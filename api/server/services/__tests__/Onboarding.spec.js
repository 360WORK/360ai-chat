'use strict';

const { parseToolResult } = require('../Onboarding');

describe('parseToolResult', () => {
  it('parses JSON from an MCP content array', () => {
    const result = {
      content: [{ type: 'text', text: JSON.stringify({ is_owner: true, tailored_prompts: ['a'] }) }],
    };
    expect(parseToolResult(result)).toEqual({ is_owner: true, tailored_prompts: ['a'] });
  });

  it('returns the object directly if already parsed', () => {
    expect(parseToolResult({ is_owner: false })).toEqual({ is_owner: false });
  });

  it('throws on an MCP error result', () => {
    expect(() =>
      parseToolResult({ isError: true, content: [{ type: 'text', text: 'No workspace selected.' }] }),
    ).toThrow('No workspace selected.');
  });

  it('throws on an empty content array', () => {
    expect(() => parseToolResult({ content: [] })).toThrow('Empty MCP tool result.');
  });

  it('returns structuredContent when present as a non-array object', () => {
    const structured = { is_owner: true, company: { completed: true } };
    expect(parseToolResult({ structuredContent: structured })).toEqual(structured);
  });

  it('ignores structuredContent when it is an array and falls through to content parse', () => {
    const result = {
      structuredContent: [{ not: 'used' }],
      content: [{ type: 'text', text: JSON.stringify({ is_owner: false }) }],
    };
    expect(parseToolResult(result)).toEqual({ is_owner: false });
  });
});

describe('getOnboardingStatus', () => {
  let getOnboardingStatus;
  let callOnboardingToolMock;

  beforeEach(() => {
    jest.resetModules();
    callOnboardingToolMock = jest.fn();
    jest.mock('../Onboarding', () => {
      const actual = jest.requireActual('../Onboarding');
      return { ...actual };
    });
    const mod = require('../Onboarding');
    getOnboardingStatus = mod.getOnboardingStatus;
  });

  afterEach(() => {
    jest.resetModules();
  });

  it('normalizes a partial raw result — fills in missing company/personal/tailored_prompts', async () => {
    jest.resetModules();

    jest.mock('~/config', () => ({
      getMCPServersRegistry: () => ({ getServerConfig: jest.fn().mockResolvedValue({}) }),
      getFlowStateManager: jest.fn().mockReturnValue({}),
      getMCPManager: jest.fn().mockReturnValue({
        callTool: jest.fn().mockResolvedValue({ is_owner: false }),
      }),
    }));
    jest.mock('~/cache', () => ({
      getLogStores: jest.fn().mockReturnValue({}),
    }));
    jest.mock('~/models', () => ({
      findToken: jest.fn(),
      createToken: jest.fn(),
      updateToken: jest.fn(),
      deleteTokens: jest.fn(),
    }));

    const { getOnboardingStatus: getStatus } = require('../Onboarding');
    const result = await getStatus({ id: 'user-1' });

    expect(result.company).toEqual({ completed: false, profile: null });
    expect(result.personal).toEqual({ completed: false, profile: null });
    expect(result.tailored_prompts).toEqual([]);
    expect(result.is_owner).toBe(false);
    expect(result.role).toBe('member');
  });
});
