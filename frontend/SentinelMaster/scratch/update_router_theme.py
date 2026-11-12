#!/usr/bin/env python3
"""
Updates 9router container to fully adopt the Sentinel Hub (hub.sentinelai.studio) design language:
- Obsidian black base (#000000)
- Ambient matrix wallpaper with glowing radial top lighting
- Apple-grade glassmorphic panels, cards, and specular highlights
- Apple pill navigation in the frosted glass sidebar
- Solid crisp white primary buttons & frosted glass secondary controls
- Sleek platinum / silver Sentinel shield emblem & favicons
- Matching JetBrains Mono & Plus Jakarta Sans / SF Pro typography
"""

import subprocess
import sys

def run_cmd(cmd):
    p = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        print(f"FAILED: {cmd}\n{p.stderr}")
        sys.exit(p.returncode)
    return p.stdout.strip()

print("[1/5] Backing up and updating CSS...")
# Base compiled CSS (lines 1-4) + Sentinel Hub Theme
run_cmd("sudo docker exec 9router head -n 4 /app/.build/next/static/chunks/2vzastg94m6fm.css.orig > /tmp/new_css")
run_cmd("cat /tmp/sentinel-hub-theme.css >> /tmp/new_css")
run_cmd("sudo docker cp /tmp/new_css 9router:/app/.build/next/static/chunks/2vzastg94m6fm.css")

# Also append to /app/src/app/globals.css
run_cmd("sudo docker cp /tmp/sentinel-hub-theme.css 9router:/tmp/sentinel-hub-theme.css")
run_cmd("sudo docker exec 9router bash -c 'cat /tmp/sentinel-hub-theme.css >> /app/src/app/globals.css'")

print("[2/5] Updating OmniRouteLogo.tsx...")
logo_code = '''
type OmniRouteLogoProps = {
  size?: number;
  className?: string;
};

export default function OmniRouteLogo({ size = 20, className = "" }: OmniRouteLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      suppressHydrationWarning
    >
      <defs>
        <linearGradient id="sentinelGrad" x1="256" y1="50" x2="256" y2="440" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#e4e4e7" />
          <stop offset="100%" stopColor="#a1a1aa" />
        </linearGradient>
      </defs>
      <path
        d="M 256.0,56.0 L 106.6,273.1 L 43.2,314.0 L 43.2,400.0 L 110.9,425.8 L 256.0,372.1 L 401.1,425.8 L 468.9,400.0 L 468.9,314.0 L 405.4,273.1 Z M 246.3,111.9 L 248.5,193.6 L 199.0,225.8 Z M 265.7,111.9 L 313.0,225.8 L 263.5,193.6 Z M 231.3,111.9 L 177.5,180.7 L 184.0,228.0 Z M 280.7,111.9 L 328.0,228.0 L 334.5,180.7 Z M 164.6,204.3 L 134.5,262.4 L 168.9,243.0 Z M 347.4,204.3 L 343.1,243.0 L 377.5,262.4 Z M 235.6,225.8 L 186.1,251.7 L 186.1,307.5 Z M 276.4,225.8 L 325.9,307.5 L 325.9,251.7 Z M 166.8,264.5 L 128.1,281.8 L 168.9,305.4 Z M 345.2,264.5 L 343.1,305.4 L 383.9,281.8 Z M 246.3,225.8 L 248.5,281.8 L 186.1,382.8 L 184.0,329.1 Z M 265.7,225.8 L 328.0,329.1 L 325.9,382.8 L 263.5,281.8 Z M 117.3,294.6 L 162.5,322.6 L 117.3,350.6 Z M 394.7,294.6 L 394.7,350.6 L 349.5,322.6 Z M 104.4,298.9 L 59.3,322.6 L 59.3,384.9 L 104.4,357.0 Z M 407.6,298.9 L 407.6,357.0 L 452.7,384.9 L 452.7,322.6 Z M 166.8,331.2 L 121.6,359.1 L 166.8,387.1 Z M 345.2,331.2 L 345.2,387.1 L 390.4,359.1 Z M 113.0,365.6 L 63.6,393.6 L 110.9,425.8 L 162.5,395.7 Z M 399.0,365.6 L 349.5,395.7 L 401.1,425.8 L 448.4,393.6 Z"
        fill="url(#sentinelGrad)"
        fillRule="evenodd"
      />
    </svg>
  );
}
'''
with open("/tmp/OmniRouteLogo.tsx", "w", encoding="utf-8") as f:
    f.write(logo_code.strip())
