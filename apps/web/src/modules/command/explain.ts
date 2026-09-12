/**
 * Shell command explainer.
 *
 * Turns a command line into a structured, token-by-token explanation using the
 * curated index in commandIndex.ts. Nothing is executed and no shell is consulted;
 * this is static analysis of text the user pasted.
 */
import { COMMANDS, type CommandSpec, type OptionSpec, type SubcommandSpec } from './commandIndex';
import { segment, tokenize, type Token } from './tokenize';

export type PartRole =
  | 'command'
  | 'subcommand'
  | 'option'
  | 'option-value'
  | 'operand'
  | 'operator'
  | 'redirection'
  | 'assignment'
  | 'comment'
  | 'unknown';

export interface ExplainedPart {
  role: PartRole;
  /** The text as written. */
  text: string;
  /** Short label, e.g. "-l" or "operand". */
  label: string;
  description: string;
  start: number;
  end: number;
}

export type WarningSeverity = 'danger' | 'caution';

export interface CommandWarning {
  severity: WarningSeverity;
  title: string;
  detail: string;
}

export interface ExplainedSegment {
  /** The operator that introduced this segment, if any. */
  connector?: string;
  connectorDescription?: string;
  commandName?: string;
  summary?: string;
  recognised: boolean;
  parts: ExplainedPart[];
}

export interface Explanation {
  segments: ExplainedSegment[];
  warnings: CommandWarning[];
  /** True when at least one segment named a command the index does not cover. */
  hasUnknownCommand: boolean;
}

const CONNECTOR_DESCRIPTIONS: Record<string, string> = {
  '|': 'Pipes the output of the left command into the input of the right one.',
  '&&': 'Runs the right command only if the left one succeeded (exit status 0).',
  '||': 'Runs the right command only if the left one failed (non-zero exit status).',
  ';': 'Runs the commands in sequence regardless of whether each succeeds.',
  '&': 'Runs the preceding command in the background.',
  '\n': 'Starts a new command on the next line.',
};

const REDIRECTION_DESCRIPTIONS: Record<string, string> = {
  '>': 'Writes standard output to a file, replacing its contents.',
  '>>': 'Appends standard output to a file.',
  '<': 'Reads standard input from a file.',
  '2>': 'Writes standard error to a file, replacing its contents.',
  '2>>': 'Appends standard error to a file.',
  '&>': 'Writes both standard output and standard error to a file.',
  '&>>': 'Appends both standard output and standard error to a file.',
  '<<': 'Here-document: reads input until the given delimiter.',
  '<<<': 'Here-string: feeds the given text in as standard input.',
  '>|': 'Writes to a file, overriding the shell’s noclobber setting.',
};

export const MAX_INPUT_LENGTH = 4000;

export function explainCommand(input: string): Explanation {
  const trimmed = input.slice(0, MAX_INPUT_LENGTH);
  const tokens = tokenize(trimmed);
  const segments = segment(tokens);

  const explainedSegments: ExplainedSegment[] = [];
  let hasUnknownCommand = false;

  for (const seg of segments) {
    const explained = explainSegment(seg.tokens, seg.precededBy);
    if (explained.commandName && !explained.recognised) {
      hasUnknownCommand = true;
    }
    explainedSegments.push(explained);
  }

  return {
    segments: explainedSegments,
    warnings: collectWarnings(explainedSegments, tokens),
    hasUnknownCommand,
  };
}

