# OSINT Challenges Playbook

> **Sentinel CTF Framework — OSINT Category**  
> Step-by-step decision tree for OSINT CTF challenges.

---

## Triage Checklist (First 5 Minutes)

- [ ] Read the challenge description carefully — what exactly is the target? (person, domain, image, username?)
- [ ] Note any names, usernames, email addresses, URLs, or locations given
- [ ] Search the exact challenge title in Google — sometimes writeups exist
- [ ] Try the full name/username in Google immediately
- [ ] Check if images are given — run reverse image search and `exiftool` immediately
- [ ] Note the flag format — is it a name? coordinates? date? username?

---

## Phase 1: Person / Username OSINT

### 1.1 Username Search

```bash
# Sherlock — search username across 300+ sites
sherlock username_here
sherlock username_here --timeout 10 --print-found

# WhatsMyName
python3 wmn.py -u username_here

# Maigret (more detailed)
maigret username_here

# Manual checks (always try):
# Twitter/X, Instagram, GitHub, Reddit, LinkedIn, TikTok, Discord
# HackTheBox, TryHackMe, CTFtime, GitHub, GitLab
```

### 1.2 Real Name / Email Search

```bash
# Google dorks
site:linkedin.com "First Last"
site:github.com "First Last"
"First Last" filetype:pdf
"First Last" site:reddit.com

# Email format guessing
# firstname.lastname@domain.com
# f.lastname@domain.com
# firstname@domain.com

# Email validation (does it exist?)
# Use hunter.io, emailhippo.com, or verify.email
```

---

## Phase 2: Domain / IP OSINT

### 2.1 WHOIS and DNS

```bash
# Whois lookup
whois domain.com
whois 1.2.3.4

# DNS records
nslookup domain.com
dig domain.com ANY
dig domain.com MX
dig domain.com TXT
dig domain.com NS

# Subdomain enumeration
subfinder -d domain.com
amass enum -d domain.com
# Online: dnsdumpster.com, crt.sh

# Certificate transparency — find subdomains
curl -s "https://crt.sh/?q=%.domain.com&output=json" | python3 -m json.tool | grep name_value
```

### 2.2 Shodan / Censys

```bash
# Shodan CLI
shodan search "hostname:domain.com"
shodan host 1.2.3.4
shodan search "org:\"Company Name\""

# Shodan useful filters
shodan search "http.title:\"Login\""
shodan search "port:8080 org:\"Company\""

# Censys
censys search "domain.com"
# Online: search.censys.io
```

### 2.3 Historical Data

```bash
# Wayback Machine — find old pages
curl "http://archive.org/wayback/available?url=domain.com"

# Check robots.txt in archive
curl "https://web.archive.org/web/2020*/https://domain.com/robots.txt"

# SecurityTrails — DNS history, subdomains
# VirusTotal — passive DNS, URLs
curl "https://www.virustotal.com/vtapi/v2/domain/report?apikey=KEY&domain=domain.com"
```

---

## Phase 3: Image OSINT

### 3.1 Metadata Analysis

```bash
# Always run exiftool first
exiftool image.jpg
exiftool image.jpg | grep -iE "gps|location|make|model|serial|datetime|software|comment"

# GPS coordinates from exiftool
# "GPS Latitude" and "GPS Longitude" — convert DMS to decimal if needed
python3 -c "
# DMS to decimal: degrees + minutes/60 + seconds/3600
lat = 3 + 8/60 + 15.5/3600
lon = 101 + 41/60 + 43.2/3600
print(f'{lat:.6f}, {lon:.6f}')
print(f'https://maps.google.com/?q={lat},{lon}')
"
```

### 3.2 Reverse Image Search

```bash
# Save image URL then use:
# Google Images: images.google.com → upload/paste URL
# TinEye: tineye.com
# Yandex Images: yandex.com/images (best for faces and locations)
# Bing Visual Search: bing.com/visualsearch

# CLI reverse search
python3 -c "
import requests, base64
img = open('image.jpg','rb').read()
# Yandex search link
b64 = base64.b64encode(img).decode()
print('Upload to: https://yandex.com/images/')
"
```

### 3.3 Geolocation from Images

Look for these clues in images:
- **Street signs** — language, font style, country format
- **License plates** — shape, color, number format per country
- **Electrical outlets / switches** — country-specific designs
- **Sun position** — time of day + shadows → compass direction
- **Architecture** — roof style, building material, colors
- **Vegetation** — tells you the climate zone
- **Road markings** — yellow vs white center lines
- **Vehicles** — steering wheel side (left/right drive)

```bash
# Tools for geo guessing
# GeoGuessr (practice)
# Overpass Turbo — OpenStreetMap queries
# Google Street View — verify your guess
# What3Words — if challenge gives 3-word location
```

---

## Phase 4: Social Media OSINT

### 4.1 Google Dorks

```bash
# Find all pages mentioning target
site:twitter.com "username"
site:reddit.com "Full Name"
"email@domain.com"
"username" site:github.com
"First Last" "Company Name"
intext:"First Last" filetype:pdf

# Find cached/deleted content
cache:domain.com/page
site:web.archive.org "domain.com"
```

### 4.2 Twitter / X OSINT

```bash
# Advanced search (use Twitter advanced search directly)
# from:username since:2020-01-01 until:2021-01-01
# (username) (keywords)

# Export tweets programmatically
# twint (if still working): twint -u username -o output.csv --csv
# nitter.net for anonymous browsing

# Find connected accounts
# Look at: following, followers, likes, replies
```

### 4.3 GitHub OSINT

```bash
# Search commits for secrets
# site:github.com "api_key" "company.com"

# Find repos by user
curl "https://api.github.com/users/USERNAME/repos" | python3 -m json.tool

# Search commits (GitDorker)
python3 gitdorker.py -t GITHUB_TOKEN -q "username" -d dorks/BHIS_toplevel.txt

# Check GitHub gists
curl "https://api.github.com/users/USERNAME/gists"

# Leaked secrets in commits
trufflehog github --repo https://github.com/user/repo
```

---

## Lookup Table: If You See X, Try Y

| You see | Try |
|---|---|
| Username given | `sherlock`, check GitHub, Twitter, LinkedIn, HackTheBox |
| Email address | `hunter.io`, search Google, check breach databases (HIBP) |
| Domain name | `whois`, `subfinder`, `crt.sh`, Wayback Machine, Shodan |
| IP address | `shodan host`, `whois`, reverse DNS, `nmap` |
| Photo of a place | Reverse image search (Yandex best), look for signs, architecture |
| Photo with GPS metadata | `exiftool`, convert to decimal, Google Maps |
| Company name | LinkedIn employees, Glassdoor, Crunchbase, their website |
| Phone number | Truecaller, phone number OSINT tools |
| Vehicle in image | License plate → country/region → narrow location |

---

## OSINT Tips & Common Mistakes

- **Yandex > Google for reverse image search** — especially for locations and faces
- **Always check exiftool first on images** — GPS coords are often left in
- **Don't assume usernames are unique** — verify it's the same person across platforms
- **Cached/archived pages hold deleted content** — always check Wayback Machine
- **Check the background of profile photos** — geolocation clues are often there
- **OSINT is iterative** — each finding leads to the next; keep notes
