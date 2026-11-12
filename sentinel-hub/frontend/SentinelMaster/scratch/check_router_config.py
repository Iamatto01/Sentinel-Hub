import os
import urllib.request
import json
import http.cookiejar

passwords = []
with open(r'F:\INI KALI LA\Sentinel Master\.env.local') as f:
    for line in f:
        for k in ['HUB_ROUTER_PASSWORD', 'HUB_DASHBOARD_PASSWORD', 'KALI_PASS']:
            if line.startswith(k + '='):
                passwords.append(line.split('=', 1)[1].strip('"\'\r\n'))

success_opener = None
for pw in passwords:
    cj = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
    req = urllib.request.Request(
        'https://router.sentinelai.studio/api/auth/login',
        data=json.dumps({'password': pw}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
    )
    try:
        resp = opener.open(req)
        print(f"Login success! (pw length={len(pw)})")
        success_opener = opener
        break
    except Exception as e:
        print(f"Login failed (pw length={len(pw)}): {e}")

if success_opener:
    # 1. Fetch provider-nodes
    try:
        req_nodes = urllib.request.Request(
            'https://router.sentinelai.studio/api/provider-nodes',
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        resp_nodes = success_opener.open(req_nodes)
        nodes = json.loads(resp_nodes.read().decode())
        print('\n=== Provider Nodes ===')
        for n in nodes.get('nodes', []):
            print(f"Node: id={n.get('id')}, name={n.get('name')}, prefix={n.get('prefix')}, baseUrl={n.get('baseUrl')}")
    except Exception as e:
        print('Error fetching nodes:', e)

    # 2. Fetch providers (connections)
    try:
        req_prov = urllib.request.Request(
            'https://router.sentinelai.studio/api/providers',
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        resp_prov = success_opener.open(req_prov)
        provs = json.loads(resp_prov.read().decode())
        print('\n=== Connections ===')
        for c in provs.get('connections', []):
            name = c.get('name', '')
            provider = c.get('provider', '')
            cid = c.get('id', '')
            models = c.get('providerSpecificData', {}).get('models', [])
            print(f"Conn: id={cid}, name={name}, provider={provider}, models={models}")
    except Exception as e:
        print('Error fetching providers:', e)
