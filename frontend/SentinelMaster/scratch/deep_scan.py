import os, glob, re, json

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(ldb_dir, "*.*"))

print(f"Total files in leveldb: {len(files)}")
today_files = [f for f in files if os.path.getmtime(f) > 1790740000]
print(f"Files modified in the last 2 hours: {len(today_files)}")

for f in today_files:
    try:
        with open(f, "rb") as fp:
            data = fp.read()
            # DeepSeek search:
            if b"deepseek" in data:
                # search for any 64 char alphanumeric string
                for m in re.finditer(rb'([A-Za-z0-9_-]{64})', data):
                    s = m.group(1).decode("ascii")
                    print(f"[{os.path.basename(f)}] Candidate 64-char (DeepSeek?): {s[:15]}...{s[-15:]}")

            # Z.ai search:
            if b"z.ai" in data:
                print(f"[{os.path.basename(f)}] Found 'z.ai' string in file!")
                # search for JWTs
                for m in re.finditer(rb'(eyJ[A-Za-z0-9_.-]{30,})', data):
                    s = m.group(1).decode("ascii")
                    print(f"[{os.path.basename(f)}] Candidate JWT (Z.ai?): len={len(s)} {s[:25]}...{s[-15:]}")
    except Exception as e:
        print(f"Error {f}: {e}")
