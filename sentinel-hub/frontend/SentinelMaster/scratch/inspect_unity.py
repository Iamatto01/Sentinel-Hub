import urllib.request
import re

req = urllib.request.Request('https://unityailab.com', headers={'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        html = resp.read().decode('utf-8', errors='ignore')
        scripts = re.findall(r'src=["\']([^"\']+\.js[^"\']*)["\']', html)
        print('Scripts:', scripts)
except Exception as e:
    print('Err:', e)
