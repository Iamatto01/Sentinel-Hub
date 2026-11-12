import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = """python3 -c "
import sqlite3

conn = sqlite3.connect('file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro', uri=True)
cur = conn.cursor()
tables = [r[0] for r in cur.execute('SELECT name FROM sqlite_master WHERE type=\\'table\\'').fetchall()]
for t in tables:
    try:
        rows = cur.execute(f'SELECT * FROM {t}').fetchall()
        for r in rows:
            text = str(r)
            if 'mistral' in text.lower() or 'unity' in text.lower() or 'evil' in text.lower():
                print(f'Match in table {t}: {text[:200]}')
                break
    except Exception as e:
        pass
" """
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
