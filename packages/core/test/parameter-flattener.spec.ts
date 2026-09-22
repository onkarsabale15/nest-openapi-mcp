import { describe, expect, it } from 'vitest';
import { SchemaResolutionError } from '@onkarsabale15/mcp-gen-common';
import { planParameterMapping } from '../src/openapi/parameter-flattener.js';
import type { OpenApiOperation } from '../src/openapi/types.js';

describe('planParameterMapping', () => {
  it('flattens path/query/header params to the top level with no body', () => {
    const op: OpenApiOperation = {
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
        { name: 'role', in: 'query', schema: { type: 'string' } },
      ],
    };
    const plan = planParameterMapping(op);
    expect(Object.keys(plan.properties)).toEqual(['id', 'role']);
    expect(plan.required).toEqual(['id']);
    expect(plan.bodyKey).toBeNull();
  });

  describe('nested strategy (default)', () => {
    it('always nests the body under `body`, never merging it into the top level', () => {
      const op: OpenApiOperation = {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } } },
            },
          },
        },
      };
      // Note: body also declares a field literally named `id` — this is exactly the collision
      // case the draft's original design left ambiguous. `nested` sidesteps it entirely.
      const plan = planParameterMapping(op, 'nested');
      expect(plan.bodyKey).toBe('body');
      expect(plan.properties.id).toEqual({ type: 'string', description: 'path parameter: id' });
      expect(plan.properties.body).toEqual({
        type: 'object',
        properties: { id: { type: 'string' }, name: { type: 'string' } },
      });
      expect(plan.required).toEqual(['id', 'body']);
    });

    it('omits `body` from required when the request body itself is optional', () => {
      const op: OpenApiOperation = {
        requestBody: {
          required: false,
          content: { 'application/json': { schema: { type: 'object', properties: {} } } },
        },
      };
      const plan = planParameterMapping(op, 'nested');
      expect(plan.required).not.toContain('body');
    });
  });

  describe('flat strategy (opt-in)', () => {
    it('merges body properties into the top level when there is no collision', () => {
      const op: OpenApiOperation = {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { sku: { type: 'string' } }, required: ['sku'] },
            },
          },
        },
      };
      const plan = planParameterMapping(op, 'flat');
      expect(plan.bodyKey).toBeNull();
      expect(Object.keys(plan.properties).sort()).toEqual(['id', 'sku']);
      expect(plan.required.sort()).toEqual(['id', 'sku']);
    });

    it('throws SchemaResolutionError at plan time on a name collision, rather than silently prefixing', () => {
      const op: OpenApiOperation = {
        operationId: 'UsersController_update',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          content: {
            'application/json': { schema: { type: 'object', properties: { id: { type: 'string' } } } },
          },
        },
      };
      expect(() => planParameterMapping(op, 'flat')).toThrow(SchemaResolutionError);
      expect(() => planParameterMapping(op, 'flat')).toThrow(/UsersController_update/);
      expect(() => planParameterMapping(op, 'flat')).toThrow(/id/);
    });
  });
});
