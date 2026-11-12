import os, glob, re, json, urllib.request

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(ldb_dir, "*.*"))
recent = [f for f in files if os.path.getmtime(f) > 1790740000]

deepseek_cands = set()
jwt_cands = set()

for f in recent:
    try:
        with open(f, "rb") as fp:
            data = fp.read()
        for m in re.finditer(rb'([A-Za-z0-9_-]{64})', data):
            s = m.group(1).decode("ascii")
            if not s.startswith("eyJ"):
                deepseek_cands.add(s)
        for m in re.finditer(rb'(eyJ[A-Za-z0-9_.-]{40,})', data):
            jwt_cands.add(m.group(1).decode("ascii"))
    except:
        pass

print(f"Testing {len(deepseek_cands)} DeepSeek candidates...")
valid_deepseek = None
for cand in deepseek_cands:
    req = urllib.request.Request("https://chat.deepseek.com/api/v0/users/current",
        headers={"Authorization": f"Bearer {cand}", "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode())
            if data.get("code") == 0 or "data" in data and data.get("data") is not None:
                print("FOUND VALID DEEPSEEK TOKEN!", cand)
                valid_deepseek = cand
                break
    except:
        pass

print("DeepSeek result:", valid_deepseek)

print(f"\nTesting {len(jwt_cands)} JWT candidates for Z.ai...")
valid_zai = None
for cand in jwt_cands:
    req = urllib.request.Request("https://chat.z.ai/api/v1/user/info",
        headers={"Authorization": f"Bearer {cand}", "User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=4) as resp:
            data = json.loads(resp.read().decode())
            print("FOUND VALID ZAI TOKEN!", data)
            valid_zai = cand
            break
    except:
        pass

with open(r"F:\INI KALI LA\Sentinel Master\scratch\verified_tokens.json", "w") as out:
    json.dump({"deepseek": valid_deepseek, "zai": valid_zai}, out, indent=2)
