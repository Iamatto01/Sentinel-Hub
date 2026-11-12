import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Shared helpers for route handlers: uniform JSON envelopes, upstream fetching
 * with hard timeouts, and consistent error surfaces.
 */

export function ok<T extends object>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ ok: true, generatedAt: new Date().toISOString(), ...data }, init);
}

export function fail(status: number, error: string, detail?: string): NextResponse {
  return NextResponse.json(
    { ok: false, error, ...(detail ? { detail } : {}), generatedAt: new Date().toISOString() },
    { status },
  );
}

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly upstreamBody?: string,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

const DEFAULT_TIMEOUT_MS = 15_000;

export interface FetchJsonOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
}

/**
 * Fetches JSON with a hard timeout. The caller always receives either parsed
 * JSON or an `UpstreamError` — never an unhandled abort.
 */
export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'manual',
    });

    const text = await response.text();
    if (!response.ok) {
      throw new UpstreamError(`Upstream responded ${response.status}`, response.status, text.slice(0, 500));
    }
    if (text.trim().length === 0) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new UpstreamError('Upstream did not return valid JSON', 502, text.slice(0, 500));
    }
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError(`Upstream timed out after ${timeoutMs}ms`, 504);
    }
    throw new UpstreamError(error instanceof Error ? error.message : 'Upstream request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

/** Converts an unknown thrown value into a JSON error response. */
export function toErrorResponse(error: unknown, fallbackStatus = 500): NextResponse {
  if (error instanceof UpstreamError) {
    return fail(error.status === 504 ? 504 : 502, error.message, error.upstreamBody);
  }
  const message = error instanceof Error ? error.message : 'Unexpected error';
  return fail(fallbackStatus, message);
}

export interface RawFetchResult {
  status: number;
  headers: Headers;
  text: string;
}

/**
 * Performs a request and returns the status, headers and raw body. Needed
 * whenever the caller must read response headers — for example capturing a
 * `Set-Cookie` session from an upstream login.
 */
export async function fetchResponse(url: string, options: FetchJsonOptions = {}): Promise<RawFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        accept: 'application/json',
        ...(options.body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
      cache: 'no-store',
      redirect: 'manual',
    });
    return { status: response.status, headers: response.headers, text: await response.text() };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new UpstreamError(`Upstream timed out after ${timeoutMs}ms`, 504);
    }
    throw new UpstreamError(error instanceof Error ? error.message : 'Upstream request failed', 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function readJson<T>(request: NextRequest): Promise<T | null> {
  try {
    const text = await request.text();
    if (!text.trim()) return null;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Best-effort client address, honouring a single proxy hop. */
export function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  const real = request.headers.get('x-real-ip');
  if (real) return real.trim();
  return null;
}

/** Runs a promise and returns a discriminated result instead of throwing. */
export async function attempt<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Request failed' };
  }
}
