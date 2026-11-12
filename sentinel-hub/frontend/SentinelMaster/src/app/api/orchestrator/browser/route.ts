import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { ok, fail, toErrorResponse } from '@/lib/http';
import { JevBrowserSession } from '@/lib/orchestrator/jev-browser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Session-scoped browser instance. Persists state (current URL, indexed DOM)
 * across requests so that NAVIGATE followed by CLICK works correctly.
 *
 * This is per-server, not per-user — acceptable since the Hub is single-operator.
 */
let browserSession: JevBrowserSession | null = null;

function getSession(): JevBrowserSession {
  if (!browserSession) browserSession = new JevBrowserSession();
  return browserSession;
}

/** Blocks private/internal IP ranges and non-HTTP schemes to prevent SSRF. */
function validateUrl(raw: string): string | null {
  let target = raw.trim();
  if (!target) return null;

  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    target = `https://${target}`;
  }

  let parsed: URL;
  try {
    parsed = new URL(target);
  } catch {
    return null;
  }

  // Block non-HTTP schemes
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return null;
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost and loopback
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname === '0.0.0.0'
  ) {
    return null;
  }

  // Block private IP ranges (RFC 1918 + link-local + cloud metadata)
  if (
    hostname.startsWith('10.') ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('169.254.') ||
    hostname.startsWith('172.16.') ||
    hostname.startsWith('172.17.') ||
    hostname.startsWith('172.18.') ||
    hostname.startsWith('172.19.') ||
    hostname.startsWith('172.2') || // 172.20-29
    hostname.startsWith('172.30.') ||
    hostname.startsWith('172.31.')
  ) {
    return null;
  }

  return target;
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const body = (await request.json()) as {
      url?: string;
      action?: string;
      reset?: boolean;
    };

    // Reset session
    if (body.reset) {
      browserSession = null;
      return ok({ data: { reset: true } });
    }

    const browser = getSession();

    if (body.url) {
      const safeUrl = validateUrl(body.url);
      if (!safeUrl) {
        return fail(400, 'Invalid or blocked URL. Only public HTTP/HTTPS URLs are allowed.');
      }
      const result = await browser.navigate(safeUrl);
      return ok({ data: result });
    }

    if (body.action) {
      const action = body.action.trim();
      // If action is NAVIGATE, validate the URL within it
      if (action.toUpperCase().startsWith('NAVIGATE ')) {
        const navUrl = action.slice('NAVIGATE '.length).trim();
        const safeUrl = validateUrl(navUrl);
        if (!safeUrl) {
          return fail(400, 'Invalid or blocked URL in NAVIGATE action.');
        }
      }
      const result = await browser.executeAction(action);
      return ok({ data: result });
    }

    return fail(400, 'Either "url", "action", or "reset" is required.');
  } catch (error) {
    return toErrorResponse(error);
  }
}
