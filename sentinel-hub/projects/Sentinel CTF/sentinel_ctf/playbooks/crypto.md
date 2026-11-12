# Cryptography Challenges Playbook

> **Sentinel CTF Framework — Crypto Category**  
> Step-by-step decision tree for solving crypto CTF challenges.

---

## Triage Checklist (First 5 Minutes)

- [ ] Read the challenge description for hints (RSA? AES? custom cipher?)
- [ ] Look at the file — is it ciphertext, a script, or both?
- [ ] Try `ctf run decoder <id>` — attempt all common encodings immediately
- [ ] Run `file` and `strings` on any binary data
- [ ] Count character set: only hex? base64 alphabet? only A-Z? numbers only?
- [ ] Check if there's a script given — read it fully before trying to solve
- [ ] Look for the key, nonce, or IV — are they hard-coded, weak, or reused?

---

## Phase 1: Identify the Encoding / Cipher

### 1.1 Encoding Quick-ID Table

| Pattern | Likely Encoding |
|---|---|
| Only `A-Z a-z 0-9 + / =` | Base64 |
| Only `A-Z a-z 0-9 - _ =` | Base64 URL-safe |
| Only `0-9 a-f` (even length) | Hex |
| Only `0-9 A-F` (even length) | Hex (uppercase) |
| Space-separated 8-digit binary groups | Binary |
| Readable but shifted by 13 | ROT13 |
| Looks shifted but not 13 | Caesar (try all 25 shifts) |
| Groups of numbers | Could be ASCII codes, or book cipher |
| `%XX` sequences | URL encoding |
| `&#XXX;` or `&amp;` | HTML entities |
| Morse: `.` and `-` | Morse code |
| Only uppercase, repeating patterns | Vigenère or substitution |

```bash
# Try all common encodings at once
ctf run decoder <challenge-id> --target "YOUR_CIPHERTEXT_HERE"

# Or manually in Python
python3 -c "import base64; print(base64.b64decode('PASTE_HERE').decode())"
python3 -c "print(bytes.fromhex('PASTE_HEX').decode())"
python3 -c "import codecs; print(codecs.decode('PASTE', 'rot_13'))"

# CyberChef (browser) — paste and use Magic mode
# https://gchq.github.io/CyberChef/#recipe=Magic(3,false,false,'')
```

### 1.2 Hash Identification

```bash
# Identify hash type
hashid 'HASH_STRING'
hash-identifier 'HASH_STRING'

# Common hash lengths:
# MD5:    32 hex chars
# SHA1:   40 hex chars
# SHA256: 64 hex chars
# SHA512: 128 hex chars
# bcrypt: starts with $2b$ or $2y$
# ntlm:   32 hex (Windows passwords)
```

---

## Phase 2: Classical Ciphers

### 2.1 Caesar / ROT

```bash
# Try all 25 Caesar shifts
python3 -c "
ct = 'YOUR_CIPHERTEXT'
for shift in range(26):
    print(shift, ''.join(chr((ord(c)-65+shift)%26+65) if c.isupper() else
                          chr((ord(c)-97+shift)%26+97) if c.islower() else c for c in ct))
"

# ROT13 specifically
echo "CIPHERTEXT" | tr 'A-Za-z' 'N-ZA-Mn-za-m'
```

### 2.2 Vigenère

```bash
# If you have crib (known plaintext), use index of coincidence
# Online: https://www.dcode.fr/vigenere-cipher

# Python — try known key
python3 -c "
key = 'KEY'
ct = 'CIPHERTEXT'
pt = ''.join(chr((ord(c)-ord(k.upper()))%26+65) if c.isupper() else c
             for c, k in zip(ct, (key*999)[:len(ct)]))
print(pt)
"
```

### 2.3 XOR

```bash
# Single-byte XOR — try all 256 keys
python3 -c "
data = bytes.fromhex('HEXCIPHERTEXT')
for k in range(256):
    attempt = bytes(b ^ k for b in data)
    if all(32 <= x < 127 or x in (9, 10, 13) for x in attempt):
        print(k, attempt)
"

# XOR with known key
python3 -c "
from itertools import cycle
ct = bytes.fromhex('HEXCIPHERTEXT')
key = b'KEY'
print(bytes(a ^ b for a, b in zip(ct, cycle(key))))
"

# Multi-byte XOR key length detection — Kasiski / IC
# Tool: xortool
xortool -x -l <key_length> ciphertext.bin
xortool -x -c ' ' ciphertext.bin   # assume most frequent byte is space
```

