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
    print("LOGIN SUCCESS: status", res.status)
    for c in jar:
        print("COOKIE:", c.name, "=", c.value[:10] + "...")
except Exception as e:
    print("LOGIN FAILED:", e)
