import { getMetadataStorage } from 'class-validator';
import type { JsonSchemaObject, JsonSchemaProperty } from '@onkarsabale15/mcp-gen-common';
import type { OpenApiDocument } from './types.js';

/** A DTO class constructor, as `@Body()`/DTO parameter types actually are. */
export type ClassConstructor = new (...args: never[]) => object;

/**
 * Maps a class-validator decorator's registered constraint name (`meta.name`, e.g. `'isString'`
 * for `@IsString()`) to the JSON Schema shape it implies. Deliberately not exhaustive — this
 * covers the common cases; an unrecognized decorator just means that property falls back to no
 * declared type rather than a wrong one.
 */
const DECORATOR_TYPE_MAP: Readonly<Record<string, JsonSchemaProperty>> = {
  isString: { type: 'string' },
  isNumber: { type: 'number' },
  isInt: { type: 'integer' },
  isPositive: { type: 'number' },
  isNegative: { type: 'number' },
  isBoolean: { type: 'boolean' },
  isBooleanString: { type: 'string' },
  isNumberString: { type: 'string' },
  isDate: { type: 'string', format: 'date-time' },
  isDateString: { type: 'string', format: 'date-time' },
  isArray: { type: 'array' },
  isEmail: { type: 'string', format: 'email' },
  isUrl: { type: 'string', format: 'uri' },
  isUuid: { type: 'string', format: 'uuid' },
  isEnum: { type: 'string' },
  isObject: { type: 'object' },
};

/**
 * Fallback schema source for a case the real-world validation pass found is common, not rare: a
 * NestJS app validates its DTOs with `class-validator` alone — no `@ApiProperty()`, no Swagger
 * CLI plugin — so `@nestjs/swagger` emits a genuinely empty `{ type: 'object', properties: {} }`
 * schema for that DTO. class-validator's own metadata storage still knows every property name
 * and, from which decorator validates it, a reasonable JSON Schema type — enough to give an LLM
 * caller *something* to go on instead of an empty object with no guidance at all.
 *
 * This is deliberately best-effort, not a replacement for real `@ApiProperty()` metadata:
 * class-validator decorators describe validation rules, not exact JSON Schema types (e.g.
 * `@IsEnum()` doesn't carry the enum's actual values through this path the way
 * `@ApiProperty({ enum: [...] })` would). It only ever fires on a schema that is genuinely empty
 * — see `enrichEmptySchemas` below, which is the only caller that should invoke this.
 */
export function buildSchemaFromClassValidator(cls: ClassConstructor): JsonSchemaObject {
  const metadatas = getMetadataStorage().getTargetValidationMetadatas(cls, cls.name, false, false);

  const properties: Record<string, JsonSchemaProperty> = {};
  const optional = new Set<string>();

  for (const meta of metadatas) {
    // class-validator types `name`/`propertyName` as optional even though every decorator we
    // care about here always sets both; skip anything that genuinely doesn't rather than assume.
    if (!meta.name || !meta.propertyName) continue;
    if (meta.name === 'isOptional') {
      optional.add(meta.propertyName);
      continue;
    }
    const mapped = DECORATOR_TYPE_MAP[meta.name];
    if (!mapped) continue;
    // First matching decorator for a property wins — mirrors the same "one type per property"
    // simplification @nestjs/swagger's own CLI-plugin type inference makes.
    properties[meta.propertyName] ??= { ...mapped };
  }

  const required = Object.keys(properties).filter((name) => !optional.has(name));
  return { type: 'object', properties, required };
}

/**
 * Walks `document.components.schemas`; for every named schema that is genuinely empty (no
 * properties) AND has a matching entry in `classRegistry` (schema component name -> the DTO
 * class that produced it — `@nestjs/swagger` names a component after the class by default, so
 * this is usually a direct name match a caller can build straight from its own DTO imports),
 * replaces it with the class-validator-derived schema from `buildSchemaFromClassValidator`.
 * Every other schema — including one with even a single real property — is left untouched.
 *
 * Intended to run *before* `resolveRefs()`, so the enrichment flows through `$ref` resolution
 * like any other schema. Returns a new document; never mutates the one it was given.
 */
export function enrichEmptySchemas(
  document: OpenApiDocument,
  classRegistry: Record<string, ClassConstructor>,
): OpenApiDocument {
  const schemas = document.components?.schemas;
  if (!schemas) return document;

  const clone = structuredClone(document);
  const cloneSchemas = clone.components?.schemas;
  if (!cloneSchemas) return clone;

  for (const [name, schema] of Object.entries(schemas)) {
    const isEmptyObjectSchema =
      schema.type === 'object' && (!schema.properties || Object.keys(schema.properties).length === 0);
    const cls = classRegistry[name];
    if (isEmptyObjectSchema && cls) {
      // JsonSchemaObject (no index signature, since it's our own strict shape) is always a
      // structurally valid JsonSchemaProperty (which allows arbitrary extra keys) — the cast is
      // just satisfying the index signature TS otherwise demands, not papering over a real gap.
      cloneSchemas[name] = buildSchemaFromClassValidator(cls) as JsonSchemaProperty;
    }
  }

  return clone;
}
