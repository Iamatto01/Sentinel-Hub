import os, re, json

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"

for fn in ["008618.log", "008619.ldb", "008617.ldb", "008615.ldb"]:
    p = os.path.join(ldb_dir, fn)
    if not os.path.exists(p):
        continue
    with open(p, "rb") as fp:
        data = fp.read()
    print(f"=== {fn} ({len(data)} bytes) ===")
    
    if b"deepseek" in data:
        print("  [DEEPSEEK] Found deepseek keyword!")
        for m in re.finditer(rb'userToken[^\x00]{0,40}(\{[^\}]{10,400}\})', data):
            print("  userToken JSON:", m.group(1).decode("latin1", errors="ignore"))
        for m in re.finditer(rb'"value":"([A-Za-z0-9_-]{20,})"', data):
            print("  value candidate:", m.group(1).decode("ascii"))
            
    if b"z.ai" in data or b"zhipu" in data:
        print("  [Z.AI] Found z.ai / zhipu keyword!")
        for m in re.finditer(rb'(eyJ[A-Za-z0-9_.-]{40,})', data):
            tok = m.group(1).decode("ascii")
            print("  JWT candidate:", tok[:40], "len:", len(tok))
