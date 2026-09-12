import { describe, expect, it } from 'vitest';
import {
  DIALECTS,
  formatSql,
  lintSql,
  PARAMETER_EXAMPLES,
  SqlError,
  tokenizeSql,
  type SqlDialect,
} from './sqlFormat';

const rules = (sql: string, dialect: SqlDialect = 'ansi') =>
  lintSql(sql, dialect).map((f) => f.rule);

describe('tokenizeSql', () => {
  it('classifies keywords, identifiers and numbers', () => {
    const tokens = tokenizeSql('SELECT id FROM users WHERE age > 30');
    expect(tokens.map((t) => t.type)).toEqual([
      'keyword', 'identifier', 'keyword', 'identifier', 'keyword', 'identifier', 'operator', 'number',
    ]);
  });

  it('keeps a string literal intact, including embedded spaces and keywords', () => {
    const tokens = tokenizeSql("SELECT 'FROM users' AS note");
    expect(tokens[1]).toMatchObject({ type: 'string', value: "'FROM users'" });
  });

  it('handles a doubled quote inside a string literal', () => {
    const tokens = tokenizeSql("SELECT 'O''Brien'");
    expect(tokens[1]?.value).toBe("'O''Brien'");
  });

  it('recognises each dialect quoting style as an identifier', () => {
    expect(tokenizeSql('SELECT "col"')[1]?.type).toBe('identifier');
    expect(tokenizeSql('SELECT `col`')[1]?.type).toBe('identifier');
    expect(tokenizeSql('SELECT [col]')[1]?.type).toBe('identifier');
  });

  it('recognises bind parameters in every common form', () => {
    for (const sql of ['WHERE id = $1', 'WHERE id = :id', 'WHERE id = ?', 'WHERE id = @id']) {
      expect(tokenizeSql(sql).some((t) => t.type === 'parameter')).toBe(true);
    }
  });

  it('recognises line and block comments', () => {
    const tokens = tokenizeSql('-- note\nSELECT 1 /* inline */');
    expect(tokens[0]).toMatchObject({ type: 'comment', value: '-- note' });
    expect(tokens.find((t) => t.value === '/* inline */')?.type).toBe('comment');
  });

  it('tracks line numbers across comments and literals', () => {
    const tokens = tokenizeSql('SELECT 1\n-- second line\nFROM t');
    expect(tokens.find((t) => t.upper === 'FROM')?.line).toBe(3);
  });

  it('recognises multi-character operators', () => {
    const values = tokenizeSql('a <= b AND c <> d OR e || f AND g::int').map((t) => t.value);
    expect(values).toContain('<=');
    expect(values).toContain('<>');
    expect(values).toContain('||');
    expect(values).toContain('::');
  });
});

describe('formatSql', () => {
  it('puts each clause on its own line', () => {
    const output = formatSql('select id, name from users where active = true');
    const lines = output.split('\n');

    expect(lines[0]).toBe('SELECT');
    expect(output).toContain('FROM');
    expect(output).toContain('WHERE');
  });

  it('uppercases keywords by default and leaves identifiers alone', () => {
    const output = formatSql('select MyColumn from MyTable');
    expect(output).toContain('SELECT');
    expect(output).toContain('MyColumn');
    expect(output).toContain('MyTable');
  });

  it('can preserve keyword casing', () => {
    const output = formatSql('select id from users', { uppercaseKeywords: false });
    expect(output).toContain('select');
    expect(output).not.toContain('SELECT');
  });

  it('honours the indent width', () => {
    const wide = formatSql('select a, b from t', { indent: 4 });
    expect(wide).toMatch(/\n {4}a,/);
  });

  it('indents AND and OR as continuations', () => {
    const output = formatSql('select id from t where a = 1 and b = 2 or c = 3');
    expect(output).toMatch(/\n\s+AND b = 1?2/);
    expect(output).toMatch(/\n\s+OR c = 3/);
  });

  it('gives joins their own line with ON indented', () => {
    const output = formatSql(
      'select u.id from users u left join orders o on o.user_id = u.id',
    );
    expect(output).toMatch(/^LEFT$/m);
    expect(output).toMatch(/\n\s+ON o\.user_id = u\.id/);
  });

  it('keeps ORDER BY and GROUP BY together', () => {
    const output = formatSql('select a, count(*) from t group by a order by a desc');
    expect(output).toContain('GROUP BY');
    expect(output).toContain('ORDER BY');
  });

  it('does not put a space before a function call parenthesis', () => {
    expect(formatSql('select count(*) from t')).toContain('count(*)');
  });

  // The formatter must never change what the query does.
  it('preserves every token, changing only whitespace and keyword case', () => {
    const input = "select id, 'a, b' as lit, count(*) from t where x <> 'FROM' and y in (1,2,3)";
    const formatted = formatSql(input);

    const strip = (sql: string) =>
      tokenizeSql(sql).map((t) => (t.type === 'keyword' ? t.upper : t.value));

    expect(strip(formatted)).toEqual(strip(input));
  });

  it('leaves a string literal untouched even when it looks like SQL', () => {
    expect(formatSql("select 'select * from secrets' as s")).toContain(
      "'select * from secrets'",
    );
  });

  it('keeps comments on their own line', () => {
    const output = formatSql('-- header\nselect id from t');
    expect(output.split('\n')[0]).toBe('-- header');
  });

  it('separates multiple statements', () => {
    const output = formatSql('select 1; select 2;');
    expect(output).toMatch(/;\n\nSELECT/);
  });

  it('returns an empty string for blank input', () => {
    expect(formatSql('   \n  ')).toBe('');
  });

  it('is idempotent', () => {
    const once = formatSql('select a, b from t where a = 1 and b = 2');
    expect(formatSql(once)).toBe(once);
  });

  it('rejects an over-large input', () => {
    expect(() => formatSql('x'.repeat(3 * 1024 * 1024))).toThrow(SqlError);
  });
});

