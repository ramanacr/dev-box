/**
 * Type generation from a JSON sample.
 *
 * Emits type declarations for the seven languages the white paper lists: TypeScript,
 * C#, Java, Kotlin, Go, Python and Rust.
 *
 * Written natively rather than adding a code-generation dependency (quicktype and
 * similar are large), in line with the delivery standard's rule to prefer the
 * smallest component that satisfies the requirement. The trade-off is stated in the
 * UI: this handles the shapes that appear in real API payloads — nested objects,
 * arrays, nullables, unions of scalars — and does not attempt the full space of
 * JSON Schema.
 */

export type TargetLanguage =
  | 'typescript'
  | 'csharp'
  | 'java'
  | 'kotlin'
  | 'go'
  | 'python'
  | 'rust';

export const TARGET_LANGUAGES: { id: TargetLanguage; label: string }[] = [
  { id: 'typescript', label: 'TypeScript' },
  { id: 'csharp', label: 'C#' },
  { id: 'java', label: 'Java' },
  { id: 'kotlin', label: 'Kotlin' },
  { id: 'go', label: 'Go' },
  { id: 'python', label: 'Python' },
  { id: 'rust', label: 'Rust' },
];

export interface GenerateOptions {
  rootName?: string;
}

export class TypeGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TypeGenerationError';
  }
}

// --- shape inference ------------------------------------------------------

type Shape =
  | { kind: 'unknown' }
  | { kind: 'null' }
  | { kind: 'boolean' }
  | { kind: 'integer' }
  | { kind: 'number' }
  | { kind: 'string' }
  | { kind: 'array'; items: Shape }
  | { kind: 'object'; fields: Map<string, { shape: Shape; required: boolean }> }
  | { kind: 'union'; options: Shape[] };

const MAX_DEPTH = 24;

function inferShape(value: unknown, depth = 0): Shape {
  if (depth > MAX_DEPTH) {
    throw new TypeGenerationError(`Input nests deeper than ${MAX_DEPTH} levels.`);
  }

  if (value === null) return { kind: 'null' };

  switch (typeof value) {
    case 'boolean':
      return { kind: 'boolean' };
    case 'number':
      return Number.isInteger(value) ? { kind: 'integer' } : { kind: 'number' };
    case 'string':
      return { kind: 'string' };
    default:
      break;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return { kind: 'array', items: { kind: 'unknown' } };
    let items: Shape = inferShape(value[0], depth + 1);
    for (let i = 1; i < value.length; i++) {
      items = mergeShapes(items, inferShape(value[i], depth + 1));
    }
    return { kind: 'array', items };
  }

  if (typeof value === 'object') {
    const fields = new Map<string, { shape: Shape; required: boolean }>();
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      fields.set(key, { shape: inferShape(child, depth + 1), required: true });
    }
    return { kind: 'object', fields };
  }

  return { kind: 'unknown' };
}

/** Merges two observed shapes into one that describes both. */
function mergeShapes(a: Shape, b: Shape): Shape {
  if (a.kind === 'unknown') return b;
  if (b.kind === 'unknown') return a;

  // null merges as "nullable", represented as a union containing null.
  if (a.kind === 'null' && b.kind === 'null') return a;
  if (a.kind === 'null' || b.kind === 'null') {
    const other = a.kind === 'null' ? b : a;
    return { kind: 'union', options: dedupe([{ kind: 'null' }, ...flattenUnion(other)]) };
  }

  if (a.kind === 'integer' && b.kind === 'number') return { kind: 'number' };
  if (a.kind === 'number' && b.kind === 'integer') return { kind: 'number' };

  if (a.kind === 'array' && b.kind === 'array') {
    return { kind: 'array', items: mergeShapes(a.items, b.items) };
  }

  if (a.kind === 'object' && b.kind === 'object') {
    const fields = new Map<string, { shape: Shape; required: boolean }>();
    const keys = new Set([...a.fields.keys(), ...b.fields.keys()]);

    for (const key of keys) {
      const left = a.fields.get(key);
      const right = b.fields.get(key);

      if (left && right) {
        fields.set(key, {
          shape: mergeShapes(left.shape, right.shape),
          required: left.required && right.required,
        });
      } else {
        // Present in only one sample, so it is optional.
        const present = (left ?? right)!;
        fields.set(key, { shape: present.shape, required: false });
      }
    }
    return { kind: 'object', fields };
  }

  if (a.kind === b.kind) return a;

  return { kind: 'union', options: dedupe([...flattenUnion(a), ...flattenUnion(b)]) };
}

