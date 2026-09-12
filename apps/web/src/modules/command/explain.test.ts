import { describe, expect, it } from 'vitest';
import { explainCommand } from './explain';
import { segment, tokenize } from './tokenize';

function partsOf(input: string) {
  return explainCommand(input).segments.flatMap((s) => s.parts);
}

function labelled(input: string, label: string) {
  return partsOf(input).find((p) => p.label === label);
}

describe('tokenize', () => {
  it('splits a simple command into words', () => {
    const tokens = tokenize('ls -la /tmp');
    expect(tokens.map((t) => t.value)).toEqual(['ls', '-la', '/tmp']);
    expect(tokens.every((t) => t.kind === 'word')).toBe(true);
  });

  it('keeps single-quoted text literal', () => {
    const tokens = tokenize(`grep 'a b  c' file`);
    expect(tokens[1]?.value).toBe('a b  c');
    expect(tokens[1]?.quoted).toBe(true);
  });

  it('handles escapes inside double quotes', () => {
    const tokens = tokenize('echo "a \\"b\\" c"');
    expect(tokens[1]?.value).toBe('a "b" c');
  });

  it('does not split on whitespace inside quotes', () => {
    expect(tokenize('cp "my file.txt" dest').map((t) => t.value)).toEqual([
      'cp',
      'my file.txt',
      'dest',
    ]);
  });

  it('recognises operators', () => {
    const kinds = tokenize('a && b || c | d ; e').filter((t) => t.kind === 'operator');
    expect(kinds.map((t) => t.value)).toEqual(['&&', '||', '|', ';']);
  });

  it('recognises redirections including a file descriptor', () => {
    const tokens = tokenize('cmd > out.txt 2> err.txt');
    const redirs = tokens.filter((t) => t.kind === 'redirection').map((t) => t.raw);
    expect(redirs).toEqual(['>', '2>']);
  });

  it('prefers the longer redirection form', () => {
    expect(tokenize('cmd >> log').filter((t) => t.kind === 'redirection')[0]?.raw).toBe('>>');
  });

  it('recognises leading assignments', () => {
    const tokens = tokenize('NODE_ENV=production node app.js');
    expect(tokens[0]?.kind).toBe('assignment');
  });

  it('recognises comments', () => {
    const tokens = tokenize('ls # list files');
    expect(tokens[1]?.kind).toBe('comment');
    expect(tokens[1]?.value).toBe('list files');
  });

  it('terminates on an unterminated quote instead of looping', () => {
    expect(() => tokenize(`echo 'unterminated`)).not.toThrow();
    expect(tokenize(`echo 'unterminated`)[1]?.value).toBe('unterminated');
  });

  it('splits into pipeline segments', () => {
    const segments = segment(tokenize('cat f | grep x | wc -l'));
    expect(segments).toHaveLength(3);
    expect(segments[1]?.precededBy).toBe('|');
  });
});

