import type { JsonSchemaProperty } from '@mcp-gen/common';

/**
 * A deliberately minimal slice of the OpenAPI 3.0/3.1 Operation Object — only the fields the
 * schema engine actually reads. We take a dereferenced document (see ref-resolver.ts) as input,
 * so by the time anything here runs there should be no `$ref` left to resolve.
 */
export interface OpenApiParameter {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: { type?: string; enum?: readonly unknown[] };
}

export interface OpenApiRequestBody {
  required?: boolean;
  content?: {
    'application/json'?: {
      schema?: JsonSchemaProperty;
    };
  };
}

export interface OpenApiOperation {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: OpenApiParameter[];
  requestBody?: OpenApiRequestBody;
}

export interface OpenApiPathItem {
  [method: string]: OpenApiOperation | undefined;
}

export interface OpenApiDocument {
  paths: Record<string, OpenApiPathItem>;
  components?:
    | {
        schemas?: Record<string, JsonSchemaProperty> | undefined;
      }
    | undefined;
  [extra: string]: unknown;
}
