const {
  composeSystemPrompt,
  normalizeBusinessType,
  buildUserContextSummary,
} = require('@librechat/api');
const { getOnboardingStatus } = require('../../services/Onboarding');

const PROFILE_TTL_MS = 5 * 60 * 1000;
const profileCache = new Map();

function readCache(userId) {
  const hit = profileCache.get(userId);
  if (!hit) {
    return null;
  }
  if (hit.expiresAt <= Date.now()) {
    profileCache.delete(userId);
    return null;
  }
  return hit.value;
}

async function resolveProfile(user) {
  const userId = user?.id ? String(user.id) : null;
  if (userId) {
    const cached = readCache(userId);
    if (cached) {
      return cached;
    }
  }
  const status = await getOnboardingStatus(user);
  const company = status?.company?.profile || null;
  const personal = status?.personal?.profile || null;
  const businessType = normalizeBusinessType(company?.business_type);
  const userContext = buildUserContextSummary({ company, personal });
  const value = { businessType, userContext };
  if (userId) {
    profileCache.set(userId, { value, expiresAt: Date.now() + PROFILE_TTL_MS });
  }
  return value;
}

/**
 * Build the composed Acumen system prompt for the primary 360ai agent.
 * Fetches the onboarding profile (source of truth) to resolve business type and
 * user context. Returns null (no-op) when the business type is unknown or any
 * lookup fails, so the live path is never broken.
 */
async function acumenContextPart(user, brief) {
  if (!user) {
    return null;
  }
  try {
    const { businessType, userContext } = await resolveProfile(user);
    if (!businessType) {
      return null;
    }
    const { prompt } = composeSystemPrompt({ businessType, userContext, brief });
    return prompt || null;
  } catch (err) {
    return null;
  }
}

module.exports = { acumenContextPart, resolveProfile };
