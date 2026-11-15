# 🔬 Forensics Challenges Playbook

> **Sentinel CTF Framework — Forensics Category**
> Step-by-step decision tree for solving forensics CTF challenges.

---

## ⚡ Triage Checklist (First 5 Minutes)

Do these immediately when you receive a forensics file:

- [ ] Run `file <target>` — identify the true file type
- [ ] Run `binwalk <target>` — check for embedded files
- [ ] Run `strings <target> | grep -i flag` — quick win attempt
- [ ] Check the file extension vs actual magic bytes — they often differ
- [ ] Run `exiftool <target>` — check all metadata
- [ ] Check file size — unusually large files may have hidden data appended
- [ ] Identify the challenge type: image steg? network capture? memory dump? disk image?
- [ ] Try `xxd <target> | head -20` to inspect the file header manually

---

## 📂 Phase 1: File Type Identification

### 1.1 Magic Bytes & File Command

```bash
# Identify file type
file suspicious_file
file -b suspicious_file   # Brief output (no filename)

# Check magic bytes manually
xxd suspicious_file | head -5
hexdump -C suspicious_file | head -10

# Common magic bytes:
# PNG:  89 50 4E 47 0D 0A 1A 0A
# JPG:  FF D8 FF
# GIF:  47 49 46 38 (GIF8)
# ZIP:  50 4B 03 04
# PDF:  25 50 44 46 (‰PDF)
# RAR:  52 61 72 21 (Rar!)
# 7z:   37 7A BC AF 27 1C
# ELF:  7F 45 4C 46 (‌ELF)
# PE:   4D 5A (MZ)
```

### 1.2 Binwalk — Embedded File Detection

```bash
# Scan for embedded files
binwalk suspicious_file

# Extract all embedded files
binwalk -e suspicious_file
binwalk --extract suspicious_file

# Recursive extraction
binwalk -eM suspicious_file

# Scan for specific signatures
binwalk -B suspicious_file   # Binary-only
binwalk --dd='.*' suspicious_file  # Extract ALL file types

# If extraction fails, manual carving:
dd if=suspicious_file bs=1 skip=<offset> count=<size> of=extracted_file
```

### 1.3 Strings Analysis

```bash
# Extract readable strings
strings suspicious_file
strings -a suspicious_file    # Scan entire file
strings -n 8 suspicious_file  # Minimum 8-char strings
strings -el suspicious_file   # 16-bit little-endian (for Windows executables)

# Grep for flag patterns
strings suspicious_file | grep -i "flag\|ctf\|HTB\|THM\|picoCTF"
strings suspicious_file | grep -Eo '[A-Z0-9_]{2,}{\w+}'   # Generic flag format

# Unicode strings
strings -eL suspicious_file   # 16-bit big-endian
```

---

## 🖼️ Phase 2: Metadata Analysis

### 2.1 Exiftool

```bash
# Full metadata dump
exiftool image.jpg

# Specific fields
exiftool -Comment image.jpg
exiftool -GPS* image.jpg      # All GPS fields
exiftool -all image.jpg

# GPS coordinates (convert to decimal for Google Maps)
exiftool -GPSLatitude -GPSLongitude -GPSLatitudeRef -GPSLongitudeRef image.jpg

# Check every metadata field for flags
exiftool image.jpg | grep -i "comment\|artist\|author\|description\|software"

# Process multiple files
exiftool *.jpg

# Remove all metadata (for cleanup)
exiftool -all= image.jpg
```

---

## 🕵️ Phase 3: Steganography

### 3.1 steghide

```bash
# Extract with no password
steghide extract -sf image.jpg
steghide extract -sf image.jpg -p ""

# Extract with a known password
steghide extract -sf image.jpg -p "password"

# Brute force steghide password
stegseek image.jpg /usr/share/wordlists/rockyou.txt

# Get steghide info (without extracting)
steghide info image.jpg

# Embed data (for understanding the tool)
steghide embed -cf image.jpg -ef secret.txt -p "password"
```

### 3.2 zsteg (PNG / BMP — LSB analysis)

