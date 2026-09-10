import { parseInput, serialize, type DataFormat } from './format';

export interface ConvertResult {
  success: boolean;
  output?: string;
  error?: string;
}

export function convertData(input: string, from: DataFormat, to: DataFormat): ConvertResult {
  if (from === to) {
    return { success: true, output: input };
  }

  const parseRes = parseInput(input, from);
  if (!parseRes.success) {
    return { success: false, error: parseRes.error };
  }

  try {
    const output = serialize(parseRes.data, to);
    return { success: true, output };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : `Failed to convert from ${from} to ${to}`,
    };
  }
}
