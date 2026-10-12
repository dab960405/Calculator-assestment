import { describe, expect, it } from 'vitest';
import type { OperationId } from '../api/types';
import { getOperation, isUnary, OPERATIONS } from './operations';

const ALL_IDS: OperationId[] = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'power',
  'sqrt',
  'percentage',
];

describe('OPERATIONS', () => {
  it('lists every API operation once, in display order', () => {
    expect(OPERATIONS.map((op) => op.id)).toEqual(ALL_IDS);
  });

  it('gives every operation a label, a symbol and operand labels', () => {
    for (const op of OPERATIONS) {
      expect(op.label).not.toBe('');
      expect(op.symbol).not.toBe('');
      expect(op.operandLabels.length).toBeGreaterThan(0);
      for (const label of op.operandLabels) expect(label).not.toBe('');
    }
  });

  it('uses unique labels so radios have distinct accessible names', () => {
    const labels = OPERATIONS.map((op) => op.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('getOperation', () => {
  it.each(ALL_IDS)('returns the definition for %s', (id) => {
    expect(getOperation(id).id).toBe(id);
  });

  it('uses operation-specific operand labels', () => {
    expect(getOperation('power').operandLabels).toEqual(['Base', 'Exponent']);
    expect(getOperation('percentage').operandLabels).toEqual(['Percentage', 'Of']);
    expect(getOperation('sqrt').operandLabels).toEqual(['Number']);
  });
});

describe('isUnary', () => {
  it.each(ALL_IDS.map((id) => [id, id === 'sqrt'] as const))('%s → %s', (id, expected) => {
    expect(isUnary(getOperation(id))).toBe(expected);
  });
});
