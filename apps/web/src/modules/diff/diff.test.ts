import { describe, expect, it } from 'vitest';
import { diffText, DiffError, toUnifiedDiff } from './diff';

/** Compact rendering of the line script, for readable assertions. */
function script(left: string, right: string, options = {}) {
  return diffText(left, right, options).lines.map((l) => {
    const marker = l.kind === 'insert' ? '+' : l.kind === 'delete' ? '-' : ' ';
    return marker + l.text;
  });
}

describe('diffText — basics', () => {
  it('reports identical documents', () => {
    const result = diffText('a\nb\nc\n', 'a\nb\nc\n');

    expect(result.identical).toBe(true);
    expect(result.stats).toEqual({ added: 0, removed: 0, unchanged: 3 });
    expect(result.hunks).toHaveLength(0);
  });

  it('handles two empty documents', () => {
    const result = diffText('', '');
    expect(result.identical).toBe(true);
    expect(result.lines).toHaveLength(0);
  });

  it('detects a pure insertion', () => {
    expect(script('a\nc\n', 'a\nb\nc\n')).toEqual([' a', '+b', ' c']);
  });

  it('detects a pure deletion', () => {
    expect(script('a\nb\nc\n', 'a\nc\n')).toEqual([' a', '-b', ' c']);
  });

  it('detects a replacement as a delete followed by an insert', () => {
    expect(script('a\nb\nc\n', 'a\nX\nc\n')).toEqual([' a', '-b', '+X', ' c']);
  });

  it('handles an empty left side', () => {
    const result = diffText('', 'a\nb\n');
    expect(result.stats).toEqual({ added: 2, removed: 0, unchanged: 0 });
  });

  it('handles an empty right side', () => {
    const result = diffText('a\nb\n', '');
    expect(result.stats).toEqual({ added: 0, removed: 2, unchanged: 0 });
  });

  it('does not emit a phantom trailing line', () => {
    // "a\n" is one line, not two.
    expect(diffText('a\n', 'a\n').stats.unchanged).toBe(1);
  });

  it('normalises CRLF so line endings alone are not a difference', () => {
    expect(diffText('a\r\nb\r\n', 'a\nb\n').identical).toBe(true);
  });

  it('handles a document with no trailing newline', () => {
    expect(diffText('a\nb', 'a\nb').identical).toBe(true);
  });

  it('notes a trailing-newline mismatch', () => {
    const result = diffText('a\nb\n', 'a\nb');
    expect(result.notes.some((n) => /trailing newline/i.test(n))).toBe(true);
  });
});

describe('diffText — minimality', () => {
  // A naive diff would mark every line changed here; Myers must find the single
  // insertion.
  it('finds a minimal edit inside a long common region', () => {
    const left = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n') + '\n';
    const lines = left.split('\n');
    lines.splice(100, 0, 'INSERTED');
    const right = lines.join('\n');

    const result = diffText(left, right);
    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(0);
  });

  it('finds a minimal edit script for a reordering', () => {
    const result = diffText('a\nb\nc\n', 'c\na\nb\n');
    // One move is one delete plus one insert, not three of each.
    expect(result.stats.added + result.stats.removed).toBeLessThanOrEqual(2);
  });

  it('keeps a shared prefix and suffix unchanged', () => {
    const result = diffText('h1\nh2\nMID\nf1\nf2\n', 'h1\nh2\nCHANGED\nf1\nf2\n');
    expect(result.stats.unchanged).toBe(4);
    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(1);
  });

  it('handles a completely different document', () => {
    const result = diffText('a\nb\nc\n', 'x\ny\nz\n');
    expect(result.stats.unchanged).toBe(0);
    expect(result.stats.added).toBe(3);
    expect(result.stats.removed).toBe(3);
  });

  it('handles repeated lines without losing alignment', () => {
    const result = diffText('a\na\na\n', 'a\na\n');
    expect(result.stats).toEqual({ added: 0, removed: 1, unchanged: 2 });
  });
});

describe('diffText — line numbers', () => {
  it('numbers both sides independently', () => {
    const result = diffText('a\nb\nc\n', 'a\nX\nc\n');

    const [first, deleted, inserted, last] = result.lines;
    expect(first).toMatchObject({ leftNumber: 1, rightNumber: 1 });
    expect(deleted).toMatchObject({ kind: 'delete', leftNumber: 2 });
    expect(deleted?.rightNumber).toBeUndefined();
    expect(inserted).toMatchObject({ kind: 'insert', rightNumber: 2 });
    expect(inserted?.leftNumber).toBeUndefined();
    expect(last).toMatchObject({ leftNumber: 3, rightNumber: 3 });
  });

  it('keeps numbering correct after an insertion shifts the right side', () => {
    const result = diffText('a\nb\n', 'a\nNEW\nb\n');
    const bLine = result.lines.find((l) => l.text === 'b');
    expect(bLine).toMatchObject({ leftNumber: 2, rightNumber: 3 });
  });
});

describe('diffText — word-level highlighting', () => {
  it('marks only the changed words on a similar line', () => {
    const result = diffText('the quick brown fox\n', 'the quick red fox\n');

    const deleted = result.lines.find((l) => l.kind === 'delete');
    const inserted = result.lines.find((l) => l.kind === 'insert');

    expect(deleted?.words).toBeDefined();
    expect(inserted?.words).toBeDefined();

    expect(deleted?.words?.filter((w) => w.kind === 'delete').map((w) => w.text)).toEqual(['brown']);
    expect(inserted?.words?.filter((w) => w.kind === 'insert').map((w) => w.text)).toEqual(['red']);
    // The unchanged words are still present so the UI can render the whole line.
    expect(deleted?.words?.map((w) => w.text).join('')).toBe('the quick brown fox');
  });

  it('does not word-diff two unrelated lines', () => {
    const result = diffText('aaaaaaaa\n', 'zzzzzzzz\n');
    expect(result.lines.find((l) => l.kind === 'delete')?.words).toBeUndefined();
  });

  it('does not word-diff a multi-line replacement block', () => {
    const result = diffText('a1\na2\n', 'b1\nb2\n');
    for (const line of result.lines) {
      expect(line.words).toBeUndefined();
    }
  });
});

