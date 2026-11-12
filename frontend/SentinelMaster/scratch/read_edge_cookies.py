import os, json, base64, sqlite3, shutil
import win32crypt
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

user_data = r"C:\Users\muham\AppData\Local\Microsoft\Edge\User Data"
local_state_path = os.path.join(user_data, "Local State")

def get_master_key():
    with open(local_state_path, "r", encoding="utf-8") as f:
        local_state = json.load(f)
    encrypted_key = base64.b64decode(local_state["os_crypt"]["encrypted_key"])
    encrypted_key = encrypted_key[5:] # strip 'DPAPI'
    master_key = win32crypt.CryptUnprotectData(encrypted_key, None, None, None, 0)[1]
    return master_key

def decrypt_value(buff, master_key):
    try:
        iv = buff[3:15]
        payload = buff[15:]
        cipher = AESGCM(master_key)
        decrypted = cipher.decrypt(iv, payload, None)
        return decrypted.decode("utf-8", errors="replace")
    except Exception as e:
        return f"[Decrypt error: {e}]"

master_key = get_master_key()
print("Master key obtained successfully!")

# Copy cookie database to temp to avoid lock
cookie_db = os.path.join(user_data, "Default", "Network", "Cookies")
temp_db = os.path.join(r"F:\INI KALI LA\Sentinel Master\scratch", "temp_cookies.db")
shutil.copy2(cookie_db, temp_db)

conn = sqlite3.connect(temp_db)
c = conn.cursor()

targets = ["deepseek", "kimi", "moonshot", "z.ai", "google"]
for t in targets:
    c.execute("SELECT host_key, name, encrypted_value FROM cookies WHERE host_key LIKE ?", (f"%{t}%",))
    rows = c.fetchall()
    print(f"\n--- Cookies for {t} ({len(rows)} found) ---")
    for host, name, enc_val in rows:
        if enc_val:
            dec = decrypt_value(enc_val, master_key)
            # mask value for printing
            dec_show = dec[:20] + "..." if len(dec) > 20 else dec
            print(f"  {host} | {name} = {dec_show}")

conn.close()
os.remove(temp_db)
