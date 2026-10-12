import type { CalculateRequest, OperationId } from '../api/types';
import { getOperation, isUnary } from './operations';

const NUMBER_PATTERN = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

export type ParseResult = { ok: true; value: number } | { ok: false; message: string };

export interface FieldErrors {
  a?: string;
  b?: string;
}

export type FormValidation =
  | { ok: true; request: CalculateRequest }
  | { ok: false; errors: FieldErrors };

export function parseOperand(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, message: 'Enter a number.' };
  if (!NUMBER_PATTERN.test(trimmed)) {
    return { ok: false, message: 'Enter a valid number, like 12 or 3.5.' };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { ok: false, message: 'That number is too large.' };
  return { ok: true, value };
}

export function validateForm(operation: OperationId, rawA: string, rawB: string): FormValidation {
  const a = parseOperand(rawA);
  const unary = isUnary(getOperation(operation));
  const b = unary ? null : parseOperand(rawB);

  const errors: FieldErrors = {};
  if (!a.ok) errors.a = a.message;
  if (b !== null && !b.ok) errors.b = b.message;

  if (!a.ok || (b !== null && !b.ok)) return { ok: false, errors };
  if (b === null) return { ok: true, request: { operation, a: a.value } };
  return { ok: true, request: { operation, a: a.value, b: b.value } };
}
