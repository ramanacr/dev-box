import { parse as parseYaml } from 'yaml';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options' | 'trace';

export interface ApiServer {
  url: string;
  description?: string;
}

export interface ApiParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  description?: string;
  required?: boolean;
  schema?: Record<string, unknown>;
  example?: unknown;
}

export interface ApiBody {
  description?: string;
  required?: boolean;
  contentType: string;
  schema?: Record<string, unknown>;
  example?: unknown;
}

export interface ApiResponse {
  statusCode: string;
  description: string;
  contentType?: string;
  schema?: Record<string, unknown>;
}

export interface ApiOperation {
  id: string;
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  parameters: ApiParameter[];
  requestBody?: ApiBody;
  responses: ApiResponse[];
}

export interface ParsedApi {
  title: string;
  version: string;
  description?: string;
  servers: ApiServer[];
  operations: ApiOperation[];
}

export interface ParseDiagnostic {
  severity: 'error' | 'warning';
  message: string;
  path?: string;
}

export interface ParseResult {
  api?: ParsedApi;
  error?: ParseDiagnostic;
}

const MAX_SPEC_SIZE = 5 * 1024 * 1024; // 5 MB limit
const HTTP_METHODS: HttpMethod[] = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options', 'trace'];

/**
 * Resolves local JSON pointers (`#/components/...` or `#/...`) within the document.
 * Rejects remote references (http:, https:, file:, etc.) and protocol-relative references (//).
 */
export function resolveLocalPointer(root: Record<string, unknown>, pointer: string): unknown {
  if (!pointer.startsWith('#/')) {
    throw new Error(`Remote or external references are forbidden for security: ${pointer}`);
  }
  const parts = pointer.slice(2).split('/').map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      throw new Error(`Unresolvable local reference pointer: ${pointer}`);
    }
  }
  return current;
}

function resolveRefsRecursively(root: Record<string, unknown>, node: unknown, depth = 0): unknown {
  if (depth > 50) return node; // prevent circular recursion overflow
  if (!node || typeof node !== 'object') return node;

  if (Array.isArray(node)) {
    return node.map((item) => resolveRefsRecursively(root, item, depth + 1));
  }

  const obj = node as Record<string, unknown>;
  if (typeof obj['$ref'] === 'string') {
    const refPath = obj['$ref'];
    if (/^(https?:|file:|\/\/)/i.test(refPath)) {
      throw new Error(`Remote or external references are forbidden for security: ${refPath}`);
    }
    const resolved = resolveLocalPointer(root, refPath);
    // Merge any sibling properties with the resolved object
    const rest = { ...obj };
    delete rest['$ref'];
    return resolveRefsRecursively(root, { ...(resolved as object), ...rest }, depth + 1);
  }

  const result: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(obj)) {
    result[key] = resolveRefsRecursively(root, val, depth + 1);
  }
  return result;
}

/**
 * Safely parses an OpenAPI 3.0, 3.1, or Swagger 2.0 YAML or JSON specification string.
 * Enforces a 5 MB maximum input size and local-only schema references.
 */
