import paramiko
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """
docker exec 9router grep -rn -i -o ".\\{0,20\\}x-sentinel route.\\{0,20\\}" /app/.build/next/static/chunks /app/.build/next/server 2>/dev/null | head -n 20
"""
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode('utf-8', errors='replace')
print('CASE-INSENSITIVE MATCHES:\n' + out)
ssh.close()