describe('lintSql — safety', () => {
  // The most expensive SQL mistake there is.
  it('flags DELETE without WHERE as an error', () => {
    const findings = lintSql('DELETE FROM users', 'postgres');
    expect(findings[0]).toMatchObject({ severity: 'error', rule: 'unbounded-write' });
    expect(findings[0]?.message).toMatch(/every row/);
  });

  it('flags UPDATE without WHERE as an error', () => {
    expect(rules('UPDATE users SET active = false')).toContain('unbounded-write');
  });

  it('does not flag DELETE or UPDATE that have a WHERE', () => {
    expect(rules('DELETE FROM users WHERE id = 1')).not.toContain('unbounded-write');
    expect(rules('UPDATE users SET active = false WHERE id = 1')).not.toContain('unbounded-write');
  });

  // A WHERE belonging to the next statement must not satisfy the first.
  it('scopes the WHERE check to the statement', () => {
    expect(rules('DELETE FROM a; SELECT 1 FROM b WHERE x = 1')).toContain('unbounded-write');
  });

  it('flags DROP', () => {
    expect(rules('DROP TABLE users')).toContain('destructive-ddl');
  });

  it('flags a value concatenated into statement text', () => {
    expect(rules("SELECT * FROM users WHERE name = 'x' || userInput")).toContain(
      'string-concatenation',
    );
  });

  it('does not flag concatenation of two literals', () => {
    expect(rules("SELECT 'a' || 'b'")).not.toContain('string-concatenation');
  });

  it('does not flag a parameterised query', () => {
    const findings = rules('SELECT id FROM users WHERE name = ?');
    expect(findings).not.toContain('string-concatenation');
    expect(findings).not.toContain('unbounded-write');
  });
});

describe('lintSql — correctness', () => {
  it('flags = NULL as an error', () => {
    const findings = lintSql('SELECT id FROM t WHERE x = NULL', 'postgres');
    const nullFinding = findings.find((f) => f.rule === 'null-comparison');

    expect(nullFinding?.severity).toBe('error');
    expect(nullFinding?.message).toMatch(/IS NULL/);
  });

  it('flags <> NULL as well', () => {
    expect(rules('SELECT id FROM t WHERE x <> NULL')).toContain('null-comparison');
  });

  it('does not flag IS NULL', () => {
    expect(rules('SELECT id FROM t WHERE x IS NULL')).not.toContain('null-comparison');
  });

  it('notes SELECT *', () => {
    expect(rules('SELECT * FROM t')).toContain('select-star');
  });

  it('does not note an explicit column list', () => {
    expect(rules('SELECT id, name FROM t')).not.toContain('select-star');
  });

  it('flags comma joins mixed with explicit joins', () => {
    expect(
      rules('SELECT * FROM a, b JOIN c ON c.id = b.id WHERE a.id = b.a_id'),
    ).toContain('mixed-join-syntax');
  });

  it('notes a plain comma join', () => {
    expect(rules('SELECT a.id FROM a, b WHERE a.id = b.a_id')).toContain('implicit-join');
  });

  it('does not flag a single-table FROM', () => {
    const findings = rules('SELECT id FROM users WHERE id = 1');
    expect(findings).not.toContain('implicit-join');
    expect(findings).not.toContain('mixed-join-syntax');
  });

  it('does not treat a comma inside a function call as a join', () => {
    expect(rules('SELECT id FROM t WHERE id = 1')).not.toContain('implicit-join');
    expect(rules('SELECT coalesce(a, b) FROM t WHERE id = 1')).not.toContain('implicit-join');
  });

  it('notes ORDER BY with no row limit', () => {
    expect(rules('SELECT id FROM t ORDER BY id')).toContain('order-without-limit');
  });

  it('does not note ORDER BY when a limit is present', () => {
    expect(rules('SELECT id FROM t ORDER BY id LIMIT 10', 'postgres')).not.toContain(
      'order-without-limit',
    );
  });

  it('returns nothing for a clean parameterised statement', () => {
    expect(lintSql('SELECT id, email FROM users WHERE tenant_id = $1 LIMIT 10', 'postgres')).toEqual(
      [],
    );
  });

  it('returns nothing for empty input', () => {
    expect(lintSql('   ', 'postgres')).toEqual([]);
  });
});

