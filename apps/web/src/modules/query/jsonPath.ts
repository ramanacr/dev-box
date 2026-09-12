/**
 * JSONPath query engine.
 *
 * Implemented natively rather than pulled in as a dependency, following the white
 * paper's design rule to prefer the smallest component that satisfies the
 * requirement, and its instruction to "implement a selected transformer registry
 * rather than cloning every conversion".
 *
 * Supported syntax is stated explicitly in SUPPORTED_SYNTAX below and the UI shows
 * it, because the delivery standard forbids claiming support for a flavour the
 * implementation has not tested. Filter expressions are parsed into a small typed
 * form and evaluated; no user text is ever passed to eval or the Function
 * constructor.
 */

export interface QueryResult {
  /** Matching values, in document order. */
  values: unknown[];
  /** Normalised path to each match, e.g. `$['items'][0]['name']`. */
  paths: string[];
}

export class JsonPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JsonPathError';
  }
}

export const SUPPORTED_SYNTAX = [
  { syntax: '$', meaning: 'The root value.' },
  { syntax: '.name / ["name"]', meaning: 'A named child property.' },
  { syntax: '[0] / [-1]', meaning: 'An array element; negative indexes count from the end.' },
  { syntax: '[0,2,4]', meaning: 'Several specific indexes or names.' },
  { syntax: '[1:4] / [:3] / [2:]', meaning: 'An array slice, end-exclusive.' },
  { syntax: '*', meaning: 'Every child of the current value.' },
  { syntax: '..name', meaning: 'Recursive descent: the property at any depth.' },
  { syntax: '[?(@.price > 10)]', meaning: 'Filter by comparison on each child.' },
  { syntax: '[?(@.tag == "sale")]', meaning: 'Filter by equality; == != < <= > >= are supported.' },
  { syntax: '[?(@.name)]', meaning: 'Filter by presence of a property.' },
] as const;

const MAX_RESULTS = 10_000;

type Segment =
  | { kind: 'root' }
  | { kind: 'child'; names: string[] }
  | { kind: 'index'; indexes: number[] }
  | { kind: 'slice'; start?: number; end?: number; step: number }
  | { kind: 'wildcard' }
  | { kind: 'descend'; name?: string }
  | { kind: 'filter'; expr: FilterExpr };

type FilterExpr =
  | { kind: 'exists'; path: string[] }
  | {
      kind: 'compare';
      path: string[];
      op: '==' | '!=' | '<' | '<=' | '>' | '>=';
      value: string | number | boolean | null;
    };

/** Evaluates a JSONPath expression against a value. */
export function queryJsonPath(root: unknown, expression: string): QueryResult {
  const segments = parse(expression);

  let current: { value: unknown; path: string[] }[] = [{ value: root, path: [] }];

  for (const segment of segments) {
    if (segment.kind === 'root') continue;

    const next: { value: unknown; path: string[] }[] = [];

    for (const node of current) {
      applySegment(segment, node, next);
      if (next.length > MAX_RESULTS) {
        throw new JsonPathError(
          `Query matched more than ${MAX_RESULTS} values. Narrow it with an index, slice or filter.`,
        );
      }
    }

    current = next;
  }

  return {
    values: current.map((n) => n.value),
    paths: current.map((n) => formatPath(n.path)),
  };
}

