'use strict';

const { v4: uuidv4 } = require('uuid');
const { logger } = require('@librechat/data-schemas');
const { deliverNewSignalRuns } = require('@librechat/api');
const { getAppConfig } = require('~/server/services/Config');
const { callMcp360Tool } = require('./mcp360');
const { User } = require('~/db/models');
const db = require('~/models');

const SIGNALS_CONVO_TITLE = 'Signals';
/** Fallbacks mirroring the enforced '360ai' modelSpec in librechat.yaml. */
const FALLBACK_SPEC = { endpoint: 'anthropic', model: 'claude-opus-4-6', spec: '360ai' };

/**
 * Call a 360ai MCP tool authenticated as the user. Thin alias over the shared
 * `callMcp360Tool` (services/mcp360.js), kept so the Signals surface's public
 * API is stable.
 *
 * @param {import('@librechat/data-schemas').IUser} user
 * @param {string} toolName
 * @param {Record<string, unknown>} [toolArguments]
 * @returns {Promise<object>}
 */
async function callSignalTool(user, toolName, toolArguments = {}) {
  return callMcp360Tool(user, toolName, toolArguments);
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
 * Resolve the endpoint/model/spec for the Signals conversation from the
 * enforced modelSpecs list (default spec wins, first spec otherwise), so
 * replies in the digest thread hit a real, configured endpoint. Falls back to
 * the known '360ai' spec values when config is unavailable.
 *
 * @returns {Promise<{ endpoint: string; model: string; spec: string }>}
 */
async function resolveSignalsPreset() {
  try {
    const appConfig = await getAppConfig();
    const list = appConfig?.modelSpecs?.list;
    const spec = Array.isArray(list) ? (list.find((s) => s?.default) ?? list[0]) : null;
    if (spec?.preset?.endpoint && spec?.preset?.model) {
      return { endpoint: spec.preset.endpoint, model: spec.preset.model, spec: spec.name };
    }
  } catch (err) {
    logger.warn('[SignalsDelivery] Could not resolve modelSpec preset from app config:', err);
  }
  return FALLBACK_SPEC;
}

/**
 * Atomically claim the user's `signalsConversationId` slot. Only succeeds if
 * the field is still unset, so two concurrent syncs cannot both win.
 *
 * @param {string} userId
 * @param {string} conversationId
 * @returns {Promise<boolean>} true when this call won the claim
 */
async function claimSignalsConversationId(userId, conversationId) {
  const result = await User.updateOne(
    {
      _id: userId,
      $or: [{ signalsConversationId: { $exists: false } }, { signalsConversationId: null }],
    },
    { $set: { signalsConversationId: conversationId } },
  );
  return (result?.modifiedCount ?? 0) > 0;
}

/**
 * Verify the user's cached Signals conversation still exists. When the user
 * deleted it, clear the stale pointer so a fresh conversation is created.
 *
 * @param {{ id: string; signalsConversationId?: string }} user
 * @returns {Promise<string | null>}
 */
async function verifiedSignalsConversationId(user) {
  if (!user.signalsConversationId) {
    return null;
  }
  const convo = await db.getConvo(user.id, user.signalsConversationId);
  if (convo) {
    return user.signalsConversationId;
  }
  await User.updateOne(
    { _id: user.id, signalsConversationId: user.signalsConversationId },
    { $set: { signalsConversationId: null } },
  );
  return null;
}

/**
 * Create a Signals conversation and atomically claim it. If a concurrent sync
 * won the claim first, the orphan conversation is deleted and the winner's id
 * is returned instead, so digests never split across conversations.
 *
 * @param {{ id: string }} user
 * @param {{ endpoint: string; model: string; spec: string }} preset
 * @returns {Promise<string>}
 */
async function createAndClaimSignalsConversation(user, preset) {
  const conversationId = uuidv4();
  await db.saveConvo(
    { userId: user.id },
    {
      conversationId,
      title: SIGNALS_CONVO_TITLE,
      endpoint: preset.endpoint,
      model: preset.model,
      spec: preset.spec,
    },
  );
  const claimed = await claimSignalsConversationId(user.id, conversationId);
  if (claimed) {
    return conversationId;
  }
  await db.deleteConvos(user.id, { conversationId });
  const winner = await db.findUser({ _id: user.id }, 'signalsConversationId');
  if (winner?.signalsConversationId) {
    return winner.signalsConversationId;
  }
  throw new Error('Could not resolve the Signals conversation.');
}

/**
 * Resolve (and lazily create) the user's dedicated "Signals" conversation id,
 * cached on the user document so it is stable across syncs. Verifies the
 * cached conversation still exists and recreates it when deleted.
 *
 * @param {{ id: string; signalsConversationId?: string }} user
 * @param {{ endpoint: string; model: string; spec: string }} [preset]
 * @returns {Promise<string>}
 */
async function resolveSignalsConversationId(user, preset) {
  const existingId = await verifiedSignalsConversationId(user);
  if (existingId) {
    return existingId;
  }
  const resolvedPreset = preset ?? (await resolveSignalsPreset());
  return createAndClaimSignalsConversation(user, resolvedPreset);
}

/**
 * Load the user's Signals conversation messages once: the set of messageIds
 * already delivered (dedup) plus the newest messageId (chain anchor for the
 * next digest's parentMessageId).
 *
 * @param {{ id: string }} user
 * @param {string} conversationId
 * @returns {Promise<{ ids: Set<string>; latestMessageId: string | null }>}
 */
async function loadSignalsMessages(user, conversationId) {
  const messages = await db.getMessages({ user: user.id, conversationId }, 'messageId');
  const ids = new Set();
  let latestMessageId = null;
  for (const m of Array.isArray(messages) ? messages : []) {
    if (m && typeof m.messageId === 'string') {
      ids.add(m.messageId);
      latestMessageId = m.messageId;
    }
  }
  return { ids, latestMessageId };
}

/**
 * Persist one digest assistant message into the Signals conversation, chained
 * to the previous message so the conversation renders as one chronological
 * feed instead of multiple roots with a branch pager.
 *
 * @param {{ id: string }} user
 * @param {string} conversationId
 * @param {{ messageId: string; text: string }} message
 * @param {{ endpoint: string; model: string }} preset
 * @param {string | null} parentMessageId
 * @returns {Promise<unknown>}
 */
async function saveSignalsMessage(user, conversationId, message, preset, parentMessageId) {
  const reqCtx = { userId: user.id };
  return db.saveMessage(reqCtx, {
    messageId: message.messageId,
    conversationId,
    user: user.id,
    role: 'assistant',
    sender: 'Assistant',
    isCreatedByUser: false,
    parentMessageId,
    text: message.text,
    endpoint: preset.endpoint,
    model: preset.model,
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
  const preset = await resolveSignalsPreset();
  const chain = { parentMessageId: null };
  return deliverNewSignalRuns(user, {
    fetchRuns: fetchSignalRuns,
    resolveConversationId: (u) => resolveSignalsConversationId(u, preset),
    existingMessageIds: async (u, conversationId) => {
      const { ids, latestMessageId } = await loadSignalsMessages(u, conversationId);
      chain.parentMessageId = latestMessageId;
      return ids;
    },
    saveMessage: async (u, conversationId, message) => {
      const saved = await saveSignalsMessage(
        u,
        conversationId,
        message,
        preset,
        chain.parentMessageId,
      );
      chain.parentMessageId = message.messageId;
      return saved;
    },
  });
}

module.exports = {
  callSignalTool,
  fetchSignalRuns,
  resolveSignalsPreset,
  resolveSignalsConversationId,
  deliverSignalsForUser,
};
