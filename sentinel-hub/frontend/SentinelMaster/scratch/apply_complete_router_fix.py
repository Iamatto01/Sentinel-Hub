#!/usr/bin/env python3
"""
Comprehensive Fix for SentinelRoute (router.sentinelai.studio)
1. Replaces public logo.png, apple-touch-icon.png, favicon.ico with Sentinel Shield.
2. Updates SQLite storage.sqlite key_value customLogoUrl to '/logo.svg'.
3. Strips legacy brand snippet from 1vpmbl4hekwi8.css -> 1vpmbl4hekwi8_v2.css (clean Inter font declarations only).
4. Compiles 2vzastg94m6fm_v3.css with complete Apple Obsidian theme & !important overrides.
5. Updates all RSC manifests to 1vpmbl4hekwi8_v2.css and 2vzastg94m6fm_v3.css.
6. Updates sw.js to omniroute-pwa-v3-sentinel and purges client cache on activate.
7. Commits container 9router to sentinel-proxy:omniroute-3.8.50-pwfix and restarts 9router.
"""

import os
import subprocess
import glob
import re
import sqlite3

def run(cmd, shell=True, check=True):
    print(f"+ {cmd}")
    res = subprocess.run(cmd, shell=shell, capture_output=True, text=True)
    if check and res.returncode != 0:
        print(f"FAILED (rc={res.returncode}):\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}")
        raise RuntimeError(f"Command failed: {cmd}")
    return res.stdout.strip()

print("=== [1/7] Generating Sentinel Shield PNG assets ===")
run("convert -density 300 -resize 512x512 -background none '/home/kali/server/SentinelMaster/public/favicon.svg' /tmp/shield-512.png")
run("convert /tmp/shield-512.png -resize 180x180 /tmp/apple-touch-icon.png")
run("convert /tmp/shield-512.png -resize 32x32 /tmp/favicon.ico")

# Copy into container
run("docker cp /tmp/shield-512.png 9router:/app/public/logo.png")
run("docker cp /tmp/apple-touch-icon.png 9router:/app/public/apple-touch-icon.png")
run("docker cp /tmp/favicon.ico 9router:/app/public/favicon.ico")
run("docker cp /tmp/shield-512.png 9router:/app/public/icon-512.png")

print("=== [2/7] Updating SQLite key_value customLogoUrl ===")
db_path = "/home/kali/server/9router-data/storage.sqlite"
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("UPDATE key_value SET value = '\"/logo.svg\"' WHERE key = 'customLogoUrl'")
conn.commit()
conn.close()
print("   Updated customLogoUrl to '/logo.svg'")

print("=== [3/7] Cleaning 1vpmbl4hekwi8.css -> 1vpmbl4hekwi8_v2.css ===")
# Extract inside container
raw_font_css = run("docker exec 9router sed -n '1,3p' /app/.build/next/static/chunks/1vpmbl4hekwi8.css")
with open("/tmp/1vpmbl4hekwi8_v2.css", "w", encoding="utf-8") as f:
    f.write(raw_font_css + "\n")
run("docker cp /tmp/1vpmbl4hekwi8_v2.css 9router:/app/.build/next/static/chunks/1vpmbl4hekwi8_v2.css")

print("=== [4/7] Generating 2vzastg94m6fm_v3.css ===")
# Read the base chunk 2vzastg94m6fm.css (or original) inside container
base_chunk = run("docker exec 9router head -n 30 /app/.build/next/static/chunks/2vzastg94m6fm.css")

