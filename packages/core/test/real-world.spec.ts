import 'reflect-metadata';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { IsInt, IsString } from 'class-validator';
import { SchemaResolutionError } from '@onkarsabale15/mcp-gen-common';
import { resolveRefs } from '../src/openapi/ref-resolver.js';
import { operationToTool } from '../src/openapi/operation-to-tool.js';
import { enrichEmptySchemas } from '../src/openapi/class-validator-fallback.js';
import type { OpenApiDocument, OpenApiOperation } from '../src/openapi/types.js';

/**
 * Regression suite over real OpenAPI documents from independently-built NestJS projects — not
 * fixtures we wrote to match our own assumptions. See test/fixtures/real-world/README.md for
 * provenance, and the "Real-World Validation Report" doc for the narrative findings this suite
 * was built from. The bar here is simply: the default (nested) pipeline must never throw on any
 * operation in any of these documents, however large or unusual.
 */

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures/real-world');

function loadFixture(name: string): OpenApiDocument {
  return JSON.parse(readFileSync(join(fixturesDir, name), 'utf8')) as OpenApiDocument;
}

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'options', 'head'] as const;

interface FoundOperation {
  method: string;
  path: string;
  operation: OpenApiOperation;
}

function allOperations(document: OpenApiDocument): FoundOperation[] {
  const found: FoundOperation[] = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (operation) found.push({ method, path, operation });
    }
  }
  return found;
}

describe.each([
  {
    fixture: 'nestjs-sample-11-swagger.json',
    label: 'nestjs/nest sample/11-swagger (real SwaggerModule output)',
    minOps: 2,
  },
  { fixture: 'immich.json', label: 'immich-app/immich', minOps: 200 },
  { fixture: 'calcom-api-v2.json', label: 'calcom/cal.com API v2', minOps: 100 },
])('real-world spec: $label', ({ fixture, minOps }) => {
  const document = loadFixture(fixture);

  it('resolves all $refs without throwing', async () => {
    const resolved = await resolveRefs(document);
    expect(resolved.paths).toBeDefined();
  });

  it('generates a valid, uniquely-named tool for every operation under the default (nested) strategy', async () => {
    const resolved = await resolveRefs(document);
    const ops = allOperations(resolved);
    expect(ops.length).toBeGreaterThanOrEqual(minOps);

    const used = new Set<string>();
    for (const { method, path, operation } of ops) {
      const tool = operationToTool(operation, method, path, used);
      expect(tool.name).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
      expect(tool.inputSchema.type).toBe('object');
    }
    // Every generated name must be unique app-wide, not just individually valid.
    expect(used.size).toBe(ops.length);
  });

  it('the flat (opt-in) strategy never crashes — real collisions throw SchemaResolutionError, everything else succeeds', async () => {
    const resolved = await resolveRefs(document);
    const ops = allOperations(resolved);
    const used = new Set<string>();
    let collisions = 0;
    for (const { method, path, operation } of ops) {
      try {
        operationToTool(operation, method, path, used, { paramStrategy: 'flat' });
      } catch (err) {
        expect(err).toBeInstanceOf(SchemaResolutionError);
        collisions++;
      }
    }
    // Documented in the validation report: Immich's PUT /faces/{id} is a known real collision
    // (path param `id` vs. a body field also named `id`).
    if (fixture === 'immich.json') {
      expect(collisions).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('real-world fix: class-validator-only DTOs no longer produce an empty tool schema', () => {
  // Stand-in for the real nestjs-sample-11-swagger CreateCatDto — same shape, same decorators —
  // since the fixture is a plain OpenAPI JSON document and doesn't carry the DTO class itself.
  class CreateCatDto {
    @IsString()
    name!: string;

    @IsInt()
    age!: number;

    @IsString()
    breed!: string;
  }

  function bodyPropertiesOf(operation: OpenApiOperation): unknown {
    const tool = operationToTool(operation, 'post', '/cats', new Set());
    const body = tool.inputSchema.properties.body;
    return body && typeof body === 'object' ? (body as { properties?: unknown }).properties : undefined;
  }

  it('reproduces the empty-schema gap found in the real fixture', async () => {
    const document = loadFixture('nestjs-sample-11-swagger.json');
    const resolved = await resolveRefs(document);
    const createOp = resolved.paths['/cats']?.post;
    expect(createOp).toBeDefined();
    expect(createOp ? bodyPropertiesOf(createOp) : undefined).toEqual({}); // the bug, reproduced
  });

  it('enrichEmptySchemas fills it in when the DTO class is registered, before resolveRefs runs', async () => {
    const document = loadFixture('nestjs-sample-11-swagger.json');
    const enriched = enrichEmptySchemas(document, { CreateCatDto });
    const resolved = await resolveRefs(enriched);
    const createOp = resolved.paths['/cats']?.post;
    expect(createOp).toBeDefined();
    expect(createOp ? bodyPropertiesOf(createOp) : undefined).toEqual({
      name: { type: 'string' },
      age: { type: 'integer' },
      breed: { type: 'string' },
    });
  });
});
