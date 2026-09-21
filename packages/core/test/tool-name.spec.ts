import { describe, expect, it } from 'vitest';
import { buildToolName } from '../src/openapi/tool-name.js';
import type { OpenApiOperation } from '../src/openapi/types.js';

function op(operationId?: string): OpenApiOperation {
  return operationId ? { operationId } : {};
}

describe('buildToolName', () => {
  it('uses operationId when present', () => {
    const used = new Set<string>();
    expect(buildToolName(op('OrdersController_create'), 'post', '/orders', used)).toBe(
      'OrdersController_create',
    );
  });

  it('falls back to method+path when operationId is missing', () => {
    const used = new Set<string>();
    // base is `${method}_${path}` = "get_/users/{id}" -> every '/', '{', '}' becomes '_'.
    expect(buildToolName(op(), 'get', '/users/{id}', used)).toBe('get__users__id_');
  });

  it('sanitizes characters outside [a-zA-Z0-9_-]', () => {
    const used = new Set<string>();
    expect(buildToolName(op('Weird Name!!'), 'get', '/x', used)).toBe('Weird_Name__');
  });

  it('truncates to 64 characters', () => {
    const used = new Set<string>();
    const longId = 'a'.repeat(100);
    const name = buildToolName(op(longId), 'get', '/x', used);
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toBe('a'.repeat(64));
  });

  it('de-duplicates colliding names deterministically within one bootstrap pass', () => {
    const used = new Set<string>();
    const first = buildToolName(op('dup'), 'get', '/a', used);
    const second = buildToolName(op('dup'), 'get', '/b', used);
    const third = buildToolName(op('dup'), 'get', '/c', used);
    expect(first).toBe('dup');
    expect(second).toBe('dup_2');
    expect(third).toBe('dup_3');
    expect(new Set([first, second, third]).size).toBe(3);
  });

  it('de-duplicates while respecting the 64-char cap, never producing a name over the limit', () => {
    const used = new Set<string>();
    const longId = 'b'.repeat(64);
    const first = buildToolName(op(longId), 'get', '/a', used);
    const second = buildToolName(op(longId), 'get', '/b', used);
    expect(first.length).toBe(64);
    expect(second.length).toBe(64);
    expect(second.endsWith('_2')).toBe(true);
    expect(first).not.toBe(second);
  });

  it('never produces an empty name even for a fully-sanitized-away id', () => {
    const used = new Set<string>();
    expect(buildToolName(op('!!!'), 'get', '', used)).toBe('___');
  });
});