function flattenUnion(shape: Shape): Shape[] {
  return shape.kind === 'union' ? shape.options : [shape];
}

function dedupe(shapes: Shape[]): Shape[] {
  const out: Shape[] = [];
  for (const shape of shapes) {
    if (!out.some((existing) => sameShape(existing, shape))) out.push(shape);
  }
  return out;
}

function sameShape(a: Shape, b: Shape): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'array' && b.kind === 'array') return sameShape(a.items, b.items);
  if (a.kind === 'object' && b.kind === 'object') {
    if (a.fields.size !== b.fields.size) return false;
    for (const [key, field] of a.fields) {
      const other = b.fields.get(key);
      if (!other || !sameShape(field.shape, other.shape)) return false;
    }
    return true;
  }
  return true;
}

function isNullable(shape: Shape): boolean {
  // A field observed only as null is nullable with an unknown element type. Rendering
  // it as the literal type `null` would be accurate for the sample but useless as a
  // model: the real field almost certainly holds something.
  if (shape.kind === 'null') return true;
  return shape.kind === 'union' && shape.options.some((o) => o.kind === 'null');
}

/** Strips null from a union, returning the remaining shape. */
function nonNull(shape: Shape): Shape {
  if (shape.kind === 'null') return { kind: 'unknown' };
  if (shape.kind !== 'union') return shape;
  const options = shape.options.filter((o) => o.kind !== 'null');
  if (options.length === 0) return { kind: 'unknown' };
  if (options.length === 1) return options[0]!;
  return { kind: 'union', options };
}

// --- naming ---------------------------------------------------------------

function pascalCase(input: string): string {
  const parts = input.split(/[^A-Za-z0-9]+/).filter(Boolean);
  if (parts.length === 0) return 'Value';
  const joined = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join('');
  return /^[0-9]/.test(joined) ? `N${joined}` : joined;
}

