import {
  normalizeRowBookmark,
  normalizeRowHighlight,
} from './row-triage.types';

describe('row-triage.types', () => {
  it('normalizes Burp highlight colors', () => {
    expect(normalizeRowHighlight('Red')).toBe('red');
    expect(normalizeRowHighlight(['green'])).toBe('green');
    expect(normalizeRowHighlight('magenta')).toBe('mauve');
    expect(normalizeRowHighlight('purple')).toBeNull();
    expect(normalizeRowHighlight(null)).toBeNull();
  });

  it('normalizes bookmark flags', () => {
    expect(normalizeRowBookmark('true')).toBeTrue();
    expect(normalizeRowBookmark(['1'])).toBeTrue();
    expect(normalizeRowBookmark('false')).toBeFalse();
    expect(normalizeRowBookmark(undefined)).toBeFalse();
  });
});