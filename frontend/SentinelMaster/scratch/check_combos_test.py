import paramiko, json

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = '''
PASS=$(grep HUB_ROUTER_PASSWORD /home/kali/server/SentinelMaster/.env.local | cut -d= -f2-)
curl -s -c /tmp/omni_test.jar -X POST http://127.0.0.1:20128/api/auth/login -H 'Content-Type: application/json' -d "{\\"password\\":\\"$PASS\\"}" > /dev/null
curl -s -b /tmp/omni_test.jar http://127.0.0.1:20128/api/combos
'''
stdin, stdout, stderr = ssh.exec_command(cmd)
out = stdout.read().decode()
try:
    data = json.loads(out)
    combos = [c.get('name') for c in data.get('combos', [])]
    print('Total combos on OmniRoute:', len(combos))
    print('Combo names:', combos)
except Exception as e:
    print('Failed parsing combos:', e, out[:300])

ssh.close()
