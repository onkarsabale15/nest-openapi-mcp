/**
 * Minimal JSON-RPC 2.0 vocabulary shared across packages. We do not reimplement the protocol —
 * `@modelcontextprotocol/sdk` owns that — this only covers the pieces our own error-mapping code
 * (see @onkarsabale15/mcp-gen-server dispatch layer) needs to reason about explicitly.
 *
 * Reserved/standard JSON-RPC error codes we map onto — see design doc §3.9 for the full table of
 * which situations map to a protocol-level error here versus a `CallToolResult.isError` tool error.
 */
export const JsonRpcErrorCode = {
  /** Unknown tool name requested. */
  MethodNotFound: -32601,
  /** `args` failed JSON Schema validation against the tool's `inputSchema`. */
  InvalidParams: -32602,
  /** Uncaught bug inside the dispatch engine itself — never a downstream API failure. */
  InternalError: -32603,
} as const;

export type JsonRpcErrorCode = (typeof JsonRpcErrorCode)[keyof typeof JsonRpcErrorCode];

export interface JsonRpcError {
  code: JsonRpcErrorCode;
  message: string;
  data?: unknown;
}