theme_css = """
/* ========================================================
   SENTINEL MASTER OBSIDIAN DESIGN SUITE (Parity with Sentinel Hub)
   ======================================================== */

:root, html, body, .dark, [data-theme="dark"], [data-theme="system"] {
  --bg: #000000 !important;
  --bg-soft: #08080a !important;
  --color-bg: #000000 !important;
  --color-bg-alt: #08080a !important;
  --color-bg-primary: #000000 !important;
  --color-bg-subtle: #08080a !important;
  --color-surface: rgba(14, 14, 18, 0.72) !important;
  --panel: rgba(14, 14, 18, 0.72) !important;
  --panel-solid: #0e0e11 !important;
  --color-surface-1: rgba(14, 14, 18, 0.72) !important;
  --color-surface-2: rgba(22, 22, 26, 0.75) !important;
  --panel-2: rgba(22, 22, 26, 0.75) !important;
  --panel-2-solid: #141418 !important;
  --color-surface-3: rgba(30, 30, 36, 0.75) !important;
  --panel-3: rgba(30, 30, 36, 0.75) !important;
  --color-card: rgba(14, 14, 18, 0.72) !important;
  --color-sidebar: rgba(10, 10, 14, 0.88) !important;
  --color-border: rgba(255, 255, 255, 0.08) !important;
  --line: rgba(255, 255, 255, 0.08) !important;
  --line-soft: rgba(255, 255, 255, 0.05) !important;
  --glass-border: rgba(255, 255, 255, 0.14) !important;
  --color-text-main: #ffffff !important;
  --color-text-primary: #ffffff !important;
  --text: #ffffff !important;
  --color-text-muted: #a1a1aa !important;
  --text-dim: #a1a1aa !important;
  --text-faint: #71717a !important;
  --color-primary: #ffffff !important;
  --color-primary-hover: #e4e4e7 !important;
  --accent: #ffffff !important;
  --color-brand-500: #ffffff !important;
  --color-brand-600: #e4e4e7 !important;
  --color-brand-700: #d4d4d8 !important;
  --green: #34d399 !important;
  --amber: #fbbf24 !important;
  --red: #f87171 !important;
  --mono: 'JetBrains Mono', ui-monospace, monospace !important;
  --sans: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Plus Jakarta Sans', system-ui, sans-serif !important;
}

[data-theme="light"] {
  --bg: #f5f5f7 !important;
  --bg-soft: #e8e8ed !important;
  --color-bg: #f5f5f7 !important;
  --color-surface: rgba(255, 255, 255, 0.8) !important;
  --panel: rgba(255, 255, 255, 0.8) !important;
  --panel-solid: #ffffff !important;
  --color-border: rgba(0, 0, 0, 0.1) !important;
  --color-text-main: #1d1d1f !important;
  --text: #1d1d1f !important;
  --color-text-muted: #6e6e73 !important;
  --text-dim: #6e6e73 !important;
  --color-primary: #000000 !important;
  --accent: #000000 !important;
}

/* ── Global Canvas & Ambient Lighting ── */
body, html, #__next {
  background-color: #000000 !important;
  color: #ffffff !important;
  font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Plus Jakarta Sans', system-ui, sans-serif !important;
}

body::before {
  content: "" !important;
  position: fixed !important;
  inset: 0 !important;
  pointer-events: none !important;
  z-index: 0 !important;
  background-image: radial-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px) !important;
  background-size: 32px 32px !important;
  mask-image: radial-gradient(ellipse 90% 70% at 50% 0%, black 40%, transparent 100%) !important;
  -webkit-mask-image: radial-gradient(ellipse 90% 70% at 50% 0%, black 40%, transparent 100%) !important;
  opacity: 0.75 !important;
}

body::after {
  content: "" !important;
  position: fixed !important;
  top: -200px !important;
  left: 50% !important;
  transform: translateX(-50%) !important;
  width: 900px !important;
  height: 500px !important;
  pointer-events: none !important;
  z-index: 0 !important;
  background: radial-gradient(circle, rgba(255, 255, 255, 0.035) 0%, transparent 70%) !important;
}

/* ── Sidebar (Glassmorphic Obsidian) ── */
aside, [class*="w-64"], [class*="w-72"] {
  background: rgba(10, 10, 14, 0.88) !important;
  backdrop-filter: blur(28px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(28px) saturate(180%) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.08) !important;
  position: relative !important;
  z-index: 20 !important;
}

header, nav[class*="border-b"], div[class*="border-b"][class*="sticky"] {
  background: rgba(10, 10, 14, 0.85) !important;
  backdrop-filter: blur(24px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
  position: relative !important;
  z-index: 20 !important;
}

/* Remove gradient behind the logo */
aside div[class*="from-[#06b6d4]"],
aside div[class*="from-cyan"] {
  background: transparent !important;
  box-shadow: none !important;
}

/* ── Apple Pill Navigation in Sidebar ── */
aside a[class*="bg-primary"],
aside a[class*="bg-brand"],
aside [aria-current="page"],
aside [class*="text-primary"][class*="bg-"],
aside a.active,
aside a[href="/home"][class*="bg-"] {
  background: rgba(255, 255, 255, 0.1) !important;
  border: 1px solid rgba(255, 255, 255, 0.18) !important;
  color: #ffffff !important;
  border-radius: 9999px !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.22), 0 4px 14px rgba(0, 0, 0, 0.4) !important;
}

/* ── Bento Surfaces & Glass Panels ── */
div.bg-surface, div.bg-surface-2, .bg-surface, .bg-surface-2,
[class*="bg-surface"], [class*="bg-surface-2"],
div[class*="rounded-xl"][class*="border"],
div[class*="rounded-2xl"][class*="border"],
div[class*="rounded-lg"][class*="border"] {
  background: rgba(14, 14, 18, 0.72) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.09) !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.12), 0 10px 30px -10px rgba(0, 0, 0, 0.8) !important;
  position: relative !important;
  z-index: 1 !important;
}

/* ── Home Partner Promo Banners ── */
div[class*="border-emerald"], div[class*="border-green"],
div[class*="border-blue"], div[class*="border-cyan"],
div[class*="bg-emerald-950"], div[class*="bg-green-950"],
div[class*="bg-blue-950"], div[class*="bg-cyan-950"] {
  background: rgba(14, 14, 18, 0.75) !important;
  backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.15), 0 8px 24px rgba(0, 0, 0, 0.6) !important;
}

/* ── Action Buttons: Pure Crisp White (Primary) ── */
a[href*="kimi"], a[href*="copilot"], a[href*="inference"],
.bg-primary, [class*="bg-brand-500"], button.bg-brand-500, a.bg-brand-500,
button[class*="bg-primary"], a[class*="bg-primary"],
button[class*="bg-blue-"], a[class*="bg-blue-"],
a[class*="bg-cyan-"] {
  background: #ffffff !important;
  color: #000000 !important;
  font-weight: 600 !important;
  border: none !important;
  box-shadow: 0 2px 10px rgba(255, 255, 255, 0.15) !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

a[href*="kimi"]:hover, a[href*="copilot"]:hover, a[href*="inference"]:hover,
.bg-primary:hover, [class*="bg-brand-500"]:hover, button.bg-brand-500:hover,
button[class*="bg-primary"]:hover, a[class*="bg-primary"]:hover {
  background: #e4e4e7 !important;
  color: #000000 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.25) !important;
}

a[href*="kimi"] svg, a[href*="copilot"] svg, a[href*="inference"] svg,
.bg-primary svg, [class*="bg-brand-500"] svg, button.bg-brand-500 svg,
button[class*="bg-primary"] svg, a[class*="bg-primary"] svg {
  color: #000000 !important;
  stroke: #000000 !important;
}

/* ── Secondary Buttons (Frosted Glass) ── */
button.border, [class*="border-border"], [class*="hover:bg-surface-2"],
button[class*="border-white/10"] {
  background: rgba(255, 255, 255, 0.05) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  color: #ffffff !important;
  backdrop-filter: blur(12px) !important;
  border-radius: 9999px !important;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08) !important;
  transition: all 0.2s ease !important;
}

button.border:hover, button[class*="border-white/10"]:hover {
  background: rgba(255, 255, 255, 0.1) !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}

/* ── Inputs & Selects ── */
input, select, textarea {
  background-color: rgba(12, 12, 16, 0.8) !important;
  border: 1px solid rgba(255, 255, 255, 0.12) !important;
  border-radius: 10px !important;
  color: #ffffff !important;
}

input:focus, select:focus, textarea:focus {
  border-color: rgba(255, 255, 255, 0.45) !important;
  box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12) !important;
  outline: none !important;
}

/* ── Status Indicators & Glowing Badges ── */
.text-emerald-400, .text-green-400, .text-emerald-500, [class*="text-emerald-"], [class*="text-green-"] {
  color: #34d399 !important;
}
.bg-emerald-500, .bg-green-500, [class*="bg-emerald-500"], [class*="bg-green-500"] {
  background-color: #34d399 !important;
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.6) !important;
}
.text-amber-400, .text-yellow-400, .text-amber-500, [class*="text-amber-"], [class*="text-yellow-"] {
  color: #fbbf24 !important;
}
.bg-amber-500, .bg-yellow-500, [class*="bg-amber-500"] {
  background-color: #fbbf24 !important;
  box-shadow: 0 0 8px rgba(251, 191, 36, 0.6) !important;
}
.text-red-400, .text-rose-400, .text-red-500, [class*="text-red-"], [class*="text-rose-"] {
  color: #f87171 !important;
}
.bg-red-500, .bg-rose-500, [class*="bg-red-500"] {
  background-color: #f87171 !important;
  box-shadow: 0 0 8px rgba(248, 113, 113, 0.6) !important;
}

/* ── Modals & Dialogs ── */
div[role="dialog"], .ant-modal-content, [class*="max-w-"][class*="bg-surface"] {
  background: #0e0e12 !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  border-radius: 20px !important;
  box-shadow: 0 24px 70px -12px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
}

/* Eliminate macOS traffic lights */
div[class*="bg-[#FF5F56]"],
div[class*="bg-[#FFBD2E]"],
div[class*="bg-[#27C93F]"],
div:has(> div[class*="bg-[#FF5F56]"]),
.traffic-lights {
  display: none !important;
}

/* ── Custom Scrollbar ── */
::-webkit-scrollbar {
  width: 7px !important;
  height: 7px !important;
}
::-webkit-scrollbar-track {
  background: transparent !important;
}
::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12) !important;
  border-radius: 99px !important;
}
::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25) !important;
}
"""

