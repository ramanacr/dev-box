import { describe, it, expect } from 'vitest';
import { validateResponse } from './responseValidation';

describe('responseValidation', () => {
  it('validates matching object successfully', () => {
    const schema = {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
      },
    };

    const result = validateResponse(schema, { id: 101, name: 'Dog' });
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('detects missing required fields and type mismatches', () => {
    const schema = {
      type: 'object',
      required: ['id', 'name'],
      properties: {
        id: { type: 'number' },
        name: { type: 'string' },
      },
    };

    const result = validateResponse(schema, { id: 'not-a-number' });
    expect(result.valid).toBe(false);
    expect(result.issues.length).toBeGreaterThanOrEqual(1);

    const messages = result.issues.map((i) => i.message);
    expect(messages.some((m) => m.includes('required') || m.includes('must have required property'))).toBe(true);
  });

  it('validates array schemas', () => {
    const schema = {
      type: 'array',
      items: { type: 'string' },
    };

    expect(validateResponse(schema, ['a', 'b', 'c']).valid).toBe(true);
    expect(validateResponse(schema, ['a', 123]).valid).toBe(false);
  });
});
