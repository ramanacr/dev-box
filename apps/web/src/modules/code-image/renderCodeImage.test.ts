import { describe, it, expect } from 'vitest';
import { renderCodeImage } from './renderCodeImage';

async function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(blob);
  });
}

describe('Code Image Renderer', () => {
  it('generates an SVG blob with image/svg+xml type', async () => {
    const blob = await renderCodeImage({
      code: 'const answer = 42;',
      format: 'svg',
    });

    expect(blob.type).toBe('image/svg+xml');
    const text = await readBlobText(blob);
    expect(text).toContain('<svg');
    expect(text).toContain('const answer = 42;');
  });

  it('escapes code containing script tags safely as XML text nodes', async () => {
    const dangerousCode = '<script>alert("xss")</script>';
    const blob = await renderCodeImage({
      code: dangerousCode,
      format: 'svg',
    });

    const text = await readBlobText(blob);
    expect(text).not.toContain('<script>');
    expect(text).toContain('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
  });

  it('toggles line numbers on and off', async () => {
    const withNumbers = await renderCodeImage({
      code: 'line one\nline two',
      lineNumbers: true,
      format: 'svg',
    });
    const withoutNumbers = await renderCodeImage({
      code: 'line one\nline two',
      lineNumbers: false,
      format: 'svg',
    });

    const textWith = await readBlobText(withNumbers);
    const textWithout = await readBlobText(withoutNumbers);

    expect(textWith).toContain('text-anchor="end">1</tspan>');
    expect(textWithout).not.toContain('text-anchor="end">1</tspan>');
  });

  it('preserves code indentation, leading spaces, and tabs', async () => {
    const formattedCode = `function hello() {\n  const x = 1;\n\tconst y = 2;\n    return x + y;\n}`;
    const blob = await renderCodeImage({
      code: formattedCode,
      format: 'svg',
    });

    const text = await readBlobText(blob);
    expect(text).toContain('xml:space="preserve"');
    // Indentation of 2 spaces
    expect(text).toContain('  const x = 1;');
    // Tab expanded to 2 spaces
    expect(text).toContain('  const y = 2;');
    // Indentation of 4 spaces
    expect(text).toContain('    return x + y;');
  });

  it('rejects input exceeding 200 KB', async () => {
    const hugeCode = 'x'.repeat(205 * 1024);
    await expect(
      renderCodeImage({
        code: hugeCode,
        format: 'svg',
      })
    ).rejects.toThrow('exceeds the 200 KB limit');
  });
});
