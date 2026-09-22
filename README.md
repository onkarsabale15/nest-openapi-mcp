# nest-openapi-mcp

Turn an existing NestJS API (already documented with `@nestjs/swagger`) into a spec-compliant
[Model Context Protocol](https://modelcontextprotocol.io) server — with zero per-endpoint annotation,
and execution that goes through the real Nest pipeline (Guards, Pipes, Interceptors, `Scope.REQUEST`
providers), not a reimplementation of it.

Several NestJS↔MCP integrations already exist (notably
[`rekog-labs/MCP-Nest`](https://github.com/rekog-labs/MCP-Nest)), but they're decorator-based — you
annotate each method you want exposed by hand. This project's angle is Swagger-driven auto-discovery:
if your API already has `@nestjs/swagger` metadata (or even just `class-validator` decorators — see
`enrichEmptySchemas` in `@mcp-gen/core`), tool schemas are derived from it directly, with a safe-by-
default policy so nothing is LLM-callable until you explicitly opt it in.

> **Status:** `@mcp-gen/core` (the OpenAPI → MCP schema engine) is built, tested, and validated against
> three independently-built NestJS codebases (see `docs/real-world-validation-report.md`).
> `@mcp-gen/server` (the actual NestJS module you'd install) and `@mcp-gen/cli` are still placeholders —
> this isn't installable as a working MCP server yet. See `docs/mcp-generator-hld-lld.md` for the full
> architecture and phased roadmap.

## Packages

| Package           | Purpose                                                                                              |
| ----------------- | ---------------------------------------------------------------------------------------------------- |
| `packages/common` | Shared types, JSON-RPC types, error classes. No framework dependency.                                |
| `packages/core`   | OpenAPI parsing, schema flattening, tool naming, tool registry, truncation. No NestJS dependency.    |
| `packages/server` | NestJS dynamic module (`McpModule.forRoot`), decorators, discovery, in-process dispatch, transports. |
| `packages/cli`    | Standalone CLI: turns any OpenAPI 3.0/3.1 document into a proxying MCP server.                       |

## Development

```bash
pnpm install
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

This repo uses pnpm workspaces + Turborepo, Changesets for versioning/publishing, and strict
TypeScript throughout. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for conventions, and
[`SECURITY.md`](./SECURITY.md) for the threat model and how to report a vulnerability privately.

## Naming note

The package scope used in this scaffold (`@mcp-gen/*`) is a placeholder chosen so development could
start immediately — it has **not** been checked for npm/GitHub availability yet. Renaming before first
publish is a find-and-replace across `package.json` files and import specifiers; nothing else depends
on the final name.
