'use strict';

const { parseToolResult } = require('../Onboarding');

describe('parseToolResult', () => {
  it('parses JSON from an MCP content array', () => {
    const result = {
      content: [
        { type: 'text', text: JSON.stringify({ is_owner: true, tailored_prompts: ['a'] }) },
      ],
    };
    expect(parseToolResult(result)).toEqual({ is_owner: true, tailored_prompts: ['a'] });
  });

  it('returns the object directly if already parsed', () => {
    expect(parseToolResult({ is_owner: false })).toEqual({ is_owner: false });
  });

  it('throws on an MCP error result', () => {
    expect(() =>
      parseToolResult({
        isError: true,
        content: [{ type: 'text', text: 'No workspace selected.' }],
      }),
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

  it('parses JSON when callTool returns the content parts directly as a [string, null] array', () => {
    const payload = {
      is_owner: true,
      company: { completed: false },
      personal: { completed: true },
    };
    expect(parseToolResult([JSON.stringify(payload), null])).toEqual(payload);
  });

  it('parses JSON when callTool returns an array of text-part objects', () => {
    const payload = { is_owner: true, client: { id: 5, name: '360AI' } };
    expect(parseToolResult([{ type: 'text', text: JSON.stringify(payload) }])).toEqual(payload);
  });

  it('throws when an array result has no text payload', () => {
    expect(() => parseToolResult([null, null])).toThrow('Empty MCP tool result.');
  });
});

describe('getOnboardingStatus', () => {
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

describe('refreshUserClaims', () => {
  const status = {
    is_owner: true,
    client: { id: 7, name: 'Acme' },
    company: { completed: true, profile: null },
    personal: { completed: false, profile: null },
  };
  const derivedClaims = {
    isOwner: true,
    role: 'owner',
    clientId: '7',
    clientName: 'Acme',
    companyOnboarded: true,
    personalOnboarded: false,
  };

  let refreshClaims;
  let updateUserSpy;
  let invalidateSpy;

  beforeEach(() => {
    jest.resetModules();
    updateUserSpy = jest.fn().mockResolvedValue({});
    invalidateSpy = jest.fn();
    jest.doMock('~/models', () => ({ updateUser: updateUserSpy }));
    jest.doMock('~/server/controllers/agents/acumen', () => ({
      invalidateAcumenProfile: invalidateSpy,
    }));
    ({ refreshUserClaims: refreshClaims } = require('../Onboarding'));
  });

  afterEach(() => {
    jest.dontMock('~/models');
    jest.dontMock('~/server/controllers/agents/acumen');
  });

  it('skips the Mongo write when derived claims match the persisted oidcClaims', async () => {
    const user = { id: 'user-1', oidcClaims: { ...derivedClaims } };
    const claims = await refreshClaims(user, status);
    expect(claims).toEqual(derivedClaims);
    expect(updateUserSpy).not.toHaveBeenCalled();
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('persists claims when they differ from the stored oidcClaims', async () => {
    const user = { id: 'user-1', oidcClaims: { ...derivedClaims, clientName: 'Old Name' } };
    const claims = await refreshClaims(user, status);
    expect(claims).toEqual(derivedClaims);
    expect(updateUserSpy).toHaveBeenCalledTimes(1);
    expect(updateUserSpy).toHaveBeenCalledWith('user-1', { oidcClaims: derivedClaims });
    expect(invalidateSpy).not.toHaveBeenCalled();
  });

  it('persists claims for a user with no prior oidcClaims', async () => {
    const user = { id: 'user-2' };
    await refreshClaims(user, status);
    expect(updateUserSpy).toHaveBeenCalledWith('user-2', { oidcClaims: derivedClaims });
  });

  it('invalidates the Acumen profile cache when companyOnboarded transitions to true', async () => {
    const user = { id: 'user-3', oidcClaims: { ...derivedClaims, companyOnboarded: false } };
    await refreshClaims(user, status);
    expect(invalidateSpy).toHaveBeenCalledWith('user-3');
    expect(updateUserSpy).toHaveBeenCalledTimes(1);
  });

  it('invalidates the Acumen profile cache when personalOnboarded transitions to true', async () => {
    const user = { id: 'user-4', oidcClaims: { ...derivedClaims } };
    const personalStatus = { ...status, personal: { completed: true, profile: null } };
    await refreshClaims(user, personalStatus);
    expect(invalidateSpy).toHaveBeenCalledWith('user-4');
  });
});