export async function parseOpenApi(input: string): Promise<ParseResult> {
  if (!input || typeof input !== 'string') {
    return {
      error: { severity: 'error', message: 'Input specification is empty or not a string.' },
    };
  }

  const byteLength = new Blob([input]).size;
  if (byteLength > MAX_SPEC_SIZE) {
    return {
      error: { severity: 'error', message: 'Specification exceeds the 5 MB maximum allowable size limit.' },
    };
  }

  let doc: Record<string, unknown>;
  try {
    const trimmed = input.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      doc = JSON.parse(input);
    } else {
      doc = parseYaml(input) as Record<string, unknown>;
    }
  } catch (err) {
    return {
      error: {
        severity: 'error',
        message: err instanceof Error ? `Failed to parse specification: ${err.message}` : 'Invalid YAML/JSON syntax.',
      },
    };
  }

  if (!doc || typeof doc !== 'object') {
    return {
      error: { severity: 'error', message: 'Specification root must be a valid YAML or JSON object.' },
    };
  }

  // Validate OpenAPI / Swagger presence
  const isOas3 = typeof doc.openapi === 'string';
  const isSwagger2 = typeof doc.swagger === 'string';
  if (!isOas3 && !isSwagger2) {
    return {
      error: { severity: 'error', message: 'Missing valid "openapi" (3.0/3.1) or "swagger" (2.0) version declaration.' },
    };
  }

  const info = (doc.info as Record<string, unknown>) || {};
  const title = typeof info.title === 'string' ? info.title : 'Untitled API';
  const version = typeof info.version === 'string' ? info.version : '1.0.0';
  const description = typeof info.description === 'string' ? info.description : undefined;

  // Extract servers
  const servers: ApiServer[] = [];
  if (Array.isArray(doc.servers)) {
    for (const s of doc.servers) {
      if (s && typeof s.url === 'string') {
        servers.push({ url: s.url, description: s.description });
      }
    }
  } else if (typeof doc.host === 'string') {
    // Swagger 2.0 fallback
    const scheme = Array.isArray(doc.schemes) && doc.schemes.length > 0 ? doc.schemes[0] : 'http';
    const basePath = typeof doc.basePath === 'string' ? doc.basePath : '';
    servers.push({ url: `${scheme}://${doc.host}${basePath}` });
  }

  if (servers.length === 0) {
    servers.push({ url: 'http://localhost:8080', description: 'Default local server' });
  }

  // Extract operations
  const operations: ApiOperation[] = [];
  const paths = (doc.paths as Record<string, unknown>) || {};
  const operationIdCounts = new Map<string, number>();

  for (const [pathKey, pathItem] of Object.entries(paths)) {
    if (!pathItem || typeof pathItem !== 'object') continue;
    const pathObj = pathItem as Record<string, unknown>;

    // Common path-level parameters
    const commonParams = Array.isArray(pathObj.parameters) ? (pathObj.parameters as unknown[]) : [];

    for (const method of HTTP_METHODS) {
      if (!(method in pathObj)) continue;
      const op = pathObj[method] as Record<string, unknown>;
      if (!op || typeof op !== 'object') continue;

      // Determine or normalize operationId
      let opId = typeof op.operationId === 'string' && op.operationId.trim() !== ''
        ? op.operationId.trim()
        : `${method.toUpperCase()}:${pathKey}`;

      // Handle duplicate operationIds
      const count = (operationIdCounts.get(opId) || 0) + 1;
      operationIdCounts.set(opId, count);
      if (count > 1) {
        opId = `${opId}_${count}`;
      }

      // Parameters
      const rawParams = [...commonParams, ...(Array.isArray(op.parameters) ? op.parameters : [])];
      const parameters: ApiParameter[] = [];
      for (const p of rawParams) {
        if (!p || typeof p !== 'object') continue;
        let pResolved: Record<string, unknown>;
        try {
          pResolved = resolveRefsRecursively(doc, p) as Record<string, unknown>;
        } catch (err) {
          return {
            error: {
              severity: 'error',
              message: err instanceof Error ? err.message : 'Failed to resolve parameter reference.',
              path: `${pathKey}.${method}`,
            },
          };
        }
        if (typeof pResolved.name === 'string') {
          parameters.push({
            name: pResolved.name,
            in: (pResolved.in as ApiParameter['in']) || 'query',
            description: typeof pResolved.description === 'string' ? pResolved.description : undefined,
            required: !!pResolved.required,
            schema: pResolved.schema as Record<string, unknown> | undefined,
            example: pResolved.example,
          });
        }
      }

      // Request Body
      let requestBody: ApiBody | undefined;
      if (op.requestBody && typeof op.requestBody === 'object') {
        try {
          const bodyResolved = resolveRefsRecursively(doc, op.requestBody) as Record<string, unknown>;
          const contentMap = (bodyResolved.content as Record<string, unknown>) || {};
          const contentType = Object.keys(contentMap)[0] || 'application/json';
          const contentSchema = contentMap[contentType] as Record<string, unknown> | undefined;

          requestBody = {
            description: typeof bodyResolved.description === 'string' ? bodyResolved.description : undefined,
            required: !!bodyResolved.required,
            contentType,
            schema: contentSchema?.schema as Record<string, unknown> | undefined,
            example: contentSchema?.example,
          };
        } catch (err) {
          return {
            error: {
              severity: 'error',
              message: err instanceof Error ? err.message : 'Failed to resolve requestBody reference.',
              path: `${pathKey}.${method}`,
            },
          };
        }
      }

      // Responses
      const responses: ApiResponse[] = [];
      if (op.responses && typeof op.responses === 'object') {
        for (const [statusCode, respItem] of Object.entries(op.responses as Record<string, unknown>)) {
          if (!respItem || typeof respItem !== 'object') continue;
          try {
            const respResolved = resolveRefsRecursively(doc, respItem) as Record<string, unknown>;
            const contentMap = (respResolved.content as Record<string, unknown>) || {};
            const contentType = Object.keys(contentMap)[0];
            const contentObj = contentType ? (contentMap[contentType] as Record<string, unknown>) : undefined;

            responses.push({
              statusCode,
              description: typeof respResolved.description === 'string' ? respResolved.description : '',
              contentType,
              schema: contentObj?.schema as Record<string, unknown> | undefined,
            });
          } catch (err) {
            return {
              error: {
                severity: 'error',
                message: err instanceof Error ? err.message : 'Failed to resolve response reference.',
                path: `${pathKey}.${method}.${statusCode}`,
              },
            };
          }
        }
      }

      operations.push({
        id: opId,
        method,
        path: pathKey,
        summary: typeof op.summary === 'string' ? op.summary : `${method.toUpperCase()} ${pathKey}`,
        description: typeof op.description === 'string' ? op.description : undefined,
        tags: Array.isArray(op.tags) ? (op.tags as string[]) : undefined,
        parameters,
        requestBody,
        responses,
      });
    }
  }

  return {
    api: {
      title,
      version,
      description,
      servers,
      operations,
    },
  };
}
