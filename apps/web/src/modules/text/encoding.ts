/**
 * Additional encoders and time utilities from the white paper's D-2 and D-3 lists:
 * gzip compression, HMAC (only when the user supplies a key), and timezone
 * conversion.
 *
 * gzip uses the browser's own CompressionStream, and HMAC uses Web Crypto, so
 * neither adds a dependency and neither leaves the tab.
 */

export class EncodingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EncodingError';
  }
}

const MAX_INPUT_BYTES = 5 * 1024 * 1024;

function assertSize(bytes: Uint8Array | string): void {
  const length = typeof bytes === 'string' ? new TextEncoder().encode(bytes).length : bytes.length;
  if (length > MAX_INPUT_BYTES) {
    throw new EncodingError('Input exceeds the 5 MB limit.');
  }
}

/** CompressionStream is widely available but not universal; check before using it. */
export function supportsGzip(): boolean {
  return typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';
}

/**
 * Pushes bytes through a compression transform and collects the result.
 *
 * Drives the stream's own writer and reader rather than going via Blob.stream() or
 * Response: both are absent or incomplete in jsdom, so the Blob route worked in a
 * browser but could not be tested. The write is kicked off without awaiting so the
 * read loop can consume as it produces — awaiting the write first deadlocks on
 * backpressure once the input exceeds the internal queue.
 */
async function streamThrough(
  // Uint8Array<ArrayBuffer> rather than the default Uint8Array: the stream writer
  // requires a view over a non-shared buffer, which the narrower type guarantees.
  bytes: Uint8Array<ArrayBuffer>,
  transform: CompressionStream | DecompressionStream,
): Promise<Uint8Array<ArrayBuffer>> {
  // The write failure is captured rather than thrown from the promise. A corrupt
  // stream makes the read side fail first, so an un-awaited rejecting write promise
  // would surface as an unhandled rejection and could fail an unrelated test.
  let writeFailure: unknown;
  const writing = (async () => {
    const writer = transform.writable.getWriter();
    try {
      await writer.write(bytes);
      await writer.close();
    } catch (error) {
      await writer.abort(error).catch(() => {});
      throw error;
    }
  })().catch((error: unknown) => {
    writeFailure = error;
  });

  const reader = transform.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.length;
      }
    }
  } finally {
    reader.releaseLock();
    // Settle the write side before returning or rethrowing, either way.
    await writing;
  }

  if (writeFailure) throw writeFailure;

  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export interface GzipResult {
  /** Base64 of the compressed bytes, so the result is pasteable. */
  base64: string;
  originalBytes: number;
  compressedBytes: number;
  /** compressedBytes / originalBytes. Above 1 means compression made it larger. */
  ratio: number;
  note?: string;
}

/**
 * Compresses text with gzip and returns base64.
 *
 * The ratio is reported honestly, including when it is above 1: gzip adds an 18-byte
 * header and trailer, so short or already-compressed input grows. Hiding that would
 * make the tool misleading for exactly the inputs where the answer matters.
 */
export async function gzipCompress(input: string): Promise<GzipResult> {
  if (!supportsGzip()) {
    throw new EncodingError('This browser does not provide CompressionStream, so gzip is unavailable.');
  }
  assertSize(input);
  if (input === '') {
    throw new EncodingError('Enter text to compress.');
  }

  const original = new TextEncoder().encode(input);
  const compressed = await streamThrough(original, new CompressionStream('gzip'));

  const ratio = compressed.length / original.length;
  const result: GzipResult = {
    base64: bytesToBase64(compressed),
    originalBytes: original.length,
    compressedBytes: compressed.length,
    ratio,
  };

  if (ratio >= 1) {
    result.note =
      'The compressed output is larger than the input. gzip adds an 18-byte header and trailer, which dominates for short or already-compressed data.';
  }

  return result;
}

/** Decompresses base64-encoded gzip data back to text. */
export async function gzipDecompress(base64: string): Promise<string> {
  if (!supportsGzip()) {
    throw new EncodingError('This browser does not provide DecompressionStream, so gunzip is unavailable.');
  }

  const trimmed = base64.trim();
  if (trimmed === '') {
    throw new EncodingError('Enter base64-encoded gzip data to decompress.');
  }

  let bytes: Uint8Array<ArrayBuffer>;
  try {
    bytes = base64ToBytes(trimmed);
  } catch {
    throw new EncodingError('Input is not valid base64.');
  }
  assertSize(bytes);

  // 1f 8b is the gzip magic number. Checking it turns an opaque stream failure into
  // a message that says what is actually wrong.
  if (bytes.length < 2 || bytes[0] !== 0x1f || bytes[1] !== 0x8b) {
    throw new EncodingError(
      'This is valid base64 but not gzip data — the gzip magic number (1f 8b) is missing.',
    );
  }

  let decompressed: Uint8Array<ArrayBuffer>;
  try {
    decompressed = await streamThrough(bytes, new DecompressionStream('gzip'));
  } catch {
    throw new EncodingError('The gzip stream is truncated or corrupt.');
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(decompressed);
  } catch {
    throw new EncodingError('The decompressed data is not valid UTF-8 text.');
  }
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  // Chunked so a large array does not blow the argument limit of String.fromCharCode.
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);

  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// --- HMAC -----------------------------------------------------------------

export type HmacAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512' | 'SHA-1';

export const HMAC_ALGORITHMS: HmacAlgorithm[] = ['SHA-256', 'SHA-384', 'SHA-512', 'SHA-1'];

export interface HmacResult {
  hex: string;
  base64: string;
  algorithm: HmacAlgorithm;
  note?: string;
}

