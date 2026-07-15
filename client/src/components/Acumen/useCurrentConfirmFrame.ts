import { useMemo } from 'react';
import type { TMessage } from 'librechat-data-provider';
import type { AcumenConfirmFrame } from './confirmSchema';
import { getLatestAssistantText, useLatestAssistantText } from '~/utils/latestAssistantText';
import { extractConfirmFrame } from './confirmSchema';

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
  const text = useLatestAssistantText(messagesTree);
  return useMemo(() => (text ? { frame: extractConfirmFrame(text) } : { frame: null }), [text]);
}

/** Test-only re-export of the shared text reader (see ~/utils/latestAssistantText). */
export { getLatestAssistantText };
