import type { HardConstraints, LayerFields, LayerRecord } from './types';

export interface RenderInput {
  ordered: LayerRecord[];
  fields: LayerFields;
  constraints: Required<HardConstraints>;
  userContext?: string;
  brief?: string;
}

const HEADINGS: Record<LayerRecord['kind'], string> = {
  foundations: '# Core Foundations',
  core: '# Method',
  profile: '# Audience',
  lens: '# This workspace',
};

const section = (title: string, body: string | undefined): string | null =>
  body && body.trim() ? `${title}\n${body.trim()}` : null;

const OVERRIDE_HEADER =
  '# Live Instruction (Acumen)\n' +
  'This section defines your working method for this session. Where it conflicts with any general workflow guidance elsewhere in your instructions, THIS section wins — except hard constraints and safety rules, which always apply and only tighten.';

export const renderPrompt = (input: RenderInput): string => {
  const parts: (string | null)[] = [OVERRIDE_HEADER];

  for (const layer of input.ordered) {
    parts.push(section(HEADINGS[layer.kind], layer.body));
  }

  const { openingCopy, starters, outputAdditions, thresholds } = input.fields;
  const fieldLines: string[] = [];
  if (openingCopy) fieldLines.push(`Opening: ${openingCopy}`);
  if (starters?.length) fieldLines.push(`Starters:\n- ${starters.join('\n- ')}`);
  if (outputAdditions?.length) fieldLines.push(`Output additions: ${outputAdditions.join(', ')}`);
  if (thresholds && Object.keys(thresholds).length) {
    const t = Object.entries(thresholds)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ');
    fieldLines.push(`Thresholds: ${t}`);
  }
  parts.push(section('# Workspace configuration', fieldLines.join('\n')));

  const constraintLines: string[] = [];
  if (input.constraints.offLimits.length) {
    constraintLines.push(
      `Off-limits (never violate):\n- ${input.constraints.offLimits.join('\n- ')}`,
    );
  }
  if (input.constraints.guardrails.length) {
    constraintLines.push(`Guardrails:\n- ${input.constraints.guardrails.join('\n- ')}`);
  }
  parts.push(section('# Off-limits & guardrails', constraintLines.join('\n')));

  parts.push(section('# User context', input.userContext));
  parts.push(section('# This turn', input.brief));

  return parts.filter((p): p is string => p !== null).join('\n\n');
};
