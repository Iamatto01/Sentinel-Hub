#!/usr/bin/env python3
"""
Minimalist Black & White Theme with Glassmorphism and Collapsible Sidebar
for SentinelRoute (router.sentinelai.studio)
"""

import os
import subprocess
import sqlite3

def run(cmd, shell=True, check=True):
    print(f"+ {cmd}")
    res = subprocess.run(cmd, shell=shell, capture_output=True, text=True)
    if check and res.returncode != 0:
        print(f"FAILED (rc={res.returncode}):\nSTDOUT:\n{res.stdout}\nSTDERR:\n{res.stderr}")
        raise RuntimeError(f"Command failed: {cmd}")
    return res.stdout.strip()

print("=== [1/6] Clearing customLogoUrl in SQLite ===")
db_path = "/home/kali/server/9router-data/storage.sqlite"
conn = sqlite3.connect(db_path)
cur = conn.cursor()
cur.execute("UPDATE key_value SET value = '\"\"' WHERE key = 'customLogoUrl'")
conn.commit()
conn.close()
print("   customLogoUrl set to empty string (native metallic shield will render)")

print("=== [2/6] Generating clean font chunk 1vpmbl4hekwi8_v2.css ===")
raw_font_css = run("docker exec 9router sed -n '1,3p' /app/.build/next/static/chunks/1vpmbl4hekwi8.css")
with open("/tmp/1vpmbl4hekwi8_v2.css", "w", encoding="utf-8") as f:
    f.write(raw_font_css + "\n")
run("docker cp /tmp/1vpmbl4hekwi8_v2.css 9router:/app/.build/next/static/chunks/1vpmbl4hekwi8_v2.css")

print("=== [3/6] Generating 2vzastg94m6fm_v4.css ===")
base_chunk = run("docker exec 9router head -n 30 /app/.build/next/static/chunks/2vzastg94m6fm.css")

