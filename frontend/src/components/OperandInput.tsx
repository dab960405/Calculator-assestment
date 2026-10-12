import type { Ref } from 'react';

interface OperandInputProps {
  id: string;
  label: string;
  value: string;
  error: string | undefined;
  onChange: (value: string) => void;
  ref?: Ref<HTMLInputElement>;
}

export function OperandInput({ id, label, value, error, onChange, ref }: OperandInputProps) {
  const errorId = `${id}-error`;
  const hasError = error !== undefined;

  return (
    <div className="operand">
      <label htmlFor={id} className="field-label">
        {label}
      </label>
      <input
        ref={ref}
        id={id}
        name={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        className="operand__input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={hasError}
        aria-describedby={hasError ? errorId : undefined}
      />
      {hasError && (
        <p id={errorId} className="operand__error">
          {error}
        </p>
      )}
    </div>
  );
}
