/**
 * Shared types for mcp-generator. This file has zero dependency on NestJS or any HTTP framework —
 * see design doc ADR #4: @mcp-gen/core (and by extension @mcp-gen/common) must stay framework-agnostic
 * so the in-process (server) and proxy (cli) execution modes share one definition of "what a tool is."
 */

/** A JSON Schema object, restricted to the subset MCP tool `inputSchema`s actually use. */
export interface JsonSchemaObject {
  type: 'object';
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  /**
   * Defaults to `false` at generation time (see core §3.5 in the design doc) so an LLM caller
   * cannot smuggle extra fields into a request beyond what the OpenAPI spec declared. Left
   * optional here (rather than defaulted in the type) so a caller must make the choice explicit
   * wherever a JsonSchemaObject is constructed.
   */
  additionalProperties?: boolean;
  description?: string;
}

/**
 * A single property inside a tool's `inputSchema`. Intentionally loose (`unknown` for nested
 * schema-shaped values) because it may be a raw OpenAPI schema fragment carried through verbatim
 * (e.g. a request body schema nested under `body`) rather than something we constructed ourselves.
 */
export interface JsonSchemaProperty {
  type?: string;
  description?: string;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  items?: JsonSchemaProperty;
  enum?: readonly unknown[];
  [extra: string]: unknown;
}

/** MCP tool metadata, as produced by @mcp-gen/core and registered with the SDK's Server. */
export interface McpToolDefinition {
  /** Must match ^[a-zA-Z0-9_-]{1,64}$ — enforced by buildToolName(), never trust an external value here. */
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  /** Provenance metadata — not sent to the MCP client, useful for logging/debugging/tests. */
  _meta?: {
    operationId?: string | undefined;
    httpMethod?: string | undefined;
    path?: string | undefined;
  };
}

/** A single MCP tool-result content block. Mirrors the subset of the MCP spec's ContentBlock union we emit. */
export interface TextContentBlock {
  type: 'text';
  text: string;
}

export interface ToolExecutionResult {
  content: TextContentBlock[];
  isError: boolean;
}

/**
 * Context about the inbound MCP request that a dispatcher needs in order to resolve an
 * AuthContext and to log/trace the call. Distinct per transport — see design doc §3.8/§3.9.
 */
export interface McpRequestExtra {
  transport: 'stdio' | 'http' | 'sse';
  sessionId?: string;
  /** Present for the http/sse transports only. */
  rawHeaders?: Record<string, string>;
  /** Present for the stdio transport only (no inbound HTTP headers exist there). */
  env?: NodeJS.ProcessEnv;
  /** Correlation id for structured logging / tracing — generated once per call by the dispatcher. */
  correlationId: string;
}

/**
 * A tool executor is the one shape both the in-process dispatcher (@mcp-gen/server) and the proxy
 * dispatcher (@mcp-gen/cli) implement. Everything downstream of "get a raw result" — validation,
 * truncation, error-mapping — is shared code that only depends on this contract.
 */
export type ToolExecutor = (
  args: Record<string, unknown>,
  extra: McpRequestExtra,
) => Promise<RawExecutionResult>;

/** The not-yet-truncated, not-yet-wrapped result of actually running a tool. */
export interface RawExecutionResult {
  data: unknown;
  httpStatus?: number;
  isError: boolean;
  /** Human-readable message when isError is true. Already sanitized by the dispatcher (see §3.9). */
  errorMessage?: string;
}
