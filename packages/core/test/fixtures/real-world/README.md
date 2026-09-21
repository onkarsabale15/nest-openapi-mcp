# Real-world OpenAPI fixtures

These are unmodified OpenAPI documents pulled from real, independently-built NestJS projects,
used to regression-test `@mcp-gen/core` against data it wasn't written to expect — see
`real-world-validation-report.md` in the project docs for the original findings from this corpus.

| File | Source | License note |
|---|---|---|
| `immich.json` | [immich-app/immich](https://github.com/immich-app/immich/blob/main/open-api/immich-openapi-specs.json), `open-api/immich-openapi-specs.json` | AGPL-3.0-licensed project; this is their published API surface description, included here only as test input, not redistributed as part of this package's own source. |
| `calcom-api-v2.json` | [calcom/cal.com](https://github.com/calcom/cal.com/blob/main/docs/api-reference/v2/openapi.json), `docs/api-reference/v2/openapi.json` | AGPL-3.0-licensed project; same note as above. |
| `nestjs-sample-11-swagger.json` | Generated locally by running the real [nestjs/nest sample/11-swagger](https://github.com/nestjs/nest/tree/master/sample/11-swagger) app (`@nestjs/core@12.0.3`, `@nestjs/swagger@12.0.1`) through the actual `SwaggerModule.createDocument()` — not hand-written, and not copied from anywhere. |

**To refresh a fixture** (e.g. after upstream changes), re-fetch the committed file directly from
the source repo, or — for the NestJS sample — re-run its `main.ts` with `SwaggerModule.createDocument()`
writing to a file instead of calling `app.listen()`. Do not hand-edit these files; a hand-edit
defeats the point of testing against data nobody curated for us.

Before publishing this package, confirm with legal/licensing review whether bundling these
third-party specs as test fixtures (vs. fetching them in CI) is the right call for the final
distribution — flagged here rather than decided unilaterally.
