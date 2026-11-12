import type { NextRequest } from 'next/server';
import { guard } from '@/lib/guard';
import { fail, ok, readJson, toErrorResponse } from '@/lib/http';
import { GithubNotConfigured, addSshKey, deleteSshKey, listSshKeys } from '@/lib/github';
import { readLocalPublicKey } from '@/lib/git';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Only these key types are accepted; private or unknown material is refused. */
const ALLOWED_ALGORITHMS = ['ssh-ed25519', 'ssh-rsa', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521', 'sk-ssh-ed25519@openssh.com'];

function isPublicKey(value: string): boolean {
  if (value.includes('PRIVATE KEY')) return false;
  const parts = value.trim().split(/\s+/);
  return parts.length >= 2 && ALLOWED_ALGORITHMS.includes(parts[0]);
}

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const [keys, local] = await Promise.all([listSshKeys(), readLocalPublicKey()]);
    const fingerprints = new Set(keys.map((key) => key.key.trim().split(/\s+/).slice(0, 2).join(' ')));
    return ok({
      data: {
        keys,
        local,
        localAlreadyUploaded: local
          ? fingerprints.has(local.publicKey.trim().split(/\s+/).slice(0, 2).join(' '))
          : false,
      },
    });
  } catch (error) {
    if (error instanceof GithubNotConfigured) return fail(503, 'GITHUB_TOKEN is not configured');
    return toErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const body = await readJson<{ title?: unknown; key?: unknown; useLocal?: unknown }>(request);
  const useLocal = body?.useLocal === true;

  try {
    let title: string;
    let key: string;

    if (useLocal) {
      const local = await readLocalPublicKey();
      if (!local) return fail(404, 'No local public key found beside the configured private key');
      title = `sentinel-hub-${local.algorithm}`;
      key = local.publicKey;
    } else {
      title = typeof body?.title === 'string' ? body.title.trim() : '';
      key = typeof body?.key === 'string' ? body.key.trim() : '';
      if (!title) return fail(400, 'A key title is required');
      if (title.length > 120) return fail(400, 'Key title is too long');
      if (!key) return fail(400, 'Public key material is required');
    }

    if (!isPublicKey(key)) {
      return fail(400, 'That does not look like a public key. Only public half of the keypair may be uploaded.');
    }
    if (key.length > 8000) return fail(400, 'Public key is too long');

    const created = await addSshKey({ title, key: key.trim() });
    return ok({ data: created }, { status: 201 });
  } catch (error) {
    if (error instanceof GithubNotConfigured) return fail(503, 'GITHUB_TOKEN is not configured');
    if (error instanceof Error && /already in use/i.test(error.message)) {
      return fail(409, 'That key is already registered on this GitHub account');
    }
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  const raw = request.nextUrl.searchParams.get('id');
  if (!raw || !/^\d{1,12}$/.test(raw)) return fail(400, 'A numeric key id is required');

  try {
    await deleteSshKey(Number.parseInt(raw, 10));
    return ok({ data: { removed: Number.parseInt(raw, 10) } });
  } catch (error) {
    if (error instanceof GithubNotConfigured) return fail(503, 'GITHUB_TOKEN is not configured');
    return toErrorResponse(error);
  }
}
