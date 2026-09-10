export interface JsonSchema202012 {
  $schema?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema202012>;
  required?: string[];
  items?: JsonSchema202012 | JsonSchema202012[];
  anyOf?: JsonSchema202012[];
  additionalProperties?: boolean;
}

export function inferJsonSchema(value: unknown): JsonSchema202012 {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...inferNode(value),
  };
}

function inferNode(value: unknown): JsonSchema202012 {
  if (value === null) {
    return { type: 'null' };
  }

  if (value === undefined) {
    return {};
  }

  if (typeof value === 'string') {
    return { type: 'string' };
  }

  if (typeof value === 'boolean') {
    return { type: 'boolean' };
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? { type: 'integer' } : { type: 'number' };
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return { type: 'array', items: {} };
    }

    // Infer schemas for all items
    const itemSchemas = value.map(inferNode);

    // Merge or union unique schemas
    const uniqueSchemas = deduplicateSchemas(itemSchemas);
    if (uniqueSchemas.length === 1) {
      return { type: 'array', items: uniqueSchemas[0] };
    }

    return { type: 'array', items: { anyOf: uniqueSchemas } };
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const properties: Record<string, JsonSchema202012> = {};
    const required: string[] = [];

    for (const [key, val] of Object.entries(obj)) {
      properties[key] = inferNode(val);
      if (val !== undefined) {
        required.push(key);
      }
    }

    return {
      type: 'object',
      properties,
      required: required.length > 0 ? required : undefined,
    };
  }

  return {};
}

function deduplicateSchemas(schemas: JsonSchema202012[]): JsonSchema202012[] {
  const seen = new Set<string>();
  const result: JsonSchema202012[] = [];

  for (const s of schemas) {
    const serialized = JSON.stringify(s);
    if (!seen.has(serialized)) {
      seen.add(serialized);
      result.push(s);
    }
  }

  return result;
}
