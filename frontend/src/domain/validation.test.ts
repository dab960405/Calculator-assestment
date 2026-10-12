import { describe, expect, it } from 'vitest';
import { parseOperand, validateForm } from './validation';

const EMPTY = 'Enter a number.';
const INVALID = 'Enter a valid number, like 12 or 3.5.';
const TOO_LARGE = 'That number is too large.';

describe('parseOperand', () => {
  it.each([
    ['12', 12],
    ['0', 0],
    ['3.5', 3.5],
    ['-3.5', -3.5],
    ['+2', 2],
    ['.5', 0.5],
    ['-.5', -0.5],
    ['5.', 5],
    ['1e3', 1000],
    ['1E-3', 0.001],
    ['-2.5e+2', -250],
    ['  42  ', 42],
    ['\t7\n', 7],
    ['0.1', 0.1],
    ['1e308', 1e308],
    ['5e-324', 5e-324],
  ])('accepts %j as %d', (raw, expected) => {
    expect(parseOperand(raw)).toEqual({ ok: true, value: expected });
  });

  it('keeps negative zero as a number', () => {
    const result = parseOperand('-0');
    expect(result.ok && Object.is(result.value, -0)).toBe(true);
  });

  it.each(['', '   ', '\n\t'])('rejects empty input %j', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, message: EMPTY });
  });

  it.each([
    'abc',
    '1,5',
    '1.2.3',
    '--1',
    '+-1',
    '1e',
    'e5',
    '.',
    '-',
    '0x10',
    '1_000',
    '1 000',
    '12abc',
    'Infinity',
    '-Infinity',
    'NaN',
  ])('rejects non-numeric input %j', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, message: INVALID });
  });

  it.each(['1e309', '-1e400', '9'.repeat(400)])('rejects %j because it overflows', (raw) => {
    expect(parseOperand(raw)).toEqual({ ok: false, message: TOO_LARGE });
  });
});

describe('validateForm', () => {
  it('builds a binary request with both operands', () => {
    expect(validateForm('add', '2', '3')).toEqual({
      ok: true,
      request: { operation: 'add', a: 2, b: 3 },
    });
  });

  it('keeps b as 0 when it is zero (division by zero is the server rule)', () => {
    expect(validateForm('divide', '1', '0')).toEqual({
      ok: true,
      request: { operation: 'divide', a: 1, b: 0 },
    });
  });

  it('builds a unary request without b for square root', () => {
    const result = validateForm('sqrt', '9', '');
    expect(result).toEqual({ ok: true, request: { operation: 'sqrt', a: 9 } });
    expect(result.ok && 'b' in result.request).toBe(false);
  });

  it('ignores an invalid b for square root', () => {
    expect(validateForm('sqrt', '9', 'not a number').ok).toBe(true);
  });

  it('does not reject negative numbers for square root (the server owns that rule)', () => {
    expect(validateForm('sqrt', '-4', '')).toEqual({
      ok: true,
      request: { operation: 'sqrt', a: -4 },
    });
  });

  it('reports errors for both fields', () => {
    expect(validateForm('multiply', '', 'x')).toEqual({
      ok: false,
      errors: { a: EMPTY, b: INVALID },
    });
  });

  it('reports only the invalid field', () => {
    expect(validateForm('subtract', '1', '')).toEqual({ ok: false, errors: { b: EMPTY } });
    expect(validateForm('subtract', 'x', '1')).toEqual({ ok: false, errors: { a: INVALID } });
  });

  it('reports only a for unary operations', () => {
    expect(validateForm('sqrt', '', '')).toEqual({ ok: false, errors: { a: EMPTY } });
  });

  it.each(['power', 'percentage'] as const)('requires b for %s', (operation) => {
    expect(validateForm(operation, '2', '')).toEqual({ ok: false, errors: { b: EMPTY } });
  });
});
