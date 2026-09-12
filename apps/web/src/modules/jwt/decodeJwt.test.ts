import { describe, expect, it } from 'vitest';
import { decodeJwt, JwtDecodeError } from './decodeJwt';

function b64url(value: unknown): string {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeToken(header: unknown, payload: unknown, signature = 'c2lnbmF0dXJl'): string {
  return `${b64url(header)}.${b64url(payload)}.${signature}`;
}

const NOW = new Date('2026-09-12T12:00:00Z');
const nowSeconds = Math.floor(NOW.getTime() / 1000);

describe('decodeJwt', () => {
  it('decodes header and claims', () => {
    const token = makeToken(
      { alg: 'RS256', typ: 'JWT', kid: 'key-1' },
      { sub: 'usr_123', iss: 'https://id.example.com', exp: nowSeconds + 3600 },
    );

    const result = decodeJwt(token, NOW);

    expect(result.header.alg).toBe('RS256');
    expect(result.header.kid).toBe('key-1');
    expect(result.claims.sub).toBe('usr_123');
    expect(result.claims.iss).toBe('https://id.example.com');
  });

  it('strips a Bearer prefix', () => {
    const token = makeToken({ alg: 'RS256' }, { sub: 'x', exp: nowSeconds + 60 });
    expect(decodeJwt(`Bearer ${token}`, NOW).claims.sub).toBe('x');
  });

  // The white paper forbids claiming validity from decoding alone.
  it('never reports the token as verified', () => {
    const result = decodeJwt(makeToken({ alg: 'RS256' }, { sub: 'x', exp: nowSeconds + 60 }), NOW);

    expect(result.signatureStatus).toBe('not-verified');
    expect(result.notices[0]).toMatch(/signature was NOT verified/i);
    // There must be no boolean anywhere in the result that could be read as "valid".
    expect(Object.keys(result)).not.toContain('valid');
    expect(Object.keys(result)).not.toContain('isValid');
  });

  it('warns when the algorithm is none', () => {
    const result = decodeJwt(makeToken({ alg: 'none' }, { sub: 'x', exp: nowSeconds + 60 }), NOW);
    expect(result.notices.some((n) => /alg "none"/.test(n))).toBe(true);
  });

  it('explains that an HS algorithm is symmetric', () => {
    const result = decodeJwt(makeToken({ alg: 'HS256' }, { sub: 'x', exp: nowSeconds + 60 }), NOW);
    expect(result.notices.some((n) => /symmetric/i.test(n))).toBe(true);
  });

  it('warns when there is no alg', () => {
    const result = decodeJwt(makeToken({ typ: 'JWT' }, { sub: 'x', exp: nowSeconds + 60 }), NOW);
    expect(result.notices.some((n) => /no "alg"/.test(n))).toBe(true);
  });

  it('warns when the token has no expiry', () => {
    const result = decodeJwt(makeToken({ alg: 'RS256' }, { sub: 'x' }), NOW);
    expect(result.notices.some((n) => /does not expire/i.test(n))).toBe(true);
  });

  it('reports an empty signature segment', () => {
    const token = `${b64url({ alg: 'none' })}.${b64url({ sub: 'x', exp: nowSeconds + 60 })}.`;
    const result = decodeJwt(token, NOW);
    expect(result.notices.some((n) => /signature segment is empty/i.test(n))).toBe(true);
  });
});

describe('timing facts', () => {
  it('marks an expired token as blocking', () => {
    const result = decodeJwt(makeToken({ alg: 'RS256' }, { exp: nowSeconds - 7200, sub: 'x' }), NOW);
    const exp = result.timing.find((t) => t.claim === 'exp');

    expect(exp?.blocking).toBe(true);
    expect(exp?.relative).toMatch(/expired 2 hours ago/);
  });

  it('marks a future expiry as not blocking', () => {
    const result = decodeJwt(makeToken({ alg: 'RS256' }, { exp: nowSeconds + 1800, sub: 'x' }), NOW);
    const exp = result.timing.find((t) => t.claim === 'exp');

    expect(exp?.blocking).toBe(false);
    expect(exp?.relative).toMatch(/in 30 minutes/);
  });

  it('marks a future nbf as blocking', () => {
    const result = decodeJwt(
      makeToken({ alg: 'RS256' }, { nbf: nowSeconds + 600, exp: nowSeconds + 3600, sub: 'x' }),
      NOW,
    );
    const nbf = result.timing.find((t) => t.claim === 'nbf');

    expect(nbf?.blocking).toBe(true);
    expect(nbf?.relative).toMatch(/starts in 10 minutes/);
  });

  it('reports iat without blocking', () => {
    const result = decodeJwt(
      makeToken({ alg: 'RS256' }, { iat: nowSeconds - 86400, exp: nowSeconds + 60, sub: 'x' }),
      NOW,
    );
    const iat = result.timing.find((t) => t.claim === 'iat');

    expect(iat?.blocking).toBe(false);
    expect(iat?.relative).toMatch(/1 day ago/);
  });

  it('renders instants as ISO-8601', () => {
    const result = decodeJwt(makeToken({ alg: 'RS256' }, { exp: 1789000000, sub: 'x' }), NOW);
    expect(result.timing[0]?.isoTime).toBe(new Date(1789000000000).toISOString());
  });

  it('ignores non-numeric time claims rather than crashing', () => {
    const result = decodeJwt(
      makeToken({ alg: 'RS256' }, { exp: 'tomorrow', nbf: null, sub: 'x' }),
      NOW,
    );
    expect(result.timing).toHaveLength(0);
  });
});

describe('error handling', () => {
  it('rejects empty input', () => {
    expect(() => decodeJwt('   ')).toThrow(JwtDecodeError);
  });

  it('rejects a token that is not three segments', () => {
    expect(() => decodeJwt('a.b')).toThrow(/three dot-separated segments/i);
    expect(() => decodeJwt('a.b.c.d')).toThrow(/three dot-separated segments/i);
  });

  // A five-segment token is a JWE; saying so is more useful than "invalid".
  it('identifies a JWE and explains why it cannot be inspected', () => {
    expect(() => decodeJwt('a.b.c.d.e')).toThrow(/JWE/);
  });

  it('rejects a non-base64url header', () => {
    expect(() => decodeJwt('!!!.eyJhIjoxfQ.sig')).toThrow(/not valid base64url/i);
  });

  it('rejects a segment that is not JSON', () => {
    const token = `${b64url('not json')}.${b64url({ sub: 'x' })}.sig`;
    expect(() => decodeJwt(token)).toThrow(/not valid JSON/i);
  });

  it('rejects a payload that is a JSON array', () => {
    const token = `${b64url({ alg: 'RS256' })}.${b64url([1, 2, 3])}.sig`;
    expect(() => decodeJwt(token)).toThrow(/must be a JSON object/i);
  });

  it('rejects an oversized token', () => {
    const huge = `${b64url({ alg: 'RS256' })}.${'a'.repeat(70000)}.sig`;
    expect(() => decodeJwt(huge)).toThrow(/64 KB/);
  });
});
