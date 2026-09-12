import { describe, expect, it } from 'vitest';
import {
  base64ToBytes,
  bytesToBase64,
  computeHmac,
  COMMON_TIMEZONES,
  EncodingError,
  gzipCompress,
  gzipDecompress,
  HMAC_ALGORITHMS,
  instantFromWallClock,
  isValidTimeZone,
  offsetFor,
  readInstantAcrossZones,
  supportsGzip,
} from './encoding';

describe('base64 helpers', () => {
  it('round-trips bytes', () => {
    const bytes = new Uint8Array([0, 1, 127, 128, 255, 42]);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it('handles an empty array', () => {
    expect(bytesToBase64(new Uint8Array())).toBe('');
    expect(base64ToBytes('')).toHaveLength(0);
  });

  it('accepts base64url input and missing padding', () => {
    const bytes = new Uint8Array([251, 255, 191]);
    const urlSafe = bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(Array.from(base64ToBytes(urlSafe))).toEqual(Array.from(bytes));
  });

  it('handles a large array without exceeding argument limits', () => {
    const bytes = new Uint8Array(200_000).map((_, i) => i % 256);
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });
});

describe('gzip', () => {
  it.runIf(supportsGzip())('round-trips text', async () => {
    const text = 'The quick brown fox jumps over the lazy dog. '.repeat(20);
    const compressed = await gzipCompress(text);
    expect(await gzipDecompress(compressed.base64)).toBe(text);
  });

  it.runIf(supportsGzip())('compresses repetitive text', async () => {
    const result = await gzipCompress('a'.repeat(10_000));

    expect(result.compressedBytes).toBeLessThan(result.originalBytes);
    expect(result.ratio).toBeLessThan(0.1);
    expect(result.note).toBeUndefined();
  });

  // Hiding this would make the tool misleading for exactly the inputs where the
  // answer matters.
  it.runIf(supportsGzip())('reports honestly when compression makes the data larger', async () => {
    const result = await gzipCompress('hi');

    expect(result.ratio).toBeGreaterThan(1);
    expect(result.note).toMatch(/18-byte header/);
  });

  it.runIf(supportsGzip())('round-trips multi-byte UTF-8', async () => {
    const text = 'héllo wörld — naïve café 日本語 🎉';
    const compressed = await gzipCompress(text);
    expect(await gzipDecompress(compressed.base64)).toBe(text);
  });

  it.runIf(supportsGzip())('rejects empty input', async () => {
    await expect(gzipCompress('')).rejects.toThrow(EncodingError);
  });

  it.runIf(supportsGzip())('rejects invalid base64 on decompress', async () => {
    await expect(gzipDecompress('!!!not base64!!!')).rejects.toThrow(/not valid base64/);
  });

  // A missing magic number is a much more useful message than a stream error.
  it.runIf(supportsGzip())('identifies base64 that is not gzip data', async () => {
    await expect(gzipDecompress(bytesToBase64(new TextEncoder().encode('plain text')))).rejects.toThrow(
      /magic number/,
    );
  });

  it.runIf(supportsGzip())('reports a truncated stream', async () => {
    const compressed = await gzipCompress('some reasonably long text to compress');
    const bytes = base64ToBytes(compressed.base64);
    const truncated = bytesToBase64(bytes.subarray(0, Math.floor(bytes.length / 2)));

    await expect(gzipDecompress(truncated)).rejects.toThrow(/truncated or corrupt/);
  });

  it.runIf(supportsGzip())('rejects empty input on decompress', async () => {
    await expect(gzipDecompress('  ')).rejects.toThrow(EncodingError);
  });
});

describe('computeHmac', () => {
  // RFC 4231 test case 2, which fixes HMAC-SHA-256 for a known key and message.
  it('matches the RFC 4231 reference vector', async () => {
    const result = await computeHmac('what do ya want for nothing?', 'Jefe', 'SHA-256');
    expect(result.hex).toBe(
      '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843',
    );
  });

  it('matches the RFC 4231 reference vector for SHA-512', async () => {
    const result = await computeHmac('what do ya want for nothing?', 'Jefe', 'SHA-512');
    expect(result.hex).toBe(
      '164b7a7bfcf819e2e395fbe73b56e0a387bd64222e831fd610270cd7ea250554' +
        '9758bf75c05a994a6d034f65f8f0e6fdcaeab1a34d4a6b4b636e070a38bce737',
    );
  });

  it('returns hex and base64 of the same value', async () => {
    const result = await computeHmac('message', 'key');
    expect(base64ToBytes(result.base64)).toEqual(
      new Uint8Array(result.hex.match(/../g)!.map((h) => parseInt(h, 16))),
    );
  });

  it('produces a different value for a different key', async () => {
    const a = await computeHmac('message', 'key-a');
    const b = await computeHmac('message', 'key-b');
    expect(a.hex).not.toBe(b.hex);
  });

  // An HMAC with no key authenticates nothing, so it must not be quietly allowed.
  it('refuses an empty key and explains why', async () => {
    await expect(computeHmac('message', '')).rejects.toThrow(/requires a secret key/);
    await expect(computeHmac('message', '')).rejects.toThrow(/plain SHA-256/);
  });

  it('supports every advertised algorithm', async () => {
    for (const algorithm of HMAC_ALGORITHMS) {
      const result = await computeHmac('message', 'key', algorithm);
      expect(result.algorithm).toBe(algorithm);
      expect(result.hex).toMatch(/^[0-9a-f]+$/);
    }
  });

  it('produces the expected digest length per algorithm', async () => {
    const lengths = { 'SHA-1': 40, 'SHA-256': 64, 'SHA-384': 96, 'SHA-512': 128 } as const;
    for (const [algorithm, length] of Object.entries(lengths)) {
      const result = await computeHmac('m', 'k', algorithm as never);
      expect(result.hex).toHaveLength(length);
    }
  });

  it('notes that SHA-1 is deprecated for signatures', async () => {
    expect((await computeHmac('m', 'k', 'SHA-1')).note).toMatch(/deprecated/);
    expect((await computeHmac('m', 'k', 'SHA-256')).note).toBeUndefined();
  });

  it('rejects an unsupported algorithm', async () => {
    await expect(computeHmac('m', 'k', 'MD5' as never)).rejects.toThrow(/Unsupported/);
  });

  it('handles an empty message with a key', async () => {
    const result = await computeHmac('', 'key');
    expect(result.hex).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('timezone utilities', () => {
  it('validates IANA identifiers', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Not/AZone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('accepts every zone in the shortlist', () => {
    for (const zone of COMMON_TIMEZONES) {
      expect(isValidTimeZone(zone), zone).toBe(true);
    }
  });

  it('computes a half-hour offset correctly', () => {
    // India is UTC+05:30 year round.
    expect(offsetFor(new Date('2026-09-12T00:00:00Z'), 'Asia/Kolkata')).toBe('+05:30');
  });

  it('computes UTC as +00:00', () => {
    expect(offsetFor(new Date('2026-09-12T00:00:00Z'), 'UTC')).toBe('+00:00');
  });

  it('computes a negative offset', () => {
    expect(offsetFor(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe('-05:00');
  });

  // The offset depends on the date, not just the zone.
  it('reflects daylight saving for the date in question', () => {
    const winter = offsetFor(new Date('2026-01-15T12:00:00Z'), 'America/New_York');
    const summer = offsetFor(new Date('2026-07-15T12:00:00Z'), 'America/New_York');

    expect(winter).toBe('-05:00');
    expect(summer).toBe('-04:00');
    expect(winter).not.toBe(summer);
  });

  it('handles a zone with no daylight saving', () => {
    const winter = offsetFor(new Date('2026-01-15T12:00:00Z'), 'Asia/Kolkata');
    const summer = offsetFor(new Date('2026-07-15T12:00:00Z'), 'Asia/Kolkata');
    expect(winter).toBe(summer);
  });

  it('renders one instant across several zones', () => {
    const instant = new Date('2026-09-12T12:00:00Z');
    const readings = readInstantAcrossZones(instant, ['UTC', 'Asia/Tokyo', 'America/New_York']);

    expect(readings).toHaveLength(3);
    expect(readings[0]?.offset).toBe('+00:00');
    expect(readings[1]?.offset).toBe('+09:00');
    expect(readings[2]?.offset).toBe('-04:00');
    for (const reading of readings) {
      expect(reading.formatted).not.toBe('');
      expect(reading.abbreviation).not.toBe('');
    }
  });

  it('rejects an unknown zone', () => {
    expect(() => readInstantAcrossZones(new Date(), ['Not/AZone'])).toThrow(
      /not a recognised IANA timezone/,
    );
  });

  it('rejects an invalid instant', () => {
    expect(() => readInstantAcrossZones(new Date('nonsense'), ['UTC'])).toThrow(EncodingError);
  });
});

describe('instantFromWallClock', () => {
  // "09:00 in Tokyo" and "09:00 in London" are different instants; this is the
  // direction people most often get wrong.
  it('interprets a wall-clock time in the given zone', () => {
    const tokyo = instantFromWallClock('2026-09-12T09:00', 'Asia/Tokyo');
    expect(tokyo.toISOString()).toBe('2026-09-12T00:00:00.000Z');
  });

  it('handles UTC', () => {
    expect(instantFromWallClock('2026-09-12T09:00', 'UTC').toISOString()).toBe(
      '2026-09-12T09:00:00.000Z',
    );
  });

  it('handles a half-hour offset', () => {
    expect(instantFromWallClock('2026-09-12T09:00', 'Asia/Kolkata').toISOString()).toBe(
      '2026-09-12T03:30:00.000Z',
    );
  });

  it('handles a negative offset', () => {
    expect(instantFromWallClock('2026-01-15T09:00', 'America/New_York').toISOString()).toBe(
      '2026-01-15T14:00:00.000Z',
    );
  });

  it('applies the summer offset for a summer date', () => {
    expect(instantFromWallClock('2026-07-15T09:00', 'America/New_York').toISOString()).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('round-trips through readInstantAcrossZones', () => {
    const instant = instantFromWallClock('2026-09-12T15:30', 'Europe/Berlin');
    const reading = readInstantAcrossZones(instant, ['Europe/Berlin'])[0]!;
    expect(reading.formatted).toContain('15:30');
  });

  it('accepts a space instead of T, and optional seconds', () => {
    expect(instantFromWallClock('2026-09-12 09:00', 'UTC').toISOString()).toBe(
      '2026-09-12T09:00:00.000Z',
    );
    expect(instantFromWallClock('2026-09-12T09:00:45', 'UTC').toISOString()).toBe(
      '2026-09-12T09:00:45.000Z',
    );
  });

  it('rejects a malformed input with a usable message', () => {
    expect(() => instantFromWallClock('tomorrow at nine', 'UTC')).toThrow(/YYYY-MM-DDTHH:MM/);
  });

  it('rejects an unknown zone', () => {
    expect(() => instantFromWallClock('2026-09-12T09:00', 'Not/AZone')).toThrow(EncodingError);
  });
});
