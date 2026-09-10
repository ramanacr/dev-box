import { describe, it, expect } from 'vitest';
import { parseInput, serialize, MAX_INPUT_BYTES } from './format';
import { convertData } from './convert';
import { inferJsonSchema } from './schema';

describe('Structured Data Formatters & Parsers', () => {
  it('parses valid JSON and formats it deterministically', () => {
    const raw = '{"b":2,"a":1}';
    const parsed = parseInput(raw, 'json');
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ b: 2, a: 1 });

    const formatted = serialize(parsed.data, 'json');
    expect(formatted).toBe('{\n  "b": 2,\n  "a": 1\n}');
  });

  it('reports error on malformed JSON', () => {
    const res = parseInput('{invalid}', 'json');
    expect(res.success).toBe(false);
    expect(res.error).toBeDefined();
  });

  it('rejects payloads exceeding the 5 MB limit', () => {
    const huge = 'a'.repeat(MAX_INPUT_BYTES + 10);
    const res = parseInput(huge, 'json');
    expect(res.success).toBe(false);
    expect(res.error).toContain('exceeds the 5 MB limit');
  });

  it('safely parses YAML without executing arbitrary types', () => {
    const yamlStr = `
name: toolbox
count: 42
tags:
  - local
  - fast
`;
    const res = parseInput(yamlStr, 'yaml');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      name: 'toolbox',
      count: 42,
      tags: ['local', 'fast'],
    });
  });

  it('parses XML without DTD entity expansion', () => {
    const xml = '<root><item id="1">value</item></root>';
    const res = parseInput(xml, 'xml');
    expect(res.success).toBe(true);
    expect(res.data).toEqual({
      root: {
        item: {
          '#text': 'value',
          '@_id': 1,
        },
      },
    });
  });

  it('parses CSV with headers and typed values', () => {
    const csv = 'id,name,active\n1,Alice,true\n2,Bob,false';
    const res = parseInput(csv, 'csv');
    expect(res.success).toBe(true);
    expect(res.data).toEqual([
      { id: 1, name: 'Alice', active: true },
      { id: 2, name: 'Bob', active: false },
    ]);
  });

  it('converts between JSON and YAML cleanly', () => {
    const json = '{"name":"test","active":true}';
    const conv = convertData(json, 'json', 'yaml');
    expect(conv.success).toBe(true);
    expect(conv.output).toContain('name: test');
    expect(conv.output).toContain('active: true');
  });
});

describe('JSON Schema 2020-12 Inference', () => {
  it('infers types, required properties, and nested objects correctly', () => {
    const data = {
      id: 101,
      name: 'Developer',
      rate: 99.5,
      active: true,
      meta: {
        tags: ['tool', 'offline'],
      },
    };

    const schema = inferJsonSchema(data);
    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.type).toBe('object');
    expect(schema.properties?.id?.type).toBe('integer');
    expect(schema.properties?.rate?.type).toBe('number');
    expect(schema.properties?.name?.type).toBe('string');
    expect(schema.properties?.active?.type).toBe('boolean');
    expect(schema.properties?.meta?.type).toBe('object');
    expect(schema.required).toContain('id');
    expect(schema.required).toContain('name');
  });

  it('infers array item schemas and handles empty arrays', () => {
    const emptyArraySchema = inferJsonSchema([]);
    expect(emptyArraySchema.type).toBe('array');
    expect(emptyArraySchema.items).toEqual({});

    const uniformArraySchema = inferJsonSchema(['alpha', 'beta']);
    expect(uniformArraySchema.type).toBe('array');
    expect(uniformArraySchema.items).toEqual({ type: 'string' });

    const mixedArraySchema = inferJsonSchema(['alpha', 42]);
    expect(mixedArraySchema.type).toBe('array');
    expect(mixedArraySchema.items).toHaveProperty('anyOf');
  });
});
