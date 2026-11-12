import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
try:
    ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)
    stdin, stdout, stderr = ssh.exec_command('hostname && uptime && docker ps --format "{{.Names}}"')
    print('OUTPUT:\n' + stdout.read().decode())
    ssh.close()
except Exception as e:
    print('SSH Error:', e)
