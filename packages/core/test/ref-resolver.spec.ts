import { describe, expect, it } from 'vitest';
import { resolveRefs } from '../src/openapi/ref-resolver.js';

describe('resolveRefs', () => {
  it('dereferences a simple internal $ref', async () => {
    const doc = {
      openapi: '3.0.0',
      paths: {
        '/users': {
          get: {
            responses: {
              '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
            },
          },
        },
      },
      components: { schemas: { User: { type: 'object', properties: { id: { type: 'string' } } } } },
    };

    const resolved = await resolveRefs(doc);
    const schema = (
      resolved as unknown as {
        paths: {
          '/users': {
            get: { responses: { '200': { content: { 'application/json': { schema: unknown } } } } };
          };
        };
      }
    ).paths['/users'].get.responses['200'].content['application/json'].schema;

    expect(schema).toEqual({ type: 'object', properties: { id: { type: 'string' } } });
  });

  it('does not mutate the object it was given', async () => {
    const doc = {
      paths: {
        '/x': {
          get: {
            responses: {
              '200': { content: { 'application/json': { schema: { $ref: '#/components/schemas/A' } } } },
            },
          },
        },
      },
      components: { schemas: { A: { type: 'object', properties: {} } } },
    };
    const before = JSON.stringify(doc);
    await resolveRefs(doc);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('resolves a deeply nested chain of $refs', async () => {
    const doc = {
      paths: {},
      components: {
        schemas: {
          A: { type: 'object', properties: { b: { $ref: '#/components/schemas/B' } } },
          B: { type: 'object', properties: { c: { $ref: '#/components/schemas/C' } } },
          C: { type: 'object', properties: { value: { type: 'string' } } },
        },
      },
    };
    const resolved = (await resolveRefs(doc)) as unknown as {
      components: {
        schemas: { A: { properties: { b: { properties: { c: { properties: { value: unknown } } } } } } };
      };
    };
    expect(resolved.components.schemas.A.properties.b.properties.c.properties.value).toEqual({
      type: 'string',
    });
  });
});
