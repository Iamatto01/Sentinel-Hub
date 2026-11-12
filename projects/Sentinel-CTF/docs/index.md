# Sentinel CTF Framework — Documentation Index

## Overview

The Sentinel CTF Framework is a production Python package that connects your Windows host to your Kali Linux VM via SSH over Cloudflare Tunnel and automates CTF challenge workflows.

---

## Documentation

| Document | Description |
|---|---|
| [README.md](../README.md) | Quick start, CLI reference, architecture |
| [categories/web.md](categories/web.md) | Web challenge playbook |
| [categories/forensics.md](categories/forensics.md) | Forensics challenge playbook |
| [categories/crypto.md](categories/crypto.md) | Cryptography challenge playbook |
| [categories/reversing.md](categories/reversing.md) | Reverse engineering playbook |
| [categories/pwn.md](categories/pwn.md) | Binary exploitation playbook |
| [categories/osint.md](categories/osint.md) | OSINT challenge playbook |

---

## Architecture

```
Windows Host                         Kali VM (via Cloudflare Tunnel)
─────────────────────────────────    ────────────────────────────────────
ctf CLI / AI Agent (MCP)             SSH daemon (port 22)
    │                                    │
    ▼                                    ▼
sentinel_ctf.core                    Tool binaries:
  ├── models.py    (Challenge, Job)     nmap, ffuf, gobuster
  ├── database.py  (SQLite)             binwalk, exiftool, strings
  ├── workspace.py (notes.md, solve.py) checksec, volatility3
  └── flagfinder.py                     ghidra, radare2, gdb
    │                                   pwntools, john, hashcat
    ▼
sentinel_ctf.executor
  ├── KaliSSHExecutor  ──asyncssh──▶ /home/kali/ctf/
  └── LocalExecutor (Windows)
    │
    ▼
sentinel_ctf.tools
  └── [category]/[tool].py
        build_command() ──▶ executor.run() ──▶ parse()
    │
    ▼
sentinel_ctf.workflows
  └── triage.py  (category pipelines)
  └── writeup_gen.py
    │
    ▼
sentinel_ctf.mcp.server  ◀── Antigravity agent
```

---

## Data flow for a new challenge

```
ctf new "Login Bypass" --cat web --host 10.10.10.5 --port 80
    │
    ├── Creates Challenge record (SQLite)
    ├── Creates workspace/login_bypass/
    │       ├── notes.md      ← pre-filled template
    │       ├── solve.py      ← pwntools/requests template
    │       └── files/        ← drop challenge files here
    │
ctf triage <id>
    │
    ├── KaliSSHExecutor connects via asyncssh → tunnel → Kali
    ├── NmapTool.run() → nmap -sV -sC 10.10.10.5
    ├── FfufTool.run() → ffuf -w .../common.txt -u http://10.10.10.5/FUZZ
    ├── Results parsed + Jobs saved to SQLite
    └── flagfinder scans all output

ctf solve <id> "flag{...}"
    │
    ├── Challenge.status = SOLVED
    ├── Workspace archived to writeups/web/login_bypass/
    └── ctf writeup <id> → writeups/web/login_bypass_writeup.md
```

---

## Configuration reference

All settings come from `.env` (copy `.env.example` and fill in):

| Variable | Default | Description |
|---|---|---|
| `KALI_HOST` | `127.0.0.1` | SSH host (tunnel endpoint) |
| `KALI_PORT` | `2222` | SSH port |
| `KALI_USER` | `kali` | SSH username |
| `KALI_KEY_PATH` | `~/.ssh/id_rsa` | SSH private key |
| `KALI_TUNNEL_HOSTNAME` | `ssh.sentinelai.studio` | Cloudflare tunnel hostname |
| `KALI_CHALLENGE_ROOT` | `/home/kali/ctf` | Challenge dir on Kali |
| `HOST_CHALLENGE_ROOT` | `./workspace` | Challenge dir on Windows |
| `ROUTER_BASE_URL` | `https://router.sentinelai.studio/v1` | AI router for analysis |
| `ROUTER_API_KEY` | `` | Router API key |
| `DEFAULT_FLAG_REGEX` | `flag\{[^}]+\}` | Flag pattern |
| `DB_PATH` | `./sentinel_ctf.db` | SQLite database path |
| `MCP_HOST` | `127.0.0.1` | MCP server host |
| `MCP_PORT` | `8765` | MCP server port |
