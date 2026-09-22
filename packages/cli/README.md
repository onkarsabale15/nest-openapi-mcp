# @onkarsabale15/mcp-gen-cli

Standalone CLI that turns any OpenAPI 3.0/3.1 document (not necessarily from NestJS) into a
proxying [MCP](https://modelcontextprotocol.io) server — a separate process that makes real
outbound HTTP requests to a target API, for when you can't or don't want to add a runtime
dependency to the API's own process.

**Status: placeholder — not implemented yet.** This is Phase 4 of
[nest-openapi-mcp](https://github.com/onkarsabale15/nest-openapi-mcp)'s roadmap. The part of this
project that's real today is [`@onkarsabale15/mcp-gen-core`](https://www.npmjs.com/package/@onkarsabale15/mcp-gen-core), the
underlying OpenAPI → MCP schema engine this CLI will run once built — that package's README has
working code you can use now.

The intended CLI (`serve`/`generate` commands, flags, auth forwarding) is already documented,
ahead of being built:

- [docs/usage/cli-proxy.md](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/cli-proxy.md)
- [docs/mcp-generator-hld-lld.md](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/mcp-generator-hld-lld.md) — full architecture

See the [usage guide overview](https://github.com/onkarsabale15/nest-openapi-mcp/blob/master/docs/usage/README.md)
for all four ways this project is designed to be used and what's real versus planned for each.

## License

MIT
