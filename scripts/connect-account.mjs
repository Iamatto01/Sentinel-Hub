import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENV_PATH = path.resolve(__dirname, '..', 'Sentinel Master', '.env.local');

function getRouterConfig() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`File ${ENV_PATH} tidak dijumpai.`);
  }
  const content = fs.readFileSync(ENV_PATH, 'utf8');
  let baseUrl = 'https://router.sentinelai.studio';
  let password = '';

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('HUB_ROUTER_URL=')) {
      baseUrl = trimmed.split('=')[1].trim().replace(/['"]/g, '');
    } else if (trimmed.startsWith('HUB_ROUTER_PASSWORD=')) {
      password = trimmed.split('=')[1].trim().replace(/['"]/g, '');
    }
  }

  if (!password) {
    throw new Error('HUB_ROUTER_PASSWORD tidak dijumpai dalam .env.local');
  }

  return { baseUrl, password };
}

async function loginToRouter(baseUrl, password) {
  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    throw new Error(`Login router gagal (HTTP ${res.status}). Semak kata laluan router.`);
  }

  const setCookie = res.headers.get('set-cookie') || '';
  const match = setCookie.match(/auth_token=([^;]+)/);
  if (!match) {
    throw new Error('Tiada cookie auth_token dipulangkan oleh router.');
  }

  return `auth_token=${match[1]}`;
}

function openInPrivateBrowser(url) {
  // Cuba buka Microsoft Edge InPrivate terlebih dahulu, kemudian Chrome Incognito jika tiada
  const edgeCmd = `start msedge -inprivate "${url}"`;
  exec(edgeCmd, (err) => {
    if (err) {
      exec(`start chrome -incognito "${url}"`, (err2) => {
        if (err2) {
          // Fallback kepada default browser
          exec(`start "" "${url}"`);
        }
      });
    }
  });
}

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans.trim());
    })
  );
}