/**
 * Computes an HMAC over a message with a caller-supplied key.
 *
 * The white paper is specific that HMAC is offered only "when a user supplies a key",
 * so there is no default or generated key here: an empty key is an error rather than
 * something quietly substituted, because an HMAC with a guessable key authenticates
 * nothing.
 */
export async function computeHmac(
  message: string,
  key: string,
  algorithm: HmacAlgorithm = 'SHA-256',
): Promise<HmacResult> {
  if (key === '') {
    throw new EncodingError(
      'HMAC requires a secret key. Without one it is not a keyed hash and proves nothing about origin — use a plain SHA-256 hash instead.',
    );
  }
  if (!HMAC_ALGORITHMS.includes(algorithm)) {
    throw new EncodingError(`Unsupported HMAC algorithm: ${String(algorithm)}`);
  }
  assertSize(message);

  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: algorithm },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  const bytes = new Uint8Array(signature);

  const result: HmacResult = {
    hex: Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join(''),
    base64: bytesToBase64(bytes),
    algorithm,
  };

  if (algorithm === 'SHA-1') {
    result.note =
      'HMAC-SHA-1 is still considered secure as a MAC, but SHA-1 is deprecated for signatures. Prefer SHA-256 for anything new.';
  }

  return result;
}

// --- timezone conversion --------------------------------------------------

/**
 * A conservative list of IANA zones covering the common cases.
 *
 * Intl supports far more; this is the picker's shortlist, and an arbitrary zone can
 * still be typed. `Intl.supportedValuesOf` would give the full set but is not
 * available everywhere, so the list is explicit.
 */
export const COMMON_TIMEZONES = [
  'UTC',
  'America/Los_Angeles',
  'America/Denver',
  'America/Chicago',
  'America/New_York',
  'America/Sao_Paulo',
  'Europe/London',
  'Europe/Dublin',
  'Europe/Paris',
  'Europe/Berlin',
  'Europe/Madrid',
  'Europe/Moscow',
  'Africa/Cairo',
  'Africa/Lagos',
  'Africa/Johannesburg',
  'Asia/Jerusalem',
  'Asia/Dubai',
  'Asia/Karachi',
  'Asia/Kolkata',
  'Asia/Dhaka',
  'Asia/Bangkok',
  'Asia/Shanghai',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Australia/Perth',
  'Australia/Sydney',
  'Pacific/Auckland',
];

export interface ZoneReading {
  timeZone: string;
  /** Formatted wall-clock time in that zone. */
  formatted: string;
  /** UTC offset as written, for example "+05:30". */
  offset: string;
  /** Short zone name, for example "IST" or "GMT+5:30". */
  abbreviation: string;
}

/** Validates an IANA zone identifier by asking Intl to use it. */
export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

/**
 * Renders one instant across several zones.
 *
 * All readings describe the same instant — this converts the presentation, not the
 * moment, which is the distinction people most often get wrong when reasoning about
 * timezones.
 */
export function readInstantAcrossZones(instant: Date, timeZones: string[]): ZoneReading[] {
  if (Number.isNaN(instant.getTime())) {
    throw new EncodingError('That is not a valid date or time.');
  }

  return timeZones.map((timeZone) => {
    if (!isValidTimeZone(timeZone)) {
      throw new EncodingError(`"${timeZone}" is not a recognised IANA timezone identifier.`);
    }

    const formatted = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(instant);

    const abbreviation =
      new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'short' })
        .formatToParts(instant)
        .find((p) => p.type === 'timeZoneName')?.value ?? '';

    return { timeZone, formatted, offset: offsetFor(instant, timeZone), abbreviation };
  });
}

/**
 * Computes the UTC offset for a zone at an instant.
 *
 * Derived by formatting the instant in the target zone and comparing it with the
 * same instant in UTC, which handles daylight saving correctly for the date in
 * question rather than assuming a fixed offset.
 */
export function offsetFor(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  // Intl renders midnight as hour 24 in some environments.
  const hour = get('hour') % 24;

  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'));
  const diffMinutes = Math.round((asUtc - instant.getTime()) / 60000);

  const sign = diffMinutes < 0 ? '-' : '+';
  const abs = Math.abs(diffMinutes);
  const hours = String(Math.floor(abs / 60)).padStart(2, '0');
  const minutes = String(abs % 60).padStart(2, '0');

  return `${sign}${hours}:${minutes}`;
}

/**
 * Interprets a wall-clock time as it would be in a given zone, returning the instant.
 *
 * This is the harder direction: "09:00 in Asia/Tokyo" names a different instant from
 * "09:00 in Europe/London". Uses a two-pass correction because the offset itself
 * depends on the instant being computed.
 */
export function instantFromWallClock(wallClock: string, timeZone: string): Date {
  if (!isValidTimeZone(timeZone)) {
    throw new EncodingError(`"${timeZone}" is not a recognised IANA timezone identifier.`);
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(wallClock.trim());
  if (!match) {
    throw new EncodingError('Enter a date and time as YYYY-MM-DDTHH:MM, for example 2026-09-12T09:00.');
  }

  const [, y, mo, d, h, mi, s] = match;
  const naiveUtc = Date.UTC(
    Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? '0'),
  );

  // First pass: assume the offset at the naive instant.
  let instant = new Date(naiveUtc - offsetMinutes(new Date(naiveUtc), timeZone) * 60000);
  // Second pass: recompute with the offset that actually applies there, which fixes
  // instants that land near a daylight-saving transition.
  instant = new Date(naiveUtc - offsetMinutes(instant, timeZone) * 60000);

  return instant;
}

function offsetMinutes(instant: Date, timeZone: string): number {
  const offset = offsetFor(instant, timeZone);
  const sign = offset.startsWith('-') ? -1 : 1;
  const [hours, minutes] = offset.slice(1).split(':').map(Number);
  return sign * ((hours ?? 0) * 60 + (minutes ?? 0));
}