describe('lintSql — dialect awareness', () => {
  it('flags LIMIT on SQL Server but not on PostgreSQL', () => {
    expect(rules('SELECT id FROM t LIMIT 10', 'sqlserver')).toContain('dialect-limit');
    expect(rules('SELECT id FROM t LIMIT 10', 'postgres')).not.toContain('dialect-limit');
  });

  it('flags TOP on PostgreSQL but not on SQL Server', () => {
    expect(rules('SELECT TOP 10 id FROM t', 'postgres')).toContain('dialect-top');
    expect(rules('SELECT TOP 10 id FROM t', 'sqlserver')).not.toContain('dialect-top');
  });

  // || is logical OR in MySQL by default, so this is a wrong-result bug rather than
  // a syntax error — worth calling out explicitly.
  it('warns that || is not concatenation in MySQL', () => {
    const finding = lintSql("SELECT a || b FROM t", 'mysql').find(
      (f) => f.rule === 'dialect-concat',
    );
    expect(finding?.message).toMatch(/silent wrong-result bug/);
  });

  it('accepts || on PostgreSQL', () => {
    expect(rules("SELECT a || b FROM t", 'postgres')).not.toContain('dialect-concat');
  });

  it('flags ILIKE outside PostgreSQL', () => {
    for (const dialect of ['mysql', 'sqlserver', 'sqlite', 'ansi'] as SqlDialect[]) {
      expect(rules("SELECT id FROM t WHERE n ILIKE 'x'", dialect)).toContain('dialect-ilike');
    }
    expect(rules("SELECT id FROM t WHERE n ILIKE 'x'", 'postgres')).not.toContain('dialect-ilike');
  });

  it('flags :: cast outside PostgreSQL', () => {
    expect(rules('SELECT a::int FROM t', 'mysql')).toContain('dialect-cast');
    expect(rules('SELECT a::int FROM t', 'postgres')).not.toContain('dialect-cast');
  });

  it('flags the wrong identifier quoting per dialect', () => {
    expect(rules('SELECT `a` FROM t', 'postgres')).toContain('dialect-quoting');
    expect(rules('SELECT [a] FROM t', 'mysql')).toContain('dialect-quoting');
    expect(rules('SELECT `a` FROM t', 'mysql')).not.toContain('dialect-quoting');
    expect(rules('SELECT [a] FROM t', 'sqlserver')).not.toContain('dialect-quoting');
  });

  it('flags the wrong parameter style per dialect', () => {
    expect(rules('SELECT id FROM t WHERE id = $1', 'mysql')).toContain('dialect-parameter');
    expect(rules('SELECT id FROM t WHERE id = $1', 'sqlserver')).toContain('dialect-parameter');
    expect(rules('SELECT id FROM t WHERE id = $1', 'postgres')).not.toContain('dialect-parameter');
  });

  it('notes non-standard syntax under ANSI', () => {
    expect(rules('SELECT id FROM t LIMIT 10', 'ansi')).toContain('dialect-limit');
  });

  it('runs for every advertised dialect without throwing', () => {
    for (const { id } of DIALECTS) {
      expect(() => lintSql('SELECT id FROM users WHERE id = 1', id)).not.toThrow();
    }
  });
});

describe('PARAMETER_EXAMPLES', () => {
  it('covers every dialect', () => {
    for (const { id } of DIALECTS) {
      expect(PARAMETER_EXAMPLES[id]).toBeDefined();
      expect(PARAMETER_EXAMPLES[id].sql).toContain('SELECT');
    }
  });

  // The examples are the remedy the linter points at, so they must themselves be
  // clean under their own dialect.
  it('each example lints clean under its own dialect', () => {
    for (const { id } of DIALECTS) {
      const findings = lintSql(PARAMETER_EXAMPLES[id].sql, id);
      const serious = findings.filter((f) => f.severity !== 'info');
      expect(serious, `${id}: ${JSON.stringify(serious)}`).toEqual([]);
    }
  });

  it('each example uses a bind parameter rather than concatenation', () => {
    for (const { id } of DIALECTS) {
      const tokens = tokenizeSql(PARAMETER_EXAMPLES[id].sql);
      expect(tokens.some((t) => t.type === 'parameter')).toBe(true);
    }
  });
});
