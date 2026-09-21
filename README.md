# mcp-generator

Turn an existing NestJS API (already documented with `@nestjs/swagger`) into a spec-compliant
[Model Context Protocol](https://modelcontextprotocol.io) server — with zero per-endpoint annotation,
and execution that goes through the real Nest pipeline (Guards, Pipes, Interceptors, `Scope.REQUEST`
providers), not a reimplementation of it.

> **Status:** early scaffold, under active development. See `docs/mcp-generator-hld-lld.md` for the
> full architecture (also kept in sync with the project's design doc).

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
TypeScript throughout. See `CONTRIBUTING.md` (coming in the docs pass) for conventions.

## Naming note

The package scope used in this scaffold (`@mcp-gen/*`) is a placeholder chosen so development could
start immediately — it has **not** been checked for npm/GitHub availability yet. Renaming before first
publish is a find-and-replace across `package.json` files and import specifiers; nothing else depends
on the final name.
