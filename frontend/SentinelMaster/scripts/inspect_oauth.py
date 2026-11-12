import sys
import paramiko

def test():
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.connect('192.168.68.132', 22, 'kali', 'kali')
    
    script = """
async function test() {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token');
    console.log('INSIDE CONTAINER FETCH SUCCESS! Status:', res.status);
  } catch(e) {
    console.error('FAIL:', e.message);
  }
}
test();
"""
    sftp = client.open_sftp()
    with sftp.file('/tmp/test_container.js', 'w') as f:
        f.write(script)
    sftp.close()

    _, stdout, stderr = client.exec_command("echo kali | sudo -S docker exec -i 9router node < /tmp/test_container.js")
    print("[OUT]:", stdout.read().decode('utf-8', errors='replace'))
    print("[ERR]:", stderr.read().decode('utf-8', errors='replace'))
    client.close()

if __name__ == '__main__':
    test()
