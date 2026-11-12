import paramiko
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

print("=== [1/4] Applying sed fix for X-Sentinel Route- -> X-Sentinel-Route- ===")
fix_cmd = """docker exec 9router sh -c '
for d in /app/.build/next/static/chunks /app/.build/next/server; do
  find "$d" -type f -name "*.js" -exec sed -i "s/X-Sentinel Route-/X-Sentinel-Route-/g" {} +
  find "$d" -type f -name "*.js" -exec sed -i "s/x-sentinel route-/x-sentinel-route-/g" {} +
done
'"""
stdin, stdout, stderr = ssh.exec_command(fix_cmd)
print("Fix rc:", stdout.channel.recv_exit_status())

print("=== [2/4] Verifying remaining matches ===")
verify_cmd = """docker exec 9router sh -c '
grep -rn "X-Sentinel Route-" /app/.build/next/static/chunks /app/.build/next/server 2>/dev/null | wc -l
'"""
stdin, stdout, stderr = ssh.exec_command(verify_cmd)
print("Remaining invalid headers count:", stdout.read().decode().strip())

print("=== [3/4] Updating Service Worker (sw.js) cache tag ===")
sw_cmd = """docker exec 9router sh -c '
CACHE_TAG="sentinel-route-fix-$(date +%s)"
if [ -f /app/public/sw.js ]; then
  sed -i "s/const CACHE_NAME = \\"[^\\"]*\\";/const CACHE_NAME = \\"$CACHE_TAG\\";/g" /app/public/sw.js 2>/dev/null || true
  echo "sw.js bumped to $CACHE_TAG"
fi
'"""
stdin, stdout, stderr = ssh.exec_command(sw_cmd)
print(stdout.read().decode().strip())

print("=== [4/4] Restarting 9router and committing image ===")
restart_cmd = """
docker restart 9router
docker commit 9router sentinel-proxy:omniroute-3.8.50-pwfix
echo "Restart and commit complete!"
"""
stdin, stdout, stderr = ssh.exec_command(restart_cmd)
print(stdout.read().decode().strip())

ssh.close()
