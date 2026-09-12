/**
 * MCP tool: convert structured data between formats.
 *
 * This runs entirely in the MCP process; nothing is sent anywhere. The previous
 * implementation hand-rolled a "simple YAML serializer" that only emitted flat
 * key/value pairs and silently produced wrong output for nested structures, so it used
 * the same `yaml` parser the browser workbench uses.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export type DataFormat = 'json' | 'yaml';

export interface TransformDataArgs {
  input: string;
  from: DataFormat;
  to: DataFormat;
}

/** Matches the browser workbench limit so both surfaces behave the same. */
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

export function transformData(args: TransformDataArgs): string {
  if (!args.input || args.input.trim() === '') {
    throw new Error('Input text cannot be empty');
  }

  const byteLength = new TextEncoder().encode(args.input).length;
  if (byteLength > MAX_INPUT_BYTES) {
    throw new Error(`Input exceeds the ${MAX_INPUT_BYTES / (1024 * 1024)} MB limit`);
  }

  for (const [label, format] of [
    ['from', args.from],
    ['to', args.to],
  ] as const) {
    if (format !== 'json' && format !== 'yaml') {
      throw new Error(`Unsupported "${label}" format: ${String(format)}`);
    }
  }

  const value = parseInput(args.input, args.from);
  return serialize(value, args.to);
}

function parseInput(input: string, format: DataFormat): unknown {
  if (format === 'json') {
    try {
      return JSON.parse(input);
    } catch (error) {
      throw new Error(`Input is not valid JSON: ${messageOf(error)}`);
    }
  }

  try {
    // Custom tags and merge keys are refused: a converter must not be a vector for
    // YAML features that can expand input or construct unexpected types.
    return parseYaml(input, { customTags: [], merge: false, maxAliasCount: 0 });
  } catch (error) {
    throw new Error(`Input is not valid YAML: ${messageOf(error)}`);
  }
}

function serialize(value: unknown, format: DataFormat): string {
  if (format === 'json') {
    return JSON.stringify(value, null, 2);
  }
  return stringifyYaml(value, { indent: 2 });
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    // Keep the parser's position information, drop any stack.
    return error.message.split('\n')[0] ?? 'parse error';
  }
  return 'parse error';
}
