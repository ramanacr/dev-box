/**
 * JWT decoder and inspector.
 *
 * Decode only. The white paper is explicit on two points that this module follows
 * literally:
 *
 *   - "JWT decoder and inspector — decode only; no signature verification claim
 *     unless a key is supplied."
 *   - "Do not describe decoding as decryption, and do not claim JWT validity from
 *     base64 decoding alone."
 *
 * So nothing here returns a boolean called "valid". The result reports what the token
 * *says*, plus timing facts that can be checked without a key, and states plainly
 * that the signature was not verified.
 */

export interface JwtHeader {
  alg?: string;
  typ?: string;
  kid?: string;
  [key: string]: unknown;
}

export interface JwtClaims {
  iss?: string;
  sub?: string;
  aud?: string | string[];
  exp?: number;
  nbf?: number;
  iat?: number;
  jti?: string;
  [key: string]: unknown;
}

export interface TimingFact {
  claim: 'exp' | 'nbf' | 'iat';
  label: string;
  /** ISO-8601 rendering of the claim's instant. */
  isoTime: string;
  /** Human-readable relative description. */
  relative: string;
  /** True when this claim currently prevents the token being accepted. */
  blocking: boolean;
}

export interface DecodedJwt {
  header: JwtHeader;
  claims: JwtClaims;
  /** Raw, still-encoded signature segment. */
  signature: string;
  /** Exactly what was and was not checked. */
  signatureStatus: 'not-verified';
  notices: string[];
  timing: TimingFact[];
  /** The three raw segments, for display. */
  segments: { header: string; payload: string; signature: string };
}

export class JwtDecodeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JwtDecodeError';
  }
}

const MAX_TOKEN_LENGTH = 64 * 1024;

/** Decodes a base64url segment to a UTF-8 string. */
function decodeSegment(segment: string, what: string): string {
  // Base64url uses - and _ and omits padding.
  const normalized = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);

  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new JwtDecodeError(`The ${what} segment is not valid base64url.`);
  }

  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new JwtDecodeError(`The ${what} segment is not valid UTF-8 text.`);
  }
}

function parseJsonSegment(segment: string, what: string): Record<string, unknown> {
  const text = decodeSegment(segment, what);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new JwtDecodeError(`The ${what} segment is not valid JSON.`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new JwtDecodeError(`The ${what} segment must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

export function decodeJwt(token: string, now: Date = new Date()): DecodedJwt {
  const trimmed = token.trim().replace(/^Bearer\s+/i, '');

  if (trimmed === '') {
    throw new JwtDecodeError('Enter a token to decode.');
  }
  if (trimmed.length > MAX_TOKEN_LENGTH) {
    throw new JwtDecodeError('Token exceeds the 64 KB inspection limit.');
  }

  const parts = trimmed.split('.');
  if (parts.length === 5) {
    throw new JwtDecodeError(
      'This looks like a JWE (five segments). Its payload is encrypted, so it cannot be inspected without the decryption key.',
    );
  }
  if (parts.length !== 3) {
    throw new JwtDecodeError(
      `A JWS has three dot-separated segments; this has ${parts.length}.`,
    );
  }

  const [headerSeg, payloadSeg, signatureSeg] = parts as [string, string, string];

  const header = parseJsonSegment(headerSeg, 'header') as JwtHeader;
  const claims = parseJsonSegment(payloadSeg, 'payload') as JwtClaims;

  const notices: string[] = [
    'The signature was NOT verified. This tool decodes the token only; decoding proves nothing about authenticity or integrity.',
  ];

  const alg = typeof header.alg === 'string' ? header.alg : undefined;
  if (!alg) {
    notices.push('The header declares no "alg", which is not a valid JWS header.');
  } else if (alg.toLowerCase() === 'none') {
    notices.push(
      'The header declares alg "none", meaning the token carries no signature at all. A server that accepts this cannot tell who issued the token.',
    );
  } else if (/^HS/i.test(alg)) {
    notices.push(
      `Algorithm ${alg} is symmetric: the same secret both signs and verifies. Verification requires that shared secret.`,
    );
  }

  if (signatureSeg === '') {
    notices.push('The signature segment is empty.');
  }

  if (claims.exp === undefined) {
    notices.push('There is no "exp" claim, so this token does not expire on its own.');
  }

  return {
    header,
    claims,
    signature: signatureSeg,
    signatureStatus: 'not-verified',
    notices,
    timing: describeTiming(claims, now),
    segments: { header: headerSeg, payload: payloadSeg, signature: signatureSeg },
  };
}

/**
 * Describes the time-based claims.
 *
 * These are the only assertions that can honestly be made without a key: whether the
 * instants the token itself states have passed.
 */
function describeTiming(claims: JwtClaims, now: Date): TimingFact[] {
  const facts: TimingFact[] = [];
  const nowMs = now.getTime();

  const add = (claim: TimingFact['claim'], label: string, seconds: unknown, blocking: (ms: number) => boolean, describe: (ms: number) => string) => {
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) return;
    const ms = seconds * 1000;
    facts.push({
      claim,
      label,
      isoTime: new Date(ms).toISOString(),
      relative: describe(ms),
      blocking: blocking(ms),
    });
  };

  add('iat', 'Issued at', claims.iat, () => false, (ms) => `${formatDelta(nowMs - ms)} ago`);

  add(
    'nbf',
    'Not valid before',
    claims.nbf,
    (ms) => ms > nowMs,
    (ms) => (ms > nowMs ? `starts in ${formatDelta(ms - nowMs)}` : `started ${formatDelta(nowMs - ms)} ago`),
  );

  add(
    'exp',
    'Expires',
    claims.exp,
    (ms) => ms <= nowMs,
    (ms) => (ms <= nowMs ? `expired ${formatDelta(nowMs - ms)} ago` : `in ${formatDelta(ms - nowMs)}`),
  );

  return facts;
}

function formatDelta(ms: number): string {
  const abs = Math.abs(ms);
  const seconds = Math.floor(abs / 1000);
  if (seconds < 60) return `${seconds} second${seconds === 1 ? '' : 's'}`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;

  const days = Math.floor(hours / 24);
  if (days < 365) return `${days} day${days === 1 ? '' : 's'}`;

  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'}`;
}

/** Well-known registered claim names, for labelling the payload view. */
export const REGISTERED_CLAIMS: Record<string, string> = {
  iss: 'Issuer — who created and signed the token.',
  sub: 'Subject — who the token is about.',
  aud: 'Audience — who the token is intended for. A verifier must check this matches itself.',
  exp: 'Expiration time, in seconds since the Unix epoch.',
  nbf: 'Not before — the token must be rejected earlier than this.',
  iat: 'Issued at, in seconds since the Unix epoch.',
  jti: 'JWT ID — a unique identifier, used to prevent replay.',
  azp: 'Authorized party — the client the token was issued to.',
  scope: 'Space-separated list of granted scopes.',
  scp: 'Granted scopes, as an array.',
  roles: 'Role claims, often used for authorization decisions.',
  groups: 'Group membership claims.',
  email: 'Email address of the subject.',
  email_verified: 'Whether the issuer has verified the email address.',
  name: 'Display name of the subject.',
  nonce: 'Value binding the token to a specific authentication request.',
  at_hash: 'Hash of the access token, binding it to this ID token.',
  client_id: 'The OAuth client the token was issued to.',
  typ: 'Token type.',
  kid: 'Key ID — tells a verifier which key from the issuer’s key set to use.',
  alg: 'Signing algorithm declared by the issuer.',
};
