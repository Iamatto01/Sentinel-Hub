import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3, urllib.request, json

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
key = cur.execute(\\"SELECT key FROM api_keys WHERE id = 'key-sentinel-class-vip'\\").fetchone()[0]

url = 'http://127.0.0.1:20128/v1/chat/completions'
body = {
    'model': 'uncensored/openai-fast',
    'messages': [{'role': 'user', 'content': 'Say hello'}]
}
req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={
    'Authorization': f'Bearer {key}',
    'Content-Type': 'application/json'
})

try:
    with urllib.request.urlopen(req, timeout=30) as resp:
        print('STATUS:', resp.status)
        data = json.loads(resp.read().decode())
        print('RESPONSE:', data['choices'][0]['message']['content'])
except Exception as e:
    print('ERROR:', e)
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:\n' + stdout.read().decode())
print('ERR:\n' + stderr.read().decode())
ssh.close()
