export type OperationId =
  | 'add'
  | 'subtract'
  | 'multiply'
  | 'divide'
  | 'power'
  | 'sqrt'
  | 'percentage';

export interface CalculateRequest {
  operation: OperationId;
  a: number;
  b?: number;
}

export interface CalculateResponse {
  result: number;
}

export type ApiErrorCode =
  | 'INVALID_JSON'
  | 'UNKNOWN_OPERATION'
  | 'MISSING_OPERAND'
  | 'DIVISION_BY_ZERO'
  | 'NEGATIVE_SQRT'
  | 'INVALID_RESULT'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNEXPECTED_RESPONSE';
