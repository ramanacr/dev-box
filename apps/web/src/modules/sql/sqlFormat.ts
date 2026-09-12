/**
 * SQL formatter and dialect-aware linter.
 *
 * White paper D-5: "SQL assistant: formatter, dialect-aware linting, explain-plan
 * viewer from pasted output, and safe parameterized-query examples. Do not connect
 * directly to databases in v1."
 *
 * This module honours that last sentence absolutely: there is no connection code
 * here, no driver dependency, and no way to execute anything. It reads text.
 *
 * The formatter is a token-based re-indenter rather than a full parser. That is a
 * deliberate limit — a complete SQL grammar across five dialects is a large surface
 * — and it means the formatter preserves the statement's tokens exactly and only
 * changes whitespace. It never rewrites a query.
 */

export type SqlDialect = 'ansi' | 'postgres' | 'mysql' | 'sqlserver' | 'sqlite';

export const DIALECTS: { id: SqlDialect; label: string }[] = [
  { id: 'ansi', label: 'ANSI SQL' },
  { id: 'postgres', label: 'PostgreSQL' },
  { id: 'mysql', label: 'MySQL / MariaDB' },
  { id: 'sqlserver', label: 'SQL Server (T-SQL)' },
  { id: 'sqlite', label: 'SQLite' },
];

export type LintSeverity = 'error' | 'warning' | 'info';

export interface LintFinding {
  severity: LintSeverity;
  /** Short machine-ish identifier, useful for suppressing or grouping. */
  rule: string;
  message: string;
  /** 1-based line number in the input, when the finding is locatable. */
  line?: number;
}

export class SqlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SqlError';
  }
}

const MAX_INPUT_BYTES = 2 * 1024 * 1024;

// Keywords that begin a new clause and therefore a new line at the current indent.
const CLAUSE_KEYWORDS = new Set([
  'SELECT', 'FROM', 'WHERE', 'GROUP', 'HAVING', 'ORDER', 'LIMIT', 'OFFSET',
  'UNION', 'INTERSECT', 'EXCEPT', 'INSERT', 'UPDATE', 'DELETE', 'SET',
  'VALUES', 'RETURNING', 'WITH', 'WINDOW', 'FETCH',
]);

// Join keywords, which get their own line but read as part of FROM.
const JOIN_KEYWORDS = new Set(['JOIN', 'INNER', 'LEFT', 'RIGHT', 'FULL', 'CROSS', 'NATURAL', 'LATERAL']);

// Keywords that continue a clause on a new line, indented one level.
const CONTINUATION_KEYWORDS = new Set(['AND', 'OR', 'ON']);

const RESERVED = new Set([
  ...CLAUSE_KEYWORDS, ...JOIN_KEYWORDS, ...CONTINUATION_KEYWORDS,
  'AS', 'BY', 'ASC', 'DESC', 'DISTINCT', 'ALL', 'INTO', 'CASE', 'WHEN', 'THEN',
  'ELSE', 'END', 'NOT', 'NULL', 'IS', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE',
  'JOIN', 'USING', 'CAST', 'THEN', 'OVER', 'PARTITION', 'ROWS', 'RANGE',
  'CREATE', 'TABLE', 'VIEW', 'INDEX', 'DROP', 'ALTER', 'ADD', 'COLUMN',
  'PRIMARY', 'KEY', 'FOREIGN', 'REFERENCES', 'UNIQUE', 'CHECK', 'DEFAULT',
  'CONSTRAINT', 'CASCADE', 'TRUE', 'FALSE', 'ON', 'OR', 'AND', 'ANY', 'SOME',
]);

type TokenType = 'keyword' | 'identifier' | 'number' | 'string' | 'operator' | 'punct' | 'comment' | 'parameter';

interface Token {
  type: TokenType;
  value: string;
  /** Uppercased value, for keyword comparison. */
  upper: string;
  line: number;
}

