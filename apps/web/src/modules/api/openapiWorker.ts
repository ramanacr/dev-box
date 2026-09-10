import { parseOpenApi, type ParseResult } from './openapi';

self.onmessage = async (e: MessageEvent<{ id: string; input: string }>) => {
  const { id, input } = e.data;
  try {
    const result: ParseResult = await parseOpenApi(input);
    self.postMessage({ id, result });
  } catch (err) {
    self.postMessage({
      id,
      result: {
        error: {
          severity: 'error',
          message: err instanceof Error ? err.message : 'Unknown worker parsing error',
        },
      },
    });
  }
};
