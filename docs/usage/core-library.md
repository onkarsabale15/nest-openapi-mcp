# Using `@onkarsabale15/mcp-gen-core` directly

**Status: available now.** This is the only package with real, published behavior today —
`@onkarsabale15/mcp-gen-server` and `@onkarsabale15/mcp-gen-cli` (the things most people will actually install once they
exist) are still placeholders. See [`../usage/README.md`](./README.md) for the full status table.

`@onkarsabale15/mcp-gen-core` is a framework-agnostic library: it turns an OpenAPI document into MCP tool
definitions. It has zero dependency on NestJS, Express, or Fastify, and does no I/O beyond
resolving `$ref`s in the document you hand it — it doesn't fetch anything, doesn't listen on a
port, doesn't execute anything. If you want to build your own integration (a non-NestJS framework,
a custom transport, or just to understand the pipeline before `@onkarsabale15/mcp-gen-server` exists), this is
the package to build on.

## Install

```bash
npm install @onkarsabale15/mcp-gen-core @onkarsabale15/mcp-gen-common
```

(`@onkarsabale15/mcp-gen-common` is a peer you'll end up importing types from directly — e.g.
`McpToolDefinition`, `ToolExecutor` — so it's worth installing explicitly rather than relying on
it being pulled in transitively.)

## The pipeline, end to end

```typescript
import { resolveRefs, operationToTool, ToolRegistry, enrichEmptySchemas } from '@onkarsabale15/mcp-gen-core';
import type { OpenApiDocument } from '@onkarsabale15/mcp-gen-core';

// 1. Start with any OpenAPI 3.0/3.1 document — from SwaggerModule.createDocument(),
//    JSON.parse() of a fetched spec, whatever. It can still have $refs and (optionally)
//    class-validator-only DTOs with empty schemas.
const rawDocument: OpenApiDocument = {
  paths: {
    '/cats': {
      post: {
        operationId: 'CatsController_create',
        summary: 'Create a cat',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateCatDto' },
            },
          },
        },
      },
    },
  },
  components: {
    schemas: {
      // Empty because the real app validates this DTO with class-validator decorators alone —
      // no @ApiProperty(), no Swagger CLI plugin. See step 2.
      CreateCatDto: { type: 'object', properties: {} },
    },
  },
};

// 2. (Optional) Fill in class-validator-only DTOs before resolving refs. Only fires on schemas
//    that are genuinely empty; anything with even one real property is left untouched.
import { IsInt, IsString } from 'class-validator';
class CreateCatDto {
  @IsString() name!: string;
  @IsInt() age!: number;
}
const enriched = enrichEmptySchemas(rawDocument, { CreateCatDto });

// 3. Dereference every $ref. Everything downstream assumes a $ref-free document.
const document = await resolveRefs(enriched);

// 4. Convert each operation into an McpToolDefinition. `usedNames` is shared across the whole
//    bootstrap pass so tool names stay unique app-wide, not just pairwise.
const usedNames = new Set<string>();
const createCatOp = document.paths['/cats']!.post!;
const tool = operationToTool(createCatOp, 'post', '/cats', usedNames);

console.log(tool.name); // "CatsController_create"
console.log(tool.inputSchema.properties.body);
// { type: 'object', properties: { name: {type:'string'}, age: {type:'integer'} }, required: ['name','age'] }

// 5. Register it with an executor — the part @onkarsabale15/mcp-gen-core deliberately does NOT provide.
//    You decide how a tool call actually turns into a real API call (this is exactly the job
//    @onkarsabale15/mcp-gen-server's loopback dispatcher and @onkarsabale15/mcp-gen-cli's HTTP proxy dispatcher will do).
const registry = new ToolRegistry();
registry.register(tool, async (args, _extra) => {
  // args.body is validated shape-wise by whatever MCP server framework you're using against
  // tool.inputSchema before this executor ever runs.
  const created = await myOwnHttpClient.post('/cats', args.body);
  return { data: created, isError: false };
});

// 6. Hand registry.list() to your MCP SDK server's tools/list handler, and
//    registry.get(name)?.executor to your tools/call handler.
```

