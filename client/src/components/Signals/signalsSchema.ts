/**
 * Signal-digest marker handling for the chat.360ai feed.
 *
 * The Signals delivery service appends a trailing HTML-comment marker to each
 * digest message so a future resolver can swap raw markdown for a rich card:
 *
 *     <!--signal-digest:RUN_ID-->
 *
 * Until that renderer exists, this module strips the marker from rendered
 * text (mirrors the onboarding-step marker pattern in onboardingSchema.ts) so
 * users never see the machine-readable comment. Kept in its own module so the
 * Signals surface owns no cross-cutting dependency and never touches unrelated
 * render files.
 */

import { stripOnboardingMarkers } from '~/components/Onboarding/onboardingSchema';

/** Regex matching the signal-digest marker. Captures the run id in group 1. */
export const SIGNAL_DIGEST_MARKER = /<!--\s*signal-digest:([a-z0-9_-]+)\s*-->/gi;

/**
 * Strip signal-digest markers from text. Collapses the blank lines a trailing
 * marker can leave behind.
 */
export function stripSignalMarkers(text: string): string {
  return text.replace(SIGNAL_DIGEST_MARKER, '').replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Apply every known feed marker strip (onboarding + signals). Call sites that
 * already call `stripOnboardingMarkers` can call this instead to also clean
 * signal-digest markers without importing each strip individually.
 */
export function stripFeedMarkers(text: string): string {
  return stripSignalMarkers(stripOnboardingMarkers(text));
}

/** Extract the first signal-digest run id from message text, if any. */
export function extractSignalDigestRunId(text: string): string | null {
  SIGNAL_DIGEST_MARKER.lastIndex = 0;
  const match = SIGNAL_DIGEST_MARKER.exec(text);
  return match ? match[1] : null;
}