function explainSegment(tokens: Token[], connector?: string): ExplainedSegment {
  const parts: ExplainedPart[] = [];

  const result: ExplainedSegment = {
    recognised: false,
    parts,
  };
  if (connector !== undefined) {
    result.connector = connector;
    const description = CONNECTOR_DESCRIPTIONS[connector];
    if (description) result.connectorDescription = description;
  }

  let index = 0;

  // Leading VAR=value assignments apply to the command that follows.
  while (index < tokens.length && tokens[index]!.kind === 'assignment') {
    const token = tokens[index]!;
    const name = token.raw.slice(0, token.raw.indexOf('='));
    parts.push({
      role: 'assignment',
      text: token.raw,
      label: name,
      description: `Sets the environment variable ${name} for this command only.`,
      start: token.start,
      end: token.end,
    });
    index++;
  }

  if (index >= tokens.length) {
    // A segment of only assignments, redirections or comments.
    appendTrailing(tokens.slice(index), parts);
    return result;
  }

  const commandToken = tokens[index]!;
  if (commandToken.kind === 'comment') {
    appendTrailing(tokens.slice(index), parts);
    return result;
  }

  const commandName = commandToken.value;
  result.commandName = commandName;

  const spec = COMMANDS[commandName];
  result.recognised = spec !== undefined;
  if (spec) result.summary = spec.summary;

  parts.push({
    role: 'command',
    text: commandToken.raw,
    label: commandName,
    description: spec
      ? spec.usage
        ? `${spec.summary} ${spec.usage}`
        : spec.summary
      : `"${commandName}" is not in the curated reference, so its options cannot be explained. Check its own --help output.`,
    start: commandToken.start,
    end: commandToken.end,
  });
  index++;

  // Resolve a subcommand before options, because option meaning depends on it.
  let activeOptions: OptionSpec[] = spec?.options ?? [];
  let subcommand: SubcommandSpec | undefined;

  if (spec?.subcommands && index < tokens.length) {
    const candidate = tokens[index]!;
    if (candidate.kind === 'word' && !candidate.value.startsWith('-')) {
      subcommand = spec.subcommands.find((s) => s.name === candidate.value);
      if (subcommand) {
        parts.push({
          role: 'subcommand',
          text: candidate.raw,
          label: `${commandName} ${subcommand.name}`,
          description: subcommand.description,
          start: candidate.start,
          end: candidate.end,
        });
        index++;
        activeOptions = [...(subcommand.options ?? []), ...(spec.options ?? [])];
      } else {
        parts.push({
          role: 'unknown',
          text: candidate.raw,
          label: candidate.value,
          description: `"${candidate.value}" is not a ${commandName} subcommand in the curated reference.`,
          start: candidate.start,
          end: candidate.end,
        });
        index++;
      }
    }
  }

  let operandPosition = 0;

  while (index < tokens.length) {
    const token = tokens[index]!;

    if (token.kind === 'comment') {
      appendTrailing(tokens.slice(index), parts);
      break;
    }

    if (token.kind === 'redirection') {
      parts.push(redirectionPart(token));
      index++;
      // The following word is the redirection target.
      if (index < tokens.length && tokens[index]!.kind === 'word') {
        const target = tokens[index]!;
        parts.push({
          role: 'operand',
          text: target.raw,
          label: 'target',
          description: 'The file or descriptor the redirection writes to or reads from.',
          start: target.start,
          end: target.end,
        });
        index++;
      }
      continue;
    }

    if (token.kind === 'assignment') {
      const name = token.raw.slice(0, token.raw.indexOf('='));
      parts.push({
        role: 'assignment',
        text: token.raw,
        label: name,
        description: `Passes ${name} as a key=value operand to ${commandName}.`,
        start: token.start,
        end: token.end,
      });
      index++;
      continue;
    }

    // `--` ends option parsing.
    if (token.raw === '--') {
      parts.push({
        role: 'option',
        text: token.raw,
        label: '--',
        description: 'Ends option parsing. Everything after this is treated as an operand, even if it starts with a dash.',
        start: token.start,
        end: token.end,
      });
      index++;
      while (index < tokens.length) {
        const operand = tokens[index]!;
        parts.push(operandPart(operand, spec, operandPosition++));
        index++;
      }
      break;
    }

    // Long option.
    if (token.raw.startsWith('--') && token.raw.length > 2) {
      const body = token.raw.slice(2);
      const eq = body.indexOf('=');
      const name = eq === -1 ? body : body.slice(0, eq);
      const inlineValue = eq === -1 ? undefined : body.slice(eq + 1);

      const option = activeOptions.find((o) => o.long?.includes(name));
      parts.push({
        role: 'option',
        text: token.raw,
        label: `--${name}`,
        description: option
          ? option.description
          : `--${name} is not in the curated reference for ${describeTarget(commandName, subcommand)}.`,
        start: token.start,
        end: token.end,
      });
      index++;

      if (option?.takesValue && inlineValue === undefined && index < tokens.length) {
        const valueToken = tokens[index]!;
        if (valueToken.kind === 'word' && !valueToken.value.startsWith('-')) {
          parts.push(optionValuePart(valueToken, `--${name}`));
          index++;
        }
      }
      continue;
    }

    // Short option or cluster.
    if (token.raw.startsWith('-') && token.raw.length > 1) {
      const cluster = token.raw.slice(1);

      // Some tools document a fused pair such as docker's -it. Only consult this for
      // multi-letter clusters: a single letter must fall through to the loop below so
      // that a value-taking option still consumes its argument.
      const fused = cluster.length > 1 ? activeOptions.find((o) => o.short?.includes(cluster)) : undefined;
      if (fused) {
        parts.push({
          role: 'option',
          text: token.raw,
          label: `-${cluster}`,
          description: fused.description,
          start: token.start,
          end: token.end,
        });
        index++;
        continue;
      }

      let consumedValueInline = false;
      for (let c = 0; c < cluster.length; c++) {
        const letter = cluster[c]!;
        const option = activeOptions.find((o) => o.short?.includes(letter));

        parts.push({
          role: 'option',
          text: `-${letter}`,
          label: `-${letter}`,
          description: option
            ? option.description
            : `-${letter} is not in the curated reference for ${describeTarget(commandName, subcommand)}.`,
          start: token.start,
          end: token.end,
        });

        // A value-taking short option consumes the rest of the cluster, e.g. -n5.
        if (option?.takesValue && c < cluster.length - 1) {
          const inline = cluster.slice(c + 1);
          parts.push({
            role: 'option-value',
            text: inline,
            label: `value for -${letter}`,
            description: `Supplied directly after -${letter} rather than as a separate argument.`,
            start: token.start,
            end: token.end,
          });
          consumedValueInline = true;
          break;
        }
      }
      index++;

      if (!consumedValueInline) {
        const last = cluster[cluster.length - 1];
        const lastOption = last ? activeOptions.find((o) => o.short?.includes(last)) : undefined;
        if (lastOption?.takesValue && index < tokens.length) {
          const valueToken = tokens[index]!;
          if (valueToken.kind === 'word' && !valueToken.value.startsWith('-')) {
            parts.push(optionValuePart(valueToken, `-${last}`));
            index++;
          }
        }
      }
      continue;
    }

    parts.push(operandPart(token, spec, operandPosition++));
    index++;
  }

  return result;
}