with open("/tmp/2vzastg94m6fm_v3.css", "w", encoding="utf-8") as f:
    f.write(base_chunk + "\n" + theme_css)

run("docker cp /tmp/2vzastg94m6fm_v3.css 9router:/app/.build/next/static/chunks/2vzastg94m6fm_v3.css")

print("=== [5/7] Updating RSC Manifests inside container ===")
# Python one-liner inside container to update all client-reference manifests
update_manifests_code = """
import glob

manifests = glob.glob('/app/.build/next/server/**/page_client-reference-manifest.js', recursive=True)
count = 0
for m in manifests:
    with open(m, 'r', encoding='utf-8') as f:
        content = f.read()
    changed = False
    if '1vpmbl4hekwi8.css' in content:
        content = content.replace('1vpmbl4hekwi8.css', '1vpmbl4hekwi8_v2.css')
        changed = True
    if '2vzastg94m6fm_v2.css' in content:
        content = content.replace('2vzastg94m6fm_v2.css', '2vzastg94m6fm_v3.css')
        changed = True
    elif '2vzastg94m6fm.css' in content:
        content = content.replace('2vzastg94m6fm.css', '2vzastg94m6fm_v3.css')
        changed = True
    if changed:
        with open(m, 'w', encoding='utf-8') as f:
            f.write(content)
        count += 1
print(f'Updated {count}/{len(manifests)} manifests.')
"""
with open("/tmp/update_manifests.py", "w", encoding="utf-8") as f:
    f.write(update_manifests_code)
