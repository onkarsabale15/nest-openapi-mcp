# Contributing

Thanks for taking a look. This project is early (see `docs/mcp-generator-hld-lld.md` for the full
architecture and `docs/real-world-validation-report.md` for how the design has been validated so far),
so there's a lot of room to help — from Phase 2 (`@mcp-gen/server`) onward, most of the actual product
doesn't exist yet.

## Setup

Requires Node ≥18 and [pnpm](https://pnpm.io) (this repo pins `packageManager` in the root
`package.json`, so `corepack enable` will get you the right version automatically).

```bash
git clone https://github.com/onkarsabale15/nest-openapi-mcp.git
cd nest-openapi-mcp
pnpm install
```

Then, from the repo root (all of these run across every package via Turborepo):

```bash
pnpm build       # tsup build of every package
pnpm lint        # ESLint (strict-type-checked config)
pnpm typecheck   # tsc --noEmit per package
pnpm test        # Vitest per package
```

Run all four before opening a PR — CI runs the same commands and won't pass otherwise. If you're
touching `packages/core`, also make sure `pnpm --filter @mcp-gen/core test` still passes the real-world
regression suite (`test/real-world.spec.ts`) — it runs the full pipeline against three independently
sourced OpenAPI documents (not fixtures written to match our own assumptions) and is the thing most
likely to catch a change that works on synthetic test data but breaks on a real spec.

## Project structure & conventions

- **Module boundaries are enforced, not just documented.** `packages/core` has zero dependency on
  `@nestjs/*` — this is enforced by `eslint-plugin-import-x`'s `no-restricted-paths` rule in
  `eslint.config.mjs`, so a PR that tries to import NestJS into `core` will fail lint, not just review.
  Don't work around the lint rule; if you think `core` genuinely needs a NestJS dependency, that's a
  design discussion to have in an issue first.
- **Strict TypeScript everywhere.** `strict: true` plus `noUncheckedIndexedAccess` and
  `exactOptionalPropertyTypes` across every package. `any` is only allowed at explicitly justified
  adapter boundaries, each with a comment explaining why — don't add a new one without the same.
- **File conventions:** kebab-case filenames, PascalCase classes, one concept per file,
  `*.service.ts` / `*.module.ts` / `*.decorator.ts` / `*.interface.ts` suffixes where they apply,
  `*.spec.ts` colocated with the source it tests.
- **Public API discipline:** each package's `src/index.ts` barrel exports only the intended public
  surface. Internal helpers that shouldn't be part of the package's semver contract go under
  `src/internal/` (once that convention is needed) and are never re-exported from the barrel.
- **TSDoc** on every exported symbol — this is what will eventually generate the reference docs site.

## Commits and PRs

This repo uses [Conventional Commits](https://www.conventionalcommits.org/) (enforced by commitlint in
CI) and a semantic PR title is required. Roughly: `feat: ...`, `fix: ...`, `docs: ...`, `refactor: ...`,
`test: ...`, `chore: ...`.

If your change affects a published package's behavior (anything under `packages/*/src`), add a
changeset:

```bash
pnpm changeset
```

This will ask which packages changed and whether it's a patch/minor/major bump, then write a short
Markdown file under `.changeset/` describing the change — that file is what becomes the changelog entry
and drives the version bump when it's released. A PR that changes package behavior without a changeset
will get flagged in review; docs-only or tooling-only changes don't need one.

## Reporting bugs / requesting features

Use the issue templates — they ask for the specific reproduction details this project actually needs
(NestJS version, Express vs. Fastify, a minimal OpenAPI operation that triggers the bug, etc.), which
saves a round-trip compared to a blank issue.

Found a security issue rather than a regular bug? Please see [SECURITY.md](./SECURITY.md) instead of
opening a public issue.

## Real-world validation fixtures

`packages/core/test/fixtures/real-world/` holds OpenAPI documents pulled from independently-built NestJS
projects (see that directory's own `README.md` for provenance and a licensing note). Don't hand-edit
these files — if you need to refresh one, re-fetch it from the source repo, and if you want to add a new
one, open an issue first so we can talk through the licensing implications (some of these are from
AGPL-3.0-licensed projects, bundled here only as test input).
