'use strict';

const { CacheKeys } = require('librechat-data-provider');
const { getMCPServersRegistry, getFlowStateManager, getMCPManager } = require('~/config');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const { findToken, createToken, updateToken, deleteTokens } = db;

const SERVER_NAME = '360ai';

/**
 * Parses the raw result returned by mcpManager.callTool into a plain object.
 * Handles three shapes:
 *  1. Already-parsed object (no `content` array) — returned directly.
 *  2. `{ isError: true, content: [{ text }] }` — throws the error text.
 *  3. `{ content: [{ text }] }` — JSON-parses `text` and returns the result.
 *
 * @param {unknown} result
 * @returns {object}
 */
function parseToolResult(result) {
  if (result && result.isError) {
    const text = result.content?.[0]?.text ?? 'MCP tool returned an error';
    throw new Error(text);
  }

  if (!result || !Array.isArray(result.content)) {
    return result;
  }

  const text = result.content[0]?.text;
  if (text == null) {
    throw new Error('Empty MCP tool result.');
  }
  return JSON.parse(text);
}

/**
 * Calls a tool on the 360ai MCP server authenticated as the given user.
 * Mirrors the MCP.js createToolInstance/_call pattern exactly:
 *  - getMCPManager(userId) for the per-user manager
 *  - getFlowStateManager(getLogStores(CacheKeys.FLOWS)) for OAuth flows
 *  - getMCPServersRegistry().getServerConfig(SERVER_NAME, userId) for serverConfig
 *  - provider left undefined (not an LLM provider context)
 *  - tokenMethods from ~/models (findToken/createToken/updateToken/deleteTokens)
 *  - user carries federatedTokens so processMCPEnv resolves {{LIBRECHAT_OPENID_ACCESS_TOKEN}}
 *  - requestBody/customUserVars/oauthStart/oauthEnd omitted (not applicable outside agent loop)
 *
 * @param {import('@librechat/data-schemas').IUser} user - Passport-populated req.user
 * @param {string} toolName - e.g. 'get_onboarding' or 'save_onboarding_profile'
 * @param {Record<string, unknown>} [toolArguments={}]
 * @returns {Promise<object>} Parsed JSON returned by the MCP tool
 */
async function callOnboardingTool(user, toolName, toolArguments = {}) {
  const userId = user?.id;
  const flowsCache = getLogStores(CacheKeys.FLOWS);
  const flowManager = getFlowStateManager(flowsCache);
  const mcpManager = getMCPManager(userId);
  const serverConfig = await getMCPServersRegistry().getServerConfig(SERVER_NAME, userId);

  const result = await mcpManager.callTool({
    serverName: SERVER_NAME,
    serverConfig,
    toolName,
    toolArguments,
    provider: undefined,
    user,
    requestBody: undefined,
    requestScopedConnections: undefined,
    customUserVars: undefined,
    flowManager,
    tokenMethods: {
      findToken,
      createToken,
      updateToken,
      deleteTokens,
    },
    // 360ai uses Bearer auth (no OBO); options/oboTrustChecker mirror MCP.js's call shape
    options: {},
    oauthStart: undefined,
    oauthEnd: undefined,
    graphTokenResolver: undefined,
    oboTokenResolver: undefined,
    oboTrustChecker: undefined,
  });

  return parseToolResult(result);
}

/**
 * Calls `get_onboarding` on the 360ai MCP server and returns the status with a derived `role`.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @returns {Promise<object>} Nested snake_case onboarding status + `role` ('owner'|'member')
 */
async function getOnboardingStatus(user) {
  const status = await callOnboardingTool(user, 'get_onboarding', {});
  return { ...status, role: status.is_owner ? 'owner' : 'member' };
}

/**
 * Maps the nested snake_case `get_onboarding` result to flat camelCase `TOnboardingClaims`
 * and persists it on the user document via `updateUser`.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @param {object} status - Result of `getOnboardingStatus`
 * @returns {Promise<object>} The persisted camelCase claims
 */
async function refreshUserClaims(user, status) {
  const { updateUser } = require('~/models');
  const oidcClaims = {
    isOwner: !!status.is_owner,
    role: status.is_owner ? 'owner' : 'member',
    clientId: status.client?.id != null ? String(status.client.id) : null,
    clientName: status.client?.name ?? null,
    companyOnboarded: !!status.company?.completed,
    personalOnboarded: !!status.personal?.completed,
  };
  await updateUser(user.id, { oidcClaims });
  return oidcClaims;
}

module.exports = { parseToolResult, callOnboardingTool, getOnboardingStatus, refreshUserClaims };
