import { useRef, useState, type FormEvent } from 'react';
import type { OperationId } from '../api/types';
import { getOperation, isUnary } from '../domain/operations';
import { validateForm, type FieldErrors } from '../domain/validation';
import { useCalculator } from '../hooks/useCalculator';
import { OperandInput } from './OperandInput';
import { OperationSelector } from './OperationSelector';
import { ResultPanel } from './ResultPanel';

export function CalculatorForm() {
  const [operationId, setOperationId] = useState<OperationId>('add');
  const [rawA, setRawA] = useState('');
  const [rawB, setRawB] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const { state, submit, reset } = useCalculator();
  const inputARef = useRef<HTMLInputElement>(null);
  const inputBRef = useRef<HTMLInputElement>(null);

  const operation = getOperation(operationId);
  const unary = isUnary(operation);
  const [labelA, labelB] = operation.operandLabels;
  const isLoading = state.status === 'loading';

  function handleOperationChange(id: OperationId) {
    setOperationId(id);
    reset();
    if (isUnary(getOperation(id))) {
      setErrors((prev) => (prev.a === undefined ? {} : { a: prev.a }));
    }
  }

  function handleAChange(value: string) {
    setRawA(value);
    reset();
    setErrors((prev) => (prev.b === undefined ? {} : { b: prev.b }));
  }

  function handleBChange(value: string) {
    setRawB(value);
    reset();
    setErrors((prev) => (prev.a === undefined ? {} : { a: prev.a }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isLoading) return;

    const validation = validateForm(operationId, rawA, rawB);
    if (!validation.ok) {
      setErrors(validation.errors);
      const firstInvalid = validation.errors.a !== undefined ? inputARef : inputBRef;
      firstInvalid.current?.focus();
      return;
    }

    setErrors({});
    void submit(validation.request);
  }

  return (
    <form className="calculator" noValidate onSubmit={handleSubmit}>
      <OperationSelector value={operationId} onChange={handleOperationChange} />

      <div className="operands">
        <OperandInput
          ref={inputARef}
          id="operand-a"
          label={labelA}
          value={rawA}
          error={errors.a}
          onChange={handleAChange}
        />
        {!unary && labelB !== undefined && (
          <OperandInput
            ref={inputBRef}
            id="operand-b"
            label={labelB}
            value={rawB}
            error={errors.b}
            onChange={handleBChange}
          />
        )}
      </div>

      <button type="submit" className="calculator__submit" disabled={isLoading}>
        {isLoading ? 'Calculating...' : 'Calculate'}
      </button>

      <ResultPanel state={state} />
    </form>
  );
}
