import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, calculate } from '../api/calculatorClient';
import type { CalculateRequest } from '../api/types';

export type CalcState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; result: number }
  | { status: 'error'; error: ApiError };

const IDLE: CalcState = { status: 'idle' };

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export function useCalculator(): {
  state: CalcState;
  submit: (req: CalculateRequest) => Promise<void>;
  reset: () => void;
} {
  const [state, setState] = useState<CalcState>(IDLE);
  const controllerRef = useRef<AbortController | null>(null);

  const abortPending = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
  }, []);

  useEffect(() => abortPending, [abortPending]);

  const submit = useCallback(async (req: CalculateRequest) => {
    // The ref is checked instead of state so rapid submits within one render are also ignored.
    if (controllerRef.current !== null) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'loading' });

    try {
      const result = await calculate(req, controller.signal);
      if (!controller.signal.aborted) setState({ status: 'success', result });
    } catch (error) {
      if (controller.signal.aborted || isAbortError(error)) return;
      const apiError = error instanceof ApiError ? error : new ApiError('UNEXPECTED_RESPONSE');
      setState({ status: 'error', error: apiError });
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  }, []);

  const reset = useCallback(() => {
    abortPending();
    setState((prev) => (prev.status === 'idle' ? prev : IDLE));
  }, [abortPending]);

  return { state, submit, reset };
}
