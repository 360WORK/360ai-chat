import { safeHref } from '../href';

describe('safeHref', () => {
  it('allows http, https, mailto, and tel URLs', () => {
    expect(safeHref('http://example.com')).toBe('http://example.com');
    expect(safeHref('https://linkedin.com/in/jane')).toBe('https://linkedin.com/in/jane');
    expect(safeHref('mailto:jane@example.com')).toBe('mailto:jane@example.com');
    expect(safeHref('tel:+15551234567')).toBe('tel:+15551234567');
  });

  it('rejects javascript: URLs', () => {
    expect(safeHref('javascript:alert(1)')).toBeUndefined();
    expect(safeHref('JavaScript:alert(1)')).toBeUndefined();
    expect(safeHref(' javascript:alert(1)')).toBeUndefined();
  });

  it('rejects data: and other non-web schemes', () => {
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    expect(safeHref('vbscript:msgbox(1)')).toBeUndefined();
    expect(safeHref('file:///etc/passwd')).toBeUndefined();
  });

  it('rejects relative, empty, and non-string values', () => {
    expect(safeHref('/profile/1')).toBeUndefined();
    expect(safeHref('not a url')).toBeUndefined();
    expect(safeHref('')).toBeUndefined();
    expect(safeHref('   ')).toBeUndefined();
    expect(safeHref(null)).toBeUndefined();
    expect(safeHref(undefined)).toBeUndefined();
  });
});
