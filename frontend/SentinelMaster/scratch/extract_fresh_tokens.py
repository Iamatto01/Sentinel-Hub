import os, glob, re, json, base64

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"
files = sorted(glob.glob(os.path.join(ldb_dir, "*.ldb")) + glob.glob(os.path.join(ldb_dir, "*.log")), key=os.path.getmtime, reverse=True)

print("Recent files:")
for f in files[:8]:
    print(" ", os.path.basename(f), "time:", os.path.getmtime(f))

deepseek_candidates = []
zai_candidates = []

for f in files[:8]:
    try:
        with open(f, "rb") as fp:
            data = fp.read()

        if b"deepseek" in data:
            print(f"[{os.path.basename(f)}] Found deepseek keyword in file!")
            for m in re.finditer(rb'"value":"([A-Za-z0-9_-]{20,})"', data):
                tok = m.group(1).decode("ascii")
                deepseek_candidates.append((os.path.basename(f), tok))
            for m in re.finditer(rb'"token":"([A-Za-z0-9_-]{20,})"', data):
                tok = m.group(1).decode("ascii")
                deepseek_candidates.append((os.path.basename(f), tok))
            for m in re.finditer(rb'userToken[s]?\x01[^\x00]{0,30}(\{[^\}]{10,400}\})', data):
                raw = m.group(1).decode("latin1", errors="ignore")
                print("  userToken raw JSON:", raw)

        if b"z.ai" in data or b"zhipu" in data:
            print(f"[{os.path.basename(f)}] Found z.ai / zhipu keyword in file!")
            for m in re.finditer(rb'(eyJ[A-Za-z0-9_.-]{40,})', data):
                tok = m.group(1).decode("ascii")
                zai_candidates.append((os.path.basename(f), tok))

    except Exception as e:
        print(f"Error {f}: {e}")

print("\n--- DEEPSEEK TOKENS ---")
for fn, t in set(deepseek_candidates):
    print(f"[{fn}] len={len(t)} {t[:15]}...{t[-10:]}")

print("\n--- Z.AI TOKENS ---")
for fn, t in set(zai_candidates):
    print(f"[{fn}] len={len(t)} {t[:15]}...{t[-10:]}")

with open(r"F:\INI KALI LA\Sentinel Master\scratch\fresh_scanned.json", "w") as out:
    json.dump({
        "deepseek": list(set(t for _, t in deepseek_candidates)),
        "zai": list(set(zai_candidates))
    }, out, indent=2)
