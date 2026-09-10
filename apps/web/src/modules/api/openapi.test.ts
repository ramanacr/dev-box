import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseOpenApi, resolveLocalPointer } from './openapi';

describe('openapi parser', () => {
  it('parses valid OpenAPI 3.1 YAML fixture', async () => {
    const yamlContent = readFileSync(resolve(__dirname, 'fixtures/pets.openapi.yaml'), 'utf8');
    const res = await parseOpenApi(yamlContent);

    expect(res.error).toBeUndefined();
    expect(res.api).toBeDefined();
    expect(res.api?.title).toBe('Pet Store API');
    expect(res.api?.version).toBe('1.0.0');
    expect(res.api?.servers?.[0]?.url).toBe('http://127.0.0.1:8080/api/v1');

    const ops = res.api?.operations || [];
    expect(ops.length).toBe(3);

    const listPets = ops.find((o) => o.id === 'listPets');
    expect(listPets).toBeDefined();
    expect(listPets?.method).toBe('get');
    expect(listPets?.path).toBe('/pets');
    expect(listPets?.parameters).toHaveLength(2);
    expect(listPets?.responses?.[0]?.schema).toBeDefined();


    // Verify unnamed operationId fallback to METHOD:path
    const createPet = ops.find((o) => o.method === 'post' && o.path === '/pets');
    expect(createPet).toBeDefined();
    expect(createPet?.id).toBe('POST:/pets');
    expect(createPet?.requestBody?.contentType).toBe('application/json');
  });

  it('handles duplicate operation IDs cleanly by appending index suffix', async () => {
    const spec = `
openapi: 3.0.0
info: { title: Dup API, version: 1.0.0 }
paths:
  /a:
    get:
      operationId: getTest
      responses: { '200': { description: ok } }
  /b:
    get:
      operationId: getTest
      responses: { '200': { description: ok } }
`;
    const res = await parseOpenApi(spec);
    expect(res.error).toBeUndefined();
    const ops = res.api?.operations || [];
    expect(ops).toHaveLength(2);
    expect(ops[0]?.id).toBe('getTest');
    expect(ops[1]?.id).toBe('getTest_2');
  });


  it('rejects remote $ref pointers', async () => {
    const spec = `
openapi: 3.0.0
info: { title: Remote Ref API, version: 1.0.0 }
paths:
  /remote:
    get:
      responses:
        '200':
          description: ok
          content:
            application/json:
              schema:
                $ref: 'https://malicious.site/schema.json'
`;
    const res = await parseOpenApi(spec);
    expect(res.error).toBeDefined();
    expect(res.error?.message).toContain('Remote or external references are forbidden');
  });

  it('returns structured diagnostic on malformed YAML', async () => {
    const badYaml = 'openapi: 3.0.0\ninfo: {\n  unclosed';
    const res = await parseOpenApi(badYaml);
    expect(res.error).toBeDefined();
    expect(res.error?.severity).toBe('error');
  });

  it('rejects documents exceeding 5 MB limit', async () => {
    // 5.5 MB string
    const largeStr = 'openapi: 3.0.0\ninfo: { title: Large, version: 1.0.0 }\n' + ' '.repeat(5.5 * 1024 * 1024);
    const res = await parseOpenApi(largeStr);
    expect(res.error).toBeDefined();
    expect(res.error?.message).toContain('5 MB maximum allowable size limit');
  });

  it('resolves local pointers accurately', () => {
    const root = {
      components: {
        schemas: {
          User: { type: 'object', properties: { id: { type: 'string' } } },
        },
      },
    };
    const resolved = resolveLocalPointer(root, '#/components/schemas/User');
    expect(resolved).toEqual({ type: 'object', properties: { id: { type: 'string' } } });
  });
});
