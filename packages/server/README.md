# @mcp-gen/server

NestJS dynamic module (`McpModule.forRoot()`) that turns an existing NestJS + `@nestjs/swagger`
app into an [MCP](https://modelcontextprotocol.io) server — in-process, dispatching through your
app's real Guards/Pipes/Interceptors via an HTTP loopback, no separate process.

**Status: placeholder — not implemented yet.** This is Phase 2–3 of
[nest-openapi-mcp](https://github.com/onkarsabale15/nest-openapi-mcp)'s roadmap. The part of this
project that's real today is [`@mcp-gen/core`](https://www.npmjs.com/package/@mcp-gen/core), the
underlying OpenAPI → MCP schema engine — that package's README has working code you can use now.

The intended API for this package (`McpModule.forRoot()`, `@McpExpose`/`@McpExclude`,
`@McpTool`/`@McpArg`, the full config surface) is already documented, ahead of being built, so the
design is concrete and reviewable before real usage locks it in:

- [docs/usage/in-process-module.md](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/in-process-module.md)
- [docs/usage/manual-tools.md](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/manual-tools.md)
- [docs/mcp-generator-hld-lld.md](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/mcp-generator-hld-lld.md) — full architecture

If you're evaluating whether to wait for this or build your own integration on top of
`@mcp-gen/core` in the meantime, see the
[usage guide overview](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/README.md).

## License

MIT