run_cmd("sudo docker cp /tmp/OmniRouteLogo.tsx 9router:/app/src/shared/components/OmniRouteLogo.tsx")

print("[3/5] Updating favicon.svg & logo.svg to Sentinel Platinum...")
favicon_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <defs>
    <linearGradient id="favBg" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#1c1c1f" />
      <stop offset="100%" stop-color="#09090b" />
    </linearGradient>
    <linearGradient id="favEmblem" x1="32" y1="6" x2="32" y2="58" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#e4e4e7" />
      <stop offset="100%" stop-color="#a1a1aa" />
    </linearGradient>
  </defs>

  <rect width="64" height="64" rx="16" fill="url(#favBg)" />
  <rect x="0.75" y="0.75" width="62.5" height="62.5" rx="15.25" stroke="rgba(255, 255, 255, 0.18)" stroke-width="1.5" />

  <g transform="translate(7, 8) scale(0.098)">
    <path d="M 256.0,56.0 L 106.6,273.1 L 43.2,314.0 L 43.2,400.0 L 110.9,425.8 L 256.0,372.1 L 401.1,425.8 L 468.9,400.0 L 468.9,314.0 L 405.4,273.1 Z M 246.3,111.9 L 248.5,193.6 L 199.0,225.8 Z M 265.7,111.9 L 313.0,225.8 L 263.5,193.6 Z M 231.3,111.9 L 177.5,180.7 L 184.0,228.0 Z M 280.7,111.9 L 328.0,228.0 L 334.5,180.7 Z M 164.6,204.3 L 134.5,262.4 L 168.9,243.0 Z M 347.4,204.3 L 343.1,243.0 L 377.5,262.4 Z M 235.6,225.8 L 186.1,251.7 L 186.1,307.5 Z M 276.4,225.8 L 325.9,307.5 L 325.9,251.7 Z M 166.8,264.5 L 128.1,281.8 L 168.9,305.4 Z M 345.2,264.5 L 343.1,305.4 L 383.9,281.8 Z M 246.3,225.8 L 248.5,281.8 L 186.1,382.8 L 184.0,329.1 Z M 265.7,225.8 L 328.0,329.1 L 325.9,382.8 L 263.5,281.8 Z M 117.3,294.6 L 162.5,322.6 L 117.3,350.6 Z M 394.7,294.6 L 394.7,350.6 L 349.5,322.6 Z M 104.4,298.9 L 59.3,322.6 L 59.3,384.9 L 104.4,357.0 Z M 407.6,298.9 L 407.6,357.0 L 452.7,384.9 L 452.7,322.6 Z M 166.8,331.2 L 121.6,359.1 L 166.8,387.1 Z M 345.2,331.2 L 345.2,387.1 L 390.4,359.1 Z M 113.0,365.6 L 63.6,393.6 L 110.9,425.8 L 162.5,395.7 Z M 399.0,365.6 L 349.5,395.7 L 401.1,425.8 L 448.4,393.6 Z" fill="url(#favEmblem)" fill-rule="evenodd" />
  </g>
