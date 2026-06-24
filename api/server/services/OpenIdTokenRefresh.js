'use strict';

/**
 * Proactive OIDC access-token refresh for the enforced `360ai` MCP server.
 *
 * Problem: chat.360ai calls Laravel over MCP using the user's OIDC access
 * token (Bearer). The token expires (no refresh was wired), after which every
 * MCP call 401s ("Invalid or expired token") and the connection dies — breaking
 * onboarding, acumen, and signals until the user re-logs in AND the backend is
 * restarted. The refresh_token was stored at login but never used.
 *
 * Fix: before relying on the access token, refresh it via the OIDC
 * refresh_token grant if it is expired or close to expiring, persisting the new
 * tokens to the session + user document so every subsequent caller (the agent
 * MCP path, onboarding, acumen, signals) reads a fresh token.
 */

const client = require('openid-client');
const logger = require('~/config/winston');

/** Refresh this far ahead of true expiry (s) to avoid races. */
const EXPIRY_SKEW_SECONDS = 60;

let cachedConfig = null;

/**
 * Lazily build (and cache) the openid-client Configuration from the same env
 * vars the login strategy uses. openid-client caches discovery internally.
 */
async function getConfig() {
  if (cachedConfig) {
    return cachedConfig;
  }
  const issuer = process.env.OPENID_ISSUER;
  const clientId = process.env.OPENID_CLIENT_ID;
  if (!issuer || !clientId) {
    throw new Error('OPENID_ISSUER / OPENID_CLIENT_ID not configured');
  }
  const clientSecret = process.env.OPENID_CLIENT_SECRET;
  const usePKCE = String(process.env.OPENID_USE_PKCE ?? '').toLowerCase() === 'true';
  const clientMetadata = { client_id: clientId };
  if (clientSecret) {
    clientMetadata.client_secret = clientSecret;
    clientMetadata.token_endpoint_auth_method = 'client_secret_post';
  } else if (usePKCE) {
    clientMetadata.token_endpoint_auth_method = 'none';
  }
  cachedConfig = await client.discovery(new URL(issuer), clientId, clientMetadata);
  return cachedConfig;
}

/** Is a unix-seconds expiry considered expired (with skew)? */
function isExpired(expiresAtSeconds, skewSeconds = EXPIRY_SKEW_SECONDS) {
  if (!expiresAtSeconds) {
    return true; // unknown expiry -> assume expired (safe to refresh if we can)
  }
  const now = Math.floor(Date.now() / 1000);
  return now + skewSeconds >= Number(expiresAtSeconds);
}

/**
 * Ensure the user has a non-expired OIDC access token, refreshing via the
 * stored refresh_token if needed. Mutates + persists:
 *  - `req.session.openidTokens` (accessToken / refreshToken / expiresAt)
 *  - `user.federatedTokens` (in-memory, for the current request's callers)
 *  - the user document (so it survives across requests if session is absent)
 *
 * Best-effort and never throws: on any failure it returns the user unchanged so
 * the caller proceeds with whatever token it has (the MCP call will 401 and the
 * route surfaces that, rather than crashing the request).
 *
 * @param {object} user - Passport user (carries federatedTokens).
 * @param {object} [session] - req.session (where openidTokens live).
 * @returns {Promise<object>} The (possibly refreshed) user.
 */
async function refreshOpenIdTokenIfNeeded(user, session) {
  if (!user) {
    return user;
  }

  const fed = user.federatedTokens || {};
  const refreshToken = fed.refresh_token || session?.openidTokens?.refreshToken;
  const accessToken = fed.access_token || session?.openidTokens?.accessToken;
  if (!refreshToken) {
    // Nothing to refresh with — leave the caller to use the (maybe-expired) token.
    return user;
  }

  // expires_at is a unix-seconds value on federatedTokens.
  if (accessToken && !isExpired(fed.expires_at)) {
    return user;
  }

  try {
    const config = await getConfig();
    const grant = await client.refreshTokenGrant(config, refreshToken);
    const newAccess = grant.access_token;
    const newRefresh = grant.refresh_token || refreshToken; // rotation optional
    const newExpiresAt = grant.expires_at
      ? Math.floor(Number(grant.expires_at) / 1000)
      : undefined;

    // Persist to the session (authoritative store read by openIdJwtStrategy).
    if (session) {
      session.openidTokens = {
        ...(session.openidTokens || {}),
        accessToken: newAccess,
        refreshToken: newRefresh,
        expiresAt: newExpiresAt ? newExpiresAt * 1000 : session.openidTokens?.expiresAt,
        lastRefreshedAt: Date.now(),
      };
    }

    // Update the in-memory user for the current request's callers (agent MCP,
    // onboarding, acumen, signals all read user.federatedTokens).
    user.federatedTokens = {
      ...fed,
      access_token: newAccess,
      refresh_token: newRefresh,
      expires_at: newExpiresAt ?? fed.expires_at,
    };

    // Persist to the user document so it survives if the session is unavailable.
    try {
      const { updateUser } = require('~/models');
      await updateUser(user.id, {
        federatedTokens: user.federatedTokens,
      });
    } catch (persistErr) {
      logger.warn('[openIdTokenRefresh] could not persist refreshed token', persistErr);
    }

    logger.info('[openIdTokenRefresh] refreshed OIDC access token');
  } catch (err) {
    // Refresh failed (revoked refresh token, provider down, etc.). Don't crash;
    // let the downstream MCP call surface the 401. The user may need to re-login.
    logger.warn(`[openIdTokenRefresh] refresh failed: ${err?.message || err}`);
  }

  return user;
}

module.exports = { refreshOpenIdTokenIfNeeded, isExpired, EXPIRY_SKEW_SECONDS };
