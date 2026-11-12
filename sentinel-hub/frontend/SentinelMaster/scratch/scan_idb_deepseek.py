import os, glob, re, json

idb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\IndexedDB\https_chat.deepseek.com_0.indexeddb.leveldb"
files = glob.glob(os.path.join(idb_dir, "*.ldb")) + glob.glob(os.path.join(idb_dir, "*.log"))

print(f"Scanning {len(files)} IndexedDB files in {idb_dir}...")
for f in files:
    try:
        with open(f, "rb") as fp:
            data = fp.read()
            if b"token" in data.lower() or b"user" in data.lower():
                print(f"[{os.path.basename(f)}] Found token/user in IDB, size: {len(data)}")
                for m in re.finditer(rb'\"token\":\"([A-Za-z0-9_-]{20,})\"', data):
                    print("  IDB token:", m.group(1).decode("ascii"))
                for m in re.finditer(rb'\"value\":\"([A-Za-z0-9_-]{20,})\"', data):
                    print("  IDB value:", m.group(1).decode("ascii"))
                for m in re.finditer(rb'([A-Za-z0-9_-]{60,70})', data):
                    cand = m.group(1).decode("ascii")
                    print("  IDB candidate 64:", cand)
    except Exception as e:
        print(f"Error {f}: {e}")
