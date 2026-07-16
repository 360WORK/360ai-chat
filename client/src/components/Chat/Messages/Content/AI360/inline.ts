import type { Company, Talent } from './types';
import { isRecord } from './parse';

export type InlineCardResult =
  | { kind: 'company'; company: Company }
  | { kind: 'talent'; talent: Talent };

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function toCompany(data: Record<string, unknown>, name: string): Company {
  return {
    name,
    location: asOptionalString(data.location),
    industry: asOptionalString(data.industry),
    employee_range: asOptionalString(data.size),
    website: asOptionalString(data.url),
    linkedin_url: asOptionalString(data.linkedin_url),
    description: asOptionalString(data.summary) ?? asOptionalString(data.signal),
  };
}

function toTalent(data: Record<string, unknown>, name: string): Talent {
  return {
    name,
    title: asOptionalString(data.title),
    current_company: asOptionalString(data.current_company),
    location: asOptionalString(data.location),
    linkedin_url: asOptionalString(data.linkedin_url),
    summary: asOptionalString(data.summary) ?? asOptionalString(data.signal),
  };
}

/**
 * Parses the body of a `360ai-card` fenced block into an existing card model.
 * Returns null for anything unparseable or incomplete (including mid-stream
 * partial JSON) so the renderer degrades silently — raw JSON must never reach
 * the user.
 */
export function parseInlineCard(text: string): InlineCardResult | null {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return null;
  }
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (!isRecord(data)) {
    return null;
  }
  const name = asOptionalString(data.name);
  if (name === undefined) {
    return null;
  }
  if (data.kind === 'company') {
    return { kind: 'company', company: toCompany(data, name) };
  }
  if (data.kind === 'talent') {
    return { kind: 'talent', talent: toTalent(data, name) };
  }
  return null;
}
