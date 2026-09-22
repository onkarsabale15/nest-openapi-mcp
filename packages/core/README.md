# @mcp-gen/core

Framework-agnostic OpenAPI → MCP tool schema engine: `$ref` resolution, parameter flattening, tool
naming/de-duplication, a tool registry, response truncation, and a fallback that fills in
class-validator-only DTO schemas that `@nestjs/swagger` would otherwise leave empty.

**Status: available now.** Part of [nest-openapi-mcp](https://github.com/onkarsabale15/nest-openapi-mcp),
a project to turn a NestJS API into an [MCP](https://modelcontextprotocol.io) server. This package
has zero dependency on NestJS, Express, or Fastify — it only knows how to turn an OpenAPI document
into MCP tool definitions. The packages that actually run a server (`@mcp-gen/server`,
`@mcp-gen/cli`) are still placeholders; see the
[full usage guide](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/README.md)
for what's real today versus planned.

## Install

```bash
npm install @mcp-gen/core @mcp-gen/common
```

## Quick example

```typescript
import { resolveRefs, operationToTool, ToolRegistry } from '@mcp-gen/core';

const document = await resolveRefs(myOpenApiDocument);
const usedNames = new Set<string>();
const operation = document.paths['/cats']!.post!;

const tool = operationToTool(operation, 'post', '/cats', usedNames);

const registry = new ToolRegistry();
registry.register(tool, async (args) => {
  const result = await myHttpClient.post('/cats', args.body);
  return { data: result, isError: false };
});
```

Full walkthrough, including the class-validator fallback for DTOs without `@ApiProperty()`:
[docs/usage/core-library.md](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/core-library.md).

## Real-world validation

This engine's pipeline is tested against three independently-built NestJS OpenAPI documents (the
official `nestjs/nest` sample, Immich, and Cal.com's API v2 — ~400 real operations) on every test
run, not just hand-written fixtures. See
[docs/real-world-validation-report.md](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/real-world-validation-report.md).

## License

MIT
