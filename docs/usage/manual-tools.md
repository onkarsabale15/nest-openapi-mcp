# Manual, non-HTTP tools (`@McpTool` / `@McpArg`)

> **Status: planned, not implemented yet.** Part of `@onkarsabale15/mcp-gen-server`, targeted for Phase 3 of the
> roadmap. Describes the designed API from `docs/mcp-generator-hld-lld.md` §3.7. See
> [`README.md`](./README.md) for what's actually usable today.

[The in-process module](./in-process-module.md) auto-derives tools from your `@nestjs/swagger`
document — every tool corresponds to an HTTP route. Not everything you'd want an LLM to call is
naturally an HTTP endpoint, though: an internal lookup, a computed aggregate, something that would
be a weird REST route just to make it MCP-callable. For that, expose a method on a regular
service directly:

## Planned usage

```typescript
import { Injectable } from '@nestjs/common';
import { McpTool, McpArg } from '@onkarsabale15/mcp-gen-server';

@Injectable()
export class UserService {
  constructor(private readonly userRepo: UserRepository) {}

  @McpTool({
    name: 'find_user_by_email',
    description: 'Fetch a user by their primary email address',
  })
  async findByEmail(
    @McpArg('email', { description: 'The email address to look up' }) email: string,
  ) {
    return this.userRepo.findOneBy({ email });
  }
}
```

No `@Controller`, no route, no HTTP dispatch at all for this path — it's called directly via
Nest's dependency injection, not through the loopback adapter [the in-process module](./in-process-module.md)
uses for controller-backed tools.

## How this is designed to work

- `@McpTool`/`@McpArg` store metadata via `Reflect.defineMetadata`; a scanner walks every provider
  via NestJS's `DiscoveryService` at bootstrap and finds every `@McpTool`-decorated method.
- For a normal (`Scope.DEFAULT`) provider, the service is resolved once at bootstrap and the
  executor is bound directly — no per-call resolution cost.
- For a `Scope.REQUEST`-scoped provider, a fresh request context is created **per tool call**
  (mirroring what Nest does per real HTTP request) so the same request-scoped semantics you'd get
  from a normal controller still apply here — this is the one place the manual-tool dispatch path
  needs special handling that the HTTP-loopback path in the in-process module gets for free.
- `@McpArg` parameter metadata (name + index, from the order the decorators appear on the method
  signature) drives argument marshaling: the JSON Schema property names registered for the tool
  map back to positional call arguments.

Both this dispatch path and the controller-backed one implement the same underlying `ToolExecutor`
contract from `@onkarsabale15/mcp-gen-common` — so validation, truncation, and error-mapping are shared code
regardless of which path a given tool came from.

## When to use this instead of an HTTP route

Reach for a manual `@McpTool` when the operation genuinely doesn't belong as a REST endpoint (an
internal-only aggregate query, a computed value with no natural URL) — not as a way to bypass the
safe-by-default endpoint filtering in the in-process module. If something *is* naturally an HTTP
operation, prefer exposing it the normal way (via a Swagger tag or `@McpExpose()`) so its behavior
stays consistent with the rest of your documented API surface.
