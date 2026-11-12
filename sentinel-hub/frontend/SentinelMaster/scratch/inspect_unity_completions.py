import urllib.request
import re

req = urllib.request.Request('https://unityailab.com/assets/index-BaJcVmSs.js', headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        content = resp.read().decode('utf-8', errors='ignore')
        matches = [m.start() for m in re.finditer(r'/v1/chat/completions', content)]
        print(f"Total '/v1/chat/completions' matches: {len(matches)}")
        for idx in matches[:5]:
            start = max(0, idx - 100)
            end = min(len(content), idx + 200)
            print("--- Snippet ---")
            print(content[start:end])
except Exception as e:
    print('Err:', e)