```bash
# Install
gem install zsteg

# Basic scan (all channels)
zsteg image.png

# Verbose scan
zsteg -a image.png     # Try all known methods
zsteg -v image.png     # Verbose output

# Specific channel
zsteg -c 1 image.png   # Channel 1 (R)
zsteg -b 1 image.png   # Bit 1

# Extract specific payload
zsteg -e "b1,rgb,lsb,xy" image.png > output.bin
```

### 3.3 stegsolve (GUI — Java)

```bash
# Launch stegsolve
java -jar stegsolve.jar

# Key analysis modes in stegsolve:
# - File Format: shows raw byte analysis
# - Data Extract: set bit planes and extract LSB data manually
# - Frame Browser: for GIF animations
# - Image Combiner: XOR/AND/OR two images to reveal hidden data
# - Colour map analysis for palette-based images
```

### 3.4 LSB (Least Significant Bit) Manual Analysis

```python
# Python LSB extraction from PNG
from PIL import Image

img = Image.open('image.png')
pixels = list(img.getdata())

# Extract LSB of R channel
bits = ''
for pixel in pixels:
    bits += str(pixel[0] & 1)  # LSB of Red channel

# Convert bits to bytes
flag = ''
for i in range(0, len(bits), 8):
    byte = bits[i:i+8]
    if len(byte) == 8:
        char = chr(int(byte, 2))
        if char.isprintable():
            flag += char
        else:
            break

print(flag)
```

```bash
# Use online tool: stylesuxx.github.io/steganography/

# openstego (Java GUI)
openstego

# Outguess
outguess -r image.jpg output.txt

# jphide / jpseek
jpseek image.jpg output.txt
```

### 3.5 Audio Steganography

```bash
# Spectrogram analysis — look for hidden data visually
# Open in Sonic Visualiser, Audacity, or:
sox audio.wav -n spectrogram -o spec.png

# DTMF tones (phone keypad)
# Use Audacity or: multimon-ng -t wav -a DTMF audio.wav

# Morse code in audio
# Listen manually or use: morse2txt

# mp3stego
mp3stego-decode -X audio.mp3 output.txt
```

### 3.6 Steganography If-You-See-X → Try-Y

| File Type | Tools to Try |
|---|---|
| JPEG (.jpg) | steghide, stegseek, exiftool, strings |
| PNG (.png) | zsteg, stegsolve, LSB Python script |
| BMP (.bmp) | zsteg, stegsolve |
| GIF (.gif) | stegsolve (Frame Browser), binwalk |
| WAV/MP3 | Audacity spectrogram, multimon-ng, mp3stego |
| PDF | binwalk, pdfinfo, pdfimages, strings |
| Pixels look off | stegsolve color planes |
| Two images provided | stegsolve Image Combiner (XOR) |

---

## 🌐 Phase 4: Network Captures (PCAP)

### 4.1 Wireshark / tshark

```bash
# Open in Wireshark GUI
wireshark capture.pcap

# tshark command-line equivalents:

# List all conversations
tshark -r capture.pcap -q -z conv,tcp

# Follow TCP stream (stream 0)
tshark -r capture.pcap -z follow,tcp,ascii,0 -q

# Export all HTTP objects (files transferred)
tshark -r capture.pcap --export-objects http,./exported_files/

# Extract all DNS queries
tshark -r capture.pcap -Y dns -T fields -e dns.qry.name

# Extract HTTP requests
tshark -r capture.pcap -Y http.request -T fields -e http.host -e http.request.uri

# Filter by IP
tshark -r capture.pcap -Y "ip.addr == 192.168.1.1"

# Show credentials (cleartext)
tshark -r capture.pcap -Y "http.request.method == POST" -T fields -e http.file_data

# FTP credentials
tshark -r capture.pcap -Y ftp -T fields -e ftp.request.command -e ftp.request.arg

# Extract files from capture
tcpflow -r capture.pcap
# Or use Network Miner (Windows GUI)
```

### 4.2 Useful Wireshark Filters

