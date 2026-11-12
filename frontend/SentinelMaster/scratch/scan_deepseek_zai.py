import os, glob, re, json, base64

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"
files = sorted(glob.glob(os.path.join(ldb_dir, "*.ldb")) + glob.glob(os.path.join(ldb_dir, "*.log")), key=os.path.getmtime, reverse=True)

print("Scanning recent LevelDB files...")

deepseek_found = []
zai_found = []

for f in files[:10]:
    try:
        with open(f, "rb") as fp:
            data = fp.read()
            
            # DeepSeek search
            if b"deepseek" in data:
                for m in re.finditer(rb'"value":"([A-Za-z0-9_-]{20,})"', data):
                    tok = m.group(1).decode("ascii")
                    deepseek_found.append((os.path.basename(f), tok))
                for m in re.finditer(rb'"token":"([A-Za-z0-9_-]{20,})"', data):
                    tok = m.group(1).decode("ascii")
                    deepseek_found.append((os.path.basename(f), tok))

            # Z.ai search
            if b"z.ai" in data or b"zhipu" in data:
                print(f"[{os.path.basename(f)}] Found z.ai / zhipu bytes!")
                for m in re.finditer(rb'(eyJ[A-Za-z0-9_.-]{40,})', data):
                    tok = m.group(1).decode("ascii")
                    zai_found.append((os.path.basename(f), tok))

    except Exception as e:
        pass

print("\n--- DEEPSEEK CANDIDATES ---")
for fn, tok in set(deepseek_found):
    print(f"[{fn}] len={len(tok)} prefix={tok[:15]}... suffix={tok[-10:]}")

print("\n--- Z.AI CANDIDATES ---")
for fn, tok in set(zai_found):
    print(f"[{fn}] len={len(tok)} prefix={tok[:15]}... suffix={tok[-10:]}")
