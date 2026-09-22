# Mode A: the in-process NestJS module (`@onkarsabale15/mcp-gen-server`)

> **Status: planned, not implemented yet.** `@onkarsabale15/mcp-gen-server` is currently a placeholder package.
> This document describes the designed API from `docs/mcp-generator-hld-lld.md` (§2.1, §3.4,
> §3.6–§3.9, §3.12) — it's the target for Phase 2 and Phase 3 of the roadmap, not something you
> can install today. Written now so the intended developer experience is concrete and reviewable
> before it's built, and so early feedback on the API shape is possible before it's locked in by
> real usage. See [`README.md`](./README.md) for what's actually usable today.

This is the mode most people will reach for: it runs **inside** your existing NestJS application's
own process, reads the OpenAPI document your app already produces via `@nestjs/swagger`, and
exposes an MCP server alongside your normal HTTP API — no separate process, no duplicated business
logic.

## Why in-process, not a proxy

A tool call is dispatched through an in-memory HTTP loopback (`light-my-request` for Express,
Fastify's native `.inject()` for Fastify) — it runs through your app's **real** Guards, Pipes,
Interceptors, and Filters, exactly as a real HTTP request would, without opening a real socket.
`Scope.REQUEST` providers resolve correctly for free, because Nest allocates a fresh DI subtree per
request regardless of how that request arrived. If you need to point at a *remote* API instead
(or can't add a runtime dependency to the API process at all), that's [Mode B, the CLI proxy](./cli-proxy.md).

## Planned installation

```bash
npm install @onkarsabale15/mcp-gen-server @nestjs/swagger
```

## Planned basic setup

```typescript
import { Module } from '@nestjs/common';
import { McpModule } from '@onkarsabale15/mcp-gen-server';

@Module({
  imports: [
    McpModule.forRoot({
      name: 'my-api-mcp-server',
      version: '1.0.0',
      transport: { type: 'stdio' },
      discovery: {
        // Default is 'openapi' with includeTags: [] — a fresh install exposes ZERO tools until
        // you opt endpoints in. This is not a placeholder default; it's the safe-by-default
        // design decision documented in the design doc §3.4/§5.
        mode: 'openapi',
        includeTags: ['orders', 'inventory'],
      },
    }),
  ],
})
export class AppModule {}
```

With that config, only operations tagged `orders` or `inventory` in your `@nestjs/swagger` document
(via `@ApiTags('orders')` etc.) become MCP tools — everything else stays invisible to an LLM
caller, by design.

## Planned: explicit per-endpoint control

```typescript
import { McpExpose, McpExclude } from '@onkarsabale15/mcp-gen-server';

@Controller('orders')
export class OrdersController {
  @McpExpose() // included even without a matching tag
  @Post()
  create(@Body() dto: CreateOrderDto) { /* ... */ }

  @McpExclude() // always excluded, no override — takes priority over everything else
  @Get('internal-audit-log')
  auditLog() { /* ... */ }

  @McpExpose({ force: true }) // DELETE is excluded by default even when tagged/included; this overrides it
  @Delete(':id')
  remove(@Param('id') id: string) { /* ... */ }
}
```

## Planned: filling class-validator-only DTO schemas automatically

If your DTOs are validated with `class-validator` alone (no `@ApiProperty()`, no Swagger CLI
plugin) — which the [real-world validation pass](../real-world-validation-report.md) found is
common, not a corner case — `@onkarsabale15/mcp-gen-server` is designed to build the
`enrichEmptySchemas` class registry automatically from route handler parameter metadata that Nest
already has, so you don't hand-maintain a schema-name → class map yourself:

```typescript
McpModule.forRoot({
  // ...
  discovery: {
    classValidatorFallback: true, // default; set false to see empty schemas instead and fix them with @ApiProperty()
  },
});
```

The underlying mechanism (`enrichEmptySchemas`/`buildSchemaFromClassValidator`) is real today —
see [`core-library.md`](./core-library.md) — what's not built yet is the automatic wiring that
extracts the class registry from your controllers for you.

## Planned: auth

The default auth behavior forwards an allow-listed set of inbound headers for HTTP/SSE transports,
or reads an env var for stdio — both explicitly documented as local-development starting points,
not production auth strategies. Implement your own:

```typescript
import type { AuthContextProvider, McpRequestExtra, AuthContext } from '@onkarsabale15/mcp-gen-server';

class MyAuthProvider implements AuthContextProvider {
  async resolve(extra: McpRequestExtra): Promise<AuthContext> {
    const token = extra.rawHeaders?.authorization;
    const identity = await this.verifyAndMapToServiceAccount(token);
    return { headers: { authorization: `Bearer ${identity.internalToken}` } };
  }
}

McpModule.forRoot({
  // ...
  auth: {
    provider: new MyAuthProvider(),
    // Optional extra gate, checked immediately before dispatch — useful when a route's own
    // Guards were written for human HTTP traffic and don't know a route shouldn't be LLM-callable.
    canExecute: async (toolName, args, ctx) => !toolName.startsWith('admin_'),
  },
});
```

## Planned: manual, non-HTTP tools

For logic that isn't naturally a REST endpoint — see [`manual-tools.md`](./manual-tools.md).

## Planned: full config surface

```typescript
interface McpModuleOptions {
  name: string;
  version: string;
  transport: {
    type: 'stdio' | 'http' | 'sse' | Array<'stdio' | 'http' | 'sse'>;
    path?: string;       // default '/mcp'
    port?: number;       // optional dedicated port, off your main app's port
    sessionStore?: McpSessionStore; // default: in-memory (single-instance/sticky-session only)
  };
  discovery: {
    mode?: 'openapi' | 'decorator' | 'all'; // default 'openapi'
    includeTags?: string[];                  // default []  — nothing exposed until you tag something
    excludeMethods?: string[];               // default ['DELETE']
    paramStrategy?: 'nested' | 'flat';        // default 'nested'
    classValidatorFallback?: boolean;         // default true
  };
  auth?: {
    provider?: AuthContextProvider;
    canExecute?: (toolName: string, args: unknown, ctx: AuthContext) => boolean | Promise<boolean>;
  };
  execution?: {
    timeoutMs?: number;        // default 30_000
    maxConcurrent?: number;    // default 32
    maxResponseBytes?: number; // default 25_000
  };
  debug?: boolean; // default false — leave off in production; unmasks error detail
}
```

Full rationale for every default lives in `docs/mcp-generator-hld-lld.md` §3.12 and §5 — this file
just documents the shape, not the reasoning behind each choice.
