import { ONBOARDING_STEPS } from '../onboardingSchema';
import { INTERVIEW_TREE } from '../../../../../packages/api/src/onboarding/interview';

/**
 * Cross-check: the structured question tree exists twice — as agent prose in
 * packages/api/src/onboarding/interview.ts (INTERVIEW_TREE) and as pill data
 * in onboardingSchema.ts (ONBOARDING_STEPS). This suite asserts the two never
 * drift: every step id asked by the agent must exist in the client schema
 * (and vice versa), and each step's single/multi/compound shape must match.
 *
 * Interview step lines follow the stable pattern:
 *     - STEP_ID — "Question" (options…)                → single-choice
 *     - STEP_ID — "Question" (multi: options…)         → one multi group
 *     - STEP_ID — "Question" (compound multi: …)       → 2+ multi groups
 */

type StepKind = 'single' | 'multi' | 'compound';

const STEP_LINE = /^- ([a-z0-9_.]+) — ".+?" \((compound multi: |multi: )?/;

const KIND_BY_PREFIX: Record<string, StepKind> = {
  'compound multi: ': 'compound',
  'multi: ': 'multi',
};

function parseInterviewSteps(): Map<string, StepKind> {
  const steps = new Map<string, StepKind>();
  for (const line of INTERVIEW_TREE.split('\n')) {
    const match = STEP_LINE.exec(line);
    if (!match) {
      continue;
    }
    steps.set(match[1], KIND_BY_PREFIX[match[2]] ?? 'single');
  }
  return steps;
}

describe('INTERVIEW_TREE ↔ onboardingSchema sync', () => {
  const interviewSteps = parseInterviewSteps();
  const schemaIds = Object.keys(ONBOARDING_STEPS);

  it('parses the full tree (root + 6 paths × 5 steps)', () => {
    expect(interviewSteps.size).toBe(31);
  });

  it('every interview step id exists in the client schema', () => {
    const missing = [...interviewSteps.keys()].filter((id) => !ONBOARDING_STEPS[id]);
    expect(missing).toEqual([]);
  });

  it('every client schema step id is asked in the interview tree', () => {
    const missing = schemaIds.filter((id) => !interviewSteps.has(id));
    expect(missing).toEqual([]);
  });

  it('each step’s single/multi/compound shape matches the schema groups', () => {
    const mismatches: string[] = [];
    for (const [id, kind] of interviewSteps) {
      const step = ONBOARDING_STEPS[id];
      if (!step) {
        continue;
      }
      if (kind === 'compound') {
        if (step.groups.length < 2 || !step.groups.every((g) => g.multi)) {
          mismatches.push(`${id}: interview says compound multi, schema groups disagree`);
        }
      } else if (kind === 'multi') {
        if (step.groups.length !== 1 || !step.groups[0].multi) {
          mismatches.push(`${id}: interview says multi, schema is not a single multi group`);
        }
      } else if (step.groups.some((g) => g.multi)) {
        mismatches.push(`${id}: interview says single-choice, schema has a multi group`);
      }
    }
    expect(mismatches).toEqual([]);
  });
});
