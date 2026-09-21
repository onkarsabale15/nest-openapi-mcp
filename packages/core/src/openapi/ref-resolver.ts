import $RefParser from '@apidevtools/json-schema-ref-parser';
import type { OpenApiDocument } from './types.js';

/**
 * Fully dereferences an OpenAPI document — every `$ref` (including circular ones, which
 * `dereference()` handles by inserting object references rather than infinitely expanding) is
 * replaced with the schema it points to. Everything downstream of this function assumes a
 * `$ref`-free document; keeping that assumption isolated to one call site is what lets
 * `parameter-flattener.ts` and `operation-to-tool.ts` stay simple, synchronous, pure functions.
 *
 * Takes the document object directly (e.g. the return value of `SwaggerModule.createDocument()`,
 * or `JSON.parse()` of a fetched spec) rather than a file path or URL — resolving *where the
 * document came from* is the caller's job (server bootstrap, or the CLI's fetch-or-read step).
 */
export async function resolveRefs(document: unknown): Promise<OpenApiDocument> {
  // `dereference` mutates and returns the same object graph it was given; clone first so callers
  // that hang on to their own reference to `document` don't get a surprise in-place mutation.
  const clone = structuredClone(document);
  const resolved = await $RefParser.dereference(clone as Record<string, unknown>);
  return resolved as OpenApiDocument;
}
