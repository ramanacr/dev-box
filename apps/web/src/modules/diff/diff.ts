/**
 * Text and line diff.
 *
 * White paper D-4 lists a diff among the text/code utilities. Implemented with the
 * Myers longest-common-subsequence algorithm over a middle-snake search, which is
 * what git and most diff tools use: it finds a minimal edit script in O(ND) time
 * rather than the O(N²) of a naive LCS table, so a large file does not stall the tab.
 *
 * Runs entirely in the browser. Nothing is uploaded.
 */

export type ChangeKind = 'equal' | 'insert' | 'delete';

export interface DiffLine {
  kind: ChangeKind;
  /** 1-based line number in the left document, if present there. */
  leftNumber?: number;
  /** 1-based line number in the right document, if present there. */
  rightNumber?: number;
  text: string;
  /**
   * Word-level segments, present only on paired replace lines so the UI can
   * highlight what actually changed inside an otherwise similar line.
   */
  words?: { kind: ChangeKind; text: string }[];
}

export interface Hunk {
  leftStart: number;
  leftCount: number;
  rightStart: number;
  rightCount: number;
  lines: DiffLine[];
}

export interface DiffResult {
  lines: DiffLine[];
  hunks: Hunk[];
  stats: { added: number; removed: number; unchanged: number };
  identical: boolean;
  /** Set when a normalisation option hid a difference that otherwise exists. */
  notes: string[];
}

export interface DiffOptions {
  /** Ignore leading and trailing whitespace on each line. */
  ignoreWhitespace?: boolean;
  /** Ignore case when comparing. */
  ignoreCase?: boolean;
  /** Lines of unchanged context to keep around each hunk. */
  context?: number;
}

export class DiffError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiffError';
  }
}

const MAX_INPUT_BYTES = 5 * 1024 * 1024;
const MAX_LINES = 50_000;

export function diffText(left: string, right: string, options: DiffOptions = {}): DiffResult {
  const encoder = new TextEncoder();
  if (encoder.encode(left).length > MAX_INPUT_BYTES || encoder.encode(right).length > MAX_INPUT_BYTES) {
    throw new DiffError('Each side is limited to 5 MB.');
  }

  const leftLines = splitLines(left);
  const rightLines = splitLines(right);

  if (leftLines.length > MAX_LINES || rightLines.length > MAX_LINES) {
    throw new DiffError(`Each side is limited to ${MAX_LINES.toLocaleString()} lines.`);
  }

  const normalize = (line: string): string => {
    let out = line;
    if (options.ignoreWhitespace) out = out.trim().replace(/\s+/g, ' ');
    if (options.ignoreCase) out = out.toLowerCase();
    return out;
  };

  const script = myersDiff(leftLines.map(normalize), rightLines.map(normalize));

  const lines: DiffLine[] = [];
  let leftIndex = 0;
  let rightIndex = 0;

  for (const op of script) {
    switch (op.kind) {
      case 'equal':
        for (let i = 0; i < op.count; i++) {
          lines.push({
            kind: 'equal',
            leftNumber: leftIndex + 1,
            rightNumber: rightIndex + 1,
            text: leftLines[leftIndex]!,
          });
          leftIndex++;
          rightIndex++;
        }
        break;

      case 'delete':
        for (let i = 0; i < op.count; i++) {
          lines.push({ kind: 'delete', leftNumber: leftIndex + 1, text: leftLines[leftIndex]! });
          leftIndex++;
        }
        break;

      case 'insert':
        for (let i = 0; i < op.count; i++) {
          lines.push({ kind: 'insert', rightNumber: rightIndex + 1, text: rightLines[rightIndex]! });
          rightIndex++;
        }
        break;
    }
  }

  annotateWordChanges(lines);

  const stats = {
    added: lines.filter((l) => l.kind === 'insert').length,
    removed: lines.filter((l) => l.kind === 'delete').length,
    unchanged: lines.filter((l) => l.kind === 'equal').length,
  };

  const notes: string[] = [];
  if ((options.ignoreWhitespace || options.ignoreCase) && stats.added === 0 && stats.removed === 0 && left !== right) {
    // Saying "identical" when a normalisation hid the difference would be misleading.
    notes.push(
      'The documents differ only in ' +
        [options.ignoreWhitespace && 'whitespace', options.ignoreCase && 'letter case']
          .filter(Boolean)
          .join(' and ') +
        ', which the current options ignore.',
    );
  }
  if (left.endsWith('\n') !== right.endsWith('\n')) {
    notes.push('One side ends with a trailing newline and the other does not.');
  }

  return {
    lines,
    hunks: buildHunks(lines, options.context ?? 3),
    stats,
    identical: stats.added === 0 && stats.removed === 0,
    notes,
  };
}