function applySegment(
  segment: Segment,
  node: { value: unknown; path: string[] },
  out: { value: unknown; path: string[] }[],
): void {
  const { value, path } = node;

  switch (segment.kind) {
    case 'child': {
      if (!isRecord(value)) return;
      for (const name of segment.names) {
        if (Object.prototype.hasOwnProperty.call(value, name)) {
          out.push({ value: value[name], path: [...path, name] });
        }
      }
      return;
    }

    case 'index': {
      if (!Array.isArray(value)) return;
      for (const raw of segment.indexes) {
        const index = raw < 0 ? value.length + raw : raw;
        if (index >= 0 && index < value.length) {
          out.push({ value: value[index], path: [...path, String(index)] });
        }
      }
      return;
    }

    case 'slice': {
      if (!Array.isArray(value)) return;
      const length = value.length;
      const step = segment.step;
      if (step === 0) return;

      let start = segment.start ?? (step > 0 ? 0 : length - 1);
      let end = segment.end ?? (step > 0 ? length : -length - 1);
      if (start < 0) start += length;
      if (segment.end !== undefined && end < 0) end += length;

      if (step > 0) {
        for (let i = Math.max(start, 0); i < Math.min(end, length); i += step) {
          out.push({ value: value[i], path: [...path, String(i)] });
        }
      } else {
        for (let i = Math.min(start, length - 1); i > Math.max(end, -1); i += step) {
          out.push({ value: value[i], path: [...path, String(i)] });
        }
      }
      return;
    }

    case 'wildcard': {
      if (Array.isArray(value)) {
        value.forEach((item, i) => out.push({ value: item, path: [...path, String(i)] }));
      } else if (isRecord(value)) {
        for (const [key, child] of Object.entries(value)) {
          out.push({ value: child, path: [...path, key] });
        }
      }
      return;
    }

    case 'descend': {
      // Visit this node and every descendant, collecting the named property (or
      // every node when no name is given).
      walk(value, path, (v, p) => {
        if (segment.name === undefined) {
          out.push({ value: v, path: p });
          return;
        }
        if (isRecord(v) && Object.prototype.hasOwnProperty.call(v, segment.name)) {
          out.push({ value: v[segment.name], path: [...p, segment.name] });
        }
      });
      return;
    }

    case 'filter': {
      const children: { value: unknown; path: string[] }[] = [];
      if (Array.isArray(value)) {
        value.forEach((item, i) => children.push({ value: item, path: [...path, String(i)] }));
      } else if (isRecord(value)) {
        for (const [key, child] of Object.entries(value)) {
          children.push({ value: child, path: [...path, key] });
        }
      }

      for (const child of children) {
        if (evaluateFilter(segment.expr, child.value)) out.push(child);
      }
      return;
    }

    case 'root':
      return;
  }
}

function walk(
  value: unknown,
  path: string[],
  visit: (value: unknown, path: string[]) => void,
): void {
  visit(value, path);

  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, [...path, String(i)], visit));
  } else if (isRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      walk(child, [...path, key], visit);
    }
  }
}

function evaluateFilter(expr: FilterExpr, value: unknown): boolean {
  const actual = resolvePath(value, expr.path);

  if (expr.kind === 'exists') {
    return actual !== undefined;
  }

  if (actual === undefined) return false;

  switch (expr.op) {
    case '==':
      return actual === expr.value;
    case '!=':
      return actual !== expr.value;
    default:
      break;
  }

  // Ordering comparisons only make sense between two numbers or two strings.
  if (typeof actual === 'number' && typeof expr.value === 'number') {
    return compareOrdered(actual, expr.value, expr.op);
  }
  if (typeof actual === 'string' && typeof expr.value === 'string') {
    return compareOrdered(actual, expr.value, expr.op);
  }
  return false;
}

function compareOrdered<T extends number | string>(a: T, b: T, op: '<' | '<=' | '>' | '>='): boolean {
  switch (op) {
    case '<':
      return a < b;
    case '<=':
      return a <= b;
    case '>':
      return a > b;
    case '>=':
      return a >= b;
  }
}

function resolvePath(value: unknown, path: string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    if (isRecord(current)) {
      current = current[key];
    } else if (Array.isArray(current)) {
      const index = Number(key);
      current = Number.isInteger(index) ? current[index] : undefined;
    } else {
      return undefined;
    }
    if (current === undefined) return undefined;
  }
  return current;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatPath(path: string[]): string {
  return (
    '$' +
    path
      .map((key) => (/^\d+$/.test(key) ? `[${key}]` : `['${key.replace(/'/g, "\\'")}']`))
      .join('')
  );
}

