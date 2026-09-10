import { describe, it, expect } from 'vitest';
import { evaluateRegex } from './regexEngine';

describe('Regex Engine', () => {
  it('extracts global matches and capture groups', () => {
    const res = evaluateRegex('(\\w+)@(\\w+\\.\\w+)', 'g', 'Contact support@example.com or sales@example.org');
    expect(res.isValid).toBe(true);
    expect(res.matches.length).toBe(2);
    expect(res.matches[0]?.match).toBe('support@example.com');
    expect(res.matches[0]?.groups).toEqual(['support', 'example.com']);
  });

  it('supports named capture groups', () => {
    const res = evaluateRegex('(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})', 'g', 'Date: 2026-09-10');
    expect(res.isValid).toBe(true);
    expect(res.matches.length).toBe(1);
    expect(res.matches[0]?.namedGroups).toEqual({
      year: '2026',
      month: '09',
      day: '10',
    });
  });

  it('safely handles zero-length matches without hanging in an infinite loop', () => {
    const res = evaluateRegex('\\b', 'g', 'abc');
    expect(res.isValid).toBe(true);
    // \b matches before 'a' and after 'c'
    expect(res.matches.length).toBe(2);
  });

  it('reports syntax error for invalid regex patterns', () => {
    const res = evaluateRegex('[a-z', 'g', 'test');
    expect(res.isValid).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('previews replacements correctly', () => {
    const res = evaluateRegex('world', 'g', 'hello world', 'toolbox');
    expect(res.isValid).toBe(true);
    expect(res.replaceOutput).toBe('hello toolbox');
  });

  it('handles 100,000 character inputs efficiently', () => {
    const largeInput = 'word '.repeat(20000);
    const res = evaluateRegex('word', 'g', largeInput);
    expect(res.isValid).toBe(true);
    expect(res.matches.length).toBe(5000); // capped at MAX_MATCH_COUNT
    expect(res.executionTimeMs).toBeLessThan(1000);
  });
});
