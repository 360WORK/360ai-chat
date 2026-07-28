import type { BusinessType, UseCaseId } from './types';
import { workspacesFor } from './grid';
import { isUseCaseId } from './types';

export const MIN_CLASSIFIER_BRIEF_WORDS = 4;

const SYSTEM_PROMPT =
  'You classify a recruiter\'s request into exactly one use-case id, or "none" if no listed use case clearly fits. Reply with JSON only.';

const GLOSSES: Record<UseCaseId, string> = {
  'talent-mapping': 'sourcing or shortlisting candidates for a specific role',
  'market-mapping': 'mapping who is hiring or the competitive landscape in a sector',
  'skill-mapping': 'mapping skills, capability gaps, or who has a given skill',
  'workforce-planning': 'headcount, build/buy/borrow, or org capacity planning',
  prospecting: 'building a target account or pitch list of companies to win as clients',
  'signal-tracking': 'setting up ongoing alerts or watches on market moves',
  'recruitment-research': 'answering a one-off research question about the market',
};

export interface ClassifierSchema {
  type: 'object';
  properties: {
    useCaseId: {
      type: 'string';
      enum: Array<UseCaseId | 'none'>;
    };
  };
  required: ['useCaseId'];
  additionalProperties: false;
}

export interface ClassifierRequest {
  system: string;
  userMessage: string;
  schema: ClassifierSchema;
  allowed: UseCaseId[];
}

interface ClassifierReply {
  useCaseId?: string;
}

export const buildClassifierRequest = (
  brief: string,
  businessType: BusinessType,
): ClassifierRequest | null => {
  const allowed = workspacesFor(businessType);
  if (allowed.length === 0) {
    return null;
  }
  const options = allowed.map((useCaseId) => `- ${useCaseId}: ${GLOSSES[useCaseId]}`).join('\n');
  const userMessage = `${options}\n\nRequest: "${brief}"`;
  const schema: ClassifierSchema = {
    type: 'object',
    properties: {
      useCaseId: {
        type: 'string',
        enum: [...allowed, 'none'],
      },
    },
    required: ['useCaseId'],
    additionalProperties: false,
  };
  return { system: SYSTEM_PROMPT, userMessage, schema, allowed };
};

export const parseClassifierResult = (
  raw: string,
  businessType: BusinessType,
): UseCaseId | null => {
  const allowed = new Set(workspacesFor(businessType));
  try {
    const parsed = JSON.parse(raw) as ClassifierReply;
    const useCaseId = parsed.useCaseId;
    if (useCaseId && isUseCaseId(useCaseId) && allowed.has(useCaseId)) {
      return useCaseId;
    }
    return null;
  } catch {
    return null;
  }
};
