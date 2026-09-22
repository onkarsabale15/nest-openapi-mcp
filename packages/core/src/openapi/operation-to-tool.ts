import type { McpToolDefinition } from '@onkarsabale15/mcp-gen-common';
import { buildToolName } from './tool-name.js';
import { planParameterMapping, type ParamStrategy } from './parameter-flattener.js';
import type { OpenApiOperation } from './types.js';

export interface OperationToToolOptions {
  paramStrategy?: ParamStrategy;
  /** Whether an LLM caller may pass fields not declared in the schema. Defaults to `false` — see §3.5/§5. */
  allowAdditionalProperties?: boolean;
}

/**
 * Converts one already-filtered, already-dereferenced OpenAPI operation into an
 * `McpToolDefinition`. This is the single point where the naming and parameter-flattening
 * pieces (each independently testable) get assembled into the shape the MCP SDK's tool
 * registration actually wants.
 *
 * Deliberately takes `method`/`path` as separate arguments rather than re-deriving them from the
 * operation object, because the operation object alone doesn't carry them (they live on the
 * enclosing OpenAPI PathItem) — keeping the caller responsible for that avoids this function
 * silently assuming a document shape it was never given.
 */
export function operationToTool(
  operation: OpenApiOperation,
  method: string,
  path: string,
  usedNames: Set<string>,
  options: OperationToToolOptions = {},
): McpToolDefinition {
  const name = buildToolName(operation, method, path, usedNames);
  const plan = planParameterMapping(operation, options.paramStrategy ?? 'nested');

  return {
    name,
    description: operation.description ?? operation.summary ?? `Executes ${method.toUpperCase()} ${path}`,
    inputSchema: {
      type: 'object',
      properties: plan.properties,
      required: plan.required,
      additionalProperties: options.allowAdditionalProperties ?? false,
    },
    _meta: {
      operationId: operation.operationId,
      httpMethod: method.toUpperCase(),
      path,
    },
  };
}
