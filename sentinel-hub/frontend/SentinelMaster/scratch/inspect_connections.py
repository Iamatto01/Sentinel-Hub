import sqlite3
import json

db_uri = 'file:/mnt/external_hdd/9router-data/storage.sqlite?mode=ro'
con = sqlite3.connect(db_uri, uri=True)
cur = con.cursor()

cur.execute("SELECT id, provider, auth_type, name, email, api_key, access_token, refresh_token, provider_specific_data FROM provider_connections WHERE provider IN ('antigravity', 'grok-cli', 'deepseek-web');")
rows = cur.fetchall()
print(f"FOUND {len(rows)} CONNECTIONS:")
for r in rows:
    cid, prov, atype, name, email, key, atoken, rtoken, psd = r
    print("=" * 60)
    print(f"ID: {cid} | Provider: {prov} | AuthType: {atype} | Email: {email}")
    print(f"Key preview: {key[:10] if key else 'None'} | Token preview: {atoken[:10] if atoken else 'None'}")
    try:
        psd_obj = json.loads(psd) if psd else {}
        # print keys of psd_obj
        print(f"PSD keys: {list(psd_obj.keys())}")
    except:
        print(f"PSD raw length: {len(psd) if psd else 0}")