run("docker cp /tmp/update_manifests.py 9router:/tmp/update_manifests.py")
run("docker exec 9router node -e 'require(\"child_process\").execSync(\"python3 /tmp/update_manifests.py || python /tmp/update_manifests.py\", {stdio: \"inherit\"})' || docker exec 9router python3 /tmp/update_manifests.py || true")

# If python is not in container, execute node script inside container!
update_manifests_node = """
const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('page_client-reference-manifest.js')) results.push(file);
  });
  return results;
}

const manifests = walk('/app/.build/next/server');
let count = 0;
manifests.forEach(m => {
  let content = fs.readFileSync(m, 'utf8');
  let changed = false;
  if (content.includes('1vpmbl4hekwi8.css')) {
    content = content.replaceAll('1vpmbl4hekwi8.css', '1vpmbl4hekwi8_v2.css');
    changed = true;
  }
  if (content.includes('2vzastg94m6fm_v2.css')) {
    content = content.replaceAll('2vzastg94m6fm_v2.css', '2vzastg94m6fm_v3.css');
    changed = true;
  } else if (content.includes('2vzastg94m6fm.css')) {
    content = content.replaceAll('2vzastg94m6fm.css', '2vzastg94m6fm_v3.css');
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(m, content, 'utf8');
    count++;
  }
});
console.log(`Node updated ${count}/${manifests.length} manifests.`);
"""
with open("/tmp/update_manifests_node.js", "w", encoding="utf-8") as f:
    f.write(update_manifests_node)
run("docker cp /tmp/update_manifests_node.js 9router:/tmp/update_manifests_node.js")
run("docker exec 9router node /tmp/update_manifests_node.js")

print("=== [6/7] Updating Service Worker (sw.js) to force cache purge ===")
sw_code = """
const CACHE_NAME = "omniroute-pwa-v3-sentinel";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  // Never cache static styles or JS chunks to prevent stale UI issues
  if (url.pathname.startsWith("/_next/static/")) {
    return;
  }
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
"""
with open("/tmp/sw.js", "w", encoding="utf-8") as f:
    f.write(sw_code.strip() + "\n")
run("docker cp /tmp/sw.js 9router:/app/public/sw.js")

print("=== [7/7] Committing Docker Image & Restarting 9router ===")
run("docker restart 9router")
run("docker commit 9router sentinel-proxy:omniroute-3.8.50-pwfix")
print("=== All OmniRoute updates committed and active! ===")
