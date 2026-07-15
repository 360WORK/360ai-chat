'use strict';

const { CacheKeys } = require('librechat-data-provider');
const { getMCPServersRegistry, getFlowStateManager, getMCPManager } = require('~/config');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const { findToken, createToken, updateToken, deleteTokens } = db;

const SERVER_NAME = '360ai';

/**
 * Parses the raw result returned by mcpManager.callTool into a plain object.
 * Single shared parser for every 360ai MCP surface (Onboarding, Signals, …).
 * Handles the union of shapes the MCP SDK / mcpManager can return:
 *  1. `{ isError: true, content: [{ text }] }` — throws the error text.
 *  2. `{ structuredContent: {...} }` — returned directly.
 *  3. Bare array tuple `["{json}", null]` — first string is JSON-parsed.
 *  4. Bare array of content blocks `[{ type: 'text', text: '{json}' }]` —
 *     first text payload is JSON-parsed; a first block with no text is
 *     returned as-is (it is itself the payload).
 *  5. `{ content: [{ text }] }` — first text payload is JSON-parsed.
 *  6. Already-parsed object (no `content` array) — returned directly.
 * An array with no usable payload throws 'Empty MCP tool result.'.
 *
 * @param {unknown} result
 * @returns {object}
 */
function parseToolResult(result) {
  if (result && result.isError) {
    const text = result.content?.[0]?.text ?? 'MCP tool returned an error';
    throw new Error(text);
  }

  if (
    result &&
    result.structuredContent !== undefined &&
    result.structuredContent !== null &&
    !Array.isArray(result.structuredContent)
  ) {
    return result.structuredContent;
  }

  const content = Array.isArray(result) ? result : result?.content;
  if (Array.isArray(content)) {
    for (const part of content) {
      const text = typeof part === 'string' ? part : part?.text;
      if (typeof text === 'string' && text.length > 0) {
        return JSON.parse(text);
      }
      if (Array.isArray(result) && part && typeof part === 'object') {
        return part;
      }
    }
    throw new Error('Empty MCP tool result.');
  }

  return result;
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
 * @param {string} toolName - e.g. 'get_onboarding' or 'get_signal_runs'
 * @param {Record<string, unknown>} [toolArguments={}]
 * @returns {Promise<object>} Parsed JSON returned by the MCP tool
 */
async function callMcp360Tool(user, toolName, toolArguments = {}) {
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

module.exports = {
  SERVER_NAME,
  parseToolResult,
  callMcp360Tool,
};