/** Tokenizes SQL well enough to re-indent it without altering its meaning. */
export function tokenizeSql(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  let line = 1;

  const push = (type: TokenType, value: string) => {
    tokens.push({ type, value, upper: value.toUpperCase(), line });
  };

  while (i < input.length) {
    const ch = input[i]!;

    if (ch === '\n') {
      line++;
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Line comment.
    if (input.startsWith('--', i)) {
      const end = input.indexOf('\n', i);
      const stop = end === -1 ? input.length : end;
      push('comment', input.slice(i, stop));
      i = stop;
      continue;
    }

    // Block comment.
    if (input.startsWith('/*', i)) {
      const end = input.indexOf('*/', i + 2);
      const stop = end === -1 ? input.length : end + 2;
      const text = input.slice(i, stop);
      push('comment', text);
      line += (text.match(/\n/g) ?? []).length;
      i = stop;
      continue;
    }

    // Single-quoted string literal. '' is an escaped quote in SQL.
    if (ch === "'") {
      let j = i + 1;
      while (j < input.length) {
        if (input[j] === "'" && input[j + 1] === "'") {
          j += 2;
          continue;
        }
        if (input[j] === "'") break;
        j++;
      }
      const text = input.slice(i, Math.min(j + 1, input.length));
      push('string', text);
      line += (text.match(/\n/g) ?? []).length;
      i = j + 1;
      continue;
    }

    // Quoted identifiers: "ansi", `mysql`, [sqlserver].
    if (ch === '"' || ch === '`' || ch === '[') {
      const close = ch === '[' ? ']' : ch;
      const end = input.indexOf(close, i + 1);
      const stop = end === -1 ? input.length : end + 1;
      push('identifier', input.slice(i, stop));
      i = stop;
      continue;
    }

    // Bind parameters across dialects: $1, :name, ?, @name.
    if (ch === '$' && /\d/.test(input[i + 1] ?? '')) {
      let j = i + 1;
      while (j < input.length && /\d/.test(input[j]!)) j++;
      push('parameter', input.slice(i, j));
      i = j;
      continue;
    }
    if ((ch === ':' || ch === '@') && /[A-Za-z_]/.test(input[i + 1] ?? '')) {
      let j = i + 1;
      while (j < input.length && /[A-Za-z0-9_]/.test(input[j]!)) j++;
      push('parameter', input.slice(i, j));
      i = j;
      continue;
    }
    if (ch === '?') {
      push('parameter', ch);
      i++;
      continue;
    }

    // Number.
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(input[i + 1] ?? ''))) {
      let j = i;
      while (j < input.length && /[\d.eE+-]/.test(input[j]!)) {
        // Only consume a sign as part of an exponent.
        if ((input[j] === '+' || input[j] === '-') && !/[eE]/.test(input[j - 1] ?? '')) break;
        j++;
      }
      push('number', input.slice(i, j));
      i = j;
      continue;
    }

    // Word: keyword or identifier.
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < input.length && /[A-Za-z0-9_$]/.test(input[j]!)) j++;
      const word = input.slice(i, j);
      push(RESERVED.has(word.toUpperCase()) ? 'keyword' : 'identifier', word);
      i = j;
      continue;
    }

    // Multi-character operators.
    const twoChar = input.slice(i, i + 2);
    if (['<=', '>=', '<>', '!=', '||', '::', '->', '=>'].includes(twoChar)) {
      push('operator', twoChar);
      i += 2;
      continue;
    }

    if ('()[],;'.includes(ch)) {
      push('punct', ch);
      i++;
      continue;
    }

    push('operator', ch);
    i++;
  }

  return tokens;
}

export interface FormatOptions {
  /** Spaces per indent level. */
  indent?: number;
  /** Uppercase reserved words. */
  uppercaseKeywords?: boolean;
}

/**
 * Re-indents SQL.
 *
 * Only whitespace and keyword casing change; every token is preserved in order, so
 * the formatted output is the same query. String literals and comments are emitted
 * verbatim.
 */
