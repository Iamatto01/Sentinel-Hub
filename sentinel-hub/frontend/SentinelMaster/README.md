# SENTINEL MASTER & INFRASTRUCTURE

## 1. Remote Connectivity & Cloudflare Tunnel
> **IMPORTANT:** Direct IP access to `192.168.68.132` is **DEPRECATED / OFFLINE**.
> All remote access to the Kali server and Sentinel services is routed exclusively through **Cloudflare Tunnel** (`*.sentinelai.studio`).

### 1.1 SSH Access via Cloudflare Tunnel
To connect to the Kali Linux host from Windows or any remote client:

**Method A: Local TCP Proxy (Recommended for Scripts & Bridges)**
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

---

## 2. Public Services Directory

| Service | Public URL | Internal Port | Supervisor |
|---|---|---|---|
| **Sentinel Hub** | `https://hub.sentinelai.studio` | 3000 | PM2 (`sentinel-master`) |
| **Sentinel Router (OmniRoute)** | `https://router.sentinelai.studio` | 20128 | Docker (`9router`) |
| **Sentinel API** | `https://api.sentinelai.studio` | 3010 | PM2 (`sentinel-api`) |
| **Sentinel Frontend** | `https://app.sentinelai.studio` | 5173 | PM2 (`sentinel-frontend`) |
| **SSH Tunnel** | `ssh.sentinelai.studio` | 22 | systemd (`sshd`) via cloudflared |
