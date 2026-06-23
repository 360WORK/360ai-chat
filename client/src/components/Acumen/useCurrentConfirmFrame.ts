import { useMemo } from 'react';
import { ContentTypes } from 'librechat-data-provider';
import type { TMessage, TMessageContentParts } from 'librechat-data-provider';
import { extractConfirmFrame } from './confirmSchema';
import type { AcumenConfirmFrame } from './confirmSchema';

/**
 * Walk the last-child chain from the most recent root down to the leaf of the
 * current branch. The last child at each level is the most recent attempt
 * (regenerations append siblings); the leaf is the newest message the user
 * actually sees. Mirrors useCurrentOnboardingStep's walker.
 */
function getCurrentBranchLeaf(tree: TMessage[] | null | undefined): TMessage | null {
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
function getMessageText(msg: TMessage): string | null {
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

function getLatestAssistantText(tree: TMessage[] | null | undefined): string | null {
  const leaf = getCurrentBranchLeaf(tree);
  if (!leaf) {
    return null;
  }
  // Assistant messages have isCreatedByUser=false. Falsy check (not strict
  // === false) so streaming/edge cases with undefined still surface the frame.
  if (leaf.isCreatedByUser) {
    return null;
  }
  return getMessageText(leaf);
}

export type UseCurrentConfirmFrame = {
  /** The active confirm frame, or null when none is pending. */
  frame: AcumenConfirmFrame | null;
};

/**
 * Detects the mid-point confirm frame the agent is currently asking, if any.
 *
 * Returns `{ frame: null }` when the latest message is the user's reply (so the
 * dock hides the instant the user confirms/adjusts) or when there is no
 * acumen-confirm block in the latest assistant message.
 *
 * @param messagesTree the current conversation message tree
 */
export default function useCurrentConfirmFrame(
  messagesTree: TMessage[] | null | undefined,
): UseCurrentConfirmFrame {
  return useMemo(() => {
    const text = getLatestAssistantText(messagesTree);
    if (!text) {
      return { frame: null };
    }
    return { frame: extractConfirmFrame(text) };
  }, [messagesTree]);
}

/** Test-only export of the text reader. */
export { getLatestAssistantText };
