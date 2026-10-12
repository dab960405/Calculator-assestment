import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, calculate } from './calculatorClient';

const fetchMock = vi.fn<typeof fetch>();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

/** A fetch that never settles on its own and rejects like the real one when its signal aborts. */
function hangingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) reject(abortError());
    signal?.addEventListener('abort', () => reject(abortError()));
  });
}

async function captureError(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error('Expected the promise to reject');
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.useRealTimers();
});

describe('calculate: request', () => {
  it('POSTs the JSON body to the calculate endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 5 }));

    await calculate({ operation: 'add', a: 2, b: 3 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe('/api/v1/calculate');
    expect(init?.method).toBe('POST');
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(String(init?.body))).toEqual({ operation: 'add', a: 2, b: 3 });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('omits b for unary operations', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 3 }));

    await calculate({ operation: 'sqrt', a: 9 });

    expect(JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body))).toEqual({
      operation: 'sqrt',
      a: 9,
    });
  });
});

describe('calculate: success', () => {
  it.each([5, 0, -2.5, 0.30000000000000004, 1e300])('returns the numeric result %d', async (n) => {
    fetchMock.mockResolvedValue(jsonResponse({ result: n }));
    await expect(calculate({ operation: 'add', a: 1, b: 1 })).resolves.toBe(n);
  });
});

describe('calculate: server errors', () => {
  it.each([
    [400, 'INVALID_JSON'],
    [400, 'UNKNOWN_OPERATION'],
    [400, 'MISSING_OPERAND'],
    [422, 'DIVISION_BY_ZERO'],
    [422, 'NEGATIVE_SQRT'],
    [422, 'INVALID_RESULT'],
    [500, 'INTERNAL_ERROR'],
  ] as const)('maps %d %s to an ApiError with code, message and status', async (status, code) => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code, message: `server says ${code}` } }, status));

    const error = await captureError(calculate({ operation: 'divide', a: 1, b: 0 }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'ApiError', code, status, message: `server says ${code}` });
  });

  it.each([
    ['an unknown code', { error: { code: 'TEAPOT', message: 'x' } }],
    ['a non-string message', { error: { code: 'INVALID_JSON', message: 42 } }],
    ['no error object', { message: 'nope' }],
    ['error as a string', { error: 'INVALID_JSON' }],
    ['null', null],
  ])('returns UNEXPECTED_RESPONSE for an error body with %s', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(body, 400));

    await expect(calculate({ operation: 'add', a: 1, b: 1 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 400,
    });
  });
});

describe('calculate: unexpected responses', () => {
  it('returns UNEXPECTED_RESPONSE for a non-JSON 502 from a proxy', async () => {
    fetchMock.mockResolvedValue(
      new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } }),
    );

    await expect(calculate({ operation: 'add', a: 1, b: 1 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 502,
    });
  });

  it('returns UNEXPECTED_RESPONSE for a 200 that is not JSON', async () => {
    fetchMock.mockResolvedValue(new Response('ok', { status: 200 }));

    await expect(calculate({ operation: 'add', a: 1, b: 1 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 200,
    });
  });

  it.each([
    ['a string result', { result: '5' }],
    ['a missing result', { value: 5 }],
    ['an array', [5]],
  ])('returns UNEXPECTED_RESPONSE for a 200 with %s', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(body));

    await expect(calculate({ operation: 'add', a: 1, b: 1 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
    });
  });

  it('returns UNEXPECTED_RESPONSE for an empty 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(calculate({ operation: 'add', a: 1, b: 1 })).rejects.toMatchObject({
      code: 'UNEXPECTED_RESPONSE',
      status: 204,
    });
  });
});

describe('calculate: network, timeout and abort', () => {
  it('returns NETWORK_ERROR when fetch rejects', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = await captureError(calculate({ operation: 'add', a: 1, b: 1 }));

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'NETWORK_ERROR', status: undefined });
  });

  it('returns TIMEOUT after 8 seconds without an answer', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(hangingFetch);

    const pending = captureError(calculate({ operation: 'add', a: 1, b: 1 }));
    await vi.advanceTimersByTimeAsync(7999);
    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    expect(await pending).toMatchObject({ code: 'TIMEOUT' });
  });

  it('returns TIMEOUT when the body stalls after the headers arrive', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation((_input, init) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => hangingFetch('', init),
      } as unknown as Response),
    );

    const pending = captureError(calculate({ operation: 'add', a: 1, b: 1 }));
    await vi.advanceTimersByTimeAsync(8000);

    expect(await pending).toMatchObject({ code: 'TIMEOUT' });
  });

  it('clears the timeout after a response', async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(jsonResponse({ result: 1 }));

    await calculate({ operation: 'add', a: 1, b: 0 });

    expect(vi.getTimerCount()).toBe(0);
  });

  it('rethrows the AbortError when the caller aborts', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();

    const pending = captureError(calculate({ operation: 'add', a: 1, b: 1 }, controller.signal));
    controller.abort();
    const error = await pending;

    expect(error).not.toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ name: 'AbortError' });
  });

  it('aborts immediately when the caller signal is already aborted', async () => {
    fetchMock.mockImplementation(hangingFetch);
    const controller = new AbortController();
    controller.abort();

    const error = await captureError(calculate({ operation: 'add', a: 1, b: 1 }, controller.signal));

    expect(fetchMock.mock.calls[0]?.[1]?.signal?.aborted).toBe(true);
    expect(error).toMatchObject({ name: 'AbortError' });
  });

  it('removes its listener from the caller signal when done', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ result: 1 }));
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, 'removeEventListener');

    await calculate({ operation: 'add', a: 1, b: 0 }, controller.signal);

    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});

describe('ApiError', () => {
  it('defaults the message to the code', () => {
    const error = new ApiError('TIMEOUT');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('TIMEOUT');
    expect(error.status).toBeUndefined();
  });
});