function describeTarget(commandName: string, subcommand?: SubcommandSpec): string {
  return subcommand ? `${commandName} ${subcommand.name}` : commandName;
}

function redirectionPart(token: Token): ExplainedPart {
  const normalized = token.raw.replace(/^\d+/, (digits) => (digits === '2' ? '2' : ''));
  const description =
    REDIRECTION_DESCRIPTIONS[token.raw] ??
    REDIRECTION_DESCRIPTIONS[normalized] ??
    'Redirects a stream to or from a file.';

  return {
    role: 'redirection',
    text: token.raw,
    label: token.raw,
    description,
    start: token.start,
    end: token.end,
  };
}

function optionValuePart(token: Token, optionLabel: string): ExplainedPart {
  return {
    role: 'option-value',
    text: token.raw,
    label: `value for ${optionLabel}`,
    description: `Consumed as the argument to ${optionLabel}.`,
    start: token.start,
    end: token.end,
  };
}

function operandPart(token: Token, spec: CommandSpec | undefined, position: number): ExplainedPart {
  const operands = spec?.operands ?? [];

  let matched = operands[position];
  if (!matched && operands.length > 0) {
    const last = operands[operands.length - 1]!;
    if (last.repeats) matched = last;
  }

  return {
    role: 'operand',
    text: token.raw,
    label: matched?.name ?? 'argument',
    description: matched?.description ?? 'Positional argument.',
    start: token.start,
    end: token.end,
  };
}

function appendTrailing(tokens: Token[], parts: ExplainedPart[]): void {
  for (const token of tokens) {
    if (token.kind === 'comment') {
      parts.push({
        role: 'comment',
        text: token.raw,
        label: 'comment',
        description: 'Ignored by the shell.',
        start: token.start,
        end: token.end,
      });
      continue;
    }
    if (token.kind === 'redirection') {
      parts.push(redirectionPart(token));
      continue;
    }
    parts.push({
      role: 'unknown',
      text: token.raw,
      label: token.value,
      description: 'Not interpreted as part of a recognised command.',
      start: token.start,
      end: token.end,
    });
  }
}

/**
 * Flags command shapes that are commonly destructive or that disable a protection.
 *
 * The white paper requires "safe-command warnings". These are advisory: the module
 * cannot know a user's intent, so the wording explains the consequence rather than
 * forbidding anything.
 */
