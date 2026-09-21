import { describe, expect, it } from 'vitest';
import { truncateResult } from '../src/truncation/truncate.js';

describe('truncateResult', () => {
  it('returns the payload untouched when under the byte budget', () => {
    const result = truncateResult({ hello: 'world' }, { maxBytes: 1000 });
    expect(result.truncated).toBe(false);
    expect(JSON.parse(result.text)).toEqual({ hello: 'world' });
  });

  it('handles an empty array without truncating', () => {
    const result = truncateResult([], { maxBytes: 10 });
    expect(result.truncated).toBe(false);
    expect(result.text).toBe('[]');
  });

  it('binary-searches the largest array prefix that fits, and reports the omitted count', () => {
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: i, name: `item-${i.toString()}` }));
    const result = truncateResult(items, { maxBytes: 2000 });
    expect(result.truncated).toBe(true);
    const parsed: unknown[] = JSON.parse(result.text);
    expect(Buffer.byteLength(result.text, 'utf8')).toBeLessThanOrEqual(2000);
    expect(result.omitted).toBe(1000 - parsed.length);
    // The prefix must be the largest one that still fits — adding one more item should not fit.
    const oneMore = JSON.stringify(items.slice(0, parsed.length + 1));
    expect(Buffer.byteLength(oneMore, 'utf8')).toBeGreaterThan(2000);
  });

  it('falls back to a hard substring cut for a single oversized object', () => {
    const huge = { blob: 'x'.repeat(5000) };
    const result = truncateResult(huge, { maxBytes: 100 });
    expect(result.truncated).toBe(true);
    expect(result.omitted).toBeUndefined();
    expect(result.text.startsWith('{"blob":"xxx')).toBe(true);
    expect(result.text.endsWith('…')).toBe(true);
    // 100 ascii bytes sliced + the trailing ellipsis (U+2026, 3 bytes in UTF-8) — not a clean
    // "maxBytes" guarantee for this fallback path, which is documented as a last resort.
    expect(Buffer.byteLength(result.text, 'utf8')).toBe(100 + Buffer.byteLength('…', 'utf8'));
  });

  it('never reports omitted for the non-array fallback path', () => {
    const result = truncateResult('x'.repeat(1000), { maxBytes: 10 });
    expect(result.truncated).toBe(true);
    expect(result.omitted).toBeUndefined();
  });
});