// --- parser ---------------------------------------------------------------

function parse(expression: string): Segment[] {
  const input = expression.trim();
  if (input === '') {
    throw new JsonPathError('Enter a JSONPath expression, for example $.items[0].name');
  }
  if (input.length > 1000) {
    throw new JsonPathError('Expression is too long.');
  }

  const segments: Segment[] = [];
  let i = 0;

  if (input[0] === '$') {
    segments.push({ kind: 'root' });
    i = 1;
  } else if (input[0] !== '.' && input[0] !== '[') {
    // Allow a bare property path such as "items[0]".
    segments.push({ kind: 'root' });
  } else {
    segments.push({ kind: 'root' });
  }

  while (i < input.length) {
    const ch = input[i]!;

    if (ch === '.') {
      // Recursive descent.
      if (input[i + 1] === '.') {
        i += 2;
        if (input[i] === '*') {
          segments.push({ kind: 'descend' });
          i++;
          continue;
        }
        if (input[i] === '[') {
          // `..[0]` — descend to every node, then index.
          segments.push({ kind: 'descend' });
          continue;
        }
        const name = readName(input, i);
        if (name.text === '') {
          throw new JsonPathError('Expected a property name after "..".');
        }
        segments.push({ kind: 'descend', name: name.text });
        i = name.next;
        continue;
      }

      i++;
      if (input[i] === '*') {
        segments.push({ kind: 'wildcard' });
        i++;
        continue;
      }
      const name = readName(input, i);
      if (name.text === '') {
        throw new JsonPathError(`Expected a property name after "." at position ${i}.`);
      }
      segments.push({ kind: 'child', names: [name.text] });
      i = name.next;
      continue;
    }

    if (ch === '[') {
      const close = findClosingBracket(input, i);
      const inner = input.slice(i + 1, close).trim();
      segments.push(parseBracket(inner));
      i = close + 1;
      continue;
    }

    if (ch === '*') {
      segments.push({ kind: 'wildcard' });
      i++;
      continue;
    }

    // A bare leading name, e.g. "items.name".
    const name = readName(input, i);
    if (name.text === '') {
      throw new JsonPathError(`Unexpected character "${ch}" at position ${i}.`);
    }
    segments.push({ kind: 'child', names: [name.text] });
    i = name.next;
  }

  return segments;
}

function readName(input: string, from: number): { text: string; next: number } {
  let i = from;
  while (i < input.length && /[A-Za-z0-9_\-$@]/.test(input[i]!)) i++;
  return { text: input.slice(from, i), next: i };
}

function findClosingBracket(input: string, open: number): number {
  let depth = 0;
  let quote: string | null = null;

  for (let i = open; i < input.length; i++) {
    const ch = input[i]!;

    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '[') depth++;
    if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }

  throw new JsonPathError('Unbalanced "[" in expression.');
}

