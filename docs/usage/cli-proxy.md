# Mode B: the standalone CLI / proxy (`@onkarsabale15/mcp-gen-cli`)

> **Status: planned, not implemented yet.** `@onkarsabale15/mcp-gen-cli` is currently a placeholder package.
> Describes the designed API from `docs/mcp-generator-hld-lld.md` §3.13, targeted for Phase 4 of
> the roadmap. See [`README.md`](./README.md) for what's actually usable today.

[The in-process module](./in-process-module.md) requires adding `@onkarsabale15/mcp-gen-server` as a runtime
dependency to your API's own process. Sometimes that's not an option — the API isn't NestJS at
all, you can't or won't add a new dependency to a production service, or you just want to point an
MCP server at someone else's already-running API using its published OpenAPI document. That's what
the CLI is for: a **separate process** that proxies real outbound HTTP requests to a remote API.

This mode works with *any* OpenAPI 3.0/3.1 document — it doesn't have to come from NestJS.

## Planned usage

```bash
npx @onkarsabale15/mcp-gen-cli serve \
  --spec=https://api.example.com/docs-json \
  --base-url=https://api.example.com \
  --header "Authorization: Bearer $TOKEN"
```

This fetches the OpenAPI document, runs it through the exact same `@onkarsabale15/mcp-gen-core` pipeline the
in-process module uses (so tool shapes are identical between the two modes — see the design doc's
ADR #4 for why that sharing matters), and starts an MCP server over stdio by default.

## Planned flags

| Flag | Purpose |
|---|---|
| `--spec=<url\|path>` | The OpenAPI document to read — a URL or a local file. |
| `--base-url=<url>` | Where proxied requests actually get sent. |
| `--header "<Name>: <value>"` | Repeatable. Static headers attached to every outbound request (auth tokens, tenant IDs, etc.). |
| `--transport <stdio\|http>` | Default `stdio`. |
| `--port <n>` | Only with `--transport http`. |
| Discovery/execution flags | Map 1:1 onto [the same `discovery`/`execution` config](./in-process-module.md#planned-full-config-surface) the in-process module uses — e.g. `--include-tags`, `--param-strategy`. |

Auth can also come from an environment variable rather than a flag:

```bash
API_KEY=xxx npx @onkarsabale15/mcp-gen-cli serve --spec=https://api.example.com/docs-json --base-url=https://api.example.com
```

## Planned: `generate` — dry-run without starting a server

```bash
npx @onkarsabale15/mcp-gen-cli generate --spec=https://api.example.com/docs-json
```

Prints the resolved tool manifest (names + schemas) without starting anything. Useful for
reviewing exactly what an LLM would be able to call before wiring the server up live, and for
committing a snapshot of the manifest to a repo so a schema change shows up as a reviewable diff in
a PR.

## In-process vs. proxy: which one do you actually want

| | In-process (`@onkarsabale15/mcp-gen-server`) | Proxy (`@onkarsabale15/mcp-gen-cli`) |
|---|---|---|
| Runs | Inside your NestJS app's own process | As a separate process |
| Dispatch | In-memory HTTP loopback — no real socket, runs your actual Guards/Pipes/Interceptors | Real outbound HTTP request over the network |
| Requires | NestJS + `@nestjs/swagger`, a new runtime dependency in your app | Nothing added to the target API at all — just its published OpenAPI document |
| Works with | NestJS apps only | Any OpenAPI 3.0/3.1 API, any framework |
| Typical use | You own the API and want the tightest, lowest-latency integration | You don't own the API, can't add a dependency to it, or want to point at a spec without touching the running service |

Both modes produce the same tool shapes from the same `@onkarsabale15/mcp-gen-core` engine — the only thing that
differs is how a tool call actually gets executed once an LLM makes one.