function camelCase(input: string): string {
  const pascal = pascalCase(input);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function snakeCase(input: string): string {
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase() || 'value';
}

/** Trims a trailing plural so an array's element type reads naturally. */
function singularize(name: string): string {
  if (/ies$/i.test(name)) return name.slice(0, -3) + 'y';
  if (/(ses|xes|zes|ches|shes)$/i.test(name)) return name.slice(0, -2);
  if (/[^s]s$/i.test(name)) return name.slice(0, -1);
  return name;
}

/** Collects the named object types in the shape, deepest last. */
interface NamedType {
  name: string;
  fields: { key: string; shape: Shape; required: boolean }[];
}

function collectTypes(shape: Shape, rootName: string): NamedType[] {
  const types: NamedType[] = [];
  const used = new Set<string>();

  const nameFor = (preferred: string): string => {
    let candidate = pascalCase(preferred);
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${pascalCase(preferred)}${suffix++}`;
    }
    used.add(candidate);
    return candidate;
  };

  // Assigned names are memoised on the shape so a repeated structure reuses its type.
  const assigned = new Map<Shape, string>();

  const visit = (current: Shape, preferred: string): void => {
    const target = nonNull(current);

    if (target.kind === 'array') {
      visit(target.items, singularize(preferred));
      return;
    }
    if (target.kind === 'union') {
      target.options.forEach((option, i) => visit(option, `${preferred}Option${i + 1}`));
      return;
    }
    if (target.kind !== 'object') return;
    if (assigned.has(target)) return;

    const name = nameFor(preferred);
    assigned.set(target, name);

    // Children first so declarations can be emitted in dependency order for
    // languages that care.
    for (const [key, field] of target.fields) {
      visit(field.shape, key);
    }

    types.push({
      name,
      fields: [...target.fields.entries()].map(([key, field]) => ({
        key,
        shape: field.shape,
        required: field.required,
      })),
    });
  };

  visit(shape, rootName);

  // Emit parents before children reads better, so reverse the post-order.
  types.reverse();

  // Expose the assignment map through a closure property for the emitters.
  typeNames.set(types, assigned);
  return types;
}

/** Maps a collected type list to the shape→name assignments used to build it. */
const typeNames = new WeakMap<NamedType[], Map<Shape, string>>();

function nameOf(types: NamedType[], shape: Shape): string | undefined {
  return typeNames.get(types)?.get(nonNull(shape));
}

// --- entry point ----------------------------------------------------------

export function generateTypes(
  json: string,
  language: TargetLanguage,
  options: GenerateOptions = {},
): string {
  const trimmed = json.trim();
  if (trimmed === '') {
    throw new TypeGenerationError('Paste a JSON sample to generate types from.');
  }
  if (trimmed.length > 2 * 1024 * 1024) {
    throw new TypeGenerationError('Input exceeds the 2 MB limit.');
  }

  let value: unknown;
  try {
    value = JSON.parse(trimmed);
  } catch (error) {
    throw new TypeGenerationError(
      `Input is not valid JSON: ${error instanceof Error ? error.message : 'parse error'}`,
    );
  }

  const rootName = pascalCase(options.rootName?.trim() || 'Root');
  const shape = inferShape(value);

  // A top-level array generates the element type; that is what a caller wants to
  // deserialize into.
  const target = nonNull(shape).kind === 'array' ? nonNull(shape) : shape;
  const types = collectTypes(target, rootName);

  if (types.length === 0) {
    throw new TypeGenerationError(
      'The sample contains no object to generate a type from. Provide an object, or an array of objects.',
    );
  }

  switch (language) {
    case 'typescript':
      return emitTypeScript(types);
    case 'csharp':
      return emitCSharp(types);
    case 'java':
      return emitJava(types);
    case 'kotlin':
      return emitKotlin(types);
    case 'go':
      return emitGo(types);
    case 'python':
      return emitPython(types);
    case 'rust':
      return emitRust(types);
    default:
      throw new TypeGenerationError(`Unsupported language: ${String(language)}`);
  }
}

// --- emitters -------------------------------------------------------------

function emitTypeScript(types: NamedType[]): string {
  const render = (shape: Shape): string => {
    const nullable = isNullable(shape);
    const base = renderBase(shape);
    return nullable ? `${base} | null` : base;
  };

  const renderBase = (shape: Shape): string => {
    const target = nonNull(shape);
    const named = nameOf(types, target);
    if (named) return named;

    switch (target.kind) {
      case 'boolean':
        return 'boolean';
      case 'integer':
      case 'number':
        return 'number';
      case 'string':
        return 'string';
      case 'array':
        return `${renderBase(target.items)}${isNullable(target.items) ? ' | null' : ''}[]`.replace(
          /^(.+ \| null)\[\]$/,
          '($1)[]',
        );
      case 'union':
        return target.options.map(renderBase).join(' | ');
      case 'null':
        return 'null';
      default:
        return 'unknown';
    }
  };

  return types
    .map((type) => {
      const fields = type.fields
        .map((field) => {
          const optional = field.required ? '' : '?';
          return `  ${propertyKey(field.key)}${optional}: ${render(field.shape)};`;
        })
        .join('\n');
      return `export interface ${type.name} {\n${fields}\n}`;
    })
    .join('\n\n');
}

function propertyKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

function emitCSharp(types: NamedType[]): string {
  const render = (shape: Shape): string => {
    const target = nonNull(shape);
    const named = nameOf(types, target);
    const nullable = isNullable(shape);

    let base: string;
    if (named) {
      base = named;
    } else {
      switch (target.kind) {
        case 'boolean':
          base = 'bool';
          break;
        case 'integer':
          base = 'long';
          break;
        case 'number':
          base = 'double';
          break;
        case 'string':
          base = 'string';
          break;
        case 'array':
          base = `List<${render(target.items)}>`;
          break;
        default:
          base = 'object';
      }
    }

    // The `?` marker is applied only when the field is genuinely nullable. Adding it
    // to every reference type also decorated array *element* types, producing
    // `List<string?>?` for a plain array of strings.
    return nullable ? `${base}?` : base;
  };

  const body = types
    .map((type) => {
      const properties = type.fields
        .map(
          (field) =>
            `    [JsonPropertyName("${field.key}")]\n` +
            `    public ${render(field.shape)} ${pascalCase(field.key)} { get; set; }`,
        )
        .join('\n\n');
      return `public sealed class ${type.name}\n{\n${properties}\n}`;
    })
    .join('\n\n');

  return `using System.Collections.Generic;\nusing System.Text.Json.Serialization;\n\n${body}`;
}

function emitJava(types: NamedType[]): string {
  const render = (shape: Shape): string => {
    const target = nonNull(shape);
    const named = nameOf(types, target);
    if (named) return named;

    switch (target.kind) {
      case 'boolean':
        return 'Boolean';
      case 'integer':
        return 'Long';
      case 'number':
        return 'Double';
      case 'string':
        return 'String';
      case 'array':
        return `List<${render(target.items)}>`;
      default:
        return 'Object';
    }
  };

  const body = types
    .map((type) => {
      const components = type.fields
        .map((field) => `    @JsonProperty("${field.key}") ${render(field.shape)} ${camelCase(field.key)}`)
        .join(',\n');
      // A record is the natural fit for a deserialization target.
      return `public record ${type.name}(\n${components}\n) {}`;
    })
    .join('\n\n');

  return `import com.fasterxml.jackson.annotation.JsonProperty;\nimport java.util.List;\n\n${body}`;
}

function emitKotlin(types: NamedType[]): string {
  const render = (shape: Shape): string => {
    const target = nonNull(shape);
    const named = nameOf(types, target);
    const nullable = isNullable(shape);

    let base: string;
    if (named) {
      base = named;
    } else {
      switch (target.kind) {
        case 'boolean':
          base = 'Boolean';
          break;
        case 'integer':
          base = 'Long';
          break;
        case 'number':
          base = 'Double';
          break;
        case 'string':
          base = 'String';
          break;
        case 'array':
          base = `List<${render(target.items)}>`;
          break;
        default:
          base = 'Any';
      }
    }
    return nullable ? `${base}?` : base;
  };

  const body = types
    .map((type) => {
      const properties = type.fields
        .map((field) => {
          const type_ = render(field.shape);
          const optional = field.required ? '' : ' = null';
          const nullableType = field.required ? type_ : type_.endsWith('?') ? type_ : `${type_}?`;
          return `    @SerialName("${field.key}") val ${camelCase(field.key)}: ${nullableType}${optional}`;
        })
        .join(',\n');
      return `@Serializable\ndata class ${type.name}(\n${properties}\n)`;
    })
    .join('\n\n');

  return `import kotlinx.serialization.SerialName\nimport kotlinx.serialization.Serializable\n\n${body}`;
}

function emitGo(types: NamedType[]): string {
  const render = (shape: Shape): string => {
    const target = nonNull(shape);
    const named = nameOf(types, target);
    const nullable = isNullable(shape);

    let base: string;
    if (named) {
      base = `*${named}`;
    } else {
      switch (target.kind) {
        case 'boolean':
          base = 'bool';
          break;
        case 'integer':
          base = 'int64';
          break;
        case 'number':
          base = 'float64';
          break;
        case 'string':
          base = 'string';
          break;
        case 'array':
          base = `[]${render(target.items)}`;
          break;
        default:
          base = 'any';
      }
    }

    // A pointer distinguishes "absent" from "zero value", which matters for an
    // optional or explicitly null field.
    if (nullable && !base.startsWith('*') && !base.startsWith('[]') && base !== 'any') {
      return `*${base}`;
    }
    return base;
  };

  const body = types
    .map((type) => {
      const fields = type.fields
        .map((field) => {
          const omit = field.required ? '' : ',omitempty';
          return `\t${pascalCase(field.key)} ${render(field.shape)} \`json:"${field.key}${omit}"\``;
        })
        .join('\n');
      return `type ${type.name} struct {\n${fields}\n}`;
    })
    .join('\n\n');

  return `package model\n\n${body}`;
}