</svg>'''
with open("/tmp/favicon.svg", "w", encoding="utf-8") as f:
    f.write(favicon_svg)
run_cmd("sudo docker cp /tmp/favicon.svg 9router:/app/public/favicon.svg")
run_cmd("sudo docker cp /tmp/favicon.svg 9router:/app/public/apple-touch-icon.svg")
run_cmd("sudo docker cp /tmp/favicon.svg 9router:/app/public/icon-192.svg")

logo_svg = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" fill="none">
  <defs>
    <linearGradient id="sentinelLogoGrad" x1="256" y1="50" x2="256" y2="440" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="50%" stop-color="#e4e4e7" />
      <stop offset="100%" stop-color="#a1a1aa" />
    </linearGradient>
  </defs>
  <path d="M 256.0,56.0 L 106.6,273.1 L 43.2,314.0 L 43.2,400.0 L 110.9,425.8 L 256.0,372.1 L 401.1,425.8 L 468.9,400.0 L 468.9,314.0 L 405.4,273.1 Z M 246.3,111.9 L 248.5,193.6 L 199.0,225.8 Z M 265.7,111.9 L 313.0,225.8 L 263.5,193.6 Z M 231.3,111.9 L 177.5,180.7 L 184.0,228.0 Z M 280.7,111.9 L 328.0,228.0 L 334.5,180.7 Z M 164.6,204.3 L 134.5,262.4 L 168.9,243.0 Z M 347.4,204.3 L 343.1,243.0 L 377.5,262.4 Z M 235.6,225.8 L 186.1,251.7 L 186.1,307.5 Z M 276.4,225.8 L 325.9,307.5 L 325.9,251.7 Z M 166.8,264.5 L 128.1,281.8 L 168.9,305.4 Z M 345.2,264.5 L 343.1,305.4 L 383.9,281.8 Z M 246.3,225.8 L 248.5,281.8 L 186.1,382.8 L 184.0,329.1 Z M 265.7,225.8 L 328.0,329.1 L 325.9,382.8 L 263.5,281.8 Z M 117.3,294.6 L 162.5,322.6 L 117.3,350.6 Z M 394.7,294.6 L 394.7,350.6 L 349.5,322.6 Z M 104.4,298.9 L 59.3,322.6 L 59.3,384.9 L 104.4,357.0 Z M 407.6,298.9 L 407.6,357.0 L 452.7,384.9 L 452.7,322.6 Z M 166.8,331.2 L 121.6,359.1 L 166.8,387.1 Z M 345.2,331.2 L 345.2,387.1 L 390.4,359.1 Z M 113.0,365.6 L 63.6,393.6 L 110.9,425.8 L 162.5,395.7 Z M 399.0,365.6 L 349.5,395.7 L 401.1,425.8 L 448.4,393.6 Z" fill="url(#sentinelLogoGrad)" fill-rule="evenodd" />
</svg>'''
with open("/tmp/logo.svg", "w", encoding="utf-8") as f:
    f.write(logo_svg)
run_cmd("sudo docker cp /tmp/logo.svg 9router:/app/public/logo.svg")

print("[4/5] Updating themeStore.ts default to Sentinel...")
run_cmd("""sudo docker exec 9router node -e '
const fs = require("fs");
let p = "/app/src/store/themeStore.ts";
let s = fs.readFileSync(p, "utf8");
s = s.replace(`colorTheme: "coral",`, `colorTheme: "sentinel",`);
s = s.replace(`coral: "#e54d5e",`, `sentinel: "#ffffff",\\n  emerald: "#34d399",\\n  cyan: "#38bdf8",\\n  coral: "#e54d5e",`);
s = s.replace(`COLOR_THEMES[colorTheme] || COLOR_THEMES.coral;`, `COLOR_THEMES[colorTheme] || COLOR_THEMES.sentinel;`);
fs.writeFileSync(p, s);
'""")

print("[5/5] Committing changes to Docker image sentinel-proxy:omniroute-3.8.50-pwfix...")
run_cmd("sudo docker commit 9router sentinel-proxy:omniroute-3.8.50-pwfix")
print("SUCCESS: 9router has been updated with Sentinel Hub styling and committed to the image.")
