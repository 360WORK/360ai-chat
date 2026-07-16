import { parseInlineCard } from '../inline';

describe('parseInlineCard', () => {
  it('normalizes a company card onto the Company type (size→employee_range, url→website, summary→description)', () => {
    const text = JSON.stringify({
      kind: 'company',
      name: 'Acme GmbH',
      location: 'Berlin',
      industry: 'Cybersecurity',
      size: '51-200',
      signal: 'Raised EUR 20M Series A',
      url: 'https://acme.example',
      linkedin_url: 'https://www.linkedin.com/company/acme',
      summary: 'EDR vendor',
    });
    expect(parseInlineCard(text)).toEqual({
      kind: 'company',
      signal: 'Raised EUR 20M Series A',
      company: {
        name: 'Acme GmbH',
        location: 'Berlin',
        industry: 'Cybersecurity',
        employee_range: '51-200',
        website: 'https://acme.example',
        linkedin_url: 'https://www.linkedin.com/company/acme',
        description: 'EDR vendor',
      },
    });
  });

  it('falls back to signal for the company description when summary is absent', () => {
    const result = parseInlineCard(
      JSON.stringify({ kind: 'company', name: 'Acme', signal: 'Hiring 6 engineers' }),
    );
    expect(result?.kind).toBe('company');
    if (result?.kind === 'company') {
      expect(result.company.description).toBe('Hiring 6 engineers');
    }
  });

  it('exposes signal distinctly from the folded description when both are present (company)', () => {
    const result = parseInlineCard(
      JSON.stringify({
        kind: 'company',
        name: 'Acme',
        signal: 'Raised $125M Series C',
        summary: 'EDR vendor',
      }),
    );
    expect(result?.kind).toBe('company');
    if (result?.kind === 'company') {
      expect(result.signal).toBe('Raised $125M Series C');
      expect(result.company.description).toBe('EDR vendor');
    }
  });

  it('exposes signal distinctly from the folded summary when both are present (talent)', () => {
    const result = parseInlineCard(
      JSON.stringify({
        kind: 'talent',
        name: 'Jane Doe',
        signal: 'Open to new roles',
        summary: 'CISSP, 8 yrs detection engineering',
      }),
    );
    expect(result?.kind).toBe('talent');
    if (result?.kind === 'talent') {
      expect(result.signal).toBe('Open to new roles');
      expect(result.talent.summary).toBe('CISSP, 8 yrs detection engineering');
    }
  });

  it('normalizes a talent card onto the Talent type', () => {
    const text = JSON.stringify({
      kind: 'talent',
      name: 'Jane Doe',
      title: 'Security Engineer',
      current_company: 'Acme GmbH',
      location: 'Berlin',
      linkedin_url: 'https://www.linkedin.com/in/janedoe',
      summary: 'CISSP, 8 yrs detection engineering',
    });
    expect(parseInlineCard(text)).toEqual({
      kind: 'talent',
      talent: {
        name: 'Jane Doe',
        title: 'Security Engineer',
        current_company: 'Acme GmbH',
        location: 'Berlin',
        linkedin_url: 'https://www.linkedin.com/in/janedoe',
        summary: 'CISSP, 8 yrs detection engineering',
      },
    });
  });

  it('falls back to signal for the talent summary when summary is absent', () => {
    const result = parseInlineCard(
      JSON.stringify({ kind: 'talent', name: 'Jane', signal: 'Open to new roles' }),
    );
    expect(result?.kind).toBe('talent');
    if (result?.kind === 'talent') {
      expect(result.talent.summary).toBe('Open to new roles');
    }
  });

  it('drops non-string optional fields instead of failing', () => {
    const result = parseInlineCard(
      JSON.stringify({ kind: 'company', name: 'Acme', location: 42, url: null }),
    );
    expect(result).toEqual({
      kind: 'company',
      company: {
        name: 'Acme',
        location: undefined,
        industry: undefined,
        employee_range: undefined,
        website: undefined,
        linkedin_url: undefined,
        description: undefined,
      },
    });
  });

  it('returns null for malformed JSON (silent degrade)', () => {
    expect(parseInlineCard('{"kind":"company","name":')).toBeNull();
    expect(parseInlineCard('not json at all')).toBeNull();
  });

  it('returns null for a mid-stream partial body', () => {
    expect(parseInlineCard('{"kind":"comp')).toBeNull();
  });

  it('returns null for empty or whitespace-only input', () => {
    expect(parseInlineCard('')).toBeNull();
    expect(parseInlineCard('  \n')).toBeNull();
  });

  it('returns null when kind is missing or unknown', () => {
    expect(parseInlineCard(JSON.stringify({ name: 'Acme' }))).toBeNull();
    expect(parseInlineCard(JSON.stringify({ kind: 'job', name: 'Acme' }))).toBeNull();
  });

  it('returns null when name is missing, empty, or not a string', () => {
    expect(parseInlineCard(JSON.stringify({ kind: 'company' }))).toBeNull();
    expect(parseInlineCard(JSON.stringify({ kind: 'company', name: '' }))).toBeNull();
    expect(parseInlineCard(JSON.stringify({ kind: 'talent', name: 7 }))).toBeNull();
  });

  it('returns null for valid JSON that is not an object', () => {
    expect(parseInlineCard('[1,2,3]')).toBeNull();
    expect(parseInlineCard('"company"')).toBeNull();
    expect(parseInlineCard('null')).toBeNull();
  });
});