export function formatSql(input: string, options: FormatOptions = {}): string {
  if (new TextEncoder().encode(input).length > MAX_INPUT_BYTES) {
    throw new SqlError('Input exceeds the 2 MB limit.');
  }
  if (input.trim() === '') return '';

  const indentWidth = options.indent ?? 2;
  const upper = options.uppercaseKeywords ?? true;
  const tokens = tokenizeSql(input);

  const out: string[] = [];
  let current = '';
  let depth = 0;
  let parenDepth = 0;

  // Set after emitting a token that binds tightly to what follows — "(" and "." —
  // so the next token is appended with no separating space.
  let suppressSpace = false;

  const flush = () => {
    if (current.trim() !== '') out.push(current.trimEnd());
    current = '';
    suppressSpace = false;
  };

  const startLine = (level: number) => {
    flush();
    current = ' '.repeat(Math.max(0, level) * indentWidth);
  };

  const append = (text: string, spaceBefore = true) => {
    const wantsSpace = spaceBefore && !suppressSpace;
    suppressSpace = false;

    if (current.trim() === '') {
      current += text;
      return;
    }
    current += (wantsSpace ? ' ' : '') + text;
  };

  for (let index = 0; index < tokens.length; index++) {
    const token = tokens[index]!;
    const text = token.type === 'keyword' && upper ? token.upper : token.value;
    const next = tokens[index + 1];

    if (token.type === 'comment') {
      startLine(depth);
      append(token.value, false);
      flush();
      continue;
    }

    if (token.type === 'punct') {
      if (token.value === '(') {
        append('(', !isFunctionCall(tokens, index));
        // Nothing separates "(" from its first argument.
        suppressSpace = true;
        parenDepth++;
        continue;
      }
      if (token.value === ')') {
        parenDepth = Math.max(0, parenDepth - 1);
        append(')', false);
        continue;
      }
      if (token.value === ',') {
        append(',', false);
        // Break after a comma only at the top level; inside parentheses the list
        // usually reads better on one line.
        if (parenDepth === 0) startLine(depth + 1);
        continue;
      }
      if (token.value === ';') {
        append(';', false);
        flush();
        out.push('');
        depth = 0;
        continue;
      }
      append(token.value, false);
      continue;
    }

    if (token.type === 'keyword' && parenDepth === 0) {
      // ORDER BY / GROUP BY / PARTITION BY read as one clause.
      if (token.upper === 'BY') {
        append(text);
        startLine(depth + 1);
        continue;
      }

      if (CLAUSE_KEYWORDS.has(token.upper)) {
        depth = token.upper === 'SELECT' && out.length > 0 ? depth : 0;
        startLine(depth);
        append(text, false);
        // SELECT and SET put their list on the next indented line.
        if (token.upper === 'SELECT' || token.upper === 'SET' || token.upper === 'VALUES') {
          if (next && !(next.type === 'keyword' && next.upper === 'DISTINCT')) {
            startLine(depth + 1);
          }
        }
        if (token.upper === 'WHERE' || token.upper === 'FROM' || token.upper === 'HAVING') {
          startLine(depth + 1);
        }
        continue;
      }

      if (JOIN_KEYWORDS.has(token.upper)) {
        startLine(depth);
        append(text, false);
        continue;
      }

      if (CONTINUATION_KEYWORDS.has(token.upper)) {
        startLine(depth + 1);
        append(text, false);
        continue;
      }

      if (token.upper === 'DISTINCT' || token.upper === 'ALL') {
        append(text);
        startLine(depth + 1);
        continue;
      }
    }

    // A qualified name — table.column — must not be split by spaces.
    if (token.type === 'operator' && token.value === '.') {
      append('.', false);
      suppressSpace = true;
      continue;
    }

    append(text);
  }

  flush();

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/** A "(" directly after an identifier is a call, so it takes no leading space. */
function isFunctionCall(tokens: Token[], index: number): boolean {
  const prev = tokens[index - 1];
  if (!prev) return false;
  return prev.type === 'identifier' || (prev.type === 'keyword' && prev.upper === 'CAST');
}

/**
 * Lints a statement for portability and safety problems.
 *
 * Every finding explains the consequence rather than only naming a rule, and the
 * dialect-specific rules fire only for the selected dialect — flagging `LIMIT` as
 * unsupported while the user has SQL Server selected is useful; flagging it on
 * Postgres would be noise.
 */
export function lintSql(input: string, dialect: SqlDialect): LintFinding[] {
  if (input.trim() === '') return [];
  if (new TextEncoder().encode(input).length > MAX_INPUT_BYTES) {
    throw new SqlError('Input exceeds the 2 MB limit.');
  }

  const findings: LintFinding[] = [];
  const tokens = tokenizeSql(input);
  const add = (finding: LintFinding) => findings.push(finding);

  const keywordAt = (i: number) => tokens[i]?.type === 'keyword' ? tokens[i]!.upper : undefined;
  const hasKeyword = (word: string) => tokens.some((t) => t.type === 'keyword' && t.upper === word);

  // --- safety ------------------------------------------------------------

  // DELETE or UPDATE with no WHERE affects every row. This is the single most
  // expensive SQL mistake there is.
  for (let i = 0; i < tokens.length; i++) {
    const word = keywordAt(i);
    if (word !== 'DELETE' && word !== 'UPDATE') continue;

    const statementEnd = findStatementEnd(tokens, i);
    const hasWhere = tokens
      .slice(i, statementEnd)
      .some((t) => t.type === 'keyword' && t.upper === 'WHERE');

    if (!hasWhere) {
      add({
        severity: 'error',
        rule: 'unbounded-write',
        line: tokens[i]!.line,
        message: `${word} with no WHERE clause affects every row in the table. If that is intended, say so explicitly with "WHERE 1=1" or use TRUNCATE.`,
      });
    }
  }

  if (hasKeyword('DROP')) {
    add({
      severity: 'warning',
      rule: 'destructive-ddl',
      line: tokens.find((t) => t.upper === 'DROP')?.line,
      message: 'DROP discards the object and its data. There is no rollback outside a transaction.',
    });
  }

  // A string literal adjacent to a concatenation operator is the classic injection
  // shape. Parameters exist precisely to avoid this.
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type !== 'operator' || (token.value !== '||' && token.value !== '+')) continue;

    const prev = tokens[i - 1];
    const next = tokens[i + 1];
    const touchesLiteral = prev?.type === 'string' || next?.type === 'string';
    const touchesIdentifier = prev?.type === 'identifier' || next?.type === 'identifier';

    if (touchesLiteral && touchesIdentifier) {
      add({
        severity: 'warning',
        rule: 'string-concatenation',
        line: token.line,
        message:
          'A value is being concatenated into the statement text. If any part of it comes from user input this is an injection, regardless of escaping. Use a bind parameter instead.',
      });
      break;
    }
  }

  // --- correctness and clarity -------------------------------------------

  for (let i = 0; i < tokens.length; i++) {
    if (keywordAt(i) !== 'SELECT') continue;
    const next = tokens[i + 1];
    if (next?.type === 'operator' && next.value === '*') {
      add({
        severity: 'info',
        rule: 'select-star',
        line: next.line,
        message:
          'SELECT * returns whatever columns the table happens to have. Naming columns keeps the result stable when the schema changes and avoids transferring data you do not use.',
      });
      break;
    }
  }

  // NULL never equals anything, including NULL.
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!;
    const next = tokens[i + 1]!;
    const isEquality = token.type === 'operator' && (token.value === '=' || token.value === '<>' || token.value === '!=');
    if (isEquality && next.type === 'keyword' && next.upper === 'NULL') {
      add({
        severity: 'error',
        rule: 'null-comparison',
        line: token.line,
        message: `"${token.value} NULL" is never true — NULL is not equal to anything, including itself. Use IS NULL or IS NOT NULL.`,
      });
      break;
    }
  }

  // A comma join mixed with explicit JOINs is a common source of accidental
  // cross products.
  const fromIndex = tokens.findIndex((t) => t.type === 'keyword' && t.upper === 'FROM');
  if (fromIndex !== -1) {
    const end = findClauseEnd(tokens, fromIndex + 1);
    const clause = tokens.slice(fromIndex + 1, end);
    const commaAtTopLevel = hasTopLevelComma(clause);

    if (commaAtTopLevel && clause.some((t) => t.type === 'keyword' && t.upper === 'JOIN')) {
      add({
        severity: 'warning',
        rule: 'mixed-join-syntax',
        line: tokens[fromIndex]!.line,
        message:
          'This mixes comma joins with explicit JOIN syntax. The two bind differently and the result is easy to get wrong; use explicit JOIN … ON throughout.',
      });
    } else if (commaAtTopLevel) {
      add({
        severity: 'info',
        rule: 'implicit-join',
        line: tokens[fromIndex]!.line,
        message:
          'Comma joins produce a cross product filtered by WHERE. Explicit JOIN … ON states the relationship where a reader expects it.',
      });
    }
  }

  if (hasKeyword('ORDER') && !hasKeyword('LIMIT') && !hasKeyword('FETCH') && !hasKeyword('TOP')) {
    add({
      severity: 'info',
      rule: 'order-without-limit',
      message:
        'ORDER BY without a row limit sorts the whole result set. If you only need the first rows, add a limit so the database can stop early.',
    });
  }

  findings.push(...lintDialect(tokens, dialect));

  return findings;
}