function emitPython(types: NamedType[]): string {
  const render = (shape: Shape): string => {
    const target = nonNull(shape);
    const named = nameOf(types, target);
    const nullable = isNullable(shape);

    let base: string;
    if (named) {
      base = named;
    } else {
      switch (target.kind) {
        case 'boolean':
          base = 'bool';
          break;
        case 'integer':
          base = 'int';
          break;
        case 'number':
          base = 'float';
          break;
        case 'string':
          base = 'str';
          break;
        case 'array':
          base = `list[${render(target.items)}]`;
          break;
        case 'union':
          base = target.options.filter((o) => o.kind !== 'null').map(render).join(' | ') || 'Any';
          break;
        default:
          base = 'Any';
      }
    }
    return nullable ? `${base} | None` : base;
  };

  // Declarations are emitted parents-first, so forward references need quoting.
  // `from __future__ import annotations` makes every annotation lazy instead.
  const body = types
    .map((type) => {
      const fields = type.fields
        .map((field) => {
          const annotation = render(field.shape);
          const name = snakeCase(field.key);
          const alias = name === field.key ? '' : ` = Field(alias="${field.key}")`;
          const optional = field.required
            ? alias
            : alias
              ? ` = Field(default=None, alias="${field.key}")`
              : ' = None';
          const typeText = field.required ? annotation : annotation.includes('None') ? annotation : `${annotation} | None`;
          return `    ${name}: ${typeText}${optional}`;
        })
        .join('\n');
      return `class ${type.name}(BaseModel):\n${fields || '    pass'}`;
    })
    .join('\n\n\n');

  return `from __future__ import annotations\n\nfrom typing import Any\n\nfrom pydantic import BaseModel, Field\n\n\n${body}`;
}

