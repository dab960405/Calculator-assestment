import type { ApiErrorCode, CalculateRequest, CalculateResponse } from './types';

const TIMEOUT_MS = 8000;
const BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';
const CALCULATE_URL = `${BASE_URL}/api/v1/calculate`;

const SERVER_ERROR_CODES: readonly ApiErrorCode[] = [
  'INVALID_JSON',
  'UNKNOWN_OPERATION',
  'MISSING_OPERAND',
  'DIVISION_BY_ZERO',
  'NEGATIVE_SQRT',
  'INVALID_RESULT',
  'INTERNAL_ERROR',
];

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number | undefined;

  constructor(code: ApiErrorCode, message?: string, status?: number) {
    super(message ?? code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function calculate(req: CalculateRequest, signal?: AbortSignal): Promise<number> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();

  if (signal?.aborted) {
    controller.abort();
  } else {
    signal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    const response = await fetch(CALCULATE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: controller.signal,
    });
    const body = await readJson(response, controller.signal);
    return toResult(response, body);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (timedOut) throw new ApiError('TIMEOUT');
    if (signal?.aborted) throw error;
    throw new ApiError('NETWORK_ERROR');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  try {
    const body: unknown = await response.json();
    return body;
  } catch (error) {
    if (signal.aborted) throw error;
    return undefined;
  }
}

function toResult(response: Response, body: unknown): number {
  if (response.ok) {
    if (isCalculateResponse(body)) return body.result;
    throw new ApiError('UNEXPECTED_RESPONSE', undefined, response.status);
  }
  const serverError = parseServerError(body);
  if (serverError === null) {
    throw new ApiError('UNEXPECTED_RESPONSE', undefined, response.status);
  }
  throw new ApiError(serverError.code, serverError.message, response.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isCalculateResponse(body: unknown): body is CalculateResponse {
  return isRecord(body) && typeof body.result === 'number';
}

function isServerErrorCode(value: unknown): value is ApiErrorCode {
  return SERVER_ERROR_CODES.some((code) => code === value);
}

function parseServerError(body: unknown): { code: ApiErrorCode; message: string } | null {
  if (!isRecord(body) || !isRecord(body.error)) return null;
  const { code, message } = body.error;
  if (!isServerErrorCode(code) || typeof message !== 'string') return null;
  return { code, message };
}
