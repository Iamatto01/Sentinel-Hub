import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3, json

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
val = cur.execute(\\"SELECT value FROM key_value WHERE namespace = 'customModels' AND key = 'openai-compatible-chat-f19e79bf-f569-4fb4-b157-9104463745d3'\\").fetchone()
if val:
    print(json.dumps(json.loads(val[0]), indent=2))
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
