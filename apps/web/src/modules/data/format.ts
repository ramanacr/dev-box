import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { XMLParser, XMLBuilder } from 'fast-xml-parser';
import Papa from 'papaparse';

export type DataFormat = 'json' | 'yaml' | 'xml' | 'csv';

export interface ParseResult {
  success: boolean;
  data?: unknown;
  error?: string;
  byteSize: number;
}

export const MAX_INPUT_BYTES = 5 * 1024 * 1024; // 5 MB limit

export function parseInput(input: string, format: DataFormat): ParseResult {
  const byteSize = new TextEncoder().encode(input).length;
  if (byteSize > MAX_INPUT_BYTES) {
    return {
      success: false,
      error: `Input size (${(byteSize / 1024 / 1024).toFixed(2)} MB) exceeds the 5 MB limit.`,
      byteSize,
    };
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return { success: true, data: null, byteSize };
  }

  try {
    switch (format) {
      case 'json': {
        const data = JSON.parse(trimmed);
        return { success: true, data, byteSize };
      }
      case 'yaml': {
        // Safe YAML parsing: disable merge keys, aliases, and custom tags
        const data = parseYaml(trimmed, {
          schema: 'core',
          customTags: [],
          merge: false,
          maxAliasCount: 0,
        });
        return { success: true, data, byteSize };
      }
      case 'xml': {
        // XML parsing without DTD / entity expansion
        const parser = new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '@_',
          processEntities: false,
          allowBooleanAttributes: true,
          parseAttributeValue: true,
          stopNodes: ['*.script'],
        });
        const data = parser.parse(trimmed);
        return { success: true, data, byteSize };
      }
      case 'csv': {
        const result = Papa.parse(trimmed, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        if (result.errors && result.errors.length > 0) {
          const firstErr = result.errors[0];
          return {
            success: false,
            error: `CSV Parse Error (line ${firstErr?.row ?? 1}): ${firstErr?.message ?? 'invalid CSV'}`,
            byteSize,
          };
        }
        return { success: true, data: result.data, byteSize };
      }
      default:
        return { success: false, error: `Unsupported data format: ${format}`, byteSize };
    }
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Failed to parse data',
      byteSize,
    };
  }
}

export function serialize(value: unknown, format: DataFormat): string {
  if (value === undefined || value === null) {
    return '';
  }

  switch (format) {
    case 'json':
      return JSON.stringify(value, null, 2);
    case 'yaml':
      return stringifyYaml(value, { indent: 2 });
    case 'xml': {
      const builder = new XMLBuilder({
        ignoreAttributes: false,
        attributeNamePrefix: '@_',
        format: true,
        indentBy: '  ',
      });
      // Wrap top level if array or raw value
      const wrapped = typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : { root: value };
      return builder.build(wrapped);
    }
    case 'csv': {
      if (Array.isArray(value)) {
        return Papa.unparse(value);
      }
      if (typeof value === 'object' && value !== null) {
        return Papa.unparse([value as Record<string, unknown>]);
      }
      return String(value);
    }
    default:
      throw new Error(`Unsupported serialize format: ${format}`);
  }
}