minimalist_css = """
/* ========================================================
   SENTINEL MINIMALIST MONOCHROME GLASS SUITE
   Pure Obsidian Black (#000000) & Crisp Apple White
   Clean Glassmorphic Cards (14px radius), Working Collapse Sidebar
   ======================================================== */

:root, html, body, .dark, [data-theme="dark"], [data-theme="system"] {
  --bg: #000000 !important;
  --bg-soft: #08080a !important;
  --color-bg: #000000 !important;
  --color-bg-alt: #08080a !important;
  --color-bg-primary: #000000 !important;
  --color-bg-subtle: #08080a !important;
  --color-surface: rgba(12, 12, 16, 0.72) !important;
  --panel: rgba(12, 12, 16, 0.72) !important;
  --panel-solid: #0e0e11 !important;
  --color-surface-1: rgba(12, 12, 16, 0.72) !important;
  --color-surface-2: rgba(20, 20, 24, 0.75) !important;
  --panel-2: rgba(20, 20, 24, 0.75) !important;
  --panel-2-solid: #141418 !important;
  --color-surface-3: rgba(26, 26, 32, 0.75) !important;
  --panel-3: rgba(26, 26, 32, 0.75) !important;
  --color-card: rgba(12, 12, 16, 0.72) !important;
  --color-sidebar: rgba(8, 8, 12, 0.88) !important;
  --color-border: rgba(255, 255, 255, 0.08) !important;
  --line: rgba(255, 255, 255, 0.08) !important;
  --line-soft: rgba(255, 255, 255, 0.05) !important;
  --glass-border: rgba(255, 255, 255, 0.12) !important;
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
  --radius: 14px !important;
  --radius-sm: 10px !important;
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

/* ── Pure Obsidian Canvas & Subtle Spotlight Lighting ── */
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

/* ── Sidebar (Glassmorphic Obsidian & Working Collapse) ── */
aside, .dashboard-sidebar-desktop aside {
  background: rgba(8, 8, 12, 0.88) !important;
  backdrop-filter: blur(28px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(28px) saturate(180%) !important;
  border-right: 1px solid rgba(255, 255, 255, 0.08) !important;
  position: relative !important;
  z-index: 20 !important;
}

/* Hide ONLY decorative macOS traffic light circles, KEEP the collapse button visible! */
div[class*="bg-[#FF5F56]"],
div[class*="bg-[#FFBD2E]"],
div[class*="bg-[#27C93F]"] {
  display: none !important;
}

/* Style Collapse Sidebar Toggle Button */
aside button[title*="Sidebar"],
aside button[aria-label*="Sidebar"],
aside button:has(span[class*="material-symbols-outlined"]) {
  display: inline-flex !important;
  align-items: center !important;
  justify-content: center !important;
  opacity: 1 !important;
  visibility: visible !important;
  background: rgba(255, 255, 255, 0.06) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #a1a1aa !important;
  border-radius: 8px !important;
  padding: 4px !important;
  cursor: pointer !important;
  transition: all 0.2s ease !important;
}

aside button[title*="Sidebar"]:hover,
aside button[aria-label*="Sidebar"]:hover {
  background: rgba(255, 255, 255, 0.14) !important;
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.25) !important;
}

/* Sidebar Top Logo: Pure Metallic Shield, Clean Transparent Background */
aside div.size-8,
aside div[class*="size-8"],
aside div[class*="from-[#06b6d4]"],
aside div[class*="from-cyan"] {
  background: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

/* Active Sidebar Navigation Pill */
aside a[class*="bg-primary"],
aside a[class*="bg-brand"],
aside [aria-current="page"],
aside a.active,
aside a[href="/home"][class*="bg-"] {
  background: rgba(255, 255, 255, 0.08) !important;
  border: 1px solid rgba(255, 255, 255, 0.16) !important;
  color: #ffffff !important;
  border-radius: 10px !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.18), 0 2px 8px rgba(0, 0, 0, 0.5) !important;
}

/* ── Header: Sleek Obsidian Glass ── */
header, nav[class*="border-b"], div[class*="border-b"][class*="sticky"] {
  background: rgba(8, 8, 12, 0.85) !important;
  backdrop-filter: blur(24px) saturate(180%) !important;
  -webkit-backdrop-filter: blur(24px) saturate(180%) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
  position: relative !important;
  z-index: 20 !important;
}

/* Header Buttons (Quick Nav, Language, Theme, Logout) */
header button {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #a1a1aa !important;
  border-radius: 10px !important;
  box-shadow: none !important;
  transition: all 0.2s ease !important;
}

header button:hover {
  background: rgba(255, 255, 255, 0.09) !important;
  color: #ffffff !important;
  border-color: rgba(255, 255, 255, 0.22) !important;
}

header button span {
  color: inherit !important;
}

/* ── Professional Minimalist Glass Panels & Cards (14px Radius — NO CIRCLES/OVALS!) ── */
.bg-surface, .bg-card, div[class*="rounded-card"],
div.bg-surface, div.bg-surface-2,
[class*="bg-surface"], [class*="bg-surface-2"] {
  background: rgba(12, 12, 16, 0.72) !important;
  backdrop-filter: blur(20px) !important;
  -webkit-backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 14px !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 8px 32px rgba(0, 0, 0, 0.75) !important;
  position: relative !important;
  z-index: 1 !important;
}

/* Card hover */
.bg-surface:hover, .bg-card:hover, div[class*="rounded-card"]:hover {
  border-color: rgba(255, 255, 255, 0.18) !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.16), 0 12px 40px rgba(0, 0, 0, 0.85) !important;
}

/* Ensure containers have normal rectangular rounded borders (NOT 9999px) */
div:has(> h2), div:has(> h3),
section[class*="border"],
div[class*="border"][class*="rounded-"],
li[class*="border"][class*="rounded-"],
div[role="region"],
ol li, ul li[class*="rounded-"] {
  border-radius: 14px !important;
}

/* Quick Start Step Cards */
ol li {
  background: rgba(255, 255, 255, 0.03) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 12px !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.06) !important;
}

/* Home partner promo cards - Clean Monochrome Glass */
div[class*="border-emerald"], div[class*="border-green"],
div[class*="border-blue"], div[class*="border-cyan"],
div[class*="bg-emerald-950"], div[class*="bg-green-950"],
div[class*="bg-blue-950"], div[class*="bg-cyan-950"] {
  background: rgba(12, 12, 16, 0.72) !important;
  backdrop-filter: blur(20px) !important;
  border: 1px solid rgba(255, 255, 255, 0.08) !important;
  border-radius: 14px !important;
  box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.1), 0 8px 24px rgba(0, 0, 0, 0.6) !important;
}

/* ── Primary Action Buttons: Crisp Apple White ── */
.bg-primary, [class*="bg-brand-500"], button.bg-brand-500, a.bg-brand-500,
button[class*="bg-primary"], a[class*="bg-primary"],
a[href*="kimi"], a[href*="copilot"], a[href*="inference"],
button[class*="bg-blue-"], a[class*="bg-blue-"],
button[class*="bg-green-"], a[class*="bg-green-"],
a[class*="bg-cyan-"] {
  background: #ffffff !important;
  color: #000000 !important;
  font-weight: 600 !important;
  border: 1px solid #ffffff !important;
  border-radius: 10px !important;
  box-shadow: 0 2px 10px rgba(255, 255, 255, 0.16) !important;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1) !important;
}

.bg-primary:hover, [class*="bg-brand-500"]:hover, button.bg-brand-500:hover,
a[href*="kimi"]:hover, a[href*="copilot"]:hover, a[href*="inference"]:hover,
button[class*="bg-primary"]:hover, a[class*="bg-primary"]:hover {
  background: #e4e4e7 !important;
  color: #000000 !important;
  border-color: #e4e4e7 !important;
  transform: translateY(-1px) !important;
  box-shadow: 0 4px 16px rgba(255, 255, 255, 0.28) !important;
}

.bg-primary svg, [class*="bg-brand-500"] svg, button.bg-brand-500 svg,
a[href*="kimi"] svg, a[href*="copilot"] svg, a[href*="inference"] svg,
button[class*="bg-primary"] svg, a[class*="bg-primary"] svg {
  color: #000000 !important;
  stroke: #000000 !important;
}

/* ── Secondary & Outline Buttons ── */
button.border, [class*="border-border"][class*="rounded-"],
button[class*="border-white/10"], button[class*="border-black/10"] {
  background: rgba(255, 255, 255, 0.04) !important;
  border: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: #ffffff !important;
  border-radius: 10px !important;
  backdrop-filter: blur(12px) !important;
  transition: all 0.2s ease !important;
}

button.border:hover {
  background: rgba(255, 255, 255, 0.08) !important;
  border-color: rgba(255, 255, 255, 0.22) !important;
}

/* ── Minimalist Status Dots ── */
span.rounded-full.bg-emerald-500, span.rounded-full.bg-green-500,
div.rounded-full.bg-emerald-500, div.rounded-full.bg-green-500 {
  background-color: #34d399 !important;
  box-shadow: 0 0 6px rgba(52, 211, 153, 0.6) !important;
}

span.rounded-full.bg-amber-500, span.rounded-full.bg-yellow-500,
div.rounded-full.bg-amber-500, div.rounded-full.bg-yellow-500 {
  background-color: #fbbf24 !important;
  box-shadow: 0 0 6px rgba(251, 191, 36, 0.6) !important;
}

span.rounded-full.bg-red-500, span.rounded-full.bg-rose-500,
div.rounded-full.bg-red-500, div.rounded-full.bg-rose-500 {
  background-color: #f87171 !important;
  box-shadow: 0 0 6px rgba(248, 113, 113, 0.6) !important;
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

/* ── Tables ── */
table {
  width: 100% !important;
  border-collapse: collapse !important;
}

thead tr, th {
  background: rgba(14, 14, 18, 0.88) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
  color: #a1a1aa !important;
  font-size: 11px !important;
  font-weight: 600 !important;
  letter-spacing: 0.06em !important;
  text-transform: uppercase !important;
}

tbody tr {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04) !important;
}

tbody tr:hover {
  background-color: rgba(255, 255, 255, 0.035) !important;
}

/* ── Modals & Dialogs ── */
div[role="dialog"], .ant-modal-content, [class*="max-w-"][class*="bg-surface"] {
  background: #0e0e12 !important;
  border: 1px solid rgba(255, 255, 255, 0.14) !important;
  border-radius: 20px !important;
  box-shadow: 0 24px 70px -12px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.2) !important;
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

with open("/tmp/2vzastg94m6fm_v4.css", "w", encoding="utf-8") as f:
    f.write(base_chunk + "\n" + minimalist_css)

run("docker cp /tmp/2vzastg94m6fm_v4.css 9router:/app/.build/next/static/chunks/2vzastg94m6fm_v4.css")

print("=== [4/6] Updating RSC Manifests inside container to v4 ===")
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
  if (content.includes('2vzastg94m6fm_v3.css')) {
    content = content.replaceAll('2vzastg94m6fm_v3.css', '2vzastg94m6fm_v4.css');
    changed = true;
  } else if (content.includes('2vzastg94m6fm_v2.css')) {
    content = content.replaceAll('2vzastg94m6fm_v2.css', '2vzastg94m6fm_v4.css');
    changed = true;
  } else if (content.includes('2vzastg94m6fm.css')) {
    content = content.replaceAll('2vzastg94m6fm.css', '2vzastg94m6fm_v4.css');
    changed = true;
  }
  if (changed) {
    fs.writeFileSync(m, content, 'utf8');
    count++;
  }
});
console.log(`Node updated ${count}/${manifests.length} manifests to v4.`);
"""
with open("/tmp/update_manifests_v4.js", "w", encoding="utf-8") as f:
    f.write(update_manifests_node)
run("docker cp /tmp/update_manifests_v4.js 9router:/tmp/update_manifests_v4.js")
run("docker exec 9router node /tmp/update_manifests_v4.js")

print("=== [5/6] Updating Service Worker (sw.js) to v4 ===")
sw_code = """
const CACHE_NAME = "omniroute-pwa-v4-minimalist";

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

print("=== [6/6] Committing Docker Image & Restarting 9router ===")
run("docker restart 9router")
run("docker commit 9router sentinel-proxy:omniroute-3.8.50-pwfix")
print("=== Complete Minimalist Black & White Fix Applied & Active! ===")
