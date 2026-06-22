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
    oauthStart: undefined,
    oauthEnd: undefined,
    graphTokenResolver: undefined,
    oboTokenResolver: undefined,
  });

  return parseToolResult(result);
}

module.exports = { parseToolResult, callOnboardingTool };
