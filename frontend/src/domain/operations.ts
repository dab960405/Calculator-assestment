import type { OperationId } from '../api/types';

export interface OperationDef {
  id: OperationId;
  label: string;
  symbol: string;
  operandLabels: [string] | [string, string];
}

const OPERATION_DEFS: Record<OperationId, OperationDef> = {
  add: { id: 'add', label: 'Add', symbol: '+', operandLabels: ['First number', 'Second number'] },
  subtract: {
    id: 'subtract',
    label: 'Subtract',
    symbol: '−',
    operandLabels: ['First number', 'Second number'],
  },
  multiply: {
    id: 'multiply',
    label: 'Multiply',
    symbol: '×',
    operandLabels: ['First number', 'Second number'],
  },
  divide: {
    id: 'divide',
    label: 'Divide',
    symbol: '÷',
    operandLabels: ['First number', 'Second number'],
  },
  power: { id: 'power', label: 'Power', symbol: '^', operandLabels: ['Base', 'Exponent'] },
  sqrt: { id: 'sqrt', label: 'Square root', symbol: '√', operandLabels: ['Number'] },
  percentage: {
    id: 'percentage',
    label: 'Percentage',
    symbol: '%',
    operandLabels: ['Percentage', 'Of'],
  },
};

export const OPERATIONS: readonly OperationDef[] = Object.values(OPERATION_DEFS);

export function getOperation(id: OperationId): OperationDef {
  return OPERATION_DEFS[id];
}

export function isUnary(def: OperationDef): boolean {
  return def.operandLabels.length === 1;
}
