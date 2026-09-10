import { parseInput, serialize, type DataFormat } from './format';
import { convertData } from './convert';
import { inferJsonSchema } from './schema';

export interface WorkerRequest {
  id: string;
  operation: 'parse' | 'format' | 'convert' | 'infer-schema';
  payload: unknown;
}

export interface WorkerResponse {
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
  byteSize?: number;
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, operation, payload } = event.data;

  try {
    switch (operation) {
      case 'parse': {
        const { input, format } = payload as { input: string; format: DataFormat };
        const res = parseInput(input, format);
        self.postMessage({
          id,
          success: res.success,
          result: res.data,
          error: res.error,
          byteSize: res.byteSize,
        });
        break;
      }
      case 'format': {
        const { value, format } = payload as { value: unknown; format: DataFormat };
        const output = serialize(value, format);
        self.postMessage({ id, success: true, result: output });
        break;
      }
      case 'convert': {
        const { input, from, to } = payload as { input: string; from: DataFormat; to: DataFormat };
        const res = convertData(input, from, to);
        self.postMessage({
          id,
          success: res.success,
          result: res.output,
          error: res.error,
        });
        break;
      }
      case 'infer-schema': {
        const { value } = payload as { value: unknown };
        const schema = inferJsonSchema(value);
        self.postMessage({ id, success: true, result: schema });
        break;
      }
      default:
        self.postMessage({ id, success: false, error: `Unknown operation: ${operation}` });
    }
  } catch (err: unknown) {
    self.postMessage({
      id,
      success: false,
      error: err instanceof Error ? err.message : 'Worker execution failure',
    });
  }
};