/** Splits on any line ending without keeping a trailing empty element. */
function splitLines(text: string): string[] {
  if (text === '') return [];
  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

interface EditOp {
  kind: ChangeKind;
  count: number;
}

/**
 * Myers diff, returning a run-length edit script.
 *
 * Common prefixes and suffixes are stripped first, which is what makes a small edit
 * inside a large file cheap. The remaining middle is solved by the standard greedy
 * forward search over d-paths.
 */
function myersDiff(a: string[], b: string[]): EditOp[] {
  // Strip the common prefix.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;

  // Strip the common suffix.
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const middleA = a.slice(prefix, a.length - suffix);
  const middleB = b.slice(prefix, b.length - suffix);

  const ops: EditOp[] = [];
  if (prefix > 0) ops.push({ kind: 'equal', count: prefix });
  ops.push(...diffMiddle(middleA, middleB));
  if (suffix > 0) ops.push({ kind: 'equal', count: suffix });

  return coalesce(ops);
}

function diffMiddle(a: string[], b: string[]): EditOp[] {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ kind: 'insert', count: b.length }];
  if (b.length === 0) return [{ kind: 'delete', count: a.length }];

  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max;

  // v[k + offset] is the furthest x reached on diagonal k. A trace of each d-step is
  // kept so the path can be walked back into an edit script.
  const trace: Int32Array[] = [];
  let v = new Int32Array(2 * max + 1).fill(-1);
  v[offset + 1] = 0;

  let found = -1;
  for (let d = 0; d <= max; d++) {
    trace.push(v.slice());
    const next = v.slice();

    for (let k = -d; k <= d; k += 2) {
      let x: number;
      const down = k === -d || (k !== d && (v[offset + k - 1] ?? -1) < (v[offset + k + 1] ?? -1));
      if (down) {
        x = v[offset + k + 1] ?? 0;
      } else {
        x = (v[offset + k - 1] ?? 0) + 1;
      }
      let y = x - k;

      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }

      next[offset + k] = x;

      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }

    v = next;
    if (found !== -1) {
      trace.push(v.slice());
      break;
    }
  }

  if (found === -1) {
    // Cannot happen for finite inputs, but fall back rather than loop.
    return [{ kind: 'delete', count: n }, { kind: 'insert', count: m }];
  }

  return backtrack(trace, a, b, offset, found);
}