```
# HTTP traffic
http
http.request
http.response

# Follow specific stream
tcp.stream eq 0

# DNS queries
dns

# Credentials/sensitive data
http.request.method == "POST"
ftp
smtp
pop
imap

# SSL (if cert is available, decrypt in Wireshark → Edit → Preferences → SSL)
ssl
tls

# ICMP (ping tunneling)
icmp

# Find large data transfers
frame.len > 1000

# Specific IPs
ip.src == 10.0.0.1 && ip.dst == 10.0.0.2
```

### 4.3 Extract Files from PCAP

```bash
# Using tshark export
tshark -r capture.pcap --export-objects http,./http_objects/
tshark -r capture.pcap --export-objects smb,./smb_objects/
tshark -r capture.pcap --export-objects ftp-data,./ftp_objects/

# Using tcpflow
tcpflow -r capture.pcap -o ./flows/

# Reassemble manually with Wireshark
# File → Export Objects → HTTP/SMB/etc.

# Extract JPEG from stream
# Copy raw bytes from Wireshark TCP stream → Save as .jpg
```

---

## 🧠 Phase 5: Memory Forensics (Volatility 3)

### 5.1 Setup & Profile Identification

```bash
# Volatility 3 (no profile needed — auto-detects)
python3 vol.py -f memory.dmp <plugin>

# Identify OS (if needed)
python3 vol.py -f memory.dmp banners.Banners

# Windows image info
python3 vol.py -f memory.dmp windows.info
```

### 5.2 Key Plugins

```bash
# --- PROCESS ANALYSIS ---

# List all processes
python3 vol.py -f memory.dmp windows.pslist

# Process tree (parent-child)
python3 vol.py -f memory.dmp windows.pstree

# Detect hidden/injected processes
python3 vol.py -f memory.dmp windows.psscan

# Command lines of all processes
python3 vol.py -f memory.dmp windows.cmdline

# Environment variables
python3 vol.py -f memory.dmp windows.envars --pid <PID>

# --- FILE ANALYSIS ---

# Scan for file handles
python3 vol.py -f memory.dmp windows.filescan

# Find a specific file
python3 vol.py -f memory.dmp windows.filescan | grep -i "flag\|secret\|password\|\.txt\|\.zip"

# Dump a file from memory
python3 vol.py -f memory.dmp windows.dumpfiles --virtaddr <ADDR>
python3 vol.py -f memory.dmp windows.dumpfiles --physaddr <PHYS_ADDR>

# --- NETWORK ANALYSIS ---

# Active network connections
python3 vol.py -f memory.dmp windows.netscan

# --- REGISTRY ---

# List registry hives
python3 vol.py -f memory.dmp windows.registry.hivelist

# Dump registry key
python3 vol.py -f memory.dmp windows.registry.printkey --key "SOFTWARE\Microsoft\Windows\CurrentVersion\Run"

# Dump SAM hashes
python3 vol.py -f memory.dmp windows.hashdump

# --- MALWARE / INJECTION ---

# Detect injected code
python3 vol.py -f memory.dmp windows.malfind

# VAD (Virtual Address Descriptor) analysis
python3 vol.py -f memory.dmp windows.vadinfo --pid <PID>

# --- PROCESS DUMP ---

# Dump entire process memory
python3 vol.py -f memory.dmp windows.memmap --pid <PID> --dump

# Dump process executable
python3 vol.py -f memory.dmp windows.procdump --pid <PID>

# --- CLIPBOARD ---
python3 vol.py -f memory.dmp windows.clipboard

# --- BROWSER HISTORY (if plugin exists) ---
python3 vol.py -f memory.dmp windows.iehistory
```

### 5.3 Strings on Memory Dump

```bash
# Extract all strings
strings memory.dmp > strings_output.txt

# Search for flags
grep -i "flag\|ctf\|picoCTF\|HTB\|THM" strings_output.txt

# Search for passwords
grep -i "password\|passwd\|pass=" strings_output.txt

# URLs
grep -Eo "https?://[^ ]+" strings_output.txt
```

---

## 💾 Phase 6: Disk Image Analysis

### 6.1 Mount and Inspect

