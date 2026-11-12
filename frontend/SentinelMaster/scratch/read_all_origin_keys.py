import os, glob, re, json

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"
files = sorted(glob.glob(os.path.join(ldb_dir, "*.ldb")) + glob.glob(os.path.join(ldb_dir, "*.log")), key=os.path.getmtime, reverse=True)

for fname in files[:10]:
    p = os.path.join(ldb_dir, fname)
    with open(p, "rb") as fp:
        data = fp.read()
    
    # Check for deepseek keys
    if b"chat.deepseek.com" in data:
        print(f"\n[{fname}] Matches for chat.deepseek.com:")
        # Look for _https://chat.deepseek.com\x00\x01<key>\x01<value>
        for m in re.finditer(rb'_https://chat\.deepseek\.com\x00\x01([^\x01]+)\x01([^\x00]+)', data):
            k = m.group(1).decode("latin1", errors="ignore")
            v = m.group(2).decode("latin1", errors="ignore")
            v_clean = re.sub(r'[^\x20-\x7e]', '', v)
            if "token" in k.lower() or "user" in k.lower() or len(v_clean) > 20:
                print(f"  KEY: {k} -> VALUE: {v_clean[:120]}")

    # Check for z.ai keys
    if b"z.ai" in data:
        print(f"\n[{fname}] Matches for z.ai:")
        for m in re.finditer(rb'z\.ai[^\x00]*\x00\x01([^\x01]+)\x01([^\x00]+)', data):
            k = m.group(1).decode("latin1", errors="ignore")
            v = m.group(2).decode("latin1", errors="ignore")
            v_clean = re.sub(r'[^\x20-\x7e]', '', v)
            print(f"  KEY: {k} -> VALUE: {v_clean[:120]}")
