import { getUserMessage } from '../api/errorMessages';
import { formatResult } from '../domain/format';
import type { CalcState } from '../hooks/useCalculator';

interface ResultPanelProps {
  state: CalcState;
}

export function ResultPanel({ state }: ResultPanelProps) {
  return (
    <section className="result" aria-label="Result">
      <div role="status" aria-live="polite" className="result__status">
        {state.status === 'idle' && (
          <p className="result__hint">Pick an operation, enter your numbers and press Calculate.</p>
        )}
        {state.status === 'loading' && <p className="result__hint">Calculating...</p>}
        {state.status === 'success' && (
          <>
            <span className="result__label">Result</span>
            <output className="result__value">{formatResult(state.result)}</output>
          </>
        )}
      </div>
      {state.status === 'error' && (
        <p role="alert" className="result__error">
          {getUserMessage(state.error)}
        </p>
      )}
    </section>
  );
}
