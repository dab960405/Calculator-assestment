import { describe, expect, it } from 'vitest';
import { formatResult } from './format';

describe('formatResult', () => {
  it.each([
    [5, '5'],
    [2.5, '2.5'],
    [-10, '-10'],
    [0, '0'],
    [-0, '0'],
    [0.1 + 0.2, '0.3'],
    [1 / 3, '0.333333333333'],
    [2 / 3, '0.666666666667'],
    [123456789012345, '123456789012000'],
    [1e21, '1e+21'],
    [1.5e300, '1.5e+300'],
    [1e-7, '1e-7'],
    [5e-324, '5e-324'],
  ])('formats %d as %s', (input, expected) => {
    expect(formatResult(input)).toBe(expected);
  });
});