## What each function actually does

| Function | Package | Purpose |
|---|---|---|
| `resolveRefs(document)` | `@onkarsabale15/mcp-gen-core` | Fully dereferences `$ref`s (including circular ones). Clones first — never mutates the document you pass in. |
| `enrichEmptySchemas(document, classRegistry)` | `@onkarsabale15/mcp-gen-core` | Fills in class-validator-only DTO schemas that would otherwise be empty. Run **before** `resolveRefs`. Optional — skip it if your DTOs already have `@ApiProperty()` metadata. |
| `buildSchemaFromClassValidator(cls)` | `@onkarsabale15/mcp-gen-core` | What `enrichEmptySchemas` calls per-class; exported separately if you want to build the schema without the empty-check gate. |
| `planParameterMapping(operation, strategy?)` | `@onkarsabale15/mcp-gen-core` | Lower-level than `operationToTool` — just the path/query/header/body → flat-schema logic. `'nested'` (default) or `'flat'`; `'flat'` throws `SchemaResolutionError` at call time if there's a name collision, on purpose (see the design doc, §3.5, for why). |
| `buildToolName(operation, method, path, used)` | `@onkarsabale15/mcp-gen-core` | Lower-level than `operationToTool` — just name generation + de-dup against a `Set` you own. |
| `operationToTool(operation, method, path, usedNames, options?)` | `@onkarsabale15/mcp-gen-core` | Combines the two above into a full `McpToolDefinition`. This is the one you actually want to call per-operation. |
| `new ToolRegistry()` | `@onkarsabale15/mcp-gen-core` | `.register(definition, executor)` (throws `ToolRegistrationConflictError` on a duplicate name), `.get(name)`, `.has(name)`, `.list()`, `.size`. |
| `truncateResult(payload, { maxBytes })` | `@onkarsabale15/mcp-gen-core` | Serializes `payload` to JSON; if it's over `maxBytes`, binary-searches the largest array prefix that fits (or hard-cuts for a non-array). Turning the result into a spec-compliant `CallToolResult` (an extra `content` block with the truncation warning, not a custom field) is your job, not this function's — see the design doc §3.10 for why. |

## Error types

All from `@onkarsabale15/mcp-gen-common`:

- `SchemaResolutionError` — thrown by `planParameterMapping`/`operationToTool` under the `'flat'`
  parameter strategy when a path/query/header parameter name collides with a body field name.
- `ToolRegistrationConflictError` — thrown by `ToolRegistry.register()` on a duplicate tool name.
  If you see this, it means two independent registration sources landed on the same name — it's
  not something a well-formed OpenAPI document alone should trigger, since `buildToolName`
  de-duplicates within a single bootstrap pass.
- `McpToolExecutionError` — not thrown by anything in `@onkarsabale15/mcp-gen-core` today; it's the shape a
  dispatcher (yours, or eventually `@onkarsabale15/mcp-gen-server`'s) should use to represent "the tool ran but
  the underlying call failed" — as opposed to a JSON-RPC protocol error. See design doc §3.9/§3.10.

## What this package deliberately does *not* do

No HTTP dispatch, no MCP transport (stdio/HTTP/SSE), no auth handling, no endpoint filtering
policy. Those are all `@onkarsabale15/mcp-gen-server`/`@onkarsabale15/mcp-gen-cli` concerns by design (see the architecture's
ADR #4 in `docs/mcp-generator-hld-lld.md`) — `@onkarsabale15/mcp-gen-core` only answers "given this OpenAPI
operation, what should the MCP tool definition look like," so that answer stays identical
regardless of whether the tool ends up dispatched in-process or proxied over HTTP.

## Real-world behavior

This isn't just unit-tested against hand-written fixtures. `packages/core/test/real-world.spec.ts`
runs this exact pipeline against three independently-built NestJS OpenAPI documents (the official
`nestjs/nest` sample, Immich, and Cal.com's API v2 — ~400 real operations total) on every test run.
See `docs/real-world-validation-report.md` for what that validation pass found, including the two
real edge cases (`oneOf`-composed bodies, untested array-typed bodies) that are documented but not
yet hardened against.
