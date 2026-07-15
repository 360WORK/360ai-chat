const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'mailto:', 'tel:']);

/**
 * Sanitizes a URL from tool output before it is used as an anchor href.
 * Returns the URL only for http:, https:, mailto:, or tel: schemes;
 * anything else (javascript:, data:, relative, unparsable) yields undefined.
 */
export function safeHref(url?: string | null): string | undefined {
  if (typeof url !== 'string' || url.trim().length === 0) {
    return undefined;
  }
  try {
    return ALLOWED_PROTOCOLS.has(new URL(url).protocol) ? url : undefined;
  } catch {
    return undefined;
  }
}
