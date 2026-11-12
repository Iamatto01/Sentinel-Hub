import os, glob, re, json

ldb_dir = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data\Default\Local Storage\leveldb"
files = glob.glob(os.path.join(ldb_dir, "*.ldb")) + glob.glob(os.path.join(ldb_dir, "*.log"))

deepseek_tokens = set()
kimi_tokens = set()
zai_tokens = set()

for f in files:
    try:
        with open(f, "rb") as fp:
            data = fp.read()

        # Search for userTokens on DeepSeek
        if b"deepseek" in data or b"userToken" in data:
            for match in re.finditer(rb'"token":"([A-Za-z0-9_-]{20,})"', data):
                tok = match.group(1).decode("ascii")
                deepseek_tokens.add(tok)
            for match in re.finditer(rb'"value":"([A-Za-z0-9_.-]{20,})"', data):
                tok = match.group(1).decode("ascii")
                deepseek_tokens.add(tok)

        # Search for kimi tokens
        if b"kimi" in data:
            for match in re.finditer(rb'"access_token":"([A-Za-z0-9_.-]{20,})"', data):
                tok = match.group(1).decode("ascii")
                kimi_tokens.add(tok)
            for match in re.finditer(rb'"token":"(eyJ[A-Za-z0-9_.-]{20,})"', data):
                tok = match.group(1).decode("ascii")
                kimi_tokens.add(tok)

        # Search for zai tokens
        if b"z.ai" in data:
            for match in re.finditer(rb'"token":"(eyJ[A-Za-z0-9_.-]{20,})"', data):
                tok = match.group(1).decode("ascii")
                zai_tokens.add(tok)

    except Exception as e:
        print(f"Error reading {f}: {e}")

print("=== DEEPSEEK TOKENS FOUND ===")
for t in deepseek_tokens:
    print("Token length:", len(t), "Prefix:", t[:15], "Suffix:", t[-10:])

print("\n=== KIMI TOKENS FOUND ===")
for t in kimi_tokens:
    print("Token length:", len(t), "Prefix:", t[:15], "Suffix:", t[-10:])

print("\n=== Z.AI TOKENS FOUND ===")
for t in zai_tokens:
    print("Token length:", len(t), "Prefix:", t[:15], "Suffix:", t[-10:])

with open(r"F:\INI KALI LA\Sentinel Master\scratch\found_tokens.json", "w") as out:
    json.dump({
        "deepseek": list(deepseek_tokens),
        "kimi": list(kimi_tokens),
        "zai": list(zai_tokens)
    }, out, indent=2)
print("\nSaved to found_tokens.json")
