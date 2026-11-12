import paramiko, sys

for host, port in [('127.0.0.1', 2222), ('192.168.68.132', 22), ('ssh.sentinelai.studio', 22)]:
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        print(f"Trying {host}:{port}...")
        ssh.connect(host, port=port, username='kali', password='kali', timeout=4)
        print(f"Connected to {host}:{port}!")
        ssh.close()
        break
    except Exception as e:
        print(f"Failed {host}:{port} -> {e}")
