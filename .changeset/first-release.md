---
"@onkarsabale15/mcp-gen-core": minor
"@onkarsabale15/mcp-gen-common": minor
---

First publishable release of the OpenAPI → MCP schema engine: `$ref` resolution, parameter
flattening, tool naming/de-duplication, a tool registry, response truncation, and a
class-validator fallback for DTOs that `@nestjs/swagger` leaves empty. Validated against three
independently-built real-world NestJS OpenAPI documents (see
`docs/real-world-validation-report.md`).

`@onkarsabale15/mcp-gen-server` and `@onkarsabale15/mcp-gen-cli` remain private placeholders and
are not published yet.