function collectWarnings(segments: ExplainedSegment[], tokens: Token[]): CommandWarning[] {
  const warnings: CommandWarning[] = [];
  const seen = new Set<string>();

  const add = (warning: CommandWarning) => {
    const key = `${warning.severity}:${warning.title}`;
    if (seen.has(key)) return;
    seen.add(key);
    warnings.push(warning);
  };

  const words = tokens.filter((t) => t.kind === 'word').map((t) => t.value);

  for (const seg of segments) {
    const name = seg.commandName;
    const flags = new Set(
      seg.parts.filter((p) => p.role === 'option').map((p) => p.label),
    );
    const operands = seg.parts.filter((p) => p.role === 'operand').map((p) => p.text);

    if (name === 'rm') {
      const recursive = flags.has('-r') || flags.has('-R') || flags.has('--recursive');
      const force = flags.has('-f') || flags.has('--force');

      if (recursive && force) {
        add({
          severity: 'danger',
          title: 'rm -rf deletes without confirmation',
          detail:
            'Recursive and forced removal together delete a whole tree with no prompt and no recovery. Verify the path first — a stray space, an unset variable, or a trailing slash can change the target.',
        });
      } else if (recursive) {
        add({
          severity: 'caution',
          title: 'Recursive removal',
          detail: 'This removes directories and everything inside them. There is no undo.',
        });
      }

      if (operands.some((o) => o === '/' || o === '/*' || o === '~' || o === '~/' )) {
        add({
          severity: 'danger',
          title: 'Removal target is a root or home directory',
          detail: 'The target expands to the filesystem root or your entire home directory.',
        });
      }
    }

    if (name === 'chmod' && operands.some((o) => /^0?777$/.test(o))) {
      add({
        severity: 'danger',
        title: 'chmod 777 grants write access to everyone',
        detail:
          'Mode 777 lets any user on the system read, write and execute the file. Grant the narrowest mode that works instead.',
      });
    }

    if (name === 'dd') {
      add({
        severity: 'danger',
        title: 'dd writes directly to the target',
        detail:
          'dd writes raw blocks with no filesystem safety net. An of= pointing at a disk device overwrites that disk immediately.',
      });
    }

    if (name === 'curl' && (flags.has('-k') || flags.has('--insecure'))) {
      add({
        severity: 'danger',
        title: 'TLS verification disabled',
        detail:
          '--insecure accepts any certificate, which removes protection against an intercepted connection. Fix the trust store rather than skipping the check.',
      });
    }

    if (name === 'git') {
      if (flags.has('-f') || flags.has('--force')) {
        const isPush = seg.parts.some((p) => p.role === 'subcommand' && p.text === 'push');
        if (isPush) {
          add({
            severity: 'danger',
            title: 'Force push overwrites remote history',
            detail:
              'This can discard commits other people have already pulled. Prefer --force-with-lease, which refuses if the remote moved since you last looked.',
          });
        }
      }
      if (flags.has('--hard')) {
        add({
          severity: 'danger',
          title: 'git reset --hard discards uncommitted work',
          detail: 'Index and working-tree changes are thrown away and are not recoverable through git.',
        });
      }
      if (flags.has('--no-verify')) {
        add({
          severity: 'caution',
          title: 'Hooks skipped',
          detail: '--no-verify bypasses the checks the repository has configured to run before a commit.',
        });
      }
    }

    if (name === 'kill' && flags.has('-9')) {
      add({
        severity: 'caution',
        title: 'SIGKILL cannot be handled',
        detail:
          'The process is terminated immediately with no chance to flush buffers or release locks. Try the default SIGTERM first.',
      });
    }

    if (name === 'kubectl' && seg.parts.some((p) => p.role === 'subcommand' && p.text === 'delete')) {
      add({
        severity: 'caution',
        title: 'Cluster resources will be deleted',
        detail: 'Anything not reproducible from a stored manifest is gone. Confirm the namespace and context first.',
      });
    }
  }

  // Piping a download straight into a shell is the classic remote-code-execution
  // shape. The interpreter is often wrapped in a privilege escalator — `curl … | sudo
  // bash` is the most common form of all — so look through the wrapper rather than
  // only at the segment's own command name.
  const INTERPRETERS = ['sh', 'bash', 'zsh', 'dash', 'ksh', 'fish', 'python', 'python3', 'node', 'perl', 'ruby'];
  const PRIVILEGE_WRAPPERS = ['sudo', 'doas', 'env'];

  const effectiveCommand = (seg: ExplainedSegment): string | undefined => {
    const name = seg.commandName;
    if (name === undefined) return undefined;
    if (!PRIVILEGE_WRAPPERS.includes(name)) return name;

    // The wrapped command is the first positional argument.
    const firstOperand = seg.parts.find((p) => p.role === 'operand' || p.role === 'unknown');
    return firstOperand?.text ?? name;
  };

  const hasDownloader = segments.some((s) => {
    const name = effectiveCommand(s);
    return name === 'curl' || name === 'wget';
  });
  const pipesToShell = segments.some(
    (s) => s.connector === '|' && INTERPRETERS.includes(effectiveCommand(s) ?? ''),
  );
  if (hasDownloader && pipesToShell) {
    add({
      severity: 'danger',
      title: 'Downloaded script piped straight into an interpreter',
      detail:
        'Whatever the server returns runs immediately with your privileges, and you never see it. Download to a file, read it, then run it.',
    });
  }

  if (words.includes('sudo')) {
    add({
      severity: 'caution',
      title: 'Runs with elevated privileges',
      detail: 'sudo removes the usual permission checks, so mistakes in this command affect the whole system.',
    });
  }

  return warnings;
}