/** Dialect-specific portability rules. */
function lintDialect(tokens: Token[], dialect: SqlDialect): LintFinding[] {
  const findings: LintFinding[] = [];
  const find = (predicate: (t: Token) => boolean) => tokens.find(predicate);

  const limit = find((t) => t.type === 'keyword' && t.upper === 'LIMIT');
  const top = find((t) => t.type === 'identifier' && t.upper === 'TOP');
  const ilike = find((t) => t.type === 'keyword' && t.upper === 'ILIKE');
  const doubleQuoted = find((t) => t.type === 'identifier' && t.value.startsWith('"'));
  const backticked = find((t) => t.type === 'identifier' && t.value.startsWith('`'));
  const bracketed = find((t) => t.type === 'identifier' && t.value.startsWith('['));
  const concat = find((t) => t.type === 'operator' && t.value === '||');
  const cast = find((t) => t.type === 'operator' && t.value === '::');
  const dollarParam = find((t) => t.type === 'parameter' && t.value.startsWith('$'));
  const atParam = find((t) => t.type === 'parameter' && t.value.startsWith('@'));

  const flag = (
    token: Token | undefined,
    rule: string,
    message: string,
    severity: LintSeverity = 'warning',
  ) => {
    if (token) findings.push({ severity, rule, message, line: token.line });
  };

  switch (dialect) {
    case 'sqlserver':
      flag(limit, 'dialect-limit', 'SQL Server does not support LIMIT. Use "SELECT TOP (n)" or "OFFSET … FETCH NEXT … ROWS ONLY".');
      flag(ilike, 'dialect-ilike', 'ILIKE is PostgreSQL-only. SQL Server comparisons are case-insensitive by collation; use LIKE, or apply LOWER() to both sides.');
      flag(concat, 'dialect-concat', 'SQL Server uses + for string concatenation, or CONCAT(). || is not supported outside ANSI mode.');
      flag(cast, 'dialect-cast', ':: is PostgreSQL cast syntax. Use CAST(x AS type) or CONVERT().');
      flag(backticked, 'dialect-quoting', 'Backtick quoting is MySQL syntax. SQL Server uses [brackets] or "double quotes" with QUOTED_IDENTIFIER on.');
      flag(dollarParam, 'dialect-parameter', '$1 placeholders are PostgreSQL syntax. SQL Server uses named parameters such as @id.');
      break;

    case 'mysql':
      flag(ilike, 'dialect-ilike', 'ILIKE is PostgreSQL-only. MySQL LIKE is already case-insensitive for most collations.');
      flag(concat, 'dialect-concat', '|| means logical OR in MySQL unless PIPES_AS_CONCAT is set. Use CONCAT() for string concatenation — this is a silent wrong-result bug, not a syntax error.');
      flag(cast, 'dialect-cast', ':: is PostgreSQL cast syntax. Use CAST(x AS type).');
      flag(bracketed, 'dialect-quoting', '[bracket] quoting is SQL Server syntax. MySQL uses `backticks`.');
      flag(doubleQuoted, 'dialect-quoting', 'Double quotes denote a string in MySQL unless ANSI_QUOTES is set. Use `backticks` for identifiers.', 'info');
      flag(dollarParam, 'dialect-parameter', '$1 placeholders are PostgreSQL syntax. MySQL uses ?.');
      break;

    case 'postgres':
      flag(top, 'dialect-top', 'SELECT TOP is SQL Server syntax. PostgreSQL uses LIMIT.');
      flag(backticked, 'dialect-quoting', 'Backtick quoting is MySQL syntax. PostgreSQL uses "double quotes".');
      flag(bracketed, 'dialect-quoting', '[bracket] quoting is SQL Server syntax. PostgreSQL uses "double quotes".');
      break;

    case 'sqlite':
      flag(top, 'dialect-top', 'SELECT TOP is SQL Server syntax. SQLite uses LIMIT.');
      flag(ilike, 'dialect-ilike', 'SQLite has no ILIKE. LIKE is case-insensitive for ASCII by default.');
      flag(cast, 'dialect-cast', ':: is PostgreSQL cast syntax. SQLite uses CAST(x AS type).');
      flag(bracketed, 'dialect-quoting', '[bracket] quoting is accepted by SQLite for compatibility, but "double quotes" are the portable form.', 'info');
      flag(atParam, 'dialect-parameter', 'SQLite accepts @name, :name and ?; :name is the most portable.', 'info');
      break;

    case 'ansi':
      flag(limit, 'dialect-limit', 'LIMIT is not in the SQL standard. The portable form is "OFFSET … FETCH FIRST … ROWS ONLY".', 'info');
      flag(top, 'dialect-top', 'SELECT TOP is not standard SQL.');
      flag(ilike, 'dialect-ilike', 'ILIKE is not standard SQL.');
      flag(cast, 'dialect-cast', ':: is not standard SQL. Use CAST(x AS type).');
      flag(backticked, 'dialect-quoting', 'Backtick quoting is not standard SQL. Use "double quotes".');
      flag(bracketed, 'dialect-quoting', '[bracket] quoting is not standard SQL. Use "double quotes".');
      break;
  }

  return findings;
}

