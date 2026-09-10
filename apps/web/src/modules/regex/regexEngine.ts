export interface RegexMatch {
  index: number;
  length: number;
  match: string;
  groups: string[];
  namedGroups?: Record<string, string>;
}

export interface RegexEvaluation {
  isValid: boolean;
  error?: string;
  matches: RegexMatch[];
  replaceOutput?: string;
  executionTimeMs: number;
}

const MAX_PATTERN_LENGTH = 200;
const MAX_INPUT_LENGTH = 1000000; // 1 MB chars
const MAX_MATCH_COUNT = 5000;

export function evaluateRegex(
  pattern: string,
  flags: string,
  input: string,
  replaceWith?: string
): RegexEvaluation {
  const start = performance.now();

  if (pattern.length > MAX_PATTERN_LENGTH) {
    return {
      isValid: false,
      error: `Pattern exceeds max length of ${MAX_PATTERN_LENGTH} characters.`,
      matches: [],
      executionTimeMs: 0,
    };
  }

  if (input.length > MAX_INPUT_LENGTH) {
    return {
      isValid: false,
      error: `Input text exceeds max length of ${(MAX_INPUT_LENGTH / 1000000).toFixed(1)} MB.`,
      matches: [],
      executionTimeMs: 0,
    };
  }

  if (!pattern) {
    return {
      isValid: true,
      matches: [],
      replaceOutput: input,
      executionTimeMs: performance.now() - start,
    };
  }

  try {
    const isGlobal = flags.includes('g');
    const regex = new RegExp(pattern, flags);
    const matches: RegexMatch[] = [];

    if (isGlobal) {
      let m: RegExpExecArray | null;
      let iterations = 0;

      while ((m = regex.exec(input)) !== null) {
        iterations++;
        matches.push({
          index: m.index,
          length: m[0].length,
          match: m[0],
          groups: m.slice(1),
          namedGroups: m.groups ? { ...m.groups } : undefined,
        });

        // Loop protection against zero-length matches
        if (m[0].length === 0) {
          regex.lastIndex++;
        }

        if (matches.length >= MAX_MATCH_COUNT || iterations > 50000) {
          break;
        }
      }
    } else {
      const m = regex.exec(input);
      if (m) {
        matches.push({
          index: m.index,
          length: m[0].length,
          match: m[0],
          groups: m.slice(1),
          namedGroups: m.groups ? { ...m.groups } : undefined,
        });
      }
    }

    let replaceOutput: string | undefined;
    if (replaceWith !== undefined) {
      replaceOutput = input.replace(regex, replaceWith);
    }

    return {
      isValid: true,
      matches,
      replaceOutput,
      executionTimeMs: performance.now() - start,
    };
  } catch (err: unknown) {
    return {
      isValid: false,
      error: err instanceof Error ? err.message : 'Invalid Regular Expression',
      matches: [],
      executionTimeMs: performance.now() - start,
    };
  }
}
