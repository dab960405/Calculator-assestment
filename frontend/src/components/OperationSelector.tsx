import type { OperationId } from '../api/types';
import { OPERATIONS } from '../domain/operations';

interface OperationSelectorProps {
  value: OperationId;
  onChange: (id: OperationId) => void;
}

export function OperationSelector({ value, onChange }: OperationSelectorProps) {
  return (
    <fieldset className="operations">
      <legend className="field-label">Operation</legend>
      <div className="operations__grid">
        {OPERATIONS.map((operation) => (
          <label key={operation.id} className="operation">
            <input
              type="radio"
              name="operation"
              value={operation.id}
              checked={operation.id === value}
              onChange={() => onChange(operation.id)}
              className="operation__input"
            />
            <span className="operation__face">
              <span className="operation__symbol" aria-hidden="true">
                {operation.symbol}
              </span>
              <span className="operation__label">{operation.label}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
