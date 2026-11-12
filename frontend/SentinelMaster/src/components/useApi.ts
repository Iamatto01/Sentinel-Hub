'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, describeError } from './api';

export interface PollState<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  generatedAt: string | null;
  refresh: () => void;
  reload: () => void;
}

/**
 * Polls a Hub API endpoint.
 *
 * `path` may be null to express "this panel has nothing to fetch yet" — the
 * hook then stays idle instead of firing a request at `null`. A refresh keeps
 * the previous payload on screen so a transient failure does not blank out the
 * dashboard, and polling pauses while the tab is hidden.
 */
export function usePoll<T>(path: string | null, intervalMs = 20_000): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(path !== null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);
  const requestId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const current = ++requestId.current;

    const load = async (showSpinner: boolean) => {
      if (showSpinner) setLoading(true);
      try {
        const envelope = await apiGet<T>(path);
        if (cancelled || !mounted.current || current !== requestId.current) return;
        setData(envelope.data);
        setError(null);
        setGeneratedAt(envelope.generatedAt ?? null);
      } catch (caught) {
        if (cancelled || !mounted.current || current !== requestId.current) return;
        setError(caught);
      } finally {
        if (!cancelled && mounted.current && current === requestId.current) setLoading(false);
      }
    };

    void load(true);

    if (intervalMs <= 0) {
      return () => {
        cancelled = true;
      };
    }

    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void load(false);
    }, intervalMs);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [path, intervalMs, nonce]);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);
  const reload = useCallback(() => {
    setData(null);
    setError(null);
    setNonce((value) => value + 1);
  }, []);

  return { data, error, loading, generatedAt, refresh, reload };
}

export interface ActionState {
  busy: string | null;
  error: unknown;
  notice: string | null;
  run: (key: string, task: () => Promise<string | void>) => Promise<boolean>;
  setNotice: (value: string | null) => void;
  clearError: () => void;
}

/**
 * Tracks a single in-flight mutation. Only one action may run at a time so a
 * double-click can never queue two deploys, two approvals or two commits.
 */
export function useAction(onDone?: () => void): ActionState {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const run = useCallback(
    async (key: string, task: () => Promise<string | void>) => {
      if (busy) return false;
      setBusy(key);
      setError(null);
      setNotice(null);
      try {
        const message = await task();
        if (message) setNotice(message);
        onDone?.();
        return true;
      } catch (caught) {
        setError(caught);
        setNotice(null);
        return false;
      } finally {
        setBusy(null);
      }
    },
    [busy, onDone],
  );

  const clearError = useCallback(() => setError(null), []);

  return { busy, error, notice, run, setNotice, clearError };
}

export function errorText(error: unknown): string {
  return describeError(error);
}
