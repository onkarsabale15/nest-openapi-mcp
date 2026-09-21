import { ToolRegistrationConflictError, type McpToolDefinition, type ToolExecutor } from '@mcp-gen/common';

interface RegisteredTool {
  definition: McpToolDefinition;
  executor: ToolExecutor;
}

/**
 * In-memory map of tool name -> {definition, executor}. Conflict detection happens here, at
 * registration time (i.e. at bootstrap) — never at call time. A conflict is always a bootstrap
 * bug (buildToolName's de-dup should have prevented it, or two independent registration sources —
 * e.g. OpenAPI discovery and a decorator-based tool — landed on the same name by coincidence), so
 * it fails loudly and immediately rather than silently letting the second registration win.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredTool>();

  register(definition: McpToolDefinition, executor: ToolExecutor): void {
    if (this.tools.has(definition.name)) {
      throw new ToolRegistrationConflictError(definition.name);
    }
    this.tools.set(definition.name, { definition, executor });
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }

  list(): McpToolDefinition[] {
    return [...this.tools.values()].map((entry) => entry.definition);
  }

  get size(): number {
    return this.tools.size;
  }
}