### 2.4 Substitution Cipher

```bash
# Use frequency analysis
# Online: https://www.quipqiup.com/
# Or: https://www.dcode.fr/monoalphabetic-substitution

# If you have partial cribs, work from there
# Tip: look for single-letter words (A, I), two-letter (IS, IN, TO, OF)
```

---

## Phase 3: Modern Crypto

### 3.1 RSA

```bash
# Given: n, e, c (ciphertext)
# Check if n is small enough to factor
python3 -c "
import sympy
n = YOUR_N
factors = sympy.factorint(n)
print(factors)
"

# Use factordb.com — paste n and check if already factored
# Use msieve or yafu for larger n
msieve -v -ms 'd=10' n

# RSA decrypt once factored
python3 -c "
from Crypto.Util.number import inverse, long_to_bytes
p, q = P, Q
n, e, c = N, E, C
phi = (p-1)*(q-1)
d = inverse(e, phi)
pt = pow(c, d, n)
print(long_to_bytes(pt))
"
```

#### RSA Attack Lookup Table

| Condition | Attack |
|---|---|
| Small `n` (< 512 bit) | Factor directly with `sympy` or factordb |
| `n` on factordb | Factor lookup — always check first |
| `e = 3` and small plaintext | Cube root attack (m³ < n) |
| Same `n`, different `e` | Common modulus attack |
| Same `e`, multiple `n`, same `m` | Håstad's broadcast attack |
| `p` and `q` close together | Fermat factorization |
| `p-1` is smooth | Pollard's p-1 |
| LSB oracle | LSB decryption oracle attack |
| Padding oracle | PKCS#1 v1.5 Bleichenbacher |

```bash
# RsaCtfTool — automates many attacks
python3 RsaCtfTool.py --publickey key.pem --uncipherfile ct.bin
python3 RsaCtfTool.py -n N -e E --uncipher C --attack all
```

### 3.2 AES

```bash
# ECB mode detection — encrypt same plaintext blocks, get same ciphertext blocks
python3 -c "
ct = bytes.fromhex('CIPHERTEXT')
blocks = [ct[i:i+16] for i in range(0, len(ct), 16)]
print('ECB detected!' if len(blocks) != len(set(blocks)) else 'Not ECB')
"

# ECB byte-at-a-time attack — submit padded plaintexts and observe outputs
# CBC bit flipping — flip bits in IV/previous block to affect next block plaintext
# Padding oracle — send malformed paddings, watch for padding errors vs other errors
```

### 3.3 Hashing / Hash Cracking

```bash
# hashcat — GPU cracking
hashcat -m 0    hash.txt wordlist.txt        # MD5
hashcat -m 100  hash.txt wordlist.txt        # SHA1
hashcat -m 1400 hash.txt wordlist.txt        # SHA256
hashcat -m 1700 hash.txt wordlist.txt        # SHA512
hashcat -m 3200 hash.txt wordlist.txt        # bcrypt
hashcat -m 1000 hash.txt wordlist.txt        # NTLM

# Rules for mutation
hashcat -m 0 hash.txt wordlist.txt -r /usr/share/hashcat/rules/best64.rule

# John the Ripper
john --format=raw-md5 hash.txt --wordlist=/usr/share/wordlists/rockyou.txt
john --format=bcrypt hash.txt --wordlist=/usr/share/wordlists/rockyou.txt

# Online crackers: crackstation.net, hashes.com
```

---

## Tools Reference

| Tool | Install | Purpose |
|---|---|---|
| `CyberChef` | browser | Swiss-army knife of encodings |
| `RsaCtfTool` | `pip install rsactftool` | RSA attack automation |
| `pycryptodome` | `pip install pycryptodome` | Python crypto primitives |
| `SageMath` | `sudo apt install sagemath` | Mathematical attacks |
| `hashcat` | pre-installed Kali | GPU hash cracking |
| `john` | pre-installed Kali | CPU hash cracking |
| `xortool` | `pip install xortool` | XOR key analysis |

---

## Common Mistakes

- **Don't assume the encoding** — always try `decoder` first, check the character set
- **Check factordb before running heavy factorization** — `n` may already be there
- **ECB oracle attacks need many submissions** — script them, don't do manually
- **ROT13 ≠ Caesar shift 13 for numbers** — numbers are usually left unchanged in ROT13
- **Hash length extension** — if you control input to a hash, check for SHA-1/MD5 length extension vulnerability