function emitRust(types: NamedType[]): string {
  const render = (shape: Shape): string => {
    const target = nonNull(shape);
    const named = nameOf(types, target);
    const nullable = isNullable(shape);

    let base: string;
    if (named) {
      base = named;
    } else {
      switch (target.kind) {
        case 'boolean':
          base = 'bool';
          break;
        case 'integer':
          base = 'i64';
          break;
        case 'number':
          base = 'f64';
          break;
        case 'string':
          base = 'String';
          break;
        case 'array':
          base = `Vec<${render(target.items)}>`;
          break;
        default:
          base = 'serde_json::Value';
      }
    }
    return nullable ? `Option<${base}>` : base;
  };

  const body = types
    .map((type) => {
      const fields = type.fields
        .map((field) => {
          const name = snakeCase(field.key);
          const annotation = field.required ? render(field.shape) : wrapOption(render(field.shape));
          const rename = name === field.key ? '' : `    #[serde(rename = "${field.key}")]\n`;
          const skip = field.required ? '' : '    #[serde(skip_serializing_if = "Option::is_none")]\n';
          return `${rename}${skip}    pub ${name}: ${annotation},`;
        })
        .join('\n');
      return `#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct ${type.name} {\n${fields}\n}`;
    })
    .join('\n\n');

  return `use serde::{Deserialize, Serialize};\n\n${body}`;
}

function wrapOption(type: string): string {
  return type.startsWith('Option<') ? type : `Option<${type}>`;
}
