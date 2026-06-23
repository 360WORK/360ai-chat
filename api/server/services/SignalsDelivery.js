'use strict';

const { v4: uuidv4 } = require('uuid');
const { deliverNewSignalRuns } = require('@librechat/api');
const { CacheKeys } = require('librechat-data-provider');
const { getMCPServersRegistry, getFlowStateManager, getMCPManager } = require('~/config');
const { getLogStores } = require('~/cache');
const db = require('~/models');

const { findToken, createToken, updateToken, deleteTokens } = db;

const SERVER_NAME = '360ai';
const SIGNALS_AGENT_ID = '360ai-signals';
const SIGNALS_CONVO_TITLE = 'Signals';

/**
 * Parse the raw result returned by mcpManager.callTool into a plain object.
 * Mirrors `parseToolResult` in services/Onboarding.js (same three shapes).
 *
 * @param {unknown} result
 * @returns {object}
 */
function parseToolResult(result) {
  if (result && result.isError) {
    const text = result.content?.[0]?.text ?? 'MCP tool returned an error';
    throw new Error(text);
  }
  // The MCP SDK can return a tool result as a tuple `[text, meta]` where the
  // first element is a JSON string (and the second is null), or as a bare
  // array of content blocks. Handle both by extracting the text and parsing.
  if (Array.isArray(result) && result.length > 0) {
    const first = result[0];
    if (typeof first === 'string') {
      return JSON.parse(first);
    }
    if (first && typeof first === 'object') {
      const blockText = first.text;
      if (typeof blockText === 'string') {
        return JSON.parse(blockText);
      }
      return first;
    }
  }
  if (
    result &&
    result.structuredContent !== undefined &&
    result.structuredContent !== null &&
    !Array.isArray(result.structuredContent)
  ) {
    return result.structuredContent;
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
 * Call a 360ai MCP tool authenticated as the user. Identical wiring to
 * `callOnboardingTool` (services/Onboarding.js) — kept local so the Signals
 * surface owns no cross-cutting dependency on the onboarding module.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @param {string} toolName
 * @param {Record<string, unknown>} [toolArguments]
 * @returns {Promise<object>}
 */
async function callSignalTool(user, toolName, toolArguments = {}) {
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
    tokenMethods: { findToken, createToken, updateToken, deleteTokens },
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
 * Fetch the user's recent signal runs via the `get_signal_runs` MCP tool.
 * Returns the raw snake_case tool result.
 *
 * @param {{ id: string }} user
 * @returns {Promise<object>}
 */
async function fetchSignalRuns(user) {
  return callSignalTool(user, 'get_signal_runs', {});
}

/**
 * Resolve (and lazily create) the user's dedicated "Signals" conversation id,
 * cached on the user document so it is stable across syncs. Returns a UUID
 * conversationId valid for `saveMessage`.
 *
 * @param {{ id: string; signalsConversationId?: string }} user
 * @returns {Promise<string>}
 */
async function resolveSignalsConversationId(user) {
  if (user.signalsConversationId) {
    return user.signalsConversationId;
  }
  const conversationId = uuidv4();
  const reqCtx = { userId: user.id };
  await db.saveConvo(reqCtx, {
    conversationId,
    title: SIGNALS_CONVO_TITLE,
    endpoint: 'agents',
    agentId: SIGNALS_AGENT_ID,
    model: SIGNALS_AGENT_ID,
  });
  await db.updateUser(user.id, { signalsConversationId: conversationId });
  return conversationId;
}

/**
 * Return the messageIds already present in the user's Signals conversation so
 * delivery can skip runs already persisted (defensive dedup on top of the
 * deterministic messageId upsert).
 *
 * @param {{ id: string }} user
 * @param {string} conversationId
 * @returns {Promise<Set<string>>}
 */
async function existingSignalsMessageIds(user, conversationId) {
  const messages = await db.getMessages({ user: user.id, conversationId }, 'messageId');
  const ids = new Set();
  for (const m of Array.isArray(messages) ? messages : []) {
    if (m && typeof m.messageId === 'string') {
      ids.add(m.messageId);
    }
  }
  return ids;
}

/**
 * Persist one digest assistant message into the Signals conversation.
 *
 * @param {{ id: string }} user
 * @param {string} conversationId
 * @param {{ messageId: string; text: string }} message
 * @returns {Promise<unknown>}
 */
async function saveSignalsMessage(user, conversationId, message) {
  const reqCtx = { userId: user.id };
  return db.saveMessage(reqCtx, {
    messageId: message.messageId,
    conversationId,
    user: user.id,
    role: 'assistant',
    sender: 'Assistant',
    isCreatedByUser: false,
    parentMessageId: null,
    text: message.text,
    endpoint: 'agents',
    agentId: SIGNALS_AGENT_ID,
    model: SIGNALS_AGENT_ID,
    finish_reason: 'stop',
    unfinished: false,
    error: false,
  });
}

/**
 * Deliver all new signal-run digests for a user. Never throws — returns
 * `{ delivered: 0 }` on any failure so the HTTP route stays safe.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @returns {Promise<{ delivered: number }>}
 */
async function deliverSignalsForUser(user) {
  if (!user || !user.id) {
    return { delivered: 0 };
  }
  return deliverNewSignalRuns(user, {
    fetchRuns: fetchSignalRuns,
    resolveConversationId: resolveSignalsConversationId,
    existingMessageIds: existingSignalsMessageIds,
    saveMessage: saveSignalsMessage,
  });
}

module.exports = {
  callSignalTool,
  fetchSignalRuns,
  resolveSignalsConversationId,
  deliverSignalsForUser,
};
