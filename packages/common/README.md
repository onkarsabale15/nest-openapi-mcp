# @onkarsabale15/mcp-gen-common

Shared types, JSON-RPC error codes, and error classes used across
[nest-openapi-mcp](https://github.com/onkarsabale15/nest-openapi-mcp)'s packages
(`McpToolDefinition`, `ToolExecutor`, `JsonSchemaObject`/`JsonSchemaProperty`,
`ToolRegistrationConflictError`, `SchemaResolutionError`, `McpToolExecutionError`, and related
types). No dependency on NestJS or any HTTP framework — this is what lets the in-process
(`@onkarsabale15/mcp-gen-server`) and proxy (`@onkarsabale15/mcp-gen-cli`) execution modes share one definition of "what a
tool is" without either depending on the other.

You'll mostly get this transitively through [`@onkarsabale15/mcp-gen-core`](https://www.npmjs.com/package/@onkarsabale15/mcp-gen-core)
rather than depending on it directly — see that package's README for actual usage, and the
[full usage guide](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/README.md)
for what's real today versus planned across the whole project.

## Install

```bash
npm install @onkarsabale15/mcp-gen-common
```

## License

MIT
