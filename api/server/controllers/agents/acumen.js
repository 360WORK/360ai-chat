const { logger } = require('@librechat/data-schemas');
const {
  composeSystemPrompt,
  normalizeBusinessType,
  buildUserContextSummary,
  selectUseCase,
  workspacesFor,
  buildClassifierRequest,
  parseClassifierResult,
  MIN_CLASSIFIER_BRIEF_WORDS,
} = require('@librechat/api');
const Anthropic = require('@anthropic-ai/sdk');
const { getOnboardingStatus } = require('../../services/Onboarding');

const PROFILE_TTL_MS = 5 * 60 * 1000;
const NEGATIVE_TTL_MS = 45 * 1000;
const PROFILE_CACHE_MAX = 500;
const CONTEXT_TIMEOUT_MS = 2500;
const STICKY_TTL_MS = 6 * 60 * 60 * 1000;
const STICKY_CACHE_MAX = 2000;
const CLASSIFIER_TIMEOUT_MS = 2000;
const profileCache = new Map();
const stickyCache = new Map();
let anthropicClient = null;

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
 * Returns the sticky use case for a conversation, or null if unset or expired.
 * Exported for the routing endpoint (Task 3) and tests.
 */
function getActiveUseCase(conversationId) {
  if (conversationId == null) {
    return null;
  }
  const entry = stickyCache.get(conversationId);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    stickyCache.delete(conversationId);
    return null;
  }
  return entry;
}

/** Evicts expired entries, then oldest, so an insert stays within the size cap. */
function evictForStickyInsert() {
  if (stickyCache.size < STICKY_CACHE_MAX) {
    return;
  }
  const now = Date.now();
  for (const [key, entry] of stickyCache) {
    if (entry.expiresAt <= now) {
      stickyCache.delete(key);
    }
  }
  while (stickyCache.size >= STICKY_CACHE_MAX) {
    const oldest = stickyCache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    stickyCache.delete(oldest);
  }
}

function setActiveUseCase(conversationId, useCaseId) {
  if (conversationId == null) {
    return;
  }
  evictForStickyInsert();
  stickyCache.set(conversationId, { useCaseId, expiresAt: Date.now() + STICKY_TTL_MS });
}

/** Test-only: clears the entire sticky use-case cache. */
function resetAcumenStickyCache() {
  stickyCache.clear();
}

function isClassifierEnabled() {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key && key !== 'user_provided') && process.env.ACUMEN_CLASSIFIER !== 'false';
}

function countWords(brief) {
  if (!brief) {
    return 0;
  }
  const trimmed = brief.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function getAnthropicClient() {
  if (!anthropicClient) {
    anthropicClient = new Anthropic();
  }
  return anthropicClient;
}

/**
 * Classifies a brief into a use case via a bounded Haiku call when the regex
 * router and sticky store both miss. Any failure, timeout, or malformed
 * response resolves to null so the message path is never blocked.
 */
async function classifyBrief(brief, businessType) {
  try {
    const request = buildClassifierRequest(brief, businessType);
    if (!request) {
      return null;
    }
    const client = getAnthropicClient();
    const response = await client.messages.create(
      {
        model: process.env.ACUMEN_CLASSIFIER_MODEL || 'claude-haiku-4-5',
        max_tokens: 64,
        output_config: { format: { type: 'json_schema', schema: request.schema } },
        system: request.system,
        messages: [{ role: 'user', content: request.userMessage }],
      },
      { timeout: CLASSIFIER_TIMEOUT_MS, maxRetries: 0 },
    );
    const textBlock = response?.content?.find((block) => block.type === 'text');
    if (!textBlock?.text) {
      return null;
    }
    return parseClassifierResult(textBlock.text, businessType);
  } catch (err) {
    logger.warn('[acumenContextPart] Classifier call failed:', err);
    return null;
  }
}

/**
 * Resolves the use case for the current message via regex router, sticky
 * conversation state, and (last resort) the classifier, in that order.
 * Only regex and classifier hits refresh the sticky store — a sticky reuse
 * leaves its own TTL untouched.
 */
async function resolveUseCase({ brief, businessType, conversationId }) {
  const regexUseCaseId = selectUseCase(brief, businessType)?.useCaseId ?? null;
  const stickyEntry = getActiveUseCase(conversationId);
  const allowed = new Set(workspacesFor(businessType));
  const stickyUseCaseId =
    stickyEntry && allowed.has(stickyEntry.useCaseId) ? stickyEntry.useCaseId : null;

  let resolved = regexUseCaseId ?? stickyUseCaseId;
  let source = 'none';
  if (regexUseCaseId) {
    source = 'regex';
  } else if (stickyUseCaseId) {
    source = 'sticky';
  }

  if (!resolved && isClassifierEnabled() && countWords(brief) >= MIN_CLASSIFIER_BRIEF_WORDS) {
    const classified = await classifyBrief(brief, businessType);
    if (classified) {
      resolved = classified;
      source = 'classifier';
    }
  }

  if (resolved && source !== 'sticky') {
    setActiveUseCase(conversationId, resolved);
  }

  return { useCaseId: resolved, source };
}

/**
 * Build the composed Acumen system prompt for the primary 360ai agent.
 * Fetches the onboarding profile (source of truth) to resolve business type and
 * user context. Returns null (no-op) when the business type is unknown, the
 * profile lookup times out, or any lookup fails, so the live path is never broken.
 */
async function acumenContextPart(user, brief, conversationId) {
  if (!user) {
    return null;
  }
  try {
    const profile = await resolveProfileWithTimeout(user);
    if (!profile || !profile.businessType) {
      return null;
    }
    const { businessType, userContext } = profile;
    const { useCaseId, source } = await resolveUseCase({ brief, businessType, conversationId });

    logger.debug('[acumen] route', {
      userId: user?.id,
      conversationId,
      businessType,
      useCaseId,
      source,
    });

    const { prompt } = composeSystemPrompt({
      businessType,
      userContext,
      brief,
      useCaseId: useCaseId ?? undefined,
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
  getActiveUseCase,
  resetAcumenStickyCache,
};
