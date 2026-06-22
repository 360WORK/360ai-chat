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
});
