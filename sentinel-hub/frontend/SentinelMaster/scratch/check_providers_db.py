import paramiko
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """docker exec 9router node -e '
const Database = require("better-sqlite3");
const db = new Database("/app/data/storage.sqlite", { readonly: true });
console.log("=== PROVIDER NODES ===");
try {
  console.log(db.prepare("SELECT * FROM provider_nodes").all());
} catch(e) { console.log(e.message); }

console.log("=== PROVIDERS ===");
try {
  console.log(db.prepare("SELECT * FROM providers").all());
} catch(e) { console.log(e.message); }
'"""
stdin, stdout, stderr = ssh.exec_command(cmd)
print('STDOUT:\n' + stdout.read().decode('utf-8', errors='replace'))
print('STDERR:\n' + stderr.read().decode('utf-8', errors='replace'))
ssh.close()
