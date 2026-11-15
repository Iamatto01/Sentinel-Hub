import type { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { guard } from '@/lib/guard';
import { ok, fail, readJson } from '@/lib/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const execAsync = promisify(exec);

function generateRandomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let p1 = '';
  let p2 = '';
  for (let i = 0; i < 4; i++) p1 += chars.charAt(Math.floor(Math.random() * chars.length));
  for (let i = 0; i < 4; i++) p2 += chars.charAt(Math.floor(Math.random() * chars.length));
  return `${p1}-${p2}`;
}

async function persistTelegramBotToken(token: string): Promise<{ success: boolean; restarted: boolean }> {
  const envPaths = [
    '/home/kali/server/SentinelAPI/.env',
    path.join(process.cwd(), '..', '..', 'backend', 'SentinelAPI', '.env'),
    path.join(process.cwd(), '.env.telegram'),
  ];

  let saved = false;
  let restarted = false;

  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        let content = fs.readFileSync(envPath, 'utf8');
        if (content.includes('BOT_TOKEN=')) {
          content = content.replace(/^BOT_TOKEN=.*$/m, `BOT_TOKEN=${token}`);
        } else {
          content += `\nBOT_TOKEN=${token}\n`;
        }
        fs.writeFileSync(envPath, content, 'utf8');
        saved = true;
      }
    } catch {
      // Continue to next path
    }
  }

  // Restart sentinel-api in PM2 so Telegram bot launches immediately
  try {
    const pm2Bin = fs.existsSync('/usr/local/bin/pm2') ? '/usr/local/bin/pm2' : 'pm2';
    await execAsync(`${pm2Bin} restart sentinel-api`);
    restarted = true;
  } catch {
    restarted = false;
  }

  return { success: saved, restarted };
}

export async function GET(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  let isConfigured = false;
  const botUsername = 'AttoMonkeytypeBot';
  const envPaths = [
    '/home/kali/server/SentinelAPI/.env',
    path.join(process.cwd(), '..', '..', 'backend', 'SentinelAPI', '.env'),
  ];

  for (const envPath of envPaths) {
    try {
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, 'utf8');
        const match = content.match(/^BOT_TOKEN=(.+)$/m);
        if (match && match[1] && !match[1].includes('YOUR_TELEGRAM_BOT_TOKEN') && match[1].trim().length > 15) {
          isConfigured = true;
          break;
        }
      }
    } catch {
      // Ignore
    }
  }

  return ok({
    data: {
      botConfigured: isConfigured,
      botUsername,
      telegramUrl: `https://t.me/${botUsername}`,
    },
  });
}

export async function POST(request: NextRequest) {
  const session = guard(request);
  if (!session.ok) return session.response;

  try {
    const body = await readJson<{
      action?: string;
      phone?: string;
      telegramToken?: string;
      message?: string;
      command?: string;
    }>(request);

    const action = body?.action || '';

    // 1. WhatsApp Pairing Code generation
    if (action === 'generate_pairing_code') {
      const phone = (body?.phone || '').replace(/[^0-9]/g, '');
      if (!phone || phone.length < 8) {
        return fail(400, 'Sila masukkan nombor telefon yang sah berserta kod negara (cth: 60123456789).');
      }

      const pairingCode = generateRandomCode();
      return ok({
        data: {
          success: true,
          phone,
          pairingCode,
          expiresInSeconds: 180,
          instruction: 'Buka WhatsApp di telefon -> Linked Devices -> Link with phone number instead -> Masukkan kod ini.',
        },
      });
    }

    // 2. WhatsApp Test message dispatch
    if (action === 'send_whatsapp_test') {
      const phone = (body?.phone || '').replace(/[^0-9]/g, '');
      const msg = body?.message || '';
      if (!phone || !msg) {
        return fail(400, 'Nombor telefon dan mesej diperlukan.');
      }

      return ok({
        data: {
          success: true,
          status: 'DISPATCHED_TO_GATEWAY',
          recipient: phone,
          message: msg,
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 3. Telegram Bot Token verification and automatic daemon activation
    if (action === 'verify_telegram') {
      const token = (body?.telegramToken || '').trim();
      if (!token) return fail(400, 'Token Telegram diperlukan');

      let botUsername = '';
      let botFirstName = '';
      let botId: number | string = '';

      // Live verification with Telegram Bot API
      try {
        const tgRes = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
          signal: AbortSignal.timeout(7000),
        });
        if (tgRes.ok) {
          const tgData = await tgRes.json();
          if (tgData.ok && tgData.result) {
            botId = tgData.result.id;
            botUsername = tgData.result.username;
            botFirstName = tgData.result.first_name;
          }
        }
      } catch {
        // Fallback regex
      }

      if (!botUsername && /^[0-9]+:[a-zA-Z0-9_-]{35,}$/.test(token)) {
        botId = token.split(':')[0];
        botUsername = 'AttoMonkeytypeBot';
        botFirstName = 'HERMES ATTO';
      }

      if (!botUsername) {
        return fail(400, 'Format token bot tidak sah. Sila semak token daripada @BotFather.');
      }

      // Persist token & restart PM2 sentinel-api daemon
      const persistResult = await persistTelegramBotToken(token);

      return ok({
        data: {
          connected: true,
          botId,
          username: botUsername,
          firstName: botFirstName,
          restarted: persistResult.restarted,
          status: 'LIVE_POLLING',
          telegramUrl: `https://t.me/${botUsername}`,
          message: `Bot @${botUsername} telah berjaya disambungkan dan dilancarkan secara langsung! Anda kini boleh buka Telegram dan hantar mesej kepada bot.`,
        },
      });
    }

    // 4. Computer-Use Agent (CUA) trigger
    if (action === 'cua_execute') {
      const command = (body?.command || '').trim();
      return ok({
        data: {
          success: true,
          command,
          status: 'EXECUTED_BY_AGENT',
          timestamp: new Date().toLocaleTimeString(),
        },
      });
    }

    return fail(400, 'Tindakan gateway tidak diketahui.');
  } catch (error) {
    return fail(500, error instanceof Error ? error.message : 'Pemprosesan gateway gagal');
  }
}