function findStatementEnd(tokens: Token[], from: number): number {
  for (let i = from; i < tokens.length; i++) {
    if (tokens[i]!.type === 'punct' && tokens[i]!.value === ';') return i;
  }
  return tokens.length;
}

function findClauseEnd(tokens: Token[], from: number): number {
  let depth = 0;
  for (let i = from; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (token.type === 'punct' && token.value === '(') depth++;
    if (token.type === 'punct' && token.value === ')') depth--;
    if (token.type === 'punct' && token.value === ';') return i;
    if (depth === 0 && token.type === 'keyword' && CLAUSE_KEYWORDS.has(token.upper)) return i;
    if (depth === 0 && token.type === 'keyword' && token.upper === 'WHERE') return i;
  }
  return tokens.length;
}

function hasTopLevelComma(clause: Token[]): boolean {
  let depth = 0;
  for (const token of clause) {
    if (token.type === 'punct' && token.value === '(') depth++;
    if (token.type === 'punct' && token.value === ')') depth--;
    if (depth === 0 && token.type === 'punct' && token.value === ',') return true;
  }
  return false;
}

/**
 * Parameterised query examples per dialect.
 *
 * The white paper asks for "safe parameterized-query examples" alongside the linter,
 * because telling someone not to concatenate is less useful than showing the form
 * their driver actually wants.
 */
