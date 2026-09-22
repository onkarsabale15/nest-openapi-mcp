import { describe, expect, it, vi } from 'vitest';
import { ToolRegistrationConflictError, type McpToolDefinition } from '@onkarsabale15/mcp-gen-common';
import { ToolRegistry } from '../src/registry/tool-registry.js';

function def(name: string): McpToolDefinition {
  return { name, description: 'x', inputSchema: { type: 'object', properties: {} } };
}

describe('ToolRegistry', () => {
  it('registers and looks up a tool by name', () => {
    const registry = new ToolRegistry();
    const executor = vi.fn();
    registry.register(def('foo'), executor);
    expect(registry.has('foo')).toBe(true);
    expect(registry.get('foo')?.executor).toBe(executor);
    expect(registry.size).toBe(1);
  });

  it('lists all registered tool definitions', () => {
    const registry = new ToolRegistry();
    registry.register(def('a'), vi.fn());
    registry.register(def('b'), vi.fn());
    expect(
      registry
        .list()
        .map((d) => d.name)
        .sort(),
    ).toEqual(['a', 'b']);
  });

  it('throws ToolRegistrationConflictError on a duplicate name instead of silently overwriting', () => {
    const registry = new ToolRegistry();
    registry.register(def('dup'), vi.fn());
    const secondExecutor = vi.fn();
    expect(() => {
      registry.register(def('dup'), secondExecutor);
    }).toThrow(ToolRegistrationConflictError);
    // The original registration must survive the failed second attempt.
    expect(registry.get('dup')?.executor).not.toBe(secondExecutor);
  });

  it('returns undefined for an unregistered name rather than throwing', () => {
    const registry = new ToolRegistry();
    expect(registry.get('missing')).toBeUndefined();
    expect(registry.has('missing')).toBe(false);
  });
});
