import { describe, expect, it } from 'vitest';
import {
  McpToolExecutionError,
  SchemaResolutionError,
  ToolRegistrationConflictError,
} from '../src/errors.js';

describe('McpToolExecutionError', () => {
  it('carries message, cause, and httpStatus, and sets the correct error name', () => {
    const cause = new Error('downstream 500');
    const err = new McpToolExecutionError('Request failed with status 500', cause, 500);
    expect(err.name).toBe('McpToolExecutionError');
    expect(err.message).toBe('Request failed with status 500');
    expect(err.cause).toBe(cause);
    expect(err.httpStatus).toBe(500);
    expect(err).toBeInstanceOf(Error);
  });

  it('allows cause and httpStatus to be omitted', () => {
    const err = new McpToolExecutionError('boom');
    expect(err.cause).toBeUndefined();
    expect(err.httpStatus).toBeUndefined();
  });
});

describe('ToolRegistrationConflictError', () => {
  it('includes the conflicting tool name in its message', () => {
    const err = new ToolRegistrationConflictError('find_user');
    expect(err.name).toBe('ToolRegistrationConflictError');
    expect(err.message).toContain('find_user');
  });
});

describe('SchemaResolutionError', () => {
  it('preserves the message it was given verbatim', () => {
    const err = new SchemaResolutionError('collision on [id]');
    expect(err.name).toBe('SchemaResolutionError');
    expect(err.message).toBe('collision on [id]');
  });
});
