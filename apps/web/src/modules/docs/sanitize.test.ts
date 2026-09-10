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

  it('sanitizes snippets to only allow mark tags', () => {
    const dirtySnippet = `Match in &lt;b&gt;bold&lt;/b&gt; with <mark>highlight</mark> and <script>alert(1)</script>`;
    const clean = sanitizeSnippet(dirtySnippet);

    expect(clean).toContain('<mark>highlight</mark>');
    expect(clean).not.toContain('<script>');
    expect(clean).toContain('&lt;script&gt;');
  });
});
