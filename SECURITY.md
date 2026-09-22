# Security Policy

## Threat model — read this before you deploy

This project's entire purpose is to take a NestJS API and make some slice of it callable by an LLM.
That is a fundamentally different trust boundary than a documented REST API consumed by human-written
client code: an LLM tool-caller can be manipulated by the content it reads (prompt injection), retries
failing calls in ways a human wouldn't, and has no inherent judgment about which calls are safe to make
in a given context. Treat every `McpModule.forRoot()` deployment as "I am deciding what an autonomous
agent is allowed to do to this API," not "I am documenting an endpoint."

The design's safe-by-default posture (see `docs/mcp-generator-hld-lld.md`, §3.4 and §5) exists because
of this. In short:

- **Nothing is exposed by default.** A fresh install with no configuration exposes zero tools. You have
  to opt endpoints in (by tag or by `@McpExpose()`), not opt them out.
- **`DELETE` is excluded by default**, even for explicitly-tagged/included operations, unless you pass
  `@McpExpose({ force: true })`.
- **Auth is never assumed.** The default `AuthContextProvider` implementations (header passthrough for
  HTTP/SSE, an env var for stdio) are documented as local-development starting points, not production
  auth strategies. Implement `AuthContextProvider` yourself for anything that isn't a toy.
- **Error messages are masked by default** (no stack traces, no connection strings) unless you
  explicitly set `debug: true` — don't do that in production.
- **Every tool input is validated against its JSON Schema** with `additionalProperties: false`, so an
  LLM can't smuggle extra fields past what the OpenAPI spec declared.

If you find a way any of these guarantees don't actually hold — a code path that exposes an endpoint it
shouldn't, a way to bypass schema validation, a way an excluded method still ends up callable — that's a
security bug in this library, not just a regular bug. Please report it privately (see below) rather than
opening a public issue.

## Supported versions

This project is pre-1.0 and under active development. Until a 1.0 release, security fixes land on the
latest published version only; there is no LTS branch to backport to yet.

## Reporting a vulnerability

Please **do not** open a public GitHub issue for a suspected security vulnerability.

Instead, use GitHub's private vulnerability reporting for this repository:
**https://github.com/onkarsabale15/nest-openapi-mcp/security/advisories/new**

If that isn't available, email the maintainer directly at **onkarsabale15@gmail.com** with:

- A description of the vulnerability and its impact (what an attacker/malicious LLM caller could
  actually do).
- Steps to reproduce, or a minimal repro project if possible.
- The version(s) affected.

You should expect an initial response within a few days. This is currently a solo-maintained project,
so please be patient with turnaround — a private report is still the right call even if the fix takes a
while, since it avoids a public 0-day window.

## Scope

In scope: the `@onkarsabale15/mcp-gen-common`, `@onkarsabale15/mcp-gen-core`, `@onkarsabale15/mcp-gen-server`, and `@onkarsabale15/mcp-gen-cli` packages in this
repository. Vulnerabilities in upstream dependencies (`@nestjs/*`, `@modelcontextprotocol/sdk`,
`class-validator`, etc.) should be reported to those projects directly, though we'd appreciate a heads
up if one affects how this library uses them.

Out of scope: vulnerabilities in an application *built with* this library that stem from that
application's own configuration choices (e.g., a developer setting `discovery.mode: 'all'` in
production, or implementing a weak `AuthContextProvider`) — those are configuration/usage issues, not
library vulnerabilities, though we're glad to help think through them via a regular issue.
