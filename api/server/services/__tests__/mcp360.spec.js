'use strict';

const { parseToolResult, SERVER_NAME } = require('../mcp360');

describe('mcp360 parseToolResult (union of all accepted shapes)', () => {
  it('exposes the 360ai server name', () => {
    expect(SERVER_NAME).toBe('360ai');
  });

  it('parses JSON from an MCP content array', () => {
    const payload = { is_owner: true, tailored_prompts: ['a'] };
    const result = { content: [{ type: 'text', text: JSON.stringify(payload) }] };
    expect(parseToolResult(result)).toEqual(payload);
  });

  it('returns an already-parsed object directly', () => {
    expect(parseToolResult({ is_owner: false })).toEqual({ is_owner: false });
  });

  it('prefers structuredContent when present', () => {
    const structured = { runs: [{ id: 1 }] };
    expect(parseToolResult({ structuredContent: structured })).toEqual(structured);
    expect(
      parseToolResult({ structuredContent: structured, content: [{ text: '{"other":1}' }] }),
    ).toEqual(structured);
  });

  it('throws the error text for isError results', () => {
    expect(() =>
      parseToolResult({ isError: true, content: [{ type: 'text', text: 'boom' }] }),
    ).toThrow('boom');
    expect(() => parseToolResult({ isError: true })).toThrow('MCP tool returned an error');
  });

  it('parses a bare tuple array ["{json}", null]', () => {
    const payload = { runs: [] };
    expect(parseToolResult([JSON.stringify(payload), null])).toEqual(payload);
  });

  it('parses a bare content-block array [{ type: "text", text }]', () => {
    const payload = { runs: [{ id: 2 }] };
    expect(parseToolResult([{ type: 'text', text: JSON.stringify(payload) }])).toEqual(payload);
  });

  it('returns the first bare-array object when it carries no text payload', () => {
    expect(parseToolResult([{ runs: [] }])).toEqual({ runs: [] });
  });

  it('skips non-text parts inside a content property and parses the first text part', () => {
    const payload = { ok: true };
    const result = {
      content: [{ type: 'image' }, { type: 'text', text: JSON.stringify(payload) }],
    };
    expect(parseToolResult(result)).toEqual(payload);
  });

  it('throws on empty/unusable arrays', () => {
    expect(() => parseToolResult({ content: [] })).toThrow('Empty MCP tool result.');
    expect(() => parseToolResult([null, null])).toThrow('Empty MCP tool result.');
    expect(() => parseToolResult({ content: [{ text: null }] })).toThrow('Empty MCP tool result.');
  });

  it('passes through null/undefined results', () => {
    expect(parseToolResult(null)).toBeNull();
    expect(parseToolResult(undefined)).toBeUndefined();
  });
});