```bash
# Identify the image
file disk.img
fdisk -l disk.img       # Show partitions

# Mount the image
mkdir /mnt/disk
mount -o loop disk.img /mnt/disk
# If it has partitions, use offset:
mount -o loop,offset=<offset_bytes> disk.img /mnt/disk

# Calculate offset: sector_size × start_sector
# Example: 512 × 2048 = 1048576
mount -o loop,offset=1048576 disk.img /mnt/disk

# Unmount
umount /mnt/disk

# For Windows NTFS images
mount -t ntfs-3g -o loop disk.img /mnt/disk
```

### 6.2 Autopsy (GUI)

```bash
# Launch Autopsy
autopsy

# Key steps in Autopsy:
# 1. New Case → Add disk image
# 2. Run all ingest modules
# 3. Check: Deleted Files, Web History, Keyword Search, Recent Documents
# 4. Search for flag pattern in keyword search
```

### 6.3 Foremost / Photorec — File Carving

```bash
# Carve files from disk image
foremost -i disk.img -o ./carved/
foremost -t jpg,png,zip,pdf -i disk.img -o ./carved/

# Photorec (interactive)
photorec disk.img

# Sleuth Kit tools
fls -r disk.img          # List all files recursively
icat disk.img <inode>    # Extract file by inode
fsstat disk.img          # Filesystem info
ils disk.img             # List inode info (find deleted)
```

---

## 📋 Phase 7: Log Analysis

```bash
# Search auth.log for failed/successful logins
grep "Failed password" /var/log/auth.log
grep "Accepted password" /var/log/auth.log

# Web server access log analysis
# Find most frequent IPs
awk '{print $1}' access.log | sort | uniq -c | sort -rn | head -20

# Find all POST requests
grep "POST" access.log

# Find specific status codes
awk '$9 == 404' access.log

# Windows Event Log (.evtx) — use python-evtx or evtxexport
pip3 install python-evtx
python3 -m evtx.evtxdump Security.evtx > events.xml
grep -i "logon\|login\|flag" events.xml

# Parse with chainsaw (fast EVTX analysis)
./chainsaw hunt Security.evtx --sigma sigma/ --mapping mappings/sigma-event-logs-all.yml
```

---

## 📋 Master Forensics Cheat Sheet

| Situation | Command / Tool |
|---|---|
| Unknown file type | `file`, `xxd head` |
| Embedded files | `binwalk -e` |
| Quick flag search | `strings file \| grep flag` |
| Image metadata | `exiftool` |
| JPEG steganography | `steghide`, `stegseek` |
| PNG steganography | `zsteg -a` |
| Audio spectrogram | Audacity, `sox` |
| PCAP analysis | Wireshark, `tshark` |
| PCAP file export | `tshark --export-objects http` |
| Memory — process list | `volatility3 windows.pslist` |
| Memory — find files | `volatility3 windows.filescan \| grep flag` |
| Memory — dump file | `volatility3 windows.dumpfiles` |
| Memory — hashes | `volatility3 windows.hashdump` |
| Disk image | Autopsy, `mount -o loop` |
| File carving | `foremost`, `photorec` |
| Deleted files | `icat`, `fls` (Sleuth Kit) |

---

## ⚠️ Common Mistakes to Avoid

1. **Checking only one layer** — always run `binwalk` even on images; files are often nested
2. **Ignoring file extension mismatches** — the real format is in the magic bytes, not the extension
3. **Missing metadata** — `exiftool` often reveals the answer directly
4. **Forgetting to try empty password** with steghide
5. **Not grepping strings first** — save time, try `strings | grep flag` before anything else
6. **Missing appended data** — check if file size is larger than expected (hidden ZIP at EOF)
7. **Not following all TCP streams** in Wireshark — flags are often in streams 1, 2, 3...
8. **Forgetting `--export-objects`** in tshark for transferred files
9. **Not checking deleted files** in disk images
10. **Volatility: wrong image type** — use `windows.info` to confirm, or try Linux plugins

---

*Sentinel CTF Framework — Forensics Playbook v1.0*