function backtrack(
  trace: Int32Array[],
  a: string[],
  b: string[],
  offset: number,
  found: number,
): EditOp[] {
  const ops: EditOp[] = [];
  let x = a.length;
  let y = b.length;

  for (let d = found; d > 0; d--) {
    const v = trace[d]!;
    const k = x - y;

    const down = k === -d || (k !== d && (v[offset + k - 1] ?? -1) < (v[offset + k + 1] ?? -1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[offset + prevK] ?? 0;
    const prevY = prevX - prevK;

    // Walk back the diagonal (the matching run).
    while (x > prevX && y > prevY) {
      ops.push({ kind: 'equal', count: 1 });
      x--;
      y--;
    }

    if (down) {
      ops.push({ kind: 'insert', count: 1 });
      y--;
    } else {
      ops.push({ kind: 'delete', count: 1 });
      x--;
    }
  }

  // Any remaining diagonal at d = 0.
  while (x > 0 && y > 0) {
    ops.push({ kind: 'equal', count: 1 });
    x--;
    y--;
  }
  while (x > 0) {
    ops.push({ kind: 'delete', count: 1 });
    x--;
  }
  while (y > 0) {
    ops.push({ kind: 'insert', count: 1 });
    y--;
  }

  return coalesce(ops.reverse());
}

function coalesce(ops: EditOp[]): EditOp[] {
  const out: EditOp[] = [];
  for (const op of ops) {
    if (op.count === 0) continue;
    const last = out[out.length - 1];
    if (last && last.kind === op.kind) {
      last.count += op.count;
    } else {
      out.push({ ...op });
    }
  }
  return out;
}

/**
 * Adds word-level segments to delete/insert pairs that look like an edit of the same
 * line, so the UI can show what changed inside it rather than colouring the whole
 * line.
 */
function annotateWordChanges(lines: DiffLine[]): void {
  for (let i = 0; i < lines.length - 1; i++) {
    const left = lines[i]!;
    const right = lines[i + 1]!;

    if (left.kind !== 'delete' || right.kind !== 'insert') continue;
    // Only pair a single delete with a single insert.
    if (lines[i + 2]?.kind === 'insert') continue;
    if (!isSimilar(left.text, right.text)) continue;

    const leftWords = tokenizeWords(left.text);
    const rightWords = tokenizeWords(right.text);
    const script = myersDiff(leftWords, rightWords);

    const leftSegments: { kind: ChangeKind; text: string }[] = [];
    const rightSegments: { kind: ChangeKind; text: string }[] = [];

    let li = 0;
    let ri = 0;
    for (const op of script) {
      if (op.kind === 'equal') {
        const text = leftWords.slice(li, li + op.count).join('');
        leftSegments.push({ kind: 'equal', text });
        rightSegments.push({ kind: 'equal', text });
        li += op.count;
        ri += op.count;
      } else if (op.kind === 'delete') {
        leftSegments.push({ kind: 'delete', text: leftWords.slice(li, li + op.count).join('') });
        li += op.count;
      } else {
        rightSegments.push({ kind: 'insert', text: rightWords.slice(ri, ri + op.count).join('') });
        ri += op.count;
      }
    }

    left.words = leftSegments;
    right.words = rightSegments;
    i++; // Skip the insert we just paired.
  }
}

/** Splits into words while preserving the whitespace between them. */
function tokenizeWords(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * Decides whether two lines are close enough to be worth a word-level comparison.
 * Uses a cheap character-bag overlap rather than a second diff, since this runs for
 * every delete/insert pair.
 */
function isSimilar(a: string, b: string): boolean {
  if (a === '' || b === '') return false;

  const longer = Math.max(a.length, b.length);
  if (longer > 1000) return false;

  const counts = new Map<string, number>();
  for (const ch of a) counts.set(ch, (counts.get(ch) ?? 0) + 1);

  let shared = 0;
  for (const ch of b) {
    const remaining = counts.get(ch) ?? 0;
    if (remaining > 0) {
      shared++;
      counts.set(ch, remaining - 1);
    }
  }

  return shared / longer >= 0.5;
}

/** Groups changes into hunks with surrounding context, like a unified diff. */
function buildHunks(lines: DiffLine[], context: number): Hunk[] {
  const changedIndexes = lines
    .map((line, i) => (line.kind === 'equal' ? -1 : i))
    .filter((i) => i !== -1);

  if (changedIndexes.length === 0) return [];

  const hunks: Hunk[] = [];
  let start = Math.max(0, changedIndexes[0]! - context);
  let end = Math.min(lines.length - 1, changedIndexes[0]! + context);

  for (const index of changedIndexes.slice(1)) {
    if (index - context <= end + 1) {
      end = Math.min(lines.length - 1, index + context);
    } else {
      hunks.push(makeHunk(lines, start, end));
      start = Math.max(0, index - context);
      end = Math.min(lines.length - 1, index + context);
    }
  }
  hunks.push(makeHunk(lines, start, end));

  return hunks;
}

function makeHunk(lines: DiffLine[], start: number, end: number): Hunk {
  const slice = lines.slice(start, end + 1);

  const leftNumbers = slice.map((l) => l.leftNumber).filter((n): n is number => n !== undefined);
  const rightNumbers = slice.map((l) => l.rightNumber).filter((n): n is number => n !== undefined);

  return {
    leftStart: leftNumbers[0] ?? 0,
    leftCount: leftNumbers.length,
    rightStart: rightNumbers[0] ?? 0,
    rightCount: rightNumbers.length,
    lines: slice,
  };
}

/** Renders the result in unified diff format. */
export function toUnifiedDiff(
  result: DiffResult,
  leftLabel = 'left',
  rightLabel = 'right',
): string {
  if (result.hunks.length === 0) return '';

  const out: string[] = [`--- ${leftLabel}`, `+++ ${rightLabel}`];

  for (const hunk of result.hunks) {
    out.push(
      `@@ -${hunk.leftStart},${hunk.leftCount} +${hunk.rightStart},${hunk.rightCount} @@`,
    );
    for (const line of hunk.lines) {
      const marker = line.kind === 'insert' ? '+' : line.kind === 'delete' ? '-' : ' ';
      out.push(marker + line.text);
    }
  }

  return out.join('\n');
}
