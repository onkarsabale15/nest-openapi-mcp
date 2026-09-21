import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { buildSchemaFromClassValidator, enrichEmptySchemas } from '../src/openapi/class-validator-fallback.js';
import type { OpenApiDocument } from '../src/openapi/types.js';

// Mirrors the real nestjs/nest sample/11-swagger `CreateCatDto` — the exact shape the real-world
// validation pass found produces a completely empty `@nestjs/swagger` schema, since it's
// decorated with class-validator alone and the app doesn't use `@ApiProperty()` or the Swagger
// CLI plugin.
class CreateCatDto {
  @IsString()
  name!: string;

  @IsInt()
  age!: number;

  @IsString()
  breed!: string;
}

class UpdateProfileDto {
  @IsString()
  @IsOptional()
  bio?: string;

  @IsString()
  displayName!: string;
}

describe('buildSchemaFromClassValidator', () => {
  it('derives property types from class-validator decorators', () => {
    const schema = buildSchemaFromClassValidator(CreateCatDto);
    expect(schema.type).toBe('object');
    expect(schema.properties).toEqual({
      name: { type: 'string' },
      age: { type: 'integer' },
      breed: { type: 'string' },
    });
    expect(schema.required?.sort()).toEqual(['age', 'breed', 'name']);
  });

  it('excludes @IsOptional() properties from required, without dropping their type', () => {
    const schema = buildSchemaFromClassValidator(UpdateProfileDto);
    expect(schema.properties.bio).toEqual({ type: 'string' });
    expect(schema.required).toEqual(['displayName']);
  });
});

describe('enrichEmptySchemas', () => {
  function docWith(schemas: OpenApiDocument['components']): OpenApiDocument {
    return { paths: {}, components: schemas };
  }

  it('replaces a genuinely empty named schema when a matching class is registered', () => {
    const document = docWith({
      schemas: { CreateCatDto: { type: 'object', properties: {} } },
    });
    const enriched = enrichEmptySchemas(document, { CreateCatDto });
    expect(enriched.components?.schemas?.CreateCatDto?.properties).toEqual({
      name: { type: 'string' },
      age: { type: 'integer' },
      breed: { type: 'string' },
    });
  });

  it('never touches a schema that already has real properties, even just one', () => {
    const document = docWith({
      schemas: {
        CreateCatDto: { type: 'object', properties: { name: { type: 'string', example: 'Kitty' } } },
      },
    });
    const enriched = enrichEmptySchemas(document, { CreateCatDto });
    expect(enriched.components?.schemas?.CreateCatDto?.properties).toEqual({
      name: { type: 'string', example: 'Kitty' },
    });
  });

  it('leaves an empty schema alone when no matching class was registered', () => {
    const document = docWith({ schemas: { Unregistered: { type: 'object', properties: {} } } });
    const enriched = enrichEmptySchemas(document, { CreateCatDto });
    expect(enriched.components?.schemas?.Unregistered?.properties).toEqual({});
  });

  it('does not mutate the document it was given', () => {
    const document = docWith({ schemas: { CreateCatDto: { type: 'object', properties: {} } } });
    const before = JSON.stringify(document);
    enrichEmptySchemas(document, { CreateCatDto });
    expect(JSON.stringify(document)).toBe(before);
  });

  it('is a no-op when the document has no components.schemas at all', () => {
    const document: OpenApiDocument = { paths: {} };
    expect(enrichEmptySchemas(document, { CreateCatDto })).toBe(document);
  });
});
