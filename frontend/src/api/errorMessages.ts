import type { ApiError } from './calculatorClient';
import type { ApiErrorCode } from './types';

const GENERIC_MESSAGE = 'Something went wrong. Please try again.';

const USER_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  DIVISION_BY_ZERO: "You can't divide by zero. Change the second number.",
  NEGATIVE_SQRT: 'Square root needs a number that is zero or greater.',
  INVALID_RESULT: "That calculation doesn't produce a valid number. Try different values.",
  NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",
  TIMEOUT: 'The server took too long to answer. Try again.',
};

export function getUserMessage(error: ApiError): string {
  return USER_MESSAGES[error.code] ?? GENERIC_MESSAGE;
}
