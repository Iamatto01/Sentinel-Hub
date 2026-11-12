import urllib.request
import json
import http.cookiejar

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

login_data = json.dumps({'password': 'sentinel_admin_secret_2026'}).encode('utf-8')
req = urllib.request.Request(
    'http://127.0.0.1:20128/api/auth/login',
    data=login_data,
    headers={'Content-Type': 'application/json'}
)

try:
    res = opener.open(req)
    print("LOGIN STATUS:", res.status)

    res_combos = opener.open('http://127.0.0.1:20128/api/combos')
    combos_data = json.loads(res_combos.read().decode('utf-8'))
    combos = combos_data.get('combos', [])
    print(f"\nTOTAL COMBOS: {len(combos)}")
    for cb in combos:
        print(f"NAME: {cb.get('name')} | ID: {cb.get('id')}")
        for m in cb.get('models', []):
            print(f"   -> model: {m.get('model')} | providerId: {m.get('providerId')} | weight: {m.get('weight')}")

    res_prov = opener.open('http://127.0.0.1:20128/api/providers')
    prov_data = json.loads(res_prov.read().decode('utf-8'))
    connections = prov_data.get('connections', [])
    print(f"\nTOTAL CONNECTIONS: {len(connections)}")
    for c in connections:
        print(f"CONN: {c.get('name')} | provider: {c.get('provider')} | active: {c.get('isActive')} | id: {c.get('id')}")

except Exception as e:
    print("ERROR:", e)
