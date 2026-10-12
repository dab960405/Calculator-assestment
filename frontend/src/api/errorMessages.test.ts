import { describe, expect, it } from 'vitest';
import { ApiError } from './calculatorClient';
import { getUserMessage } from './errorMessages';
import type { ApiErrorCode } from './types';

const GENERIC = 'Something went wrong. Please try again.';

describe('getUserMessage', () => {
  it.each<[ApiErrorCode, string]>([
    ['DIVISION_BY_ZERO', "You can't divide by zero. Change the second number."],
    ['NEGATIVE_SQRT', 'Square root needs a number that is zero or greater.'],
    ['INVALID_RESULT', "That calculation doesn't produce a valid number. Try different values."],
    ['NETWORK_ERROR', "Can't reach the server. Check your connection and try again."],
    ['TIMEOUT', 'The server took too long to answer. Try again.'],
  ])('maps %s to a specific message', (code, expected) => {
    expect(getUserMessage(new ApiError(code))).toBe(expected);
  });

  it.each<ApiErrorCode>([
    'INVALID_JSON',
    'UNKNOWN_OPERATION',
    'MISSING_OPERAND',
    'INTERNAL_ERROR',
    'UNEXPECTED_RESPONSE',
  ])('falls back to the generic message for %s', (code) => {
    expect(getUserMessage(new ApiError(code))).toBe(GENERIC);
  });

  it('never shows the raw server message', () => {
    const error = new ApiError('INTERNAL_ERROR', 'stack trace: secret.go:42', 500);
    expect(getUserMessage(error)).toBe(GENERIC);
  });
});
