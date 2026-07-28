'use strict';

const { parseToolResult, callMcp360Tool } = require('./mcp360');

/**
 * Calls a tool on the 360ai MCP server authenticated as the given user.
 * Thin alias over the shared `callMcp360Tool` (services/mcp360.js), kept so
 * the onboarding surface's public API is stable.
 *
 * @param {import('@librechat/data-schemas').IUser} user - Passport-populated req.user
 * @param {string} toolName - e.g. 'get_onboarding' or 'save_onboarding_profile'
 * @param {Record<string, unknown>} [toolArguments={}]
 * @returns {Promise<object>} Parsed JSON returned by the MCP tool
 */
async function callOnboardingTool(user, toolName, toolArguments = {}) {
  return callMcp360Tool(user, toolName, toolArguments);
}

/**
 * Calls `get_onboarding` on the 360ai MCP server and returns the status with a derived `role`.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @returns {Promise<object>} Nested snake_case onboarding status + `role` ('owner'|'member')
 */
async function getOnboardingStatus(user) {
  const raw = await callOnboardingTool(user, 'get_onboarding', {});
  const isOwner = !!(raw && raw.is_owner);
  return {
    is_owner: isOwner,
    role: isOwner ? 'owner' : 'member',
    client: raw && raw.client ? raw.client : null,
    company: raw && raw.company ? raw.company : { completed: false, profile: null },
    personal: raw && raw.personal ? raw.personal : { completed: false, profile: null },
    tailored_prompts: Array.isArray(raw && raw.tailored_prompts) ? raw.tailored_prompts : [],
  };
}

const CLAIM_FIELDS = [
  'isOwner',
  'role',
  'clientId',
  'clientName',
  'companyOnboarded',
  'personalOnboarded',
];

/**
 * Maps the nested snake_case `get_onboarding` result to flat camelCase `TOnboardingClaims`
 * and persists it on the user document via `updateUser`. The Mongo write is skipped when
 * the derived claims match the already-persisted `user.oidcClaims`. When an onboarding
 * flag transitions to true, the Acumen profile cache is invalidated so the chat server
 * picks up the new profile immediately.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @param {object} status - Result of `getOnboardingStatus`
 * @returns {Promise<object>} The derived camelCase claims
 */
async function refreshUserClaims(user, status) {
  const oidcClaims = {
    isOwner: !!status.is_owner,
    role: status.is_owner ? 'owner' : 'member',
    clientId: status.client?.id != null ? String(status.client.id) : null,
    clientName: status.client?.name ?? null,
    companyOnboarded: !!status.company?.completed,
    personalOnboarded: !!status.personal?.completed,
  };
  const existing = user.oidcClaims || {};
  const changed = CLAIM_FIELDS.some((field) => existing[field] !== oidcClaims[field]);
  if (!changed) {
    return oidcClaims;
  }
  const onboardedNow =
    (oidcClaims.companyOnboarded && !existing.companyOnboarded) ||
    (oidcClaims.personalOnboarded && !existing.personalOnboarded);
  if (onboardedNow) {
    const { invalidateAcumenProfile } = require('~/server/controllers/agents/acumen');
    invalidateAcumenProfile(user.id);
  }
  const { updateUser } = require('~/models');
  await updateUser(user.id, { oidcClaims });
  return oidcClaims;
}

/**
 * Calls `save_onboarding_profile` on the 360ai MCP server to persist the given profile.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @param {{ scope: string, profile: object, tailoredPrompts?: unknown }} opts
 * @returns {Promise<object>} Raw tool result
 */
async function saveOnboardingProfile(user, { scope, profile, tailoredPrompts }) {
  const args = { scope, profile_json: JSON.stringify(profile) };
  if (tailoredPrompts !== undefined) {
    args.tailored_prompts_json = JSON.stringify(tailoredPrompts);
  }
  return callOnboardingTool(user, 'save_onboarding_profile', args);
}

module.exports = {
  parseToolResult,
  callOnboardingTool,
  getOnboardingStatus,
  refreshUserClaims,
  saveOnboardingProfile,
};
