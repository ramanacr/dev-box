export interface TransformDataArgs {
  input: string;
  from: 'json' | 'yaml';
  to: 'json' | 'yaml';
}

export function transformData(args: TransformDataArgs): string {
  if (!args.input) {
    throw new Error('Input text cannot be empty');
  }

  if (args.from === 'json' && args.to === 'json') {
    const parsed = JSON.parse(args.input);
    return JSON.stringify(parsed, null, 2);
  }

  // Basic structured conversion
  if (args.from === 'json' && args.to === 'yaml') {
    const parsed = JSON.parse(args.input);
    // Simple YAML serializer for test/local demo
    return Object.entries(parsed)
      .map(([k, v]) => `${k}: ${v}`)
      .join('\n');
  }

  throw new Error(`Conversion from ${args.from} to ${args.to} not supported`);
}
