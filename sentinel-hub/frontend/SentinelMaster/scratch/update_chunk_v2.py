#!/usr/bin/env python3
import subprocess
import sys

def run_cmd(cmd):
    p = subprocess.run(cmd, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    if p.returncode != 0:
        print(f"FAILED: {cmd}\n{p.stderr}")
        sys.exit(p.returncode)
    return p.stdout.strip()

print("[1/4] Copying to 2vzastg94m6fm_v2.css in container...")
run_cmd("sudo docker exec 9router cp /app/.build/next/static/chunks/2vzastg94m6fm.css /app/.build/next/static/chunks/2vzastg94m6fm_v2.css")

print("[2/4] Updating server manifests...")
replace_script = '''
const fs = require("fs");
const path = require("path");

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
    } else if (entry.name.endsWith(".js") || entry.name.endsWith(".json")) {
      const content = fs.readFileSync(fullPath, "utf8");
      if (content.includes("2vzastg94m6fm.css")) {
        const updated = content.replaceAll("2vzastg94m6fm.css", "2vzastg94m6fm_v2.css");
        fs.writeFileSync(fullPath, updated, "utf8");
        console.log("Updated:", fullPath);
      }
    }
  }
}

walk("/app/.build/next/server");
'''
run_cmd(f"sudo docker exec 9router node -e '{replace_script}'")

print("[3/4] Restarting 9router...")
run_cmd("sudo docker restart 9router")

print("[4/4] Verifying...")
import time
time.sleep(4)
res = run_cmd("sudo docker ps --filter 'name=9router' --format '{{.Names}} {{.Status}}'")
print("Container status:", res)

# Check rendered HTML
html_check = run_cmd("curl -sL http://127.0.0.1:20128/dashboard | grep -o '2vzastg94m6fm[^\" ]*' | head -n 5")
print("Rendered CSS in HTML:", html_check)

# Commit
run_cmd("sudo docker commit 9router sentinel-proxy:omniroute-3.8.50-pwfix")
print("Docker image committed successfully.")
