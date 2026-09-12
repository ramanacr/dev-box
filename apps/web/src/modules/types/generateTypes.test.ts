import { describe, expect, it } from 'vitest';
import { generateTypes, TARGET_LANGUAGES, TypeGenerationError } from './generateTypes';

const SAMPLE = JSON.stringify({
  id: 42,
  name: 'Widget',
  price: 19.99,
  inStock: true,
  tags: ['a', 'b'],
  description: null,
  supplier: { id: 7, companyName: 'Acme' },
});

describe('generateTypes — TypeScript', () => {
  const output = generateTypes(SAMPLE, 'typescript', { rootName: 'Product' });

  it('names the root type', () => {
    expect(output).toContain('export interface Product {');
  });

  it('maps scalars', () => {
    expect(output).toMatch(/id: number;/);
    expect(output).toMatch(/name: string;/);
    expect(output).toMatch(/inStock: boolean;/);
  });

  it('maps arrays', () => {
    expect(output).toMatch(/tags: string\[\];/);
  });

  it('marks a null-valued field as nullable', () => {
    expect(output).toMatch(/description: unknown \| null;/);
  });

  it('generates a nested type and references it', () => {
    expect(output).toContain('export interface Supplier {');
    expect(output).toMatch(/supplier: Supplier;/);
    expect(output).toMatch(/companyName: string;/);
  });
});

describe('generateTypes — other languages', () => {
  it('emits C# with serialization attributes', () => {
    const output = generateTypes(SAMPLE, 'csharp', { rootName: 'Product' });
    expect(output).toContain('using System.Text.Json.Serialization;');
    expect(output).toContain('public sealed class Product');
    expect(output).toContain('[JsonPropertyName("inStock")]');
    expect(output).toMatch(/public bool InStock \{ get; set; \}/);
    expect(output).toMatch(/public List<string> Tags \{ get; set; \}/);
  });

  it('emits a Java record', () => {
    const output = generateTypes(SAMPLE, 'java', { rootName: 'Product' });
    expect(output).toContain('import com.fasterxml.jackson.annotation.JsonProperty;');
    expect(output).toContain('public record Product(');
    expect(output).toContain('@JsonProperty("inStock") Boolean inStock');
    expect(output).toContain('List<String> tags');
  });

  it('emits a Kotlin data class', () => {
    const output = generateTypes(SAMPLE, 'kotlin', { rootName: 'Product' });
    expect(output).toContain('@Serializable');
    expect(output).toContain('data class Product(');
    expect(output).toContain('@SerialName("inStock") val inStock: Boolean');
    expect(output).toContain('val tags: List<String>');
  });

  it('emits a Go struct with json tags', () => {
    const output = generateTypes(SAMPLE, 'go', { rootName: 'Product' });
    expect(output).toContain('package model');
    expect(output).toContain('type Product struct {');
    expect(output).toContain('InStock bool `json:"inStock"`');
    expect(output).toContain('Tags []string `json:"tags"`');
    // Nested objects are referenced by pointer.
    expect(output).toMatch(/Supplier \*Supplier `json:"supplier"`/);
  });

  it('emits Python pydantic models', () => {
    const output = generateTypes(SAMPLE, 'python', { rootName: 'Product' });
    expect(output).toContain('from pydantic import BaseModel, Field');
    expect(output).toContain('class Product(BaseModel):');
    // camelCase JSON keys become snake_case fields with an alias.
    expect(output).toContain('in_stock: bool = Field(alias="inStock")');
    expect(output).toContain('tags: list[str]');
  });

  it('emits Rust serde structs', () => {
    const output = generateTypes(SAMPLE, 'rust', { rootName: 'Product' });
    expect(output).toContain('use serde::{Deserialize, Serialize};');
    expect(output).toContain('pub struct Product {');
    expect(output).toContain('#[serde(rename = "inStock")]');
    expect(output).toContain('pub in_stock: bool,');
    expect(output).toContain('pub tags: Vec<String>,');
  });

  it('supports every advertised language', () => {
    for (const { id } of TARGET_LANGUAGES) {
      expect(() => generateTypes(SAMPLE, id, { rootName: 'Product' })).not.toThrow();
    }
  });
});