export const PARAMETER_EXAMPLES: Record<SqlDialect, { placeholder: string; sql: string; call: string }> = {
  ansi: {
    placeholder: '?',
    sql: 'SELECT id, email\nFROM users\nWHERE tenant_id = ?\n  AND created_at >= ?',
    call: '-- Bind positionally, in order, through your driver\'s prepared-statement API.\n-- Never build this string with concatenation.',
  },
  postgres: {
    placeholder: '$1, $2',
    sql: 'SELECT id, email\nFROM users\nWHERE tenant_id = $1\n  AND created_at >= $2',
    call: "// node-postgres\nawait client.query(sql, [tenantId, since]);",
  },
  mysql: {
    placeholder: '?',
    sql: 'SELECT id, email\nFROM users\nWHERE tenant_id = ?\n  AND created_at >= ?',
    call: '// mysql2\nawait connection.execute(sql, [tenantId, since]);',
  },
  sqlserver: {
    placeholder: '@name',
    sql: 'SELECT TOP (100) id, email\nFROM users\nWHERE tenant_id = @tenantId\n  AND created_at >= @since',
    call: '// Microsoft.Data.SqlClient\ncommand.Parameters.Add("@tenantId", SqlDbType.Int).Value = tenantId;\ncommand.Parameters.Add("@since", SqlDbType.DateTime2).Value = since;',
  },
  sqlite: {
    placeholder: ':name',
    sql: 'SELECT id, email\nFROM users\nWHERE tenant_id = :tenantId\n  AND created_at >= :since',
    call: "// better-sqlite3\ndb.prepare(sql).all({ tenantId, since });",
  },
};