async function connectKiro(baseUrl, cookie) {
  console.log('\n[1/3] Menghubungi Kiro OAuth service...');
  const res = await fetch(`${baseUrl}/api/oauth/kiro/social-authorize?provider=google`, {
    headers: { Cookie: cookie },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal memulakan Kiro authorization: ${errText}`);
  }

  const data = await res.json();
  const { authUrl, userCode, deviceCode, interval = 5, expiresIn = 300 } = data;

  console.log('\n================================================================');
  console.log('   TETINGKAP BROWSER INPRIVATE TELAH DIBUKA SECARA AUTOMATIK!');
  console.log(`   KOD PENGESAHAN: [ ${userCode} ]`);
  console.log('================================================================');
  console.log('ARAHAN PENTING:');
  console.log('1. Di tetingkap browser InPrivate yang dibuka, pilih akaun Gmail anda.');
  console.log('   (PENTING: Jangan pilih muhammadsaifudinmj@gmail.com)');
  console.log('2. Klik Allow / Sahkan pengesahan Kiro.');
  console.log('\nSedang menunggu anda selesaikan log masuk di browser...');

  openInPrivateBrowser(authUrl);

  const pollInterval = Math.max(3, Number(interval)) * 1000;
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    process.stdout.write('.');

    try {
      const pollRes = await fetch(`${baseUrl}/api/oauth/kiro/social-exchange`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          deviceCode,
          provider: 'google',
          targetProvider: 'kiro',
        }),
      });

      const pollData = await pollRes.json();
      if (pollData.success) {
        console.log('\n\n🎉 [BERJAYA!] Akaun Kiro anda telah berjaya disambungkan!');
        console.log('>>> Kuota: 50 Kredit Percuma kini aktif dalam Sentinel Router.');
        console.log('>>> Anda boleh menutup tetingkap InPrivate browser tadi.');
        return;
      }

      if (!pollData.pending) {
        throw new Error(pollData.error || 'Authorization failed.');
      }
    } catch (err) {
      if (!err.message.includes('authorization_pending')) {
        console.warn('\nNota:', err.message);
      }
    }
  }

  console.log('\n[TAMAT MASA] Sesi log masuk tamat tempoh. Sila cuba lagi.');
}

async function connectGrok(baseUrl, cookie) {
  console.log('\n[1/3] Menghubungi xAI Grok device authorization...');
  const res = await fetch(`${baseUrl}/api/oauth/grok-cli/device-code`, {
    headers: { Cookie: cookie },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal memulakan Grok authorization: ${errText}`);
  }

  const data = await res.json();
  const authUrl = data.verification_uri_complete || data.verification_uri;
  const userCode = data.user_code;
  const deviceCode = data.device_code;
  const codeVerifier = data.codeVerifier;
  const interval = data.interval || 5;
  const expiresIn = data.expires_in || 1800;

  console.log('\n================================================================');
  console.log('   TETINGKAP BROWSER INPRIVATE TELAH DIBUKA SECARA AUTOMATIK!');
  console.log(`   KOD PENGESAHAN: [ ${userCode} ]`);
  console.log('================================================================');
  console.log('ARAHAN PENTING:');
  console.log('1. Di tetingkap browser InPrivate yang dibuka, log masuk akaun pilihan anda.');
  console.log('   (PENTING: Jangan pilih muhammadsaifudinmj@gmail.com)');
  console.log('2. Sahkan pengesahan peranti xAI Grok.');
  console.log('\nSedang menunggu anda selesaikan log masuk di browser...');

  openInPrivateBrowser(authUrl);

  const pollInterval = Math.max(3, Number(interval)) * 1000;
  const deadline = Date.now() + expiresIn * 1000;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    process.stdout.write('.');

    try {
      const pollRes = await fetch(`${baseUrl}/api/oauth/grok-cli/poll`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: cookie,
        },
        body: JSON.stringify({
          deviceCode,
          codeVerifier,
        }),
      });

      const pollData = await pollRes.json();
      if (pollData.success || pollData.accessToken || pollData.token) {
        console.log('\n\n🎉 [BERJAYA!] Akaun Grok Build anda telah berjaya disambungkan!');
        console.log('>>> Akaun baru telah ditambah ke dalam pool model Grok 4.6.');
        console.log('>>> Anda boleh menutup tetingkap InPrivate browser tadi.');
        return;
      }

      if (!pollData.pending && pollData.error !== 'authorization_pending') {
        throw new Error(pollData.error || pollData.errorDescription || 'Authorization failed.');
      }
    } catch (err) {
      if (!err.message.includes('authorization_pending')) {
        console.warn('\nNota:', err.message);
      }
    }
  }

  console.log('\n[TAMAT MASA] Sesi log masuk tamat tempoh. Sila cuba lagi.');
}

async function main() {
  console.clear();
  console.log('================================================================');
  console.log('       SENTINEL ROUTER — SAMBUNG AKAUN AI (KIRO & GROK)');
  console.log('================================================================');

  let config;
  let cookie;
  try {
    config = getRouterConfig();
    console.log(`Menyambung ke Gateway: ${config.baseUrl}...`);
    cookie = await loginToRouter(config.baseUrl, config.password);
    console.log('Gateway status: OK (Tersambung)');
  } catch (err) {
    console.error('Ralat persediaan:', err.message);
    process.exit(1);
  }

  console.log('\nPilih servis yang anda ingin sambung:');
  console.log('  [1] Kiro AI (Google Login — Percuma 50 Kredit Claude/GLM)');
  console.log('  [2] Grok Build (xAI / Google Login — Grok 4.6)');
  console.log('  [3] Keluar\n');

  const choice = await askQuestion('Pilihan anda (1/2/3): ');

  if (choice === '1') {
    await connectKiro(config.baseUrl, cookie);
  } else if (choice === '2') {
    await connectGrok(config.baseUrl, cookie);
  } else {
    console.log('Keluar.');
    process.exit(0);
  }

  console.log('\nSemak status terkini di dashboard:');
  console.log('👉 https://router.sentinelai.studio/dashboard/quota\n');
}

main().catch((err) => {
  console.error('\nRalat tidak dijangka:', err.message);
});