describe('explainCommand', () => {
  it('describes a known command', () => {
    const result = explainCommand('ls -la /tmp');
    expect(result.segments[0]?.recognised).toBe(true);
    expect(result.segments[0]?.summary).toMatch(/directory contents/i);
  });

  it('expands a clustered short option into each flag', () => {
    const labels = partsOf('ls -la').filter((p) => p.role === 'option').map((p) => p.label);
    expect(labels).toEqual(['-l', '-a']);
  });

  it('explains each clustered flag separately', () => {
    expect(labelled('ls -la', '-l')?.description).toMatch(/long format/i);
    expect(labelled('ls -la', '-a')?.description).toMatch(/dot/i);
  });

  it('explains long options', () => {
    expect(labelled('ls --all', '--all')?.description).toMatch(/dot/i);
  });

  it('handles an inline long-option value', () => {
    const part = labelled('ls --color=auto', '--color');
    expect(part?.description).toMatch(/colouris/i);
  });

  it('consumes a separate option value', () => {
    const parts = partsOf('grep -n -A 3 pattern file');
    const value = parts.find((p) => p.role === 'option-value');
    expect(value?.text).toBe('3');
  });

  it('consumes an option value fused to the flag', () => {
    const parts = partsOf('head -n20 file');
    const value = parts.find((p) => p.role === 'option-value');
    expect(value?.text).toBe('20');
  });

  it('resolves a subcommand and scopes its options', () => {
    const result = explainCommand('git commit -m "wip"');
    const sub = result.segments[0]?.parts.find((p) => p.role === 'subcommand');
    expect(sub?.label).toBe('git commit');
    expect(labelled('git commit -m "wip"', '-m')?.description).toMatch(/commit message/i);
  });

  // -m means "message" for git commit; it must not be resolved from another
  // subcommand's option table.
  it('does not apply one subcommand’s options to another', () => {
    const branchB = labelled('git branch -d old', '-d');
    expect(branchB?.description).toMatch(/deletes a branch/i);
  });

  it('describes positional operands by name', () => {
    const parts = partsOf('grep pattern file.txt');
    const operands = parts.filter((p) => p.role === 'operand');
    expect(operands[0]?.label).toBe('pattern');
    expect(operands[1]?.label).toBe('file');
  });

  it('treats a repeating operand as repeating', () => {
    const operands = partsOf('rm a b c').filter((p) => p.role === 'operand');
    expect(operands).toHaveLength(3);
    expect(operands.every((o) => o.label === 'file')).toBe(true);
  });

  it('explains pipeline connectors', () => {
    const result = explainCommand('cat f | grep x');
    expect(result.segments[1]?.connector).toBe('|');
    expect(result.segments[1]?.connectorDescription).toMatch(/pipes/i);
  });

  it('explains && and || distinctly', () => {
    const and = explainCommand('a && b').segments[1];
    const or = explainCommand('a || b').segments[1];
    expect(and?.connectorDescription).toMatch(/only if the left one succeeded/i);
    expect(or?.connectorDescription).toMatch(/only if the left one failed/i);
  });

  it('explains redirections and their target', () => {
    const parts = partsOf('ls > out.txt');
    expect(parts.find((p) => p.role === 'redirection')?.description).toMatch(/replacing its contents/i);
    expect(parts.find((p) => p.label === 'target')?.text).toBe('out.txt');
  });

  it('explains an environment assignment prefix', () => {
    const part = partsOf('NODE_ENV=production node app.js').find((p) => p.role === 'assignment');
    expect(part?.label).toBe('NODE_ENV');
    expect(part?.description).toMatch(/for this command only/i);
  });

  it('ends option parsing at --', () => {
    const parts = partsOf('rm -- -weird-file');
    const operand = parts.find((p) => p.text === '-weird-file');
    expect(operand?.role).toBe('operand');
  });

  // The module must say so rather than inventing an explanation.
  it('reports an unknown command instead of guessing', () => {
    const result = explainCommand('frobnicate --turbo');
    expect(result.hasUnknownCommand).toBe(true);
    expect(result.segments[0]?.recognised).toBe(false);
    expect(result.segments[0]?.parts[0]?.description).toMatch(/not in the curated reference/i);
  });

  it('reports an unknown option on a known command', () => {
    expect(labelled('ls --nonexistent', '--nonexistent')?.description).toMatch(
      /not in the curated reference/i,
    );
  });

  it('reports an unknown subcommand', () => {
    const part = partsOf('git frobnicate').find((p) => p.role === 'unknown');
    expect(part?.description).toMatch(/not a git subcommand/i);
  });

  it('caps very long input rather than processing it all', () => {
    expect(() => explainCommand('ls '.repeat(5000))).not.toThrow();
  });

  it('handles empty input', () => {
    const result = explainCommand('');
    expect(result.segments.flatMap((s) => s.parts)).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('safety warnings', () => {
  const titles = (input: string) => explainCommand(input).warnings.map((w) => w.title);

  it('flags rm -rf as dangerous', () => {
    const warnings = explainCommand('rm -rf build').warnings;
    expect(warnings[0]?.severity).toBe('danger');
    expect(warnings[0]?.title).toMatch(/without confirmation/i);
  });

  it('flags a root removal target', () => {
    expect(titles('rm -rf /')).toContain('Removal target is a root or home directory');
  });

  it('flags recursive removal without force as a caution', () => {
    const warnings = explainCommand('rm -r build').warnings;
    expect(warnings.some((w) => w.severity === 'caution' && /Recursive/.test(w.title))).toBe(true);
  });

  it('flags chmod 777', () => {
    expect(titles('chmod 777 file')).toContain('chmod 777 grants write access to everyone');
  });

  it('flags disabled TLS verification', () => {
    expect(titles('curl -k https://example.com')).toContain('TLS verification disabled');
  });

  it('flags force push but not a normal push', () => {
    expect(titles('git push --force origin main')).toContain('Force push overwrites remote history');
    expect(titles('git push origin main')).not.toContain('Force push overwrites remote history');
  });

  it('flags git reset --hard', () => {
    expect(titles('git reset --hard HEAD~1')).toContain('git reset --hard discards uncommitted work');
  });

  it('flags curl piped into a shell', () => {
    expect(titles('curl -sS https://example.com/install.sh | sh')).toContain(
      'Downloaded script piped straight into an interpreter',
    );
  });

  it('does not flag curl writing to a file', () => {
    expect(titles('curl -sS https://example.com/install.sh -o install.sh')).not.toContain(
      'Downloaded script piped straight into an interpreter',
    );
  });

  it('flags sudo', () => {
    expect(titles('sudo ls')).toContain('Runs with elevated privileges');
  });

  it('flags dd', () => {
    expect(titles('dd if=/dev/zero of=/dev/sda')).toContain('dd writes directly to the target');
  });

  it('flags kill -9 as a caution', () => {
    const warnings = explainCommand('kill -9 1234').warnings;
    expect(warnings.some((w) => w.severity === 'caution')).toBe(true);
  });

  it('produces no warnings for an ordinary command', () => {
    expect(explainCommand('ls -la').warnings).toHaveLength(0);
    expect(explainCommand('git status -s').warnings).toHaveLength(0);
  });

  it('does not repeat the same warning', () => {
    const warnings = explainCommand('rm -rf a && rm -rf b').warnings;
    const forceTitles = warnings.filter((w) => /without confirmation/.test(w.title));
    expect(forceTitles).toHaveLength(1);
  });
});

describe('pipe-to-interpreter detection through privilege wrappers', () => {
  const titles = (input: string) => explainCommand(input).warnings.map((w) => w.title);
  const PIPE_WARNING = 'Downloaded script piped straight into an interpreter';

  // The most common form of this pattern wraps the interpreter in sudo, so the
  // segment's own command name is "sudo" rather than the shell.
  it('flags curl piped into sudo bash', () => {
    expect(titles('curl -sS https://get.example.com/install.sh | sudo bash')).toContain(
      PIPE_WARNING,
    );
  });

  it('flags wget piped into sh', () => {
    expect(titles('wget -qO- https://example.com/i.sh | sh')).toContain(PIPE_WARNING);
  });

  it('flags a download piped into python', () => {
    expect(titles('curl -s https://example.com/get.py | python3')).toContain(PIPE_WARNING);
  });

  it('flags doas and env wrappers too', () => {
    expect(titles('curl -s https://example.com/i.sh | doas sh')).toContain(PIPE_WARNING);
    expect(titles('curl -s https://example.com/i.sh | env bash')).toContain(PIPE_WARNING);
  });

  it('does not flag a download piped into a non-interpreter', () => {
    expect(titles('curl -sS http://127.0.0.1:8080/healthz | jq .')).not.toContain(PIPE_WARNING);
    expect(titles('curl -sS https://example.com/data.txt | wc -l')).not.toContain(PIPE_WARNING);
  });

  it('does not flag a local file piped into a shell', () => {
    expect(titles('cat script.sh | bash')).not.toContain(PIPE_WARNING);
  });
});
