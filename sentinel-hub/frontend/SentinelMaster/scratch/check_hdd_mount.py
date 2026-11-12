import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('127.0.0.1', port=2222, username='kali', password='kali', timeout=10)

cmd = "ls -la /mnt/external_hdd/9router-data"
stdin, stdout, stderr = ssh.exec_command(cmd)
print('OUT:', stdout.read().decode())
print('ERR:', stderr.read().decode())
ssh.close()
