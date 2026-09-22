import { SchemaResolutionError, type JsonSchemaProperty } from '@onkarsabale15/mcp-gen-common';
import type { OpenApiOperation } from './types.js';

export type ParamStrategy = 'nested' | 'flat';

export interface ParamPlan {
  properties: Record<string, JsonSchemaProperty>;
  required: string[];
  /**
   * `'body'` when the request body was nested under that key (the `nested` strategy, always;
   * `flat` only when there happened to be no body). `null` when there is no request body at all,
   * or (`flat` strategy) when the body's properties were merged into the top level.
   */
  bodyKey: 'body' | null;
}

/**
 * Turns an operation's path/query/header parameters and JSON request body into a single flat
 * `inputSchema.properties` map — MCP tools take one flat `arguments` object, REST endpoints
 * distribute inputs across four locations, so *something* has to reconcile that.
 *
 * Default strategy is `'nested'`: path/query/header parameters go at the top level (they're
 * small, primitive-typed, and don't collide with each other by OpenAPI convention); the request
 * body — if present — always goes under a single `body` property, full stop. This is deliberately
 * simpler than trying to be clever: it is collision-proof by construction, and it means every
 * tool in an app that has a body has the *same shaped* body wrapper, which matters more for an
 * LLM caller learning the pattern across many tools than a marginally flatter schema would.
 *
 * `'flat'` is opt-in, for teams that want the flattest possible schema for simple CRUD bodies.
 * It merges body properties into the top level — but only when there is zero name overlap with
 * the path/query/header parameters already there. A collision throws `SchemaResolutionError` at
 * *bootstrap*, not silently at call time and not via an invented prefixing rule: see design doc
 * §3.5 for why this replaced the original "prefix with body_" idea (a silent, inconsistent
 * runtime shape change is worse than a loud build-time failure with a clear fix).
 */
export function planParameterMapping(
  operation: OpenApiOperation,
  strategy: ParamStrategy = 'nested',
): ParamPlan {
  const top: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const param of operation.parameters ?? []) {
    top[param.name] = {
      type: param.schema?.type ?? 'string',
      description: param.description ?? `${param.in} parameter: ${param.name}`,
      ...(param.schema?.enum ? { enum: param.schema.enum } : {}),
    };
    if (param.required) required.push(param.name);
  }

  const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
  if (!bodySchema) {
    return { properties: top, required, bodyKey: null };
  }

  if (strategy === 'nested') {
    top.body = bodySchema;
    if (operation.requestBody?.required) required.push('body');
    return { properties: top, required, bodyKey: 'body' };
  }

  // strategy === 'flat'
  const bodyProps = bodySchema.properties ?? {};
  const collisions = Object.keys(bodyProps).filter((key) => key in top);
  if (collisions.length > 0) {
    throw new SchemaResolutionError(
      `Operation "${operation.operationId ?? '(no operationId)'}" has parameter/body name ` +
        `collisions on [${collisions.join(', ')}] under the 'flat' parameter strategy. Either ` +
        `switch discovery.paramStrategy to 'nested' (the default, and collision-proof), or rename ` +
        `the colliding field(s) in the DTO/route.`,
    );
  }
  Object.assign(top, bodyProps);
  required.push(...(bodySchema.required ?? []));
  return { properties: top, required: [...new Set(required)], bodyKey: null };
}
