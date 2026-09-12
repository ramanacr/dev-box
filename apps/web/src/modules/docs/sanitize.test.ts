import { describe, it, expect } from 'vitest';
import { sanitizeHtml, sanitizeSnippet } from './sanitize';

describe('Documentation Sanitizer', () => {
  it('strips dangerous script tags and malicious attributes', () => {
    const dirty = `<p>Safe text</p><script>alert("pwned")</script><img src="x" onerror="alert(1)" /><a href="javascript:alert(2)">link</a>`;
    const clean = sanitizeHtml(dirty);

    expect(clean).not.toContain('<script>');
    expect(clean).not.toContain('alert');
    expect(clean).not.toContain('onerror');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('<p>Safe text</p>');
  });

  it('allows safe formatting tags and valid hrefs', () => {
    const safe = `<p>Documentation for <code>TypeScript</code> with <a href="https://example.com">external link</a></p>`;
    const clean = sanitizeHtml(safe);

    expect(clean).toContain('<p>Documentation for <code>TypeScript</code>');
    expect(clean).toContain('href="https://example.com"');
    expect(clean).toContain('target="_blank"');
    expect(clean).toContain('rel="noopener noreferrer"');
  });

  it('keeps the highlight and strips every other tag', () => {
    const clean = sanitizeSnippet(
      '<h2>The shape of the problem</h2> <p>A <mark>backtracking</mark> engine.</p>',
    );

    expect(clean).toContain('<mark>backtracking</mark>');
    // The structural tags are removed rather than shown as literal text.
    expect(clean).not.toContain('<h2>');
    expect(clean).not.toContain('&lt;h2&gt;');
    expect(clean).toContain('The shape of the problem');
    expect(clean).toContain('engine');
  });

  it('removes a script tag entirely rather than displaying it', () => {
    const clean = sanitizeSnippet('before <script>alert(1)</script> after');

    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('&lt;script&gt;');
    expect(clean).toContain('before');
    expect(clean).toContain('after');
  });

  it('preserves entity-encoded markup as readable text', () => {
    // The source document literally contained the characters "<b>bold</b>".
    const clean = sanitizeSnippet('Match in &lt;b&gt;bold&lt;/b&gt; here');

    expect(clean).toContain('&lt;b&gt;bold&lt;/b&gt;');
    expect(clean).not.toContain('<b>');
  });

  // An excerpt is cut at an arbitrary offset, so it routinely begins or ends
  // mid-tag.
  it('handles a tag truncated at either end of the excerpt', () => {
    expect(sanitizeSnippet('…ment</p> <p>Next <mark>term</mark>')).toContain(
      '<mark>term</mark>',
    );
    expect(sanitizeSnippet('<mark>term</mark> then <p class="x')).not.toContain('<p');
    expect(sanitizeSnippet('<mark>term</mark> then <p class="x')).toContain('then');
  });

  it('cannot be tricked into emitting a tag by double encoding', () => {
    // A single decode pass must not turn "&amp;lt;script&amp;gt;" into a live tag.
    const clean = sanitizeSnippet('&amp;lt;script&amp;gt;alert(1)&amp;lt;/script&amp;gt;');

    expect(clean).not.toMatch(/<script/i);
    expect(clean).not.toMatch(/<[a-z]/i);
  });

  it('does not emit a tag for a mark-lookalike', () => {
    const clean = sanitizeSnippet('<markx>no</markx> <mark>yes</mark>');

    expect(clean).not.toContain('<markx>');
    expect(clean).toContain('<mark>yes</mark>');
  });

  it('collapses whitespace left behind by removed tags', () => {
    const clean = sanitizeSnippet('<p>one</p>\n\n<p>two</p>');
    expect(clean).toBe('one two');
  });

  it('emits only mark tags, whatever the input', () => {
    const inputs = [
      '<img src=x onerror=alert(1)>',
      '<svg/onload=alert(1)>',
      '<iframe src="javascript:alert(1)">',
      '<a href="javascript:alert(1)">click</a>',
      '<mark>ok</mark><style>body{display:none}</style>',
    ];

    for (const input of inputs) {
      const clean = sanitizeSnippet(input);
      const tags = clean.match(/<\/?[a-z][^>]*>/gi) ?? [];
      for (const tag of tags) {
        expect(tag.toLowerCase()).toMatch(/^<\/?mark>$/);
      }
    }
  });
});
