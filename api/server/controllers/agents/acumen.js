const { logger } = require('@librechat/data-schemas');
const {
  composeSystemPrompt,
  normalizeBusinessType,
  buildUserContextSummary,
} = require('@librechat/api');
const { getOnboardingStatus } = require('../../services/Onboarding');

const PROFILE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 45 * 1000;
const PROFILE_CACHE_MAX = 500;
const CONTEXT_TIMEOUT_MS = 1500;
const profileCache = new Map();

function readCache(userId) {
  const entry = profileCache.get(userId);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt != null && entry.expiresAt <= Date.now()) {
    profileCache.delete(userId);
    return null;
  }
  return entry;
}

/** Evicts expired entries, then oldest, so an insert stays within the size cap. */
function evictForInsert() {
  if (profileCache.size < PROFILE_CACHE_MAX) {
    return;
  }
  const now = Date.now();
  for (const [key, entry] of profileCache) {
    if (entry.expiresAt != null && entry.expiresAt <= now) {
      profileCache.delete(key);
    }
  }
  while (profileCache.size >= PROFILE_CACHE_MAX) {
    const oldest = profileCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    profileCache.delete(oldest);
  }
}

async function fetchProfile(user) {
  const status = await getOnboardingStatus(user);
  const company = status?.company?.profile || null;
  const personal = status?.personal?.profile || null;
  const businessType = normalizeBusinessType(company?.business_type);
  const userContext = buildUserContextSummary({ company, personal });
  return { businessType, userContext };
}

/**
 * Resolves the user's Acumen profile (business type + context summary) with a
 * per-user in-memory cache. Concurrent misses share a single in-flight MCP
 * call; resolved values are cached for 5 minutes (45s when businessType is
 * null, so a just-completed onboarding surfaces quickly).
 */
async function resolveProfile(user) {
  const userId = user?.id ? String(user.id) : null;
  if (!userId) {
    return fetchProfile(user);
  }
  const cached = readCache(userId);
  if (cached) {
    return cached.value ?? cached.promise;
  }
  const promise = fetchProfile(user)
    .then((value) => {
      const ttl = value.businessType ? PROFILE_TTL_MS : NEGATIVE_TTL_MS;
      profileCache.set(userId, { value, expiresAt: Date.now() + ttl });
      return value;
    })
    .catch((err) => {
      const current = profileCache.get(userId);
      if (current && current.promise === promise) {
        profileCache.delete(userId);
      }
      throw err;
    });
  evictForInsert();
  profileCache.set(userId, { promise, expiresAt: null });
  return promise;
}

/**
 * Bounds profile resolution for the per-message hot path: resolves to null if
 * the lookup exceeds CONTEXT_TIMEOUT_MS so a slow Laravel MCP cannot delay
 * chat. The underlying fetch keeps running and populates the cache for
 * subsequent messages.
 */
function resolveProfileWithTimeout(user) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      logger.warn(
        `[acumenContextPart] Profile resolution timed out after ${CONTEXT_TIMEOUT_MS}ms for user ${user?.id}; skipping Acumen context`,
      );
      resolve(null);
    }, CONTEXT_TIMEOUT_MS);
    resolveProfile(user).then(
      (value) => {
        clearTimeout(timer);
        if (!settled) {
          resolve(value);
        }
      },
      (err) => {
        clearTimeout(timer);
        if (!settled) {
          reject(err);
        }
      },
    );
  });
}

/** Drops the cached Acumen profile for a user (e.g. after onboarding completes). */
function invalidateAcumenProfile(userId) {
  if (userId == null) {
    return;
  }
  profileCache.delete(String(userId));
}

/** Test-only: clears the entire profile cache. */
function resetAcumenProfileCache() {
  profileCache.clear();
}

/**
 * Build the composed Acumen system prompt for the primary 360ai agent.
 * Fetches the onboarding profile (source of truth) to resolve business type and
 * user context. Returns null (no-op) when the business type is unknown, the
 * profile lookup times out, or any lookup fails, so the live path is never broken.
 */
async function acumenContextPart(user, brief) {
  if (!user) {
    return null;
  }
  try {
    const profile = await resolveProfileWithTimeout(user);
    if (!profile || !profile.businessType) {
      return null;
    }
    const { prompt } = composeSystemPrompt({
      businessType: profile.businessType,
      userContext: profile.userContext,
      brief,
    });
    return prompt || null;
  } catch (err) {
    logger.warn(`[acumenContextPart] Failed to compose Acumen context for user ${user?.id}:`, err);
    return null;
  }
}

module.exports = {
  acumenContextPart,
  resolveProfile,
  invalidateAcumenProfile,
  resetAcumenProfileCache,
};
