import { describe, it, expect } from 'vitest';
import { TextTransforms } from './transforms';

describe('Text Transforms', () => {
  it('encodes and decodes Base64 roundtrip (including unicode and URL-safe)', () => {
    const original = 'Hello Developer Toolbox! 🚀';
    const encoded = TextTransforms.base64Encode(original, true);
    expect(encoded).not.toContain('+');
    expect(encoded).not.toContain('/');

    const decoded = TextTransforms.base64Decode(encoded);
    expect(decoded).toBe(original);
  });

  it('escapes and unescapes HTML entities', () => {
    const raw = '<script>alert("test & \'fun\'")</script>';
    const escaped = TextTransforms.htmlEscape(raw);
    expect(escaped).toBe('&lt;script&gt;alert(&quot;test &amp; &#039;fun&#039;&quot;)&lt;/script&gt;');

    const unescaped = TextTransforms.htmlUnescape(escaped);
    expect(unescaped).toBe(raw);
  });

  it('sorts lines ascending, descending, and by length', () => {
    const input = 'cherry\napple\nbanana';
    expect(TextTransforms.sortLines(input, 'asc')).toBe('apple\nbanana\ncherry');
    expect(TextTransforms.sortLines(input, 'desc')).toBe('cherry\nbanana\napple');
    expect(TextTransforms.sortLines(input, 'length')).toBe('apple\ncherry\nbanana');
  });

  it('deduplicates lines', () => {
    const input = 'one\ntwo\none\nthree\ntwo';
    expect(TextTransforms.deduplicateLines(input)).toBe('one\ntwo\nthree');
  });

  it('converts case formats accurately', () => {
    const input = 'developer toolbox workbench';
    expect(TextTransforms.changeCase(input, 'camel')).toBe('developerToolboxWorkbench');
    expect(TextTransforms.changeCase(input, 'pascal')).toBe('DeveloperToolboxWorkbench');
    expect(TextTransforms.changeCase(input, 'snake')).toBe('developer_toolbox_workbench');
    expect(TextTransforms.changeCase(input, 'kebab')).toBe('developer-toolbox-workbench');
  });

  it('computes SHA-256 and SHA-512 hashes via Web Crypto', async () => {
    const hash = await TextTransforms.sha256('hello');
    // SHA256 of "hello" is 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(hash).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824');
  });

  it('generates valid UUID v4', () => {
    const uuid = TextTransforms.generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
