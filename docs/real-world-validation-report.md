# Real-World Validation Report — `@mcp-gen/core`

**Date:** 2026-09-22 · **Scope:** Ran the built `@mcp-gen/core` package (ref resolution, parameter flattening, tool naming, truncation) against OpenAPI documents from three real, NestJS-backed projects — not synthetic test fixtures.

## What was tested and how each spec was obtained

| Project | How the spec was obtained | Why it matters |
|---|---|---|
| **[nestjs/nest sample/11-swagger](https://github.com/nestjs/nest/tree/master/sample/11-swagger)** | Fetched the *actual source files* from GitHub, installed real `@nestjs/core@12.0.3` / `@nestjs/swagger@12.0.1`, compiled with real `tsc` (not a bundler), and ran the real `SwaggerModule.createDocument()` — the JSON tested is genuinely NestJS-runtime-generated, not hand-written. | This is the one true end-to-end check: does a document actually produced by `@nestjs/swagger` at runtime work, not just a document that looks like one. |
| **[immich-app/immich](https://github.com/immich-app/immich/blob/main/open-api/immich-openapi-specs.json)** | Committed spec, fetched directly from the repo. | Large (519 KB, 192 path items, 276 operations), real production NestJS backend. |
| **[calcom/cal.com API v2](https://github.com/calcom/cal.com/blob/main/docs/api-reference/v2/openapi.json)** | Committed spec, fetched directly from the repo. | 349 KB, 121 operations, real production NestJS backend with a documented history of duplicate `operationId`s ([issue #29903](https://github.com/calcom/cal.diy/issues/29903)) — a direct real-world stress test of the tool-name dedup logic. |

**Total: 399 real operations across 3 independently-built NestJS codebases.**

## Results

- **Zero crashes.** All 399 operations, under the default (`nested`) parameter strategy, produced a valid `McpToolDefinition` with no exceptions, across all three specs.
- **`$ref` resolution never failed**, including on Immich's 519 KB document (90ms) and Cal.com's 349 KB document (29ms) — both far larger and more deeply cross-referenced than the synthetic fixtures in the unit test suite.
- **The `flat` (opt-in) strategy's collision detection fired correctly on real data**: Immich's `PUT /faces/{id}` (`reassignFacesById`) has a path parameter named `id` *and* a body field named `id` — exactly the ambiguous case the design doc's ADR #3 was written around. Under `flat`, this correctly throws `SchemaResolutionError` at plan time instead of silently corrupting the schema; under the default `nested` strategy it's a non-issue (the body is namespaced away entirely). This is the first time that code path has been exercised by data it wasn't written to expect.
- **Cal.com's historical duplicate-`operationId` issue is no longer present** in the current `main` branch (it was fixed upstream after the linked issue), so the dedup loop wasn't forced to fire on this pass — but it's now proven harmless overhead when names are already unique, and the unit tests already cover the collision path directly.
- **Tool name lengths stayed well under the 64-char cap** in all three specs (max observed: 60, on Cal.com) — no real-world dedup-under-truncation case was exercised, though the synthetic unit tests already cover that boundary.

## Two real gaps this surfaced

**1. Empty body schemas when a NestJS app uses `class-validator` without `@ApiProperty()` or the Swagger CLI plugin — a common, not edge-case, pattern.**

The `nestjs-sample-11-swagger` run reproduced this directly: `CreateCatDto` is decorated only with `class-validator`'s `@IsString()`/`@IsInt()` — no `@ApiProperty()`, and the sample doesn't use `@nestjs/swagger`'s CLI plugin (which can auto-generate `@ApiProperty()` from TS types at build time). The result: `SwaggerModule.createDocument()` itself emits `"CreateCatDto": { "type": "object", "properties": {} }` — completely empty. `@mcp-gen/core` faithfully carries that through: the generated tool's `body` schema has zero properties, so an LLM caller gets no guidance at all about what fields `create_cat` actually needs.

This isn't a bug in `@mcp-gen/core` — it's correctly reflecting what `@nestjs/swagger` gave it. But it's a real crack in the "zero-annotation, works against your existing app" pitch (design doc §0), because plenty of real NestJS codebases use `class-validator` alone for request validation and never bother with `@ApiProperty()`. **This needs a decision before Phase 2 goes further:**
- (a) document it as a hard prerequisite (app must have `@ApiProperty()` or the CLI plugin enabled) and have `McpModule` emit a loud bootstrap warning listing every tool with an empty/near-empty body schema, or
- (b) have the discovery service optionally read `class-validator`'s own metadata storage (`getMetadataStorage()`) as a fallback source of property names/types when the Swagger-derived schema is empty — more work, but closer to the "zero-annotation" promise actually holding up against a random real app.

**2. Composed (`oneOf`) request bodies pass through opaquely — safe, but unexercised until now.**

Cal.com's `POST /v2/bookings`, `/reschedule`, `/cancel`, and `/v2/auth/oauth2/token` all use `oneOf`-composed request body schemas (different shapes depending on the event type). `@mcp-gen/core` doesn't crash on these — the `nested` strategy just embeds the raw schema (including `oneOf`) under `body` as-is, which is valid JSON Schema and type-checks fine against `JsonSchemaProperty`'s index signature. No fix needed, but worth documenting explicitly: nothing in `@mcp-gen/core` validates or simplifies `oneOf`/`anyOf`/`allOf` — an LLM caller sees the raw union and has to reason about it itself.

No `array`-typed top-level request bodies (e.g. a bulk-create endpoint accepting `[{...}, {...}]`) appeared in any of the three real specs, so that theoretical gap in the `flat` strategy (`bodySchema.properties` is `undefined` on an array schema, silently merging nothing) remains unexercised by real data — still worth a defensive fix and a unit test before Phase 2, since it's a real, if rarer, REST pattern.

## Also surfaced: the version support matrix in the design doc is already out of date

The `nestjs-sample-11-swagger` run pulled `@nestjs/core@12.0.3` and `@nestjs/swagger@12.0.1` — **NestJS is now on major version 12**, not 10/11 as the design doc's NFR section and roadmap assumed. The version support matrix (design doc §2.5, §9) needs updating before Phase 2 locks in peer dependency ranges.
