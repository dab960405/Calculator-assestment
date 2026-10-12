import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate } from '../api/calculatorClient';
import { useCalculator } from './useCalculator';

vi.mock('../api/calculatorClient', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/calculatorClient')>()),
  calculate: vi.fn(),
}));

const calculateMock = vi.mocked(calculate);
const REQUEST = { operation: 'add', a: 2, b: 3 } as const;

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function lastSignal(): AbortSignal | undefined {
  return calculateMock.mock.lastCall?.[1];
}

beforeEach(() => {
  calculateMock.mockReset();
});

describe('useCalculator', () => {
  it('starts idle', () => {
    const { result } = renderHook(() => useCalculator());
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('goes idle → loading → success', async () => {
    const response = deferred<number>();
    calculateMock.mockReturnValue(response.promise);
    const { result } = renderHook(() => useCalculator());

    let submitted!: Promise<void>;
    act(() => {
      submitted = result.current.submit(REQUEST);
    });
    expect(result.current.state).toEqual({ status: 'loading' });
    expect(calculateMock).toHaveBeenCalledWith(REQUEST, expect.any(AbortSignal));

    await act(async () => {
      response.resolve(5);
      await submitted;
    });
    expect(result.current.state).toEqual({ status: 'success', result: 5 });
  });

  it('goes loading → error with the ApiError', async () => {
    const error = new ApiError('DIVISION_BY_ZERO', 'Division by zero is not allowed.', 422);
    calculateMock.mockRejectedValue(error);
    const { result } = renderHook(() => useCalculator());

    await act(() => result.current.submit(REQUEST));

    expect(result.current.state).toEqual({ status: 'error', error });
  });

  it('wraps unknown failures as UNEXPECTED_RESPONSE', async () => {
    calculateMock.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useCalculator());

    await act(() => result.current.submit(REQUEST));

    const { state } = result.current;
    expect(state.status).toBe('error');
    expect(state.status === 'error' && state.error).toMatchObject({ code: 'UNEXPECTED_RESPONSE' });
  });

  it('treats a DOMException that is not an AbortError as a failure', async () => {
    calculateMock.mockRejectedValue(new DOMException('Blocked', 'NotAllowedError'));
    const { result } = renderHook(() => useCalculator());

    await act(() => result.current.submit(REQUEST));

    const { state } = result.current;
    expect(state.status === 'error' && state.error.code).toBe('UNEXPECTED_RESPONSE');
  });

  it('clears a previous error on the next submit', async () => {
    calculateMock.mockRejectedValueOnce(new ApiError('NETWORK_ERROR'));
    const { result } = renderHook(() => useCalculator());
    await act(() => result.current.submit(REQUEST));
    expect(result.current.state.status).toBe('error');

    const retry = deferred<number>();
    calculateMock.mockReturnValueOnce(retry.promise);
    let submitted!: Promise<void>;
    act(() => {
      submitted = result.current.submit(REQUEST);
    });
    expect(result.current.state).toEqual({ status: 'loading' });

    await act(async () => {
      retry.resolve(5);
      await submitted;
    });
    expect(result.current.state).toEqual({ status: 'success', result: 5 });
  });

  it('ignores a second submit while one is pending', async () => {
    const response = deferred<number>();
    calculateMock.mockReturnValue(response.promise);
    const { result } = renderHook(() => useCalculator());

    act(() => {
      void result.current.submit(REQUEST);
      void result.current.submit({ operation: 'multiply', a: 9, b: 9 });
    });

    expect(calculateMock).toHaveBeenCalledTimes(1);
    await act(async () => response.resolve(5));
    await waitFor(() => expect(result.current.state).toEqual({ status: 'success', result: 5 }));
  });

  it('allows a new submit after the previous one settles', async () => {
    calculateMock.mockResolvedValueOnce(1).mockResolvedValueOnce(2);
    const { result } = renderHook(() => useCalculator());

    await act(() => result.current.submit(REQUEST));
    await act(() => result.current.submit(REQUEST));

    expect(calculateMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ status: 'success', result: 2 });
  });

  it('reset aborts the pending request and ignores its result', async () => {
    const response = deferred<number>();
    calculateMock.mockReturnValue(response.promise);
    const { result } = renderHook(() => useCalculator());

    let submitted!: Promise<void>;
    act(() => {
      submitted = result.current.submit(REQUEST);
    });
    act(() => result.current.reset());

    expect(lastSignal()?.aborted).toBe(true);
    expect(result.current.state).toEqual({ status: 'idle' });

    await act(async () => {
      response.resolve(99);
      await submitted;
    });
    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('reset ignores the AbortError of the cancelled request', async () => {
    const response = deferred<number>();
    calculateMock.mockReturnValue(response.promise);
    const { result } = renderHook(() => useCalculator());

    let submitted!: Promise<void>;
    act(() => {
      submitted = result.current.submit(REQUEST);
    });
    act(() => result.current.reset());
    await act(async () => {
      response.reject(new DOMException('Aborted', 'AbortError'));
      await submitted;
    });

    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('reset clears a success or error back to idle', async () => {
    calculateMock.mockResolvedValue(5);
    const { result } = renderHook(() => useCalculator());
    await act(() => result.current.submit(REQUEST));

    act(() => result.current.reset());

    expect(result.current.state).toEqual({ status: 'idle' });
  });

  it('reset keeps the same idle state object when already idle', () => {
    const { result } = renderHook(() => useCalculator());
    const before = result.current.state;

    act(() => result.current.reset());

    expect(result.current.state).toBe(before);
  });

  it('allows a new submit right after reset', async () => {
    const first = deferred<number>();
    calculateMock.mockReturnValueOnce(first.promise).mockResolvedValueOnce(7);
    const { result } = renderHook(() => useCalculator());

    act(() => {
      void result.current.submit(REQUEST);
    });
    act(() => result.current.reset());
    await act(() => result.current.submit(REQUEST));

    expect(calculateMock).toHaveBeenCalledTimes(2);
    expect(result.current.state).toEqual({ status: 'success', result: 7 });
  });

  it('aborts the pending request on unmount', () => {
    calculateMock.mockReturnValue(new Promise(() => {}));
    const { result, unmount } = renderHook(() => useCalculator());

    act(() => {
      void result.current.submit(REQUEST);
    });
    unmount();

    expect(lastSignal()?.aborted).toBe(true);
  });
});
