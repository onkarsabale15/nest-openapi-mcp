# Ways to use this project

There are four distinct ways this project is designed to be used. Only one is real today —
the other three are documented ahead of being built so the intended API shape is concrete and
reviewable, not because they're usable yet. Don't take a "planned" guide as something you can
`npm install` and run.

| Mode | Package | Status | Roadmap phase |
|---|---|---|---|
| [Use the schema engine directly](./core-library.md) | `@mcp-gen/core` | **Available now** — real, tested, validated against three independently-built NestJS OpenAPI documents | Phase 1 (done) |
| [In-process NestJS module](./in-process-module.md) | `@mcp-gen/server` | Placeholder only | Phase 2–3 |
| [Manual, non-HTTP tools](./manual-tools.md) | `@mcp-gen/server` | Placeholder only | Phase 3 |
| [Standalone CLI / proxy](./cli-proxy.md) | `@mcp-gen/cli` | Placeholder only | Phase 4 |

## Which one do you actually want?

- **Building your own integration, or just want to understand the pipeline?** →
  [`core-library.md`](./core-library.md) — this is real and you can use it today.
- **You own a NestJS API and want the tightest integration once it exists** →
  [`in-process-module.md`](./in-process-module.md) (Mode A: runs in your app's own process,
  dispatches through your real Guards/Pipes/Interceptors).
- **You want to expose logic that isn't naturally an HTTP endpoint, once the module exists** →
  [`manual-tools.md`](./manual-tools.md) (`@McpTool`/`@McpArg` on a plain service method).
- **You don't own the target API, can't add a dependency to it, or it isn't NestJS at all** →
  [`cli-proxy.md`](./cli-proxy.md) (Mode B: a separate process that proxies real HTTP requests
  using any OpenAPI 3.0/3.1 document).

## Why document unbuilt features at all

The full design — architecture, every config option, the reasoning behind each default — already
exists in [`../mcp-generator-hld-lld.md`](../mcp-generator-hld-lld.md) (the HLD/LLD). These guides
are a narrower, usage-focused view of the same design, split by "which mode am I trying to use"
instead of "how is the system built." Writing them now, before the code exists, is deliberate: it
forces the planned API surface to be concrete enough to critique before real usage locks it in,
and it means there's a single source of truth to update (rather than writing docs from scratch
once each phase ships, and inevitably drifting from what got built). If you spot something in a
"planned" guide that looks wrong or awkward before it's implemented, that's exactly the right time
to raise it — see [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md).