describe('generateTypes — shape merging', () => {
  it('treats a field missing from one array element as optional', () => {
    const json = JSON.stringify([{ a: 1, b: 2 }, { a: 3 }]);
    const output = generateTypes(json, 'typescript', { rootName: 'Row' });

    expect(output).toMatch(/a: number;/);
    expect(output).toMatch(/b\?: number;/);
  });

  it('widens integer and float to a single numeric type', () => {
    const json = JSON.stringify([{ n: 1 }, { n: 1.5 }]);
    expect(generateTypes(json, 'typescript', { rootName: 'Row' })).toMatch(/n: number;/);
    expect(generateTypes(json, 'go', { rootName: 'Row' })).toContain('float64');
  });

  it('keeps integers narrow when no float appears', () => {
    const json = JSON.stringify([{ n: 1 }, { n: 2 }]);
    expect(generateTypes(json, 'go', { rootName: 'Row' })).toContain('int64');
    expect(generateTypes(json, 'rust', { rootName: 'Row' })).toContain('i64');
  });

  it('treats a sometimes-null field as nullable', () => {
    const json = JSON.stringify([{ v: 'x' }, { v: null }]);
    expect(generateTypes(json, 'typescript', { rootName: 'Row' })).toMatch(/v: string \| null;/);
    expect(generateTypes(json, 'kotlin', { rootName: 'Row' })).toContain('String?');
    expect(generateTypes(json, 'rust', { rootName: 'Row' })).toContain('Option<String>');
  });

  it('produces a union for genuinely mixed scalar types', () => {
    const json = JSON.stringify([{ v: 'x' }, { v: 5 }]);
    expect(generateTypes(json, 'typescript', { rootName: 'Row' })).toMatch(
      /v: (string \| number|number \| string);/,
    );
  });

  it('generates the element type for a top-level array', () => {
    const json = JSON.stringify([{ id: 1 }, { id: 2 }]);
    const output = generateTypes(json, 'typescript', { rootName: 'Item' });
    expect(output).toContain('export interface Item {');
    expect(output).toMatch(/id: number;/);
  });

  it('merges nested objects across array elements', () => {
    const json = JSON.stringify([
      { meta: { a: 1 } },
      { meta: { a: 2, b: 'x' } },
    ]);
    const output = generateTypes(json, 'typescript', { rootName: 'Row' });
    expect(output).toMatch(/a: number;/);
    expect(output).toMatch(/b\?: string;/);
  });

  it('handles an empty array as an unknown element type', () => {
    const output = generateTypes(JSON.stringify({ items: [] }), 'typescript', { rootName: 'Root' });
    expect(output).toMatch(/items: unknown\[\];/);
  });

  it('handles deeply nested structures', () => {
    const json = JSON.stringify({ a: { b: { c: { d: { value: 1 } } } } });
    const output = generateTypes(json, 'typescript', { rootName: 'Root' });
    expect(output).toContain('export interface D {');
    expect(output).toMatch(/value: number;/);
  });
});

describe('generateTypes — identifier handling', () => {
  it('quotes a JSON key that is not a valid identifier', () => {
    const json = JSON.stringify({ 'content-type': 'application/json' });
    expect(generateTypes(json, 'typescript', { rootName: 'Headers' })).toContain(
      '"content-type": string;',
    );
  });

  it('converts a kebab-case key for languages that need it', () => {
    const json = JSON.stringify({ 'content-type': 'application/json' });
    expect(generateTypes(json, 'go', { rootName: 'Headers' })).toContain('ContentType string');
    expect(generateTypes(json, 'rust', { rootName: 'Headers' })).toContain('pub content_type: String');
  });

  it('avoids a type-name collision', () => {
    const json = JSON.stringify({ a: { x: 1 }, b: { y: 2 }, item: { z: 3 }, items: [{ z: 4 }] });
    const output = generateTypes(json, 'typescript', { rootName: 'Root' });
    // `item` and the singularised `items` both want the name Item.
    expect(output).toContain('export interface Item {');
    expect(output).toContain('export interface Item2 {');
  });

  it('defaults the root name when none is given', () => {
    expect(generateTypes(SAMPLE, 'typescript')).toContain('export interface Root {');
  });

  it('sanitises a root name that starts with a digit', () => {
    expect(generateTypes(SAMPLE, 'typescript', { rootName: '2fa' })).toContain('interface N2fa');
  });
});

describe('generateTypes — errors', () => {
  it('rejects empty input', () => {
    expect(() => generateTypes('  ', 'typescript')).toThrow(TypeGenerationError);
  });

  it('reports invalid JSON', () => {
    expect(() => generateTypes('{not json', 'typescript')).toThrow(/not valid JSON/i);
  });

  it('rejects a scalar with no object to generate from', () => {
    expect(() => generateTypes('42', 'typescript')).toThrow(/no object/i);
    expect(() => generateTypes('"text"', 'typescript')).toThrow(/no object/i);
  });

  it('rejects an over-large input', () => {
    const huge = JSON.stringify({ pad: 'x'.repeat(3 * 1024 * 1024) });
    expect(() => generateTypes(huge, 'typescript')).toThrow(/2 MB/);
  });

  it('rejects an unsupported language', () => {
    expect(() => generateTypes(SAMPLE, 'cobol' as never)).toThrow(/Unsupported language/i);
  });
});