function parseBracket(inner: string): Segment {
  if (inner === '') {
    throw new JsonPathError('Empty "[]" is not a valid step.');
  }

  if (inner === '*') return { kind: 'wildcard' };

  // Filter expression.
  if (inner.startsWith('?')) {
    let body = inner.slice(1).trim();
    if (body.startsWith('(') && body.endsWith(')')) {
      body = body.slice(1, -1).trim();
    }
    return { kind: 'filter', expr: parseFilter(body) };
  }

  // Slice.
  if (inner.includes(':')) {
    const pieces = inner.split(':');
    if (pieces.length > 3) {
      throw new JsonPathError(`Invalid slice "${inner}".`);
    }
    const toNumber = (text: string | undefined, what: string): number | undefined => {
      const trimmed = text?.trim() ?? '';
      if (trimmed === '') return undefined;
      const n = Number(trimmed);
      if (!Number.isInteger(n)) {
        throw new JsonPathError(`Slice ${what} must be an integer, got "${trimmed}".`);
      }
      return n;
    };

    const start = toNumber(pieces[0], 'start');
    const end = toNumber(pieces[1], 'end');
    const step = toNumber(pieces[2], 'step') ?? 1;

    const slice: Segment = { kind: 'slice', step };
    if (start !== undefined) slice.start = start;
    if (end !== undefined) slice.end = end;
    return slice;
  }

  // Union or single subscript. Quoted entries are names, bare integers are indexes.
  const entries = splitTopLevel(inner, ',').map((e) => e.trim());

  const allQuoted = entries.every((e) => /^(['"]).*\1$/.test(e));
  if (allQuoted) {
    return { kind: 'child', names: entries.map(unquote) };
  }

  const allIntegers = entries.every((e) => /^-?\d+$/.test(e));
  if (allIntegers) {
    return { kind: 'index', indexes: entries.map(Number) };
  }

  // A bare, unquoted name such as [name].
  if (entries.length === 1 && /^[A-Za-z_][A-Za-z0-9_\-]*$/.test(entries[0]!)) {
    return { kind: 'child', names: [entries[0]!] };
  }

  throw new JsonPathError(
    `Cannot interpret "[${inner}]". Mix quoted names or integer indexes, not both.`,
  );
}

function parseFilter(body: string): FilterExpr {
  if (body === '') {
    throw new JsonPathError('Empty filter expression.');
  }

  const operators = ['==', '!=', '<=', '>=', '<', '>'] as const;
  for (const op of operators) {
    const at = findOperator(body, op);
    if (at === -1) continue;

    const left = body.slice(0, at).trim();
    const right = body.slice(at + op.length).trim();

    return {
      kind: 'compare',
      path: parseFilterPath(left),
      op,
      value: parseLiteral(right),
    };
  }

  // No operator: a presence test.
  return { kind: 'exists', path: parseFilterPath(body) };
}

/** Finds an operator outside of quotes, preferring the longest form. */
function findOperator(body: string, op: string): number {
  let quote: string | null = null;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (quote) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (body.startsWith(op, i)) {
      // Do not match "<" inside "<=".
      if (op.length === 1 && (body[i + 1] === '=' || body[i - 1] === '!' || body[i - 1] === '=')) {
        continue;
      }
      return i;
    }
  }
  return -1;
}

function parseFilterPath(text: string): string[] {
  let path = text.trim();
  if (path.startsWith('@')) path = path.slice(1);
  if (path.startsWith('.')) path = path.slice(1);

  if (path === '') return [];

  const parts: string[] = [];
  const pattern = /\[\s*(['"])(.*?)\1\s*\]|\[\s*(-?\d+)\s*\]|([A-Za-z0-9_\-]+)/g;

  let match: RegExpExecArray | null;
  let consumed = 0;
  while ((match = pattern.exec(path)) !== null) {
    consumed = pattern.lastIndex;
    parts.push(match[2] ?? match[3] ?? match[4] ?? '');
  }

  if (parts.length === 0 || consumed === 0) {
    throw new JsonPathError(`Cannot interpret filter path "${text}".`);
  }
  return parts;
}

function parseLiteral(text: string): string | number | boolean | null {
  const trimmed = text.trim();

  if (/^(['"]).*\1$/.test(trimmed)) return unquote(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;

  const asNumber = Number(trimmed);
  if (trimmed !== '' && Number.isFinite(asNumber)) return asNumber;

  throw new JsonPathError(
    `Cannot interpret "${trimmed}" as a value. Quote strings, or use a number, true, false or null.`,
  );
}

function unquote(text: string): string {
  return text.slice(1, -1).replace(/\\(['"\\])/g, '$1');
}

function splitTopLevel(input: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = '';

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;

    if (quote) {
      current += ch;
      if (ch === '\\' && i + 1 < input.length) {
        current += input[++i]!;
        continue;
      }
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === '[' || ch === '(') depth++;
    if (ch === ']' || ch === ')') depth--;

    if (ch === separator && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  parts.push(current);
  return parts;
}
