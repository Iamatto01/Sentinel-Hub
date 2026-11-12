'use client';

/**
 * Browser-side access to the Hub API.
 *
 * Every route answers with the `{ ok, generatedAt, ... }` envelope from
 * `src/lib/http.ts`. Two routes deliberately break the "non-2xx means error"
 * rule and are handled explicitly:
 *
 *   - `GET /api/fame` answers 200 with `data.configured = false` when the Fame
 *     admin key is missing. That is a state, not a failure.
 *   - `POST /api/kali/deploy` answers 500 with a *successful* envelope when the
 *     remote build fails, so the deploy log is still delivered to the UI.
 */

export interface ApiEnvelope<T> {
  ok: true;
  generatedAt: string;
  data: T;
}

export interface ApiFailureBody {
  ok: false;
  error: string;
  detail?: string;
  generatedAt?: string;
  lockedUntil?: number;
  retryAfterSeconds?: number;
}

export class ApiError extends Error {
  /** The Hub's own short error code, e.g. `Too many failed attempts...`. */
  readonly error: string;
  readonly status: number;
  readonly detail?: string;
  readonly body: unknown;

  constructor(error: string, status: number, detail?: string, body?: unknown) {
    super(detail ? `${error} — ${detail}` : error);
    this.name = 'ApiError';
    this.error = error;
    this.status = status;
    this.detail = detail;
    this.body = body;
  }
}

export interface RawResult {
  status: number;
  body: unknown;
}

async function parse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: text.slice(0, 400) };
  }
}

function isFailure(body: unknown): body is ApiFailureBody {
  return typeof body === 'object' && body !== null && (body as { ok?: unknown }).ok === false;
}

/** Performs a request and returns the raw status plus parsed body. */
export async function apiRaw(path: string, init?: RequestInit): Promise<RawResult> {
  const response = await fetch(path, {
    cache: 'no-store',
    credentials: 'same-origin',
    ...init,
    headers: {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  return { status: response.status, body: await parse(response) };
}

function unwrap<T>(result: RawResult): ApiEnvelope<T> {
  const { status, body } = result;

  if (isFailure(body)) {
    throw new ApiError(body.error || 'Request failed', status, body.detail, body);
  }

  if (status >= 400) {
    throw new ApiError(`Request failed with status ${status}`, status, undefined, body);
  }

  if (typeof body !== 'object' || body === null) {
    throw new ApiError('Malformed response from the Hub API', status, undefined, body);
  }

  return body as ApiEnvelope<T>;
}

export async function apiGet<T>(path: string): Promise<ApiEnvelope<T>> {
  return unwrap<T>(await apiRaw(path));
}

export async function apiSend<T>(path: string, method: string, payload?: unknown): Promise<ApiEnvelope<T>> {
  return unwrap<T>(
    await apiRaw(path, {
      method,
      body: payload === undefined ? undefined : JSON.stringify(payload),
    }),
  );
}

export async function apiPost<T>(path: string, payload?: unknown): Promise<ApiEnvelope<T>> {
  return apiSend<T>(path, 'POST', payload);
}

export async function apiDelete<T>(path: string): Promise<ApiEnvelope<T>> {
  return apiSend<T>(path, 'DELETE');
}

/** Human-readable message for anything thrown by the helpers above. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) {
    return error.detail ? `${error.error} — ${error.detail}` : error.error;
  }
  if (error instanceof Error) return error.message;
  return String(error);
}
