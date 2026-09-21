# NestJS → MCP Server Generator — Architecture & Design (HLD + LLD)

**Status:** Draft v1 for review · **Owner:** Onkar · **Last updated:** 2026-09-22

This document turns the original idea into a build-ready plan: what's genuinely doable, what changes were made to the original proposal and why, a High-Level Design, a Low-Level Design, engineering standards, a test/CI strategy, and a phased roadmap. Every place where a decision had to be made without your input is called out explicitly under **Assumptions & Open Questions (§9)** so nothing is silently decided for you.

---

## 0. Feasibility Verdict

**Yes, this is buildable, and the two-mode architecture (in-process module + CLI proxy) is the right shape.** Nothing in the proposal requires unproven technology — it's an integration project across three well-documented surfaces: NestJS internals (`DiscoveryService`, `ModuleRef`, `HttpAdapterHost`), `@nestjs/swagger`'s in-memory OpenAPI document, and the official `@modelcontextprotocol/sdk`.

However, the original draft has five concrete engineering flaws that would cause real production incidents if built as-written. They're fixed in this design (details in the relevant LLD subsections, summarized here):

1. **`supertest` is not an in-process dispatcher.** `supertest(app)` binds a real ephemeral TCP listener per call unless the app is already listening — that's a live socket + port allocation on every single tool invocation, not the "zero network latency" the proposal claims. **Fix:** use `light-my-request` (the same library Fastify's own `.inject()` uses internally) for Express, and Fastify's native `.inject()` for Fastify — both simulate a full HTTP request in-process with no real socket, while still running the entire Guard → Interceptor → Pipe → Controller → Interceptor → Filter pipeline. See §3.6.
2. **The parameter-flattening collision strategy was hand-wavy** ("prefix with `body_` or nest under `body`" — pick one, deterministically, or every tool's shape becomes unpredictable). **Fix:** a single deterministic algorithm, default-safe, documented in §3.5.
3. **"Isolate everything, exclude what you don't want" is the wrong default for something that hands an LLM the ability to call your production API.** A newly added `DELETE /users/:id` endpoint should not become LLM-callable by default the moment someone deploys. **Fix:** safe-by-default (opt-in) exposure, detailed in §3.4.
4. **JSON-RPC errors and MCP tool-execution errors are two different mechanisms**, and the draft conflates them ("map internal errors to JSON-RPC error format... `isError: true`"). `isError: true` is a field *inside* a successful `CallToolResult`, not a JSON-RPC error object. Getting this wrong breaks how the calling LLM sees and recovers from failures. **Fix:** an explicit mapping table in §3.9.
5. **The `_mcp_warning` truncation field is a non-standard, invented key** that most MCP clients will silently ignore since it sits outside the `content` block array the spec actually defines. **Fix:** truncation warnings are emitted as an additional `content` text block, per spec. See §3.10.

### Prior art you should know about before writing a line of code

The space is more crowded than the proposal suggests. A quick survey (September 2026):

- **[`rekog-labs/MCP-Nest`](https://github.com/rekog-labs/MCP-Nest)** (npm: `@rekog/mcp-nest`) is the most established NestJS↔MCP module today. It is **decorator-based only** (`@Tool()` on methods you annotate by hand) — it does **not** auto-derive tools from existing `@nestjs/swagger` metadata. This is your real differentiator: zero-annotation, Swagger-driven auto-discovery for teams that already document their API with `@nestjs/swagger`.
- **[`nestjs-swagger-mcp`](https://libraries.io/npm/nestjs-swagger-mcp)** and **[`ts-oas/nest-openapi`](https://deepwiki.com/ts-oas/nest-openapi)** already attempt OpenAPI-driven generation for NestJS specifically — worth reading their source for lessons before building, and worth being honest in your README about how you differ (in-process pipeline-faithful dispatch, safe-by-default exposure, dual-mode CLI).
- **[`Docat0209/mcp-openapi`](https://github.com/Docat0209/mcp-openapi)** does generic (framework-agnostic) OpenAPI → MCP conversion — this is essentially "Approach B" (the CLI/proxy mode) already built by someone else, though not NestJS-specific.
- **`@nestjs-mcp/server`** (by `adrian-d-hidalgo`) **already exists on npm** — the exact package scope named in the original proposal is taken. You'll need a different name (see §9).

None of this means don't build it — it means the pitch has to be sharper than "NestJS + MCP" (that's taken, several times over). The wedge that's genuinely underserved: **faithful in-process execution through the real Nest pipeline (not a hand-rolled reimplementation of Guards/Pipes) combined with zero-annotation Swagger-driven discovery and safe-by-default exposure.** Recommend leading with that in the README and picking a name that signals it (e.g. `nest-openapi-mcp`, `swagger-to-mcp`, `mcp-from-swagger` — final name pending the npm/GitHub availability check in §9).

---

## 1. Goals, Non-Goals, Success Criteria

**Goals**
- Turn an existing NestJS app (already using `@nestjs/swagger`) into a spec-compliant MCP server with no manual per-endpoint tool authoring, via `McpModule.forRoot()`.
- Also support manual, fine-grained tool exposure from plain services (no HTTP route required) via `@McpTool` / `@McpArg` decorators, for logic that isn't naturally a REST endpoint.
- Ship a standalone CLI that turns *any* OpenAPI 3.0/3.1 document (not necessarily NestJS) into a proxying MCP server, for teams that can't or won't add a runtime dependency to their API process.
- Be safe to point at a production API by default: nothing is exposed to an LLM caller unless a developer explicitly opts it in.
- Be a good OSS citizen: typed, tested, documented, semantically versioned, dual ESM/CJS, works across supported NestJS/Express/Fastify version combinations.

**Non-Goals (v1)**
- Not a general-purpose API gateway (no rate limiting dashboards, no billing, no multi-tenant admin UI).
- Not attempting to support GraphQL or gRPC-based NestJS apps — REST/OpenAPI only for v1.
- Not shipping a hosted/SaaS version — this is a library + CLI, self-hosted by the consuming team.
- Horizontal-scale session storage (Redis-backed MCP sessions) is designed for (pluggable interface) but not implemented until v1.1 — v1 targets single-instance or sticky-session deployments plus stdio (which is inherently single-process).

**Success criteria for v1.0**
- A sample NestJS app with Guards, Pipes, Interceptors, a request-scoped provider, and both Express and Fastify variants passes an automated compliance suite run against `@modelcontextprotocol/inspector`.
- `tools/list` and `tools/call` round-trip correctly over stdio, Streamable HTTP, and legacy SSE.
- Zero endpoints exposed on a freshly-installed app with default config (opt-in proven, not just documented).
- Package installs and builds cleanly on Node 18/20/22 against NestJS 11 and 12, Express 4/5, Fastify 4/5. (Corrected from an original 10/11 assumption — see §9.9: real-world validation against three independent NestJS codebases found the current ecosystem is on NestJS 12.)

---

## 2. High-Level Design (HLD)

### 2.1 System context

```
┌───────────────────────────────────────────────────────────────────┐
│                          MCP Clients                              │
│         (Claude Desktop/Code, Cursor, custom LLM agents)          │
└───────────────────────────┬───────────────────────────────────────┘
                             │ JSON-RPC 2.0 over stdio / Streamable HTTP / SSE
                             ▼
        ┌────────────────────────────────────────────────┐
        │                Mode A: In-process               │            ┌─────────────────────────────┐
        │        (@your-scope/server — NestJS module)      │            │        Mode B: Proxy         │
        │                                                    │            │   (@your-scope/cli)          │
        │  Runs INSIDE the target NestJS app's own process  │            │  Separate process, talks to  │
        │  Dispatches through the real HTTP pipeline via    │            │  a REMOTE NestJS/any API     │
        │  an in-memory loopback (no socket) or direct DI    │            │  over real HTTP + auth       │
        └───────────────────────┬──────────────────────────┘            └───────────────┬───────────────┘
                                 │ in-process call (loopback / DI)                         │ HTTPS
                                 ▼                                                          ▼
                    ┌─────────────────────────┐                              ┌─────────────────────────┐
                    │   NestJS DI Container    │                              │   Remote NestJS/any API  │
                    │  Guards→Pipes→Controller  │                              │   (unmodified, live)      │
                    │  →Interceptors→Filters    │                              └─────────────────────────┘
                    └─────────────────────────┘
```

Both modes share one engine (`@your-scope/core`) for OpenAPI parsing, schema flattening, tool-name generation, and truncation. Only the *execution* strategy differs — everything about *what a tool looks like* is identical whether it ends up dispatched in-process or over HTTP. This sharing is the single most important structural decision in the whole system: it's what keeps Mode A and Mode B from silently drifting into two different tool-shape behaviors.

### 2.2 Package topology

```
repo/
├── packages/
│   ├── common/     # @scope/common   — shared types, JSON-RPC types, error classes
│   ├── core/       # @scope/core     — framework-agnostic: OpenAPI parsing, tool schema
│   │                                   generation, truncation, tool registry
│   ├── server/     # @scope/server   — NestJS dynamic module, decorators, discovery,
│   │                                   dispatch adapters, transports (Mode A)
│   ├── cli/        # @scope/cli      — standalone proxy server generator (Mode B)
│   └── session-redis/ # @scope/session-redis — optional pluggable session store (v1.1+)
├── examples/
│   ├── basic-express-app/
│   └── basic-fastify-app/
└── (root tooling: turborepo, pnpm workspaces, changesets, eslint, tsconfig)
```

Rationale for a monorepo with independently publishable packages (rather than one big package): consumers who only need the CLI shouldn't pull in `@nestjs/core` as a dependency, and consumers who only need the NestJS module shouldn't pull in CLI-only deps like a command-line argument parser. `core` has zero NestJS dependency so it's independently testable and reusable (someone could build an Express-only or Fastify-only integration on top of it later without touching NestJS at all).

### 2.3 Subsystem responsibilities

| Subsystem | Package | Responsibility |
|---|---|---|
| OpenAPI extraction | `server` | Calls `SwaggerModule.createDocument()` at bootstrap to get the live, in-memory OpenAPI doc — no file I/O, always in sync with the running code. |
| Schema engine | `core` | `$ref` resolution, operation→tool mapping, parameter flattening, tool naming/dedup, truncation. Pure functions, no I/O. |
| Schema enrichment (fallback) | `core` | Fills genuinely empty, class-validator-only DTO schemas via class-validator metadata reconstruction (`enrichEmptySchemas`) — a floor when `@ApiProperty()`/CLI-plugin metadata is absent. Runs before `$ref` resolution. See §3.4.1. |
| Tool registry | `core` | In-memory map of tool name → `{definition, executor}`. Conflict detection at registration time (throws at bootstrap, not at call time). |
| Discovery & filtering | `server` | Decides which operations/services become tools, per the safe-by-default policy (§3.4). |
| Dispatch (loopback) | `server` | Executes a tool call against the live Nest app through the real HTTP pipeline, without a real socket. |
| Dispatch (direct DI) | `server` | Executes `@McpTool`-decorated service methods directly via `ModuleRef`, handling `Scope.REQUEST` providers correctly. |
| Dispatch (proxy) | `cli` | Executes a tool call as a real outbound HTTP request against a remote API, with auth forwarding. |
| Transports | `server` / `cli` | stdio, Streamable HTTP, legacy SSE — wraps `@modelcontextprotocol/sdk`. |
| Auth context | `server` / `cli` | Pluggable strategy for turning "who is calling this MCP tool" into "what headers does the internal/outbound request carry." |
| Observability | `server` | Structured logs, correlation IDs, optional OpenTelemetry spans, per-tool metrics. |

### 2.4 Key design decisions (ADR-style summary)

| # | Decision | Alternatives considered | Why |
|---|---|---|---|
| 1 | Loopback dispatch via `light-my-request`/`.inject()`, not `supertest` | supertest; raw `app.handle()` reimplementation | Zero real sockets, framework-native (Fastify), well-maintained, avoids reimplementing routing/pipeline semantics |
| 2 | Safe-by-default (opt-in) tool exposure | Opt-out (expose all, exclude some) | An LLM tool-caller is a fundamentally different trust boundary than a documented REST API; opt-out fails open |
| 3 | Deterministic nested-body-by-default parameter shape | Silent flat-merge with ad hoc prefixing | Predictable, collision-proof, consistent schema shape across every tool in an app |
| 4 | Shared `core` package with zero NestJS dependency | One monolithic package | Enables Mode A/B parity, independent testing, smaller install for CLI-only users |
| 5 | `AuthContextProvider` as a pluggable interface | Hardcoded Bearer-header passthrough | Real APIs have varied auth (JWT, API key, mTLS-derived identity, multi-tenant headers); hardcoding one forces forks |
| 6 | Distinguish JSON-RPC protocol errors from `CallToolResult.isError` tool errors | Collapsing both into JSON-RPC errors | Matches the actual MCP spec; lets the calling LLM see and reason about a failed tool call instead of it looking like a broken connection |
| 7 | Truncation communicated via extra `content` block | Custom top-level `_mcp_warning` field | Standards-compliant; visible to every MCP client, not just ones that happen to read a made-up field |
| 8 | class-validator metadata as a fallback schema source for empty DTOs | Leave empty schemas as-is and document the limitation; require `@ApiProperty()` | Real-world validation found class-validator-only DTOs (no `@ApiProperty()`, no CLI plugin) are common, not rare — an empty tool schema is actively unhelpful to an LLM caller, and the metadata to do better already exists at runtime |

### 2.5 Non-functional requirements

- **Performance:** in-process dispatch overhead (loopback simulation + schema validation + truncation) should add materially less latency than the endpoint's own business logic for typical CRUD operations — target: p95 dispatch overhead < 5ms measured against direct controller invocation, verified with an autocannon/k6 smoke test (§6).
- **Security:** default-deny exposure; input validated against JSON Schema with unknown properties rejected by default; path-parameter values URL-encoded before substitution (no path traversal via a crafted `id` argument); stack traces and internal error detail masked unless an explicit debug flag is set.
- **Compatibility:** NestJS 11 & 12, Express 4 & 5, Fastify 4 & 5, Node 18/20/22, ESM and CJS consumers. (Updated post-validation — see §9.9.)
- **Observability:** every tool call is logged with a correlation ID, tool name, duration, and outcome; optional OpenTelemetry span per call.
- **Resilience:** per-tool call timeout (configurable, default 30s) and a global concurrency cap on simultaneous tool executions, so a slow downstream doesn't let an LLM agent pile up unbounded concurrent load on the API process it's embedded in.

---

## 3. Low-Level Design (LLD)

### 3.1 `@scope/common` — shared types

```typescript
// json-rpc.ts
export interface JsonRpcError { code: number; message: string; data?: unknown }

// types.ts
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: false; // enforced by default — see §3.5
}

export interface McpToolDefinition {
  name: string;              // ^[a-zA-Z0-9_-]{1,64}$
  description: string;
  inputSchema: JsonSchemaObject;
  _meta?: { operationId?: string; httpMethod?: string; path?: string };
}

export type ToolExecutor = (args: Record<string, unknown>, extra: McpRequestExtra) => Promise<ToolExecutionResult>;

export interface ToolExecutionResult {
  data: unknown;
  httpStatus?: number;
  isError: boolean;
  errorMessage?: string;
}

export interface McpRequestExtra {
  transport: 'stdio' | 'http' | 'sse';
  sessionId?: string;
  rawHeaders?: Record<string, string>;   // present for http/sse
  env?: NodeJS.ProcessEnv;               // present for stdio
}
```

```typescript
// errors.ts
export class ToolRegistrationConflictError extends Error {}
export class SchemaResolutionError extends Error {}
export class McpToolExecutionError extends Error {
  constructor(message: string, public readonly cause?: unknown, public readonly httpStatus?: number) { super(message); }
}
```

### 3.2 `@scope/core` — OpenAPI → tool schema engine

**Pipeline (pure, no I/O beyond the initial document):**

```
OpenAPI document (already resolved, in-memory)
   → enrichEmptySchemas(document, classRegistry)   [optional — §3.4.1, fills class-validator-only DTOs]
   → resolveRefs()            [@apidevtools/json-schema-ref-parser, dereference mode]
   → for each (path, method, operation):
        → planParameterMapping(operation)   [§3.5 — deterministic flat/nested decision]
        → buildToolName(operation, used)    [§3.3]
        → McpToolDefinition
   → ToolRegistry.register(name, definition, executor)   [throws on name collision]
```

#### 3.3 Tool naming

```typescript
export function buildToolName(
  operation: OpenApiOperation,
  method: string,
  path: string,
  used: Set<string>,
): string {
  const base = operation.operationId ?? `${method}_${path}`;
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'tool';
  let candidate = sanitized;
  let i = 2;
  while (used.has(candidate)) {
    const suffix = `_${i++}`;
    candidate = sanitized.slice(0, 64 - suffix.length) + suffix;
  }
  used.add(candidate);
  return candidate;
}
```

`@nestjs/swagger` auto-generates `operationId` as `ControllerName_methodName` when not set explicitly, which is already collision-resistant across a normal app — the dedup loop above exists only to handle the edge case of an explicit, developer-set `operationId` clashing, or a fallback name built from method+path colliding after sanitization strips punctuation.

#### 3.4 Endpoint filtering — safe-by-default (fixes flaw #3)

Evaluated once per operation, at bootstrap, in this exact order:

1. `@McpExclude()` present → **always excluded.** No override.
2. `discovery.mode === 'decorator'` → included **only if** `@McpExpose()` is present on that handler.
3. `discovery.mode === 'openapi'` (**default**) → included only if **all** of:
   - the operation's Swagger tags intersect `discovery.includeTags` **or** `@McpExpose()` is present on the handler (explicit override even without a matching tag), **and**
   - the HTTP method is not in `discovery.excludeMethods` (default: `['DELETE']`) **unless** `@McpExpose({ force: true })` is present, **and**
   - `@McpExclude()` is absent (already covered by rule 1, restated for clarity).
4. `discovery.mode === 'all'` → include everything not caught by rule 1 or the destructive-method default, **and log a startup warning naming every exposed endpoint plus the count.** This mode is documented as "for local prototyping only, do not use against a production database."

With no configuration at all, `discovery.mode` defaults to `'openapi'` and `includeTags` defaults to `[]` — meaning **a fresh install exposes zero tools** until the developer either tags routes or adds `@McpExpose()`. This is the concrete mechanism behind the "safe by default" NFR in §2.5.

#### 3.4.1 Schema enrichment fallback — class-validator-only DTOs (added post-validation, see §9.9)

Real-world validation against three independently-built NestJS codebases found a design gap the original proposal's "zero-annotation" framing didn't account for: a DTO validated with `class-validator` decorators alone (`@IsString()`, `@IsInt()`, `@IsOptional()`, ...) but with **no** `@ApiProperty()` and no Swagger CLI plugin produces a genuinely empty `{ type: 'object', properties: {} }` schema from `@nestjs/swagger`. This is common in real apps (the official `nestjs/nest` sample itself does this), not a corner case — and an empty schema is actively unhelpful to an LLM caller, which has no idea what shape of object to send.

`@scope/core` fixes this with a best-effort fallback, implemented as two pure functions:

```typescript
export type ClassConstructor = new (...args: never[]) => object;

// Reads class-validator's own metadata storage and reconstructs a JSON Schema:
// property names + types inferred from which validation decorator is used
// (@IsString → string, @IsInt → integer, @IsBoolean → boolean, ...), and
// required/optional derived from the presence of @IsOptional().
export function buildSchemaFromClassValidator(cls: ClassConstructor): JsonSchemaObject;

// Walks document.components.schemas; for every named schema that is genuinely
// empty AND has a matching entry in classRegistry (schema component name -> the
// DTO class that produced it), replaces it with buildSchemaFromClassValidator's
// output. Every schema with even one real property is left untouched. Returns a
// new document; never mutates the one it was given. Intended to run *before*
// resolveRefs() so the enrichment flows through $ref resolution normally.
export function enrichEmptySchemas(
  document: OpenApiDocument,
  classRegistry: Record<string, ClassConstructor>,
): OpenApiDocument;
```

This is deliberately **best-effort, not a substitute for real `@ApiProperty()` metadata** — class-validator decorators describe validation rules, not exact JSON Schema types (e.g. `@IsEnum()` doesn't carry the enum's actual allowed values through this path the way `@ApiProperty({ enum: [...] })` would). It only ever fires on a schema that is genuinely empty; a schema with even a single real property from Swagger is never touched. The goal is a useful floor, not parity with hand-annotated schemas.

**Phase 2 integration note:** in `@scope/server`, the `classRegistry` should be built automatically during discovery (NestJS already has the DTO class reference on every route handler's parameter metadata — no reason to make app authors hand-maintain a name→class map), with `discovery.classValidatorFallback: boolean` (default `true`) as the opt-out switch for teams that would rather see the gap and add `@ApiProperty()` themselves.

Verified in `packages/core`: `class-validator-fallback.spec.ts` (unit tests against real decorated test classes) and `real-world.spec.ts` (end-to-end, reproducing the exact empty-schema bug against the real `nestjs/nest` sample fixture and proving the fallback fixes it).

#### 3.5 Parameter flattening — deterministic strategy (fixes flaw #2)

**Default strategy: `nested`.** Path, query, and header parameters are flattened to the top level of `inputSchema.properties` (they're small, primitive-typed, and essentially never collide with each other by OpenAPI convention). The request body — if present — is **always** nested under a single `body` property, never merged into the top level.

```typescript
export type ParamStrategy = 'nested' | 'flat';

export function planParameterMapping(
  operation: OpenApiOperation,
  strategy: ParamStrategy = 'nested',
): ParamPlan {
  const top: Record<string, JsonSchemaObject['properties'][string]> = {};
  const required: string[] = [];

  for (const p of operation.parameters ?? []) {
    top[p.name] = { type: p.schema?.type ?? 'string', description: p.description ?? `${p.in} parameter` };
    if (p.required) required.push(p.name);
  }

  const bodySchema = operation.requestBody?.content?.['application/json']?.schema;
  if (!bodySchema) return { properties: top, required, bodyKey: null };

  if (strategy === 'nested') {
    top.body = bodySchema;
    if (operation.requestBody?.required) required.push('body');
    return { properties: top, required, bodyKey: 'body' };
  }

  // strategy === 'flat': only safe when there is zero name overlap
  const bodyProps = bodySchema.properties ?? {};
  const collisions = Object.keys(bodyProps).filter((k) => k in top);
  if (collisions.length > 0) {
    throw new SchemaResolutionError(
      `Operation "${operation.operationId}" has flat-strategy parameter collisions on [${collisions.join(', ')}]. ` +
      `Use 'nested' strategy (the default) or rename the colliding field(s).`,
    );
  }
  Object.assign(top, bodyProps);
  required.push(...(bodySchema.required ?? []));
  return { properties: top, required: [...new Set(required)], bodyKey: null };
}
```

`flat` is opt-in per-module (`discovery.paramStrategy: 'flat'`) for teams with simple CRUD bodies who want the flattest possible schema and are willing to accept a **build-time failure** (not a silent, surprising runtime shape change) if a collision ever appears. This is a deliberate change from the draft: collisions are either impossible (nested default) or a loud bootstrap error (flat opt-in) — never a silent, inconsistent-across-tools workaround. Real-world validation confirmed this is not theoretical: Immich's `PUT /faces/{id}` has a genuine path-param-vs-body-field collision on `id`, caught correctly as a `SchemaResolutionError` under the `flat` strategy and permanently regression-tested in `real-world.spec.ts`.

### 3.6 Dispatch engine — in-process loopback (fixes flaw #1)

```typescript
export interface HttpLoopbackAdapter {
  dispatch(req: LoopbackRequest): Promise<LoopbackResponse>;
}

export interface LoopbackRequest {
  method: string; url: string; query?: Record<string, string>;
  headers: Record<string, string>; body?: unknown;
}
export interface LoopbackResponse { status: number; headers: Record<string, string>; body: unknown }
```

```typescript
// fastify-loopback.adapter.ts
export class FastifyLoopbackAdapter implements HttpLoopbackAdapter {
  constructor(private readonly instance: FastifyInstance) {}
  async dispatch(req: LoopbackRequest): Promise<LoopbackResponse> {
    const res = await this.instance.inject({
      method: req.method, url: buildUrl(req.url, req.query), headers: req.headers, payload: req.body,
    });
    return { status: res.statusCode, headers: res.headers as Record<string, string>, body: safeJsonParse(res.body) };
  }
}
```

```typescript
// express-loopback.adapter.ts
import lightMyRequest from 'light-my-request';

export class ExpressLoopbackAdapter implements HttpLoopbackAdapter {
  constructor(private readonly app: import('express').Express) {}
  async dispatch(req: LoopbackRequest): Promise<LoopbackResponse> {
    const res = await lightMyRequest(this.app, {
      method: req.method as any, url: buildUrl(req.url, req.query), headers: req.headers, payload: req.body,
    });
    return { status: res.statusCode, headers: res.headers as Record<string, string>, body: safeJsonParse(res.payload) };
  }
}
```

**Why this fixes flaw #1:** `light-my-request` drives the request straight through Express's own `(req, res, next)` handler chain using synthetic `net.Socket`-like objects — no `listen()`, no OS port, no real TCP handshake. Fastify's `.inject()` does the same natively. Both exercise the **entire** framework pipeline (Guards → Pipes → Controller → Interceptors → Filters) exactly as a real request would, which is what solves the "missing execution context" and "bypassed pipeline" problems the draft correctly identified — and, because Nest allocates a fresh DI subtree per HTTP request regardless of how that request arrived, `Scope.REQUEST` providers resolve correctly with no special-casing needed in the dispatcher itself.

The adapter is selected once at bootstrap based on `HttpAdapterHost.httpAdapter.getType()` (`'express'` | `'fastify'`), and the `McpLifecycleService` fails fast with a clear error if it encounters an adapter type it doesn't recognize, rather than silently guessing.

**Sequence — Mode A, controller-backed tool:**

```
MCP Client → transport → ToolRegistry.lookup(name) → executor(args, extra)
  1. AuthContextProvider.resolve(extra) → AuthContext { headers }
  2. validate(args, tool.inputSchema)   → 400-equivalent (JSON-RPC -32602) on failure
  3. reconstruct {path, query, header, body} from args per the ParamPlan recorded at bootstrap
  4. substitute path template params (URL-encoded — prevents path/segment injection)
  5. HttpLoopbackAdapter.dispatch({ method, url, query, headers: merge(authHeaders, staticHeaders), body })
  6. status >= 400 → McpToolExecutionError(sanitizedMessage, cause, status)
  7. truncate(response.body, truncationConfig)
  8. wrap as CallToolResult, isError = (status >= 400)
  9. observability: log + metric + (optional) OTel span end
```

### 3.7 Dispatch engine — direct DI (service-level `@McpTool`)

For logic that isn't a REST endpoint (or where you don't want the HTTP-pipeline overhead at all):

```typescript
@Injectable()
export class UserService {
  @McpTool({ name: 'find_user_by_email', description: 'Fetch a user by primary email' })
  async findByEmail(@McpArg('email', { description: 'User email address' }) email: string) {
    return this.userRepo.findOneBy({ email });
  }
}
```

`@McpTool`/`@McpArg` store metadata via `Reflect.defineMetadata` under package-scoped keys. `DecoratorScannerService` walks all providers via `DiscoveryService.getProviders()` at bootstrap, and for each `@McpTool`-decorated method:

- If the declaring provider is `Scope.DEFAULT` (the common case): resolve it once via `ModuleRef.get(ProviderClass, { strict: false })` and bind the executor directly — no per-call resolution cost.
- If `Scope.REQUEST`: create a fresh `ContextId` via `ContextIdFactory.create()` per tool call and resolve via `moduleRef.resolve(ProviderClass, contextId, { strict: false })`, mirroring what Nest does per-HTTP-request. This is the one place the direct-DI path needs special-casing that the loopback path gets "for free."
- `@McpArg` parameter metadata (name + index) drives argument marshaling: the registered JSON Schema property names map back to positional call arguments in the order the decorators appear.

Both dispatch paths (loopback and direct DI) implement the same `ToolExecutor` type from §3.1, so the registry, validation, truncation, and error-mapping logic downstream of "get a raw result" is 100% shared code — this is the second big code-sharing win after `core`.

### 3.8 Auth context propagation

```typescript
export interface AuthContext { headers?: Record<string, string> }

export interface AuthContextProvider {
  resolve(extra: McpRequestExtra): AuthContext | Promise<AuthContext>;
}

// Default for HTTP/SSE transports: forward an allow-listed set of inbound headers
export class PassthroughHeaderAuthProvider implements AuthContextProvider {
  constructor(private readonly allowList = ['authorization', 'x-api-key', 'x-tenant-id']) {}
  resolve(extra: McpRequestExtra): AuthContext {
    if (!extra.rawHeaders) return {};
    const headers: Record<string, string> = {};
    for (const key of this.allowList) if (extra.rawHeaders[key]) headers[key] = extra.rawHeaders[key];
    return { headers };
  }
}

// Default for stdio transport (no inbound HTTP headers exist): env var
export class EnvVarAuthProvider implements AuthContextProvider {
  constructor(private readonly envVar = 'MCP_API_TOKEN') {}
  resolve(): AuthContext {
    const token = process.env[this.envVar];
    return token ? { headers: { authorization: `Bearer ${token}` } } : {};
  }
}
```

`McpModule.forRoot({ auth: { provider: MyCustomProvider } })` lets a team implement real logic — verify a JWT and map it to an internal service-account header, enforce per-tool scopes, reject a session outright by throwing. An optional second hook, `canExecute(toolName, args, authContext): boolean | Promise<boolean>`, runs immediately before dispatch as defense-in-depth beyond whatever the underlying route's own Guards already enforce — useful because a Guard written for human HTTP traffic may not know a particular route shouldn't be LLM-callable even when it's fine for browser traffic.

### 3.9 Transports

- **stdio:** `StdioTransportManager` wraps `StdioServerTransport` from the SDK. Because stdout is reserved exclusively for JSON-RPC frames, the module swaps Nest's default console-based `Logger` for a stderr-writing implementation the moment `transport.type` includes `'stdio'`, and additionally monkey-patches `process.stdout.write` with a guard that redirects any write *not* originating from the SDK's own transport to stderr with a one-time startup warning — this catches stray `console.log` calls in user code that would otherwise silently corrupt the protocol stream, which is exactly the kind of failure that's invisible in dev and catastrophic in an actual Claude Desktop integration.
- **Streamable HTTP:** `HttpTransportManager` mounts on the app's **existing** `HttpAdapterHost` instance at a configurable path (default `/mcp`) unless a separate `transport.port` is configured, in which case a second lightweight adapter instance is bootstrapped exclusively for MCP traffic (useful for keeping the MCP surface off a public-facing port/firewall zone). Session state (MCP session ID → transport instance → resolved `AuthContext`) lives behind an `McpSessionStore` interface; the default is an in-memory `Map` (documented limitation: requires sticky sessions behind a load balancer, or single-instance deployment); `@scope/session-redis` (v1.1) implements the same interface backed by Redis for stateless horizontal scaling.
- **Legacy SSE:** `SseTransportManager` mounts `/sse` (GET, stream) and `/messages` (POST) for older clients, per the pre-Streamable-HTTP spec revision, purely as a compatibility fallback.

### 3.10 Error handling — protocol errors vs. tool errors (fixes flaw #4)

| Situation | Mechanism | Code / shape |
|---|---|---|
| Unknown tool name requested | JSON-RPC protocol error | `-32601 Method not found` |
| `args` fail JSON Schema validation | JSON-RPC protocol error | `-32602 Invalid params` |
| Uncaught bug inside the dispatch engine itself | JSON-RPC protocol error | `-32603 Internal error` |
| Tool ran, but the underlying endpoint returned 4xx/5xx, or threw a business-logic exception | **Successful** JSON-RPC response; `CallToolResult.isError = true` | `content: [{ type: 'text', text: sanitizedMessage }]` |

The fourth row is the one the draft got backwards. A tool execution failure (e.g., "user not found," a validation error from the downstream endpoint, a downstream 500) is not a protocol failure — the MCP call itself succeeded; the *tool* reported an error, and the calling LLM is expected to read `isError` and the content text to decide what to do next (retry with different args, tell the user, etc.). Collapsing this into a JSON-RPC error makes it look, from the client's perspective, like the server itself is broken.

Error messages sent to the client are masked by default (`"Request failed with status 500"` rather than a stack trace or DB connection string) unless `debug: true` is set in module options, in which case the original message and a redacted stack (file paths only, no env values) are included — gated explicitly so nobody ships `debug: true` to production by accident (it also logs a loud warning on bootstrap if it's on).

### 3.11 Truncation (fixes flaw #5)

```typescript
export function truncateResult(payload: unknown, opts: { maxBytes: number }): { text: string; truncated: boolean; omitted?: number } {
  const full = JSON.stringify(payload);
  if (Buffer.byteLength(full) <= opts.maxBytes) return { text: full, truncated: false };

  if (Array.isArray(payload)) {
    let lo = 0, hi = payload.length, best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (Buffer.byteLength(JSON.stringify(payload.slice(0, mid))) <= opts.maxBytes) { best = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return { text: JSON.stringify(payload.slice(0, best)), truncated: true, omitted: payload.length - best };
  }
  return { text: full.slice(0, opts.maxBytes) + '…', truncated: true };
}
```

The tool wraps this into a spec-compliant `CallToolResult`:

```typescript
const { text, truncated, omitted } = truncateResult(data, { maxBytes: config.maxResponseBytes ?? 25_000 });
const content: ContentBlock[] = [{ type: 'text', text }];
if (truncated) {
  content.push({
    type: 'text',
    text: `⚠ Output truncated${omitted ? `: ${omitted} item(s) omitted` : ''}. Refine your query or request a narrower page.`,
  });
}
```

No custom top-level fields — every MCP client renders `content` blocks, so the warning is guaranteed visible instead of silently dropped by clients that don't know a made-up key.

### 3.12 Configuration surface

```typescript
export interface McpModuleOptions {
  name: string;
  version: string;
  transport: {
    type: 'stdio' | 'http' | 'sse' | Array<'stdio' | 'http' | 'sse'>;
    path?: string;        // default '/mcp'
    port?: number;        // optional dedicated port
    sessionStore?: McpSessionStore;  // default: in-memory
  };
  discovery: {
    mode?: 'openapi' | 'decorator' | 'all';   // default 'openapi'
    includeTags?: string[];                    // default []
    excludeMethods?: string[];                 // default ['DELETE']
    paramStrategy?: 'nested' | 'flat';          // default 'nested'
    classValidatorFallback?: boolean;           // default true — see §3.4.1
  };
  auth?: {
    provider?: AuthContextProvider;             // default: passthrough (http) / env var (stdio)
    canExecute?: (toolName: string, args: unknown, ctx: AuthContext) => boolean | Promise<boolean>;
  };
  execution?: {
    timeoutMs?: number;         // default 30_000
    maxConcurrent?: number;     // default 32
    maxResponseBytes?: number;  // default 25_000
  };
  debug?: boolean;              // default false — unmasked errors, verbose logs
}
```

### 3.13 CLI (`@scope/cli`) — Mode B

```
npx @scope/cli serve --spec=https://api.example.com/docs-json --base-url=https://api.example.com [--header "Authorization: Bearer $TOKEN"]
```

- `serve` command: fetches/reads the OpenAPI document (URL or local file), runs it through the **same `@scope/core` pipeline** used by Mode A, then starts an MCP server (stdio by default, `--transport http --port N` optional) whose executor is an `axios`-based `HttpProxyDispatcher` that makes real outbound requests to `--base-url`, attaching any `--header` flags and/or environment-variable-sourced auth (`API_KEY=xxx npx @scope/cli serve ...`, mirroring the draft's original design — this part of the proposal was already sound).
- `generate` command: dry-run that prints the resolved tool manifest (names + schemas) without starting a server — useful for reviewing exactly what an LLM would be able to call before wiring it up live, and for committing a snapshot to a repo for change review in PRs.
- Reuses `@scope/core`'s safe-by-default filtering and truncation identically to Mode A, via the same config shape (CLI flags map 1:1 onto `McpModuleOptions.discovery`/`execution`).

---

## 4. Engineering Standards

- **TypeScript:** `strict: true` plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` across every package; `any` is disallowed except at explicitly justified adapter boundaries (Express/Fastify raw request/response typing), each with a `// eslint-disable-next-line` comment stating why.
- **Module boundaries:** `core` has zero dependency on `@nestjs/*` — enforced with `eslint-plugin-import-x`'s `no-restricted-paths` so this can't silently regress.
- **Lint/format:** `@typescript-eslint` strict-type-checked config + Prettier, enforced via `husky` + `lint-staged` pre-commit hooks; CI re-runs both regardless (pre-commit hooks can be skipped locally, CI can't).
- **File/naming conventions:** kebab-case filenames, PascalCase classes, one concept per file, `*.interface.ts` / `*.service.ts` / `*.module.ts` / `*.decorator.ts` suffixes, `*.spec.ts` colocated with source.
- **Public API discipline:** each package's `index.ts` barrel exports only the intended public surface; internal helpers live under `src/internal/` and are never re-exported, so refactors inside `internal/` never force a semver-major bump.
- **Documentation:** TSDoc on every exported symbol; `typedoc` generates a reference site from it; each package ships its own `README.md` with a runnable quickstart; a trimmed copy of this document lives in the repo as `ARCHITECTURE.md`.
- **Commits/releases:** Conventional Commits enforced by `commitlint`; **Changesets** drives versioning, changelog generation, and npm publishing (a "Version Packages" PR opens automatically on merges that include a changeset; merging that PR publishes).
- **Dependency injection discipline:** constructor injection everywhere in application code; the only sanctioned `ModuleRef.get`/`.resolve()` service-locator usage is inside the discovery/dispatch internals themselves, and it's documented inline as to why it can't be constructor injection (the set of providers to resolve isn't known until runtime discovery completes).

---

## 5. Security Considerations (deep dive)

- **Default-deny exposure** (§3.4) is the primary control — treat any change to that default as requiring explicit sign-off in review, not a routine PR.
- **Path parameter injection:** every path-template substitution is URL-encoded before insertion; a malicious `id` argument like `../../admin` becomes a literal encoded path segment, not a traversal.
- **Strict schema validation:** `inputSchema` objects set `additionalProperties: false` by default (configurable escape hatch, opt-in only), so an LLM can't smuggle extra fields into a body/query beyond what the OpenAPI spec declared.
- **Auth is never assumed** — the `AuthContextProvider` interface exists specifically so a team's real authorization logic (JWT verification, per-tenant header mapping, scope checks) lives in their own code, not baked into the library with a hardcoded "forward the Authorization header and hope" default. The default passthrough provider is explicitly documented as a starting point for local development, not a production auth strategy.
- **Error masking by default** prevents stack traces, connection strings, or internal file paths from leaking to an LLM client (and, transitively, to whatever the LLM shows the end user) unless a developer explicitly opts into `debug: true`.
- **Resource exhaustion:** per-tool timeout and a global concurrency cap (§3.12) stop a runaway agent loop (an LLM repeatedly retrying a failing tool call, or fanning out many parallel calls) from becoming a self-inflicted denial-of-service against the very API the module is embedded in.
- **Destructive methods excluded by default** (`DELETE`, configurable) — a team has to make an active choice (`@McpExpose({ force: true })`) to let an LLM delete something.

---

## 6. Testing Strategy

- **Unit (`core`):** table-driven tests for `$ref` resolution against real-world specs of varying complexity (a small Petstore-style spec, a spec with deeply nested `$ref` chains, a spec with `oneOf`/`allOf`), parameter-flattening collision cases (both strategies, including the intentional build-time failure case for `flat`), tool-name dedup, truncation edge cases (empty array, single object larger than the byte budget, deeply nested arrays), and the class-validator schema-enrichment fallback (§3.4.1). Target ≥85% line coverage.
- **Real-world regression (`core`):** three committed OpenAPI documents from independently-built NestJS projects (not hand-crafted fixtures) — the official `nestjs/nest` sample, Immich, Cal.com API v2 — run through the full pipeline on every test run (`real-world.spec.ts`), asserting zero crashes across ~400 real operations and reproducing/verifying the fix for the class-validator empty-schema gap end-to-end. See §9.9 and `real-world-validation-report.md` for how this suite came to exist.
- **Integration (`server`):** real `@nestjs/testing` `TestingModule` booting example controllers that exercise Guards, Pipes, Interceptors, a `Scope.REQUEST` provider, and both the Express and Fastify adapters — assertions confirm the pipeline actually ran (e.g., a value an Interceptor injects shows up in the tool result; a Guard rejection surfaces as `isError: true`, not a crash or an unhandled rejection).
- **Protocol compliance:** example apps launched as real child processes, driven over stdio and Streamable HTTP with a minimal JSON-RPC test client; `tools/list` output validated against the official MCP JSON Schema with `ajv`; cross-checked against `@modelcontextprotocol/inspector` in CI where it supports a headless/CLI mode.
- **Performance smoke test:** an `autocannon`/k6 script against the HTTP transport, comparing dispatch latency to a direct controller call, gating the NFR target from §2.5 (fails CI if p95 overhead regresses past the threshold).

---

## 7. CI/CD

- `ci.yml` (every PR): lint → typecheck → unit+integration tests with coverage → build all packages → protocol-compliance e2e against both example apps, matrixed over Node 18/20/22 × NestJS 11/12.
- `release.yml`: Changesets GitHub Action opens/updates a "Version Packages" PR; merging it publishes to npm with provenance attached.
- Branch protection requires all matrix legs green plus a semantic PR title (enforced via `commitlint`'s PR-title mode).

---

## 8. Phased Roadmap (solo-engineer estimate)

| Phase | Scope | Acceptance | Est. |
|---|---|---|---|
| 0 | Repo bootstrap: pnpm workspaces + Turborepo, base tsconfig/eslint/prettier, empty packages, CI skeleton, Changesets init | `pnpm build` succeeds on an empty scaffold; CI green on a no-op PR | 0.5–1 day |
| 1 | `core`: ref resolver, operation→tool mapping, parameter flattener, tool registry, truncation, class-validator schema-enrichment fallback | ≥90% unit coverage; runs clean against real public OpenAPI specs without crashing | 4–6 days |
| 2 | `server` MVP: `McpModule.forRoot`, Swagger extraction, Express+Fastify loopback adapters, stdio transport, safe-by-default filtering, passthrough auth, automatic classRegistry wiring for the enrichment fallback (§3.4.1) | Example app (Guards+Pipes+Interceptors+`Scope.REQUEST`) works end-to-end via `@modelcontextprotocol/inspector`; Guard rejection returns `isError`, not a crash | 5–8 days |
| 3 | Streamable HTTP + legacy SSE transports; `@McpTool`/`@McpArg` decorator path with direct DI dispatch (incl. `ContextIdFactory` for request-scoped providers) | 2 concurrent HTTP sessions tested independently; a decorator-based tool works with zero backing HTTP route | 4–6 days |
| 4 | `cli`: `serve` + `generate` commands, axios proxy dispatcher, env-var auth | `npx @scope/cli serve --spec=<url>` works against the example app's own `/docs-json` | 3–4 days |
| 5 | Hardening: structured logging + correlation IDs, optional OTel spans, per-tool timeout/concurrency guard, debug-mode error unmasking, full truncation wiring, security review pass | Load test meets the p95 overhead NFR; security checklist in §5 verified item-by-item | 3–5 days |
| 6 | Docs & DX: root + per-package READMEs, `ARCHITECTURE.md`, TypeDoc site, two polished example apps (Express + Fastify), `CONTRIBUTING.md` | A new user can go from `npm install` to a working `tools/list` in under 10 minutes following only the README | 2–3 days |
| 7 | Release: name/scope finalized (§9), 0.1.0-alpha published, public repo, release workflow live | `npm install` from the real registry works; announcement-ready | 1–2 days |

**Total: ~23–35 focused engineering days** for a solid 0.1.0, before any external contributions or feedback-driven iteration.

---

## 9. Assumptions & Open Questions (nothing here is silently decided)

These are the calls made to keep the design concrete. Flag any of these you want changed and the relevant LLD section gets revised accordingly.

1. **Package name/scope is not yet chosen** — `@nestjs-mcp/server` is already taken on npm (a different, existing project). Before Phase 0, check availability of a specific name (candidates: `nest-openapi-mcp`, `swagger-to-mcp`, or a personal/org scope like `@onkarsabale/nestjs-mcp`) on both npm and GitHub.
2. **Target versions (corrected 2026-09-22):** NestJS 11 & 12, Express 4 & 5, Fastify 4 & 5, Node ≥18. The original draft's 10/11 matrix is now stale — real-world validation (§9.9) against three independently-built NestJS codebases (nestjs/nest's own sample, Immich, Cal.com) found the current ecosystem squarely on NestJS 12 (`@nestjs/core@12.x`, `@nestjs/swagger@12.x`). Older NestJS (v8/v9/v10) explicitly out of scope for v1.
3. **License:** MIT recommended for adoption-friendliness — needs your confirmation.
4. **Prerequisite:** the in-process mode assumes the target app already uses `@nestjs/swagger` decorators; apps without them get little to no auto-derived schema. This should be documented as a stated limitation with a "add Swagger decorators first" quick guide, not silently degraded behavior. (Partially narrowed by §3.4.1/§9.9: the class-validator fallback now covers the common sub-case of "decorators for validation but not for Swagger," but an app with no annotations of any kind is still out of scope.)
5. **Redis-backed session store is deferred to v1.1** — v1 targets single-instance or sticky-session HTTP deployments, and stdio (inherently single-process, unaffected).
6. **`@modelcontextprotocol/sdk` is the protocol implementation** — not hand-rolling JSON-RPC. This was already the right call in the original draft and is kept as-is.
7. **Default destructive-method exclusion list is `['DELETE']` only** — `PATCH`/`PUT` are treated as safe-by-tag rather than safe-by-verb, on the assumption most APIs gate genuinely dangerous mutations behind their own auth already; open to tightening this if your target APIs disagree.
8. **Positioning/differentiation vs. `rekog-labs/MCP-Nest`** (the dominant existing NestJS↔MCP module, decorator-only) is treated as a marketing/README concern, not an architectural one — the design here stands on its own regardless of how it's positioned, but the README should lead with "zero-annotation Swagger-driven discovery + pipeline-faithful in-process dispatch" since that's the genuine gap in the current ecosystem.
9. **Real-world validation (2026-09-22) against three independently-built NestJS codebases** (nestjs/nest's own sample — real `SwaggerModule.createDocument()` output, not hand-written; Immich; Cal.com API v2 — 399 real operations total) confirmed the core pipeline design holds up outside synthetic fixtures, and surfaced the following, detailed fully in the companion `real-world-validation-report.md` project doc:
   - **class-validator-only DTOs** produce empty tool schemas from `@nestjs/swagger` — a real, common gap, not a corner case. **Fixed**, not just documented: see §3.4.1 (`enrichEmptySchemas`/`buildSchemaFromClassValidator` in `@scope/core`), shipped and tested now rather than deferred to Phase 2.
   - **`oneOf`-composed request bodies** (seen in Cal.com's API v2) resolve and generate valid schemas today, but are harder for some LLM clients to fill in correctly than a flat object — informational, worth revisiting with real usage data once Phase 2 ships; not a defect to fix now.
   - **Array-typed request bodies** (a bare JSON array as the whole body) are handled correctly by the schema engine in theory but weren't exercised by any of the three real corpora — flagged as a theoretical gap needing explicit test coverage before v1.0, not a known bug.
   - The three real OpenAPI documents are now committed as permanent regression fixtures (`packages/core/test/fixtures/real-world/`) with a dedicated suite (`real-world.spec.ts`, §6) run on every test invocation, not just a one-off check.
   - **Open licensing question, not yet resolved:** Immich and Cal.com are AGPL-3.0-licensed projects; their published API specs are bundled here only as test input, but whether that's the right call for the final public distribution (vs. fetching them in CI instead of committing them) needs a legal/licensing sanity-check before v1.0 ships — flagged in `packages/core/test/fixtures/real-world/README.md`, not decided unilaterally.

---

### Appendix — worked example

Given:
```typescript
@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  @McpExpose()
  @ApiOperation({ summary: 'Create an order' })
  @Post()
  create(@Body() dto: CreateOrderDto) { /* ... */ }
}
```
with `discovery: { includeTags: ['orders'] }`, bootstrap produces:
```json
{
  "name": "OrdersController_create",
  "description": "Create an order",
  "inputSchema": {
    "type": "object",
    "properties": { "body": { "type": "object", "properties": { "sku": {"type":"string"}, "qty": {"type":"number"} }, "required": ["sku","qty"] } },
    "required": ["body"],
    "additionalProperties": false
  }
}
```
An LLM call with `{ "body": { "sku": "ABC-1", "qty": 2 } }` is validated, unflattened back into a `POST /orders` request with that JSON body, dispatched through `light-my-request` against the live Express/Fastify instance (running any `ValidationPipe`/Guards exactly as a real client would trigger), and the response is truncated/wrapped and returned as a `CallToolResult`.
