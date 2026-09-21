export interface TruncationOptions {
  /** Max serialized byte size of the primary content block. Default 25_000 — see McpModuleOptions.execution. */
  maxBytes: number;
}

export interface TruncationResult {
  text: string;
  truncated: boolean;
  /** Only set when `payload` was an array and some items were dropped. */
  omitted?: number;
}

/**
 * Serializes `payload` to JSON, and if it's over `maxBytes`, truncates it.
 *
 * Arrays get special handling: a binary search finds the largest prefix that fits under the byte
 * budget, so the caller gets as much real data as fits rather than an arbitrarily-cut blob. Any
 * other oversized payload (a single huge object, a huge string) falls back to a hard substring
 * cut — uglier, but safe, and rare in practice (most oversized MCP tool results are "too many
 * rows," which is the array case).
 *
 * This function only produces the truncated *text* and whether/how much was cut — turning that
 * into a spec-compliant `CallToolResult` with a human-readable warning as an extra `content`
 * block (not a custom top-level field — see design doc §3.10/§5) is the dispatcher's job, not
 * this one, so this stays a pure, easily-tested function.
 */
export function truncateResult(payload: unknown, opts: TruncationOptions): TruncationResult {
  // `payload` is `unknown`, so it can legitimately be `undefined` (e.g. a 204 No Content tool
  // result) — JSON.stringify(undefined) really does return `undefined` at runtime. TS's lib types
  // claim JSON.stringify always returns `string`, so the type-aware linter sees this as
  // unreachable; it isn't. Everywhere else below operates on an already-narrowed array, where the
  // return-type claim is accurate, so no disable is needed there.
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  const full = JSON.stringify(payload) ?? 'null';
  if (Buffer.byteLength(full, 'utf8') <= opts.maxBytes) {
    return { text: full, truncated: false };
  }

  if (Array.isArray(payload)) {
    let lo = 0;
    let hi = payload.length;
    let best = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const candidate = JSON.stringify(payload.slice(0, mid));
      if (Buffer.byteLength(candidate, 'utf8') <= opts.maxBytes) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return {
      text: JSON.stringify(payload.slice(0, best)),
      truncated: true,
      omitted: payload.length - best,
    };
  }

  // Last-resort fallback for a single oversized object/string: a hard cut is not pretty, but it
  // is safe (bounded output size) and this path is rare — the array case above is what almost
  // every real "too much data" MCP tool result actually looks like.
  return { text: `${full.slice(0, opts.maxBytes)}…`, truncated: true };
}
