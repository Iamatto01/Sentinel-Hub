import subprocess, os

files = [
    'src/app/globals.css',
    'src/lib/router-types.ts',
    'src/lib/router.ts',
    'src/app/api/router/credentials/route.ts',
    'src/components/RouterView.tsx',
]

base_local = r'F:\INI KALI LA\Sentinel Master'
base_remote = '/home/kali/server/SentinelMaster'

for rel in files:
    local_path = os.path.join(base_local, rel)
    remote_path = f"{base_remote}/{rel}"
    with open(local_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    print(f"Pushing {rel} ({len(content)} chars)...")
    # Stream content into remote file
    cmd = ['ssh', 'kali-n100', f'cat > "{remote_path}"']
    p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, encoding='utf-8')
    stdout, stderr = p.communicate(input=content)
    if p.returncode != 0:
        print(f"Error pushing {rel}: {stderr}")
    else:
        print(f"Successfully pushed {rel}")

print("\nDone pushing files to server.")
