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
 * refresh_token grant if it is expired or close to expiring. The refreshed
 * tokens are applied to the session and the in-memory user for the current
 * request; persistence is session-scoped by design — tokens are never written
 * to the user document (the schema has no such field, and storing plaintext
 * OAuth tokens at rest is undesirable). If the session is unavailable the
 * refresh only benefits the current request.
 *
 * Concurrency: Laravel Passport rotates refresh tokens (single-use), so
 * concurrent requests must not each run their own refresh grant. A per-user
 * in-flight lock ensures one grant runs at a time; concurrent callers await
 * the same promise and all receive the same refreshed tokens.
 */

const client = require('openid-client');
const logger = require('~/config/winston');

/** Refresh this far ahead of true expiry (s) to avoid races. */
const EXPIRY_SKEW_SECONDS = 60;

let cachedConfig = null;

/** @type {Map<string, Promise<RefreshedTokens | null>>} per-user in-flight refresh grants */
const inflightRefreshes = new Map();

/**
 * @typedef {object} RefreshedTokens
 * @property {string} access_token
 * @property {string} refresh_token
 * @property {number | undefined} expires_at - unix seconds
 * @property {number} refreshed_at - epoch ms
 */

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
 * Seconds until expiry from an openid-client v6 token endpoint response.
 * v6 responses expose `expires_in` (seconds) and an `expiresIn()` helper —
 * there is no `expires_at` field. Handles both the response class and a plain
 * object defensively.
 */
function resolveExpiresIn(grant) {
  if (typeof grant?.expiresIn === 'function') {
    const seconds = Number(grant.expiresIn());
    if (Number.isFinite(seconds)) {
      return seconds;
    }
  }
  const seconds = Number(grant?.expires_in);
  return Number.isFinite(seconds) ? seconds : undefined;
}

/**
 * Run the refresh_token grant. Never throws: returns the refreshed token
 * bundle, or null on failure (revoked refresh token, provider down, etc.).
 * @returns {Promise<RefreshedTokens | null>}
 */
async function executeRefresh(refreshToken) {
  try {
    const config = await getConfig();
    const grant = await client.refreshTokenGrant(config, refreshToken);
    const expiresIn = resolveExpiresIn(grant);
    const refreshedAt = Date.now();
    logger.info('[openIdTokenRefresh] refreshed OIDC access token');
    return {
      access_token: grant.access_token,
      refresh_token: grant.refresh_token || refreshToken, // rotation optional
      expires_at: expiresIn !== undefined ? Math.floor(refreshedAt / 1000) + expiresIn : undefined,
      refreshed_at: refreshedAt,
    };
  } catch (err) {
    logger.warn(`[openIdTokenRefresh] refresh failed: ${err?.message || err}`);
    return null;
  }
}

/**
 * Ensure the user has a non-expired OIDC access token, refreshing via the
 * stored refresh_token if needed. Mutates:
 *  - `req.session.openidTokens` (accessToken / refreshToken / expiresAt)
 *  - `user.federatedTokens` (in-memory, for the current request's callers)
 *
 * Persistence is session-scoped by design: tokens are not written to the user
 * document. Concurrent requests for the same user share a single in-flight
 * refresh grant (Passport rotates refresh tokens, so a second grant with the
 * same token would fail and could revoke the stored token).
 *
 * Best-effort and never throws: on any failure it returns the user unchanged
 * so the caller proceeds with whatever token it has (the MCP call will 401 and
 * the route surfaces that, rather than crashing the request).
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

  const lockKey = String(user.id ?? user._id ?? refreshToken);
  let pending = inflightRefreshes.get(lockKey);
  if (!pending) {
    pending = executeRefresh(refreshToken).finally(() => {
      inflightRefreshes.delete(lockKey);
    });
    inflightRefreshes.set(lockKey, pending);
  }

  const tokens = await pending;
  if (!tokens) {
    return user;
  }

  // Update the in-memory user for the current request's callers (agent MCP,
  // onboarding, acumen, signals all read user.federatedTokens).
  user.federatedTokens = {
    ...fed,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at ?? fed.expires_at,
  };

  // Persist to this caller's session (authoritative store read by openIdJwtStrategy).
  if (session) {
    session.openidTokens = {
      ...(session.openidTokens || {}),
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at ? tokens.expires_at * 1000 : session.openidTokens?.expiresAt,
      lastRefreshedAt: tokens.refreshed_at,
    };
  }

  return user;
}

module.exports = { refreshOpenIdTokenIfNeeded, isExpired, EXPIRY_SKEW_SECONDS };
