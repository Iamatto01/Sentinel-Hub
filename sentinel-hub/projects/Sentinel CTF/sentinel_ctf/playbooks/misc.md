# Misc / Other Challenges Playbook

> **Sentinel CTF Framework — Misc Category**  
> Step-by-step decision tree for miscellaneous and general CTF challenges.

---

## Triage Checklist (First 5 Minutes)

- [ ] Read the challenge description word-for-word — clues are often hidden in plain sight
- [ ] Check the challenge title — often an acronym, a hint, or a direct tool name
- [ ] Run `strings` and `file` on any provided file
- [ ] Try `ctf run decoder <id>` — many misc challenges are just hidden encodings
- [ ] Connect to any provided service and interact manually first
- [ ] Check for common misc categories: programming puzzle, jail escape, steganography, QR codes, audio

---

## Common Misc Sub-Categories

### 1. Programming / Math Puzzles

```bash
# If it's a service that asks math questions fast:
from pwn import *
p = remote('host', port)
import re, ast

while True:
    line = p.recvline().decode()
    expr = re.search(r'[\d\s\+\-\*\/\(\)]+', line)
    if expr:
        result = eval(expr.group())
        p.sendline(str(result).encode())
```

### 2. QR Codes / Barcodes

```bash
# Decode QR from image
zbarimg image.png
# Or: zbarcam (webcam), or online at zxing.org/w/decode.jspx

# Generate QR from text (reverse challenge)
qrencode -o out.png "text here"

# Damaged QR codes — try:
# - Fix alignment patterns manually in GIMP
# - Use online QR repair tools: merricx.github.io/qrazybox/
```

### 3. Audio Challenges

```bash
# Open in Audacity — look at:
# 1. Waveform (visual morse code patterns?)
# 2. Spectrogram (text hidden in frequencies!)
#    View → Spectrogram → look for text at high frequencies

# Morse code from audio
morse2text audio.wav   # or use online decoder: morsecode.world

# Check LSB of audio samples (like image LSB steg)
python3 -c "
import wave, struct
w = wave.open('audio.wav')
frames = w.readframes(w.getnframes())
samples = struct.unpack('<' + 'h'*(len(frames)//2), frames)
lsbs = ''.join(str(s & 1) for s in samples[:1000])
# Convert binary to ASCII
chars = [chr(int(lsbs[i:i+8],2)) for i in range(0, len(lsbs)-7, 8)]
print(''.join(chars))
"
```

### 4. Jail / Sandbox Escape

```bash
# Python jail — common escapes
# If print is blocked:
import os; os.system('cat flag.txt')
__import__('os').system('cat flag.txt')

# If import is blocked:
().__class__.__bases__[0].__subclasses__()
# Find <class 'subprocess.Popen'> index and use it

# If builtins are removed:
[x for x in (1).__class__.__base__.__subclasses__() if x.__name__=='catch_warnings'][0]()._module.__builtins__

# Bash jail — restricted shell escapes
# If PATH is restricted:
/bin/sh
$'\x2fbin\x2fsh'  # hex encoded slash

# If only some chars allowed:
echo $0            # often prints the shell name
ls -la /           # explore filesystem
cat /proc/$$/cmdline   # current process command
```

### 5. Encoding / Cipher Rabbit Holes

```bash
# Multi-layer encoding — keep decoding until readable
# Tools: CyberChef Magic recipe, dcode.fr, or ctf run decoder

# Common multi-layer chains:
# Base64 → Hex → ROT13
# Morse → Base64 → Binary
# URL → Hex → XOR

# Script to automate chained decoding
python3 -c "
import base64, codecs
data = 'YOUR_DATA'
# Try each and print all results
for fn in [
    lambda x: base64.b64decode(x).decode(),
    lambda x: bytes.fromhex(x).decode(),
    lambda x: codecs.decode(x, 'rot_13'),
]:
    try: print(fn(data))
    except: pass
"
```

### 6. Network Services / Protocols

```bash
# Connect and explore
nc host port
openssl s_client -connect host:port  # TLS

# Common hidden protocols:
# FTP: ftp host; anonymous login
# SMTP: telnet host 25; EHLO, MAIL FROM, RCPT TO, DATA
# POP3: telnet host 110; USER, PASS, LIST, RETR
# IMAP: read emails
# DNS: dig @host TXT flag.domain.com

# Wireshark filter for flag
wireshark -Y 'frame contains "flag{"' capture.pcap
tshark -r capture.pcap -Y 'data' -T fields -e data.text | grep -i flag
```

### 7. Esoteric Languages

| You see | Esoteric language | Tool/Site |
|---|---|---|
| `++++++++++[>+++++++>++++...]` | Brainfuck | `brainfuck.org` |
| `Ook. Ook? Ook!` | Ook! | `esolangs.org/wiki/Ook!` |
| Whitespace (tabs/spaces only) | Whitespace | `vii5ard.github.io/whitespace/` |
| `Ck Cm Cwm Cw ...` | Cow | Cow lang interpreter |
| `()()()...` with parens | JSFuck (JS) | Run in browser console |
| `!!!...` | Malbolge | Online interpreter |

---

## Lookup Table: Misc Challenges

| You see | Try |
|---|---|
| Audio file given | Audacity spectrogram, LSB steg, morse |
| Lots of text with random caps | First letter of each word/line? Capitals only? |
| Numbers in weird ranges | ASCII codes, pixel values, coordinates |
| Binary/hex that doesn't decode normally | Try reversed, byte-swapped, or XOR'd |
| QR code that won't scan | zbarimg, online QR repair tools |
| Network service on weird port | `nc`, then try HTTP/FTP/SMTP commands manually |
| Brainfuck-like characters | esolangs.org lookup table |
| Image with subtle color differences | StegSolve, bit plane analysis, LSB |

---

## General Tips

- **Read the flavor text again** after each step — hints become clearer with context
- **Search the challenge name** — many challenges reference real-world events or tools by name
- **Google the exact cipher/encoding name** if you spot one — usually a Wikipedia + CTF writeup combo
- **Discord/IRC of the CTF** — if you're genuinely stuck 30+ min, see if others are hinting without spoilers
