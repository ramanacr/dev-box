/**
 * Shell command tokenizer.
 *
 * Splits a command line into structural tokens so each part can be explained
 * separately. This is a lexer only — nothing is ever executed, and no shell is
 * invoked. The goal is to describe what a command *would* do.
 *
 * Quoting rules follow POSIX shell closely enough for explanation purposes: single
 * quotes are literal, double quotes allow escapes and keep `$` visible for the
 * explainer to comment on, and a backslash escapes the next character outside single
 * quotes.
 */

export type TokenKind =
  | 'word'
  | 'operator'
  | 'redirection'
  | 'assignment'
  | 'comment';

export interface Token {
  kind: TokenKind;
  /** The text as written, including quotes. */
  raw: string;
  /** The text with one level of quoting removed. */
  value: string;
  /** Whether the value was wholly or partly quoted. */
  quoted: boolean;
  start: number;
  end: number;
}

/** Operators that separate or connect commands. */
const OPERATORS = ['&&', '||', '|&', '|', ';;', ';', '&', '\n'] as const;

/** Redirection forms, longest first so `>>` wins over `>`. */
const REDIRECTIONS = ['&>>', '&>', '>>', '<<<', '<<', '>|', '>', '<', '2>>', '2>'] as const;

const ASSIGNMENT_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  const push = (kind: TokenKind, raw: string, value: string, quoted: boolean, start: number) => {
    tokens.push({ kind, raw, value, quoted, start, end: start + raw.length });
  };

  while (i < input.length) {
    const ch = input[i]!;

    // Whitespace (newline is meaningful, handled as an operator).
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }

    // Comments run to end of line.
    if (ch === '#' && (i === 0 || /\s/.test(input[i - 1]!))) {
      const end = input.indexOf('\n', i);
      const stop = end === -1 ? input.length : end;
      const raw = input.slice(i, stop);
      push('comment', raw, raw.replace(/^#\s*/, ''), false, i);
      i = stop;
      continue;
    }

    // Redirections. Check before operators so `2>` is not split at `>`.
    const redirection = matchPrefix(input, i, REDIRECTIONS);
    if (redirection) {
      // A leading file descriptor digit belongs to the redirection: `2>file`.
      let start = i;
      let raw = redirection;
      if (i > 0 && /\d/.test(input[i - 1]!) && !redirection.startsWith('&')) {
        const prev = tokens[tokens.length - 1];
        if (prev && prev.kind === 'word' && /^\d+$/.test(prev.raw) && prev.end === i) {
          tokens.pop();
          start = prev.start;
          raw = prev.raw + redirection;
        }
      }
      push('redirection', raw, raw, false, start);
      i += redirection.length;
      continue;
    }

    const operator = matchPrefix(input, i, OPERATORS);
    if (operator) {
      push('operator', operator, operator, false, i);
      i += operator.length;
      continue;
    }

    // A word, which may contain quoted runs.
    const start = i;
    let raw = '';
    let value = '';
    let quoted = false;

    while (i < input.length) {
      const c = input[i]!;

      if (/[\s]/.test(c)) break;
      if (matchPrefix(input, i, OPERATORS)) break;
      if (matchPrefix(input, i, REDIRECTIONS)) break;

      if (c === "'") {
        const close = input.indexOf("'", i + 1);
        const stop = close === -1 ? input.length : close;
        raw += input.slice(i, stop + (close === -1 ? 0 : 1));
        value += input.slice(i + 1, stop);
        quoted = true;
        i = close === -1 ? input.length : close + 1;
        continue;
      }

      if (c === '"') {
        let j = i + 1;
        let inner = '';
        let rawInner = '"';
        while (j < input.length && input[j] !== '"') {
          if (input[j] === '\\' && j + 1 < input.length) {
            rawInner += input[j]! + input[j + 1]!;
            inner += input[j + 1]!;
            j += 2;
            continue;
          }
          rawInner += input[j]!;
          inner += input[j]!;
          j++;
        }
        if (j < input.length) rawInner += '"';
        raw += rawInner;
        value += inner;
        quoted = true;
        i = j + 1;
        continue;
      }

      if (c === '\\' && i + 1 < input.length) {
        raw += c + input[i + 1]!;
        value += input[i + 1]!;
        i += 2;
        continue;
      }

      raw += c;
      value += c;
      i++;
    }

    if (raw === '') {
      // Defensive: never loop without consuming input.
      i++;
      continue;
    }

    const kind: TokenKind = !quoted && ASSIGNMENT_RE.test(raw) ? 'assignment' : 'word';
    push(kind, raw, value, quoted, start);
  }

  return tokens;
}

function matchPrefix(input: string, at: number, candidates: readonly string[]): string | null {
  for (const candidate of candidates) {
    if (input.startsWith(candidate, at)) return candidate;
  }
  return null;
}

/** Splits tokens into pipeline segments on `|`, `&&`, `||`, `;` and newlines. */
export interface Segment {
  tokens: Token[];
  /** The operator that introduced this segment, if any. */
  precededBy?: string;
}

export function segment(tokens: Token[]): Segment[] {
  const segments: Segment[] = [];
  let current: Segment = { tokens: [] };

  for (const token of tokens) {
    if (token.kind === 'operator') {
      segments.push(current);
      current = { tokens: [], precededBy: token.value };
      continue;
    }
    current.tokens.push(token);
  }
  segments.push(current);

  return segments.filter((s) => s.tokens.length > 0 || s.precededBy !== undefined);
}
