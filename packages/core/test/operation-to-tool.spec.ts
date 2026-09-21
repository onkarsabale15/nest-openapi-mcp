import { describe, expect, it } from 'vitest';
import { operationToTool } from '../src/openapi/operation-to-tool.js';
import type { OpenApiOperation } from '../src/openapi/types.js';

describe('operationToTool', () => {
  it('builds a spec-compliant McpToolDefinition from an operation', () => {
    const op: OpenApiOperation = {
      operationId: 'OrdersController_create',
      summary: 'Create an order',
      parameters: [],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              properties: { sku: { type: 'string' }, qty: { type: 'number' } },
              required: ['sku', 'qty'],
            },
          },
        },
      },
    };

    const tool = operationToTool(op, 'post', '/orders', new Set());

    expect(tool.name).toBe('OrdersController_create');
    expect(tool.description).toBe('Create an order');
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.inputSchema.required).toEqual(['body']);
    expect(tool.inputSchema.properties.body).toMatchObject({
      properties: { sku: { type: 'string' }, qty: { type: 'number' } },
    });
    expect(tool._meta).toEqual({
      operationId: 'OrdersController_create',
      httpMethod: 'POST',
      path: '/orders',
    });
  });

  it('falls back to a generated description when neither description nor summary is set', () => {
    const tool = operationToTool({}, 'get', '/health', new Set());
    expect(tool.description).toBe('Executes GET /health');
  });

  it('respects allowAdditionalProperties when explicitly enabled', () => {
    const tool = operationToTool({}, 'get', '/x', new Set(), { allowAdditionalProperties: true });
    expect(tool.inputSchema.additionalProperties).toBe(true);
  });

  it('shares one used-names Set across multiple calls to keep names unique app-wide', () => {
    const used = new Set<string>();
    const a = operationToTool({ operationId: 'dup' }, 'get', '/a', used);
    const b = operationToTool({ operationId: 'dup' }, 'get', '/b', used);
    expect(a.name).not.toBe(b.name);
  });
});
