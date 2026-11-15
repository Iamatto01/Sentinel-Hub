# 🚀 INI KALI LA — Workspace Hub

> Organized master workspace containing all projects, frontends, backends, databases, and microservices.

---

## 📂 Directory Layout

```text
F:\INI KALI LA\
├── 📁 projects/                # All standalone project workspaces
│   ├── 📁 FYP2PROJECT/         # SentinelAI FYP2 Main Repository (AI Pentest Platform)
│   ├── 📁 Sentinel-CyberMaster/# Autonomous Cyber Defense & Automation
│   ├── 📁 Sentinel-CTF/        # Capture-The-Flag Challenges & Solver Platform
│   ├── 📁 SentinelAlong/       # 2D/3D Floorplan & Architectural Sketcher (Port 8028)
│   ├── 📁 SentinelArcuz100/    # Arcuz 100-Floor RPG Server & Client (Port 8029)
│   ├── 📁 SentinelConvert/     # Universal Data Converter Engine
│   ├── 📁 SentinelFame/        # Fame Operations & Traffic Management Engine
│   ├── 📁 SentinelMLBB/        # MLBB Analytics & Bot Automation (Port 3005)
│   └── 📁 Sentineltree/        # Family Tree Visualization & Cloudflare Pages
│
├── 📁 frontend/                # Web Dashboards & User Interfaces
│   ├── 📁 SentinelMaster/      # Unified Command Hub (Next.js 16, Port 3000)
│   └── 📁 SentinelAI/          # FYP2 Cyber Threat Dashboard (Vite + React, Port 5173)
│
├── 📁 backend/                 # API Engines & Application Servers
│   ├── 📁 SentinelAI/          # Python/Node.js Security Pipeline (Port 5000)
│   └── 📁 SentinelAPI/         # Express API & Token Gateway (Port 3010)
│
├── 📁 database/                # SQLite Databases & Automated Backups
│   ├── fyp2.db                 # Authoritative FYP2 Database
│   └── 📁 backups/             # Daily rolling snapshots
│
├── 📁 docker/                  # Container Definitions & Orchestration
│   ├── Dockerfile              # Kali Linux Environment Image
│   └── docker-compose.yml      # Service Compose Stack
│
├── 📁 docs/                    # Architecture Guides & Port Allocation
│
├── 📁 scripts/                 # Server Launchers, Docker Controls & Scripts
│   ├── START_LOCAL_WINDOWS.bat # Run local services natively on Windows
│   ├── START_KALI_DOCKER.bat   # Start Kali Linux Docker Container
│   └── INSTALL_DOCKER.bat      # Docker Desktop Installer Helper
│
├── 📁 sentinel-hub/            # Master symlink to F:\Sentinel Hub
├── 📄 LAUNCH_ANTIGRAVITY_CHAT.bat # One-click launch for Antigravity AI Chat UI
└── 📄 README.md                # This documentation file
```

---

## 🌐 Network & Port Ownership

| Port | Service | Tech Stack | Status / Route |
| :--- | :--- | :--- | :--- |
| **3000** | `SentinelMaster` | Next.js 16 (React 19) | `hub.sentinelai.studio` / `localhost:3000` |
| **3005** | `SentinelMLBB` | Next.js App | Local MLBB Assistant |
| **3010** | `SentinelAPI` | Node.js Express | API Gateway |
| **5000** | `SentinelAI Backend` | Node.js / Python | Core FYP2 Engine |
| **5173** | `SentinelAI Frontend`| Vite + React | `sentinelai.studio` |
| **8028** | `SentinelAlong` | HTML5 / Canvas | Floorplan Tool |
| **8029** | `SentinelArcuz100` | Node.js Game Server | Flash / WebSocket |
| **20128**| `Sentinel Router` | OmniRoute (Docker) | `router.sentinelai.studio` / Port 20128 |

---

## ⚡ Quick Start

- **Launch Antigravity Chat:** Double-click `LAUNCH_ANTIGRAVITY_CHAT.bat`
- **Launch Sentinel Master Hub:** Run `cd frontend\SentinelMaster && npm run dev`
- **Start All Local Services:** Run `scripts\START_LOCAL_WINDOWS.bat`
