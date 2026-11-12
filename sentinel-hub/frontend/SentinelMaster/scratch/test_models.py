import urllib.request
import json

key = None
with open(r'F:\INI KALI LA\Sentinel Master\.env.local') as f:
    for line in f:
        if line.startswith('HUB_ROUTER_KEY='):
            key = line.split('=', 1)[1].strip('"\'\r\n')

url = 'https://router.sentinelai.studio/v1/models'
req = urllib.request.Request(url, headers={'Authorization': f'Bearer {key}', 'User-Agent': 'Mozilla/5.0'})
try:
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode())
        print('Models count:', len(data.get('data', [])))
        for m in data.get('data', []):
            print('-', m.get('id'))
except Exception as e:
    print('Error:', e)
