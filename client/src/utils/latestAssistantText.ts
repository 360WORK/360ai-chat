import { useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';

/**
 * Follow the last-child chain from the most recent root down to the leaf of
 * the current conversation branch. The last child at each level is the most
 * recent attempt (regenerations append siblings); the leaf is the newest
 * message the user actually sees.
 */
export function getCurrentBranchLeaf(tree: TMessage[] | null | undefined): TMessage | null {
  if (!tree || tree.length === 0) {
    return null;
  }
  let node = tree[tree.length - 1];
  while (node.children && node.children.length > 0) {
    node = node.children[node.children.length - 1];
  }
  return node;
}

/**
 * Concatenate TEXT parts of an agent message (agent text lives in `content`
 * parts, not the flat `text` field), falling back to the flat `text` field.
 */
export function getMessageText(msg: TMessage): string | null {
  const parts = msg.content;
  if (Array.isArray(parts) && parts.length > 0) {
    let assembled = '';
    for (const part of parts) {
      if (part && (part as TMessageContentParts).type === ContentTypes.TEXT) {
        const t = (part as { text?: string | { value?: string } }).text;
        const str = typeof t === 'string' ? t : t?.value;
        if (typeof str === 'string' && str.length > 0) {
          assembled += str;
        }
      }
    }
    if (assembled.length > 0) {
      return assembled;
    }
  }
  return typeof msg.text === 'string' && msg.text.length > 0 ? msg.text : null;
}

/**
 * Returns the text of the current-branch leaf ONLY when that leaf is an
 * assistant message. Returns null otherwise (no messages yet, the latest
 * message is the user's just-submitted reply, or the agent is mid-stream on
 * a non-question message).
 *
 * This is what makes marker-driven docks hide the instant the user submits an
 * answer: their reply becomes the leaf, so there is no assistant leaf to read
 * until the agent's next message arrives.
 */
export function getLatestAssistantText(tree: TMessage[] | null | undefined): string | null {
  const leaf = getCurrentBranchLeaf(tree);
  if (!leaf) {
    return null;
  }
  // `isCreatedByUser` distinguishes user vs assistant messages on TMessage
  // (there is no `role` field). Assistant messages have isCreatedByUser=false.
  // Use a falsy check (not strict `=== false`) because some streaming/edge
  // paths may leave it undefined for agent messages — we don't want to miss
  // the agent's message in that case. User messages reliably carry `true`.
  if (leaf.isCreatedByUser) {
    return null;
  }
  return getMessageText(leaf);
}

/**
 * Memoized latest-assistant-text of the current branch, shared by the
 * onboarding-pill and acumen-confirm resolvers so each recomputes at most once
 * per messagesTree change.
 */
export function useLatestAssistantText(tree: TMessage[] | null | undefined): string | null {
  return useMemo(() => getLatestAssistantText(tree), [tree]);
}
