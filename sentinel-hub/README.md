# SENTINEL WORKSPACE — INFRASTRUCTURE & ACCESS

## 1. Remote Connectivity & Cloudflare Tunnel
> **IMPORTANT:** Direct IP access to `192.168.68.132` is **DEPRECATED / OFFLINE**.
> All remote access to the Kali server and Sentinel services is routed exclusively through **Cloudflare Tunnel** (`*.sentinelai.studio`).

### 1.1 SSH Access via Cloudflare Tunnel
To connect to the Kali Linux host from Windows or any remote client:

**Method A: Local TCP Proxy (Recommended for Tools & Paramiko)**
```bash
# Start background tunnel forwarder on local port 2222:
cloudflared access tcp --hostname ssh.sentinelai.studio --url 127.0.0.1:2222

# Connect via standard SSH:
ssh -p 2222 kali@127.0.0.1
```

**Method B: OpenSSH ProxyCommand (`~/.ssh/config`)**
```ssh-config
Host kali-tunnel
    HostName ssh.sentinelai.studio
    User kali
    ProxyCommand cloudflared access ssh --hostname %h
```
Then run: `ssh kali-tunnel`.

---

## 2. Public Services Directory

| Service | Public URL | Internal Port | Supervisor |
|---|---|---|---|
| **Sentinel Hub** | `https://hub.sentinelai.studio` | 3000 | PM2 (`sentinel-master`) |
| **Sentinel Router (OmniRoute)** | `https://router.sentinelai.studio` | 20128 | Docker (`9router`) |
| **Sentinel API** | `https://api.sentinelai.studio` | 3010 | PM2 (`sentinel-api`) |
| **Sentinel Frontend** | `https://app.sentinelai.studio` | 5173 | PM2 (`sentinel-frontend`) |
| **SSH Tunnel** | `ssh.sentinelai.studio` | 22 | systemd (`sshd`) via cloudflared |

---

## 3. Sentinel Router (OmniRoute) Maintenance Notes

### 3.1 Header Name Safety Rule (Critical)
* Never introduce spaces into HTTP header names during rebranding scripts.
* The header `X-Sentinel-Route-No-Cache` must remain strictly hyphenated (`-`), not spaced (`X-Sentinel Route-`), or the browser's `Headers.append()` will throw:
  `TypeError: Headers.append: "X-Sentinel Route-No-Cache" is an invalid header name.`
* Status: **FIXED & VERIFIED** on live container `9router` (image: `sentinel-proxy:omniroute-3.8.50-pwfix`).

### 3.2 Uncensored / OpenAI-Compatible Models
* Node: `Uncensored AI (Pollinations)` (`openai-compatible-chat-f19e79bf-f569-4fb4-b157-9104463745d3`)
* Base URL: `https://text.pollinations.ai/openai/v1`
* Active Working Free Models:
  * `uncensored/openai-fast` (GPT-OSS 20B reasoning, unrestricted) — **200 OK Verified**
  * `uncensored/openai` (GPT-OSS 20B standard) — **200 OK Verified**
