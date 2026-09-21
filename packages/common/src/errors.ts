/** Thrown at bootstrap when two operations resolve to the same sanitized tool name. Never thrown at call time. */
export class ToolRegistrationConflictError extends Error {
  constructor(toolName: string) {
    super(
      `Tool name conflict: "${toolName}" is already registered. This should be impossible — ` +
        `buildToolName() is supposed to de-duplicate names before registration. If you see this, ` +
        `it's a bug in the registry, not a bug in your API.`,
    );
    this.name = 'ToolRegistrationConflictError';
  }
}

/** Thrown when the OpenAPI → tool schema pipeline cannot produce a valid schema for an operation. */
export class SchemaResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SchemaResolutionError';
  }
}

/**
 * Represents a tool that *ran* but failed — as opposed to a JSON-RPC protocol error. See design
 * doc §3.9: this is caught by the dispatcher and turned into a `CallToolResult` with
 * `isError: true`, never surfaced as a JSON-RPC error object.
 */
export class McpToolExecutionError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = 'McpToolExecutionError';
  }
}
