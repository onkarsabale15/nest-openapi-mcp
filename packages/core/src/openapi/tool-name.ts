import type { OpenApiOperation } from './types.js';

const MAX_TOOL_NAME_LENGTH = 64;
const INVALID_CHARS = /[^a-zA-Z0-9_-]/g;

/**
 * Builds a spec-compliant tool name (`^[a-zA-Z0-9_-]{1,64}$`) and de-duplicates it against every
 * name already registered in this bootstrap pass.
 *
 * `@nestjs/swagger` auto-generates `operationId` as `ControllerName_methodName` when a developer
 * hasn't set one explicitly, which is already collision-resistant across a normal app — the
 * de-dup loop below exists for the edge cases: an explicitly-set `operationId` that collides with
 * another, or a fallback name (built from method+path when there's no `operationId` at all) that
 * collides after sanitization strips punctuation two different paths both happened to use.
 *
 * `used` is mutated (the winning candidate is added to it) — callers iterate operations and pass
 * the same `Set` across the whole bootstrap pass so names stay unique app-wide, not just pairwise.
 */
export function buildToolName(
  operation: OpenApiOperation,
  method: string,
  path: string,
  used: Set<string>,
): string {
  const base = operation.operationId ?? `${method}_${path}`;
  const sanitized = base.replace(INVALID_CHARS, '_').slice(0, MAX_TOOL_NAME_LENGTH) || 'tool';

  let candidate = sanitized;
  let attempt = 2;
  while (used.has(candidate)) {
    const suffix = `_${attempt.toString()}`;
    candidate = sanitized.slice(0, MAX_TOOL_NAME_LENGTH - suffix.length) + suffix;
    attempt += 1;
  }

  used.add(candidate);
  return candidate;
}