describe('diffText — options', () => {
  it('ignores whitespace when asked', () => {
    expect(diffText('  a  \nb\n', 'a\nb\n', { ignoreWhitespace: true }).identical).toBe(true);
    expect(diffText('  a  \nb\n', 'a\nb\n').identical).toBe(false);
  });

  it('collapses internal whitespace runs when ignoring whitespace', () => {
    expect(diffText('a    b\n', 'a b\n', { ignoreWhitespace: true }).identical).toBe(true);
  });

  it('ignores case when asked', () => {
    expect(diffText('Hello\n', 'hello\n', { ignoreCase: true }).identical).toBe(true);
    expect(diffText('Hello\n', 'hello\n').identical).toBe(false);
  });

  // Reporting "identical" when an option hid a real difference would mislead.
  it('notes when a normalisation option hid a difference', () => {
    const result = diffText('  Hello  \n', 'hello\n', {
      ignoreWhitespace: true,
      ignoreCase: true,
    });

    expect(result.identical).toBe(true);
    expect(result.notes.some((n) => /whitespace and letter case/.test(n))).toBe(true);
  });

  it('does not add that note when the documents are genuinely equal', () => {
    const result = diffText('a\n', 'a\n', { ignoreWhitespace: true });
    expect(result.notes.some((n) => /which the current options ignore/.test(n))).toBe(false);
  });

  it('preserves the original text in the output, not the normalised text', () => {
    const result = diffText('  KEPT  \nb\n', '  KEPT  \nc\n', {
      ignoreWhitespace: true,
      ignoreCase: true,
    });
    expect(result.lines[0]?.text).toBe('  KEPT  ');
  });
});

describe('diffText — hunks', () => {
  const build = (count: number, ...changed: number[]) => {
    const left = Array.from({ length: count }, (_, i) => `line ${i}`);
    const right = [...left];
    for (const i of changed) right[i] = `CHANGED ${i}`;
    return [left.join('\n') + '\n', right.join('\n') + '\n'] as const;
  };

  it('groups a single change with surrounding context', () => {
    const [left, right] = build(20, 10);
    const result = diffText(left, right, { context: 3 });

    expect(result.hunks).toHaveLength(1);
    // 3 lines of context each side, plus the delete and the insert.
    expect(result.hunks[0]?.lines).toHaveLength(8);
  });

  it('separates distant changes into separate hunks', () => {
    const [left, right] = build(40, 5, 30);
    const result = diffText(left, right, { context: 2 });
    expect(result.hunks).toHaveLength(2);
  });

  it('merges nearby changes into one hunk', () => {
    const [left, right] = build(20, 5, 7);
    const result = diffText(left, right, { context: 3 });
    expect(result.hunks).toHaveLength(1);
  });

  it('honours a zero context setting', () => {
    const [left, right] = build(20, 10);
    const result = diffText(left, right, { context: 0 });
    expect(result.hunks[0]?.lines.every((l) => l.kind !== 'equal')).toBe(true);
  });

  it('reports hunk start lines and counts', () => {
    const [left, right] = build(20, 10);
    const hunk = diffText(left, right, { context: 2 }).hunks[0]!;

    expect(hunk.leftStart).toBe(9);
    expect(hunk.rightStart).toBe(9);
    expect(hunk.leftCount).toBeGreaterThan(0);
    expect(hunk.rightCount).toBeGreaterThan(0);
  });
});

describe('toUnifiedDiff', () => {
  it('renders standard unified diff syntax', () => {
    const result = diffText('a\nb\nc\n', 'a\nX\nc\n', { context: 1 });
    const unified = toUnifiedDiff(result, 'before.txt', 'after.txt');

    expect(unified).toContain('--- before.txt');
    expect(unified).toContain('+++ after.txt');
    expect(unified).toMatch(/@@ -\d+,\d+ \+\d+,\d+ @@/);
    expect(unified).toContain('-b');
    expect(unified).toContain('+X');
    expect(unified).toContain(' a');
  });

  it('renders nothing for identical documents', () => {
    expect(toUnifiedDiff(diffText('a\n', 'a\n'))).toBe('');
  });

  it('uses default labels', () => {
    const unified = toUnifiedDiff(diffText('a\n', 'b\n'));
    expect(unified).toContain('--- left');
    expect(unified).toContain('+++ right');
  });
});

describe('diffText — limits', () => {
  it('rejects an input over the byte limit', () => {
    const huge = 'x'.repeat(6 * 1024 * 1024);
    expect(() => diffText(huge, 'a')).toThrow(DiffError);
    expect(() => diffText('a', huge)).toThrow(/5 MB/);
  });

  it('rejects an input over the line limit', () => {
    const many = 'x\n'.repeat(50_001);
    expect(() => diffText(many, 'a')).toThrow(/50,000 lines/);
  });

  it('completes on a large but legal input', () => {
    const left = Array.from({ length: 5000 }, (_, i) => `line ${i}`).join('\n');
    const right = left.replace('line 2500', 'CHANGED');

    const result = diffText(left, right);
    expect(result.stats.added).toBe(1);
    expect(result.stats.removed).toBe(1);
  });
});
