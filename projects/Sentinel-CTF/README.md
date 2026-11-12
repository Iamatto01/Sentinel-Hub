# Sentinel CTF Framework

A full-stack CTF challenge management and automation framework. Runs tool pipelines on your **Kali Linux VM** via SSH over Cloudflare Tunnel, tracks every challenge and job in a local SQLite database, and exposes everything to AI agents through a **MCP server**.

---

## Quick start

```powershell
# 1. Install
cd "F:\INI KALI LA\Sentinel CTF"
pip install -e ".[dev]"

# 2. Configure
copy .env.example .env
# Edit .env — set KALI_KEY_PATH and ROUTER_API_KEY at minimum

# 3. Start the Cloudflare tunnel (required before any Kali command)
cloudflared access tcp --hostname ssh.sentinelai.studio --url 127.0.0.1:2222

# 4. Test the connection
ctf ssh-test

# 5. Create your first challenge
ctf new "My First Web Challenge" --cat web --host 10.10.10.5 --port 80

# 6. Run triage
ctf triage <challenge-id>

# 7. Mark as solved
ctf solve <challenge-id> "flag{...}"

# 8. Generate writeup
ctf writeup <challenge-id>
```

---

## Project structure

```
Sentinel CTF/
├── sentinel_ctf/
│   ├── core/
│   │   ├── models.py        # Pydantic models: Challenge, Job, Writeup
│   │   ├── config.py        # Settings from .env
│   │   ├── database.py      # SQLite CRUD
│   │   ├── workspace.py     # Challenge folder + notes.md + solve.py generator
│   │   └── flagfinder.py    # Regex flag scanner
│   ├── executor/
│   │   ├── base.py          # Abstract executor interface
│   │   ├── ssh.py           # KaliSSHExecutor (asyncssh via tunnel)
│   │   └── local.py         # LocalExecutor (Windows subprocess)
│   ├── tools/
│   │   ├── base.py          # BaseTool
│   │   ├── web/             # NmapTool, FfufTool, GobusterTool
│   │   ├── forensics/       # TriageTool, VolatilityTool
│   │   ├── crypto/          # DecoderTool
│   │   ├── reversing/       # StringsTool, ChecksecTool
│   │   ├── pwn/             # PwntoolsRunner
│   │   └── osint/           # WhoisTool
│   ├── workflows/
│   │   ├── triage.py        # Category-aware triage pipeline
│   │   └── writeup_gen.py   # Auto writeup generator
│   ├── cli/
│   │   └── main.py          # `ctf` CLI (Typer)
│   └── mcp/
│       └── server.py        # MCP server for AI agents
├── workspace/               # One folder per active challenge
├── writeups/                # Solved challenge writeups (by category)
├── docs/                    # Documentation
├── tests/                   # Test suite
├── .env.example
└── pyproject.toml
```

---

## CLI reference

| Command | Description |
|---|---|
| `ctf new <name> --cat <cat>` | Create a new challenge |
| `ctf list` | List all challenges |
| `ctf info <id>` | Show challenge details + job history |
| `ctf open <id>` | Open workspace in Explorer |
| `ctf triage <id> --file <path>` | Run automated triage on Kali |
| `ctf run <tool> <id> --target <t>` | Run a specific tool |
| `ctf solve <id> <flag>` | Mark solved, archive workspace |
| `ctf writeup <id>` | Generate markdown writeup |
| `ctf ssh-test` | Test Kali SSH connection |
| `ctf flag-scan <text>` | Scan text for flags |
| `ctf delete <id>` | Delete challenge from database |

### Available tools for `ctf run`

| Tool | Category | What it does |
|---|---|---|
| `nmap` | Web | Port + service scan |
| `ffuf` | Web | Directory/endpoint fuzzing |
| `gobuster` | Web | Dir/DNS brute force |
| `triage` | Forensics | Multi-tool file triage (file, strings, exiftool, binwalk, xxd) |
| `volatility` | Forensics | Memory image analysis |
| `decoder` | Crypto | Multi-encoding decode chain |
| `strings` | Reversing | Extract printable strings + interesting patterns |
| `checksec` | Reversing/PWN | Binary protection check |
| `whois` | OSINT | Domain/IP whois |

---

## Connecting to Kali

The framework connects via **asyncssh** through the Cloudflare Tunnel. You must have `cloudflared` installed on Windows.

```powershell
# Start the TCP proxy (keep this running in a separate terminal)
cloudflared access tcp --hostname ssh.sentinelai.studio --url 127.0.0.1:2222

# Then all ctf commands that use Kali will work
ctf ssh-test
```

The `.env` settings that control the connection:

```
KALI_HOST=127.0.0.1
KALI_PORT=2222
KALI_USER=kali
KALI_KEY_PATH=~/.ssh/id_rsa
KALI_TUNNEL_HOSTNAME=ssh.sentinelai.studio
KALI_CHALLENGE_ROOT=/home/kali/ctf
```

---

## MCP server (AI agent integration)

Start the MCP server so Antigravity can call the framework directly:

```powershell
python -m sentinel_ctf.mcp.server
```

Register it in your Antigravity MCP config. The agent then has access to:

| MCP Tool | Description |
|---|---|
| `ctf_list_challenges` | List all challenges |
| `ctf_new_challenge` | Create a challenge |
| `ctf_get_challenge` | Get challenge details |
| `ctf_triage` | Run triage workflow |
| `ctf_run_tool` | Run any tool |
| `ctf_solve` | Mark solved |
| `ctf_get_jobs` | Get job history |
| `ctf_ssh_run` | Run arbitrary command on Kali |
| `ctf_flag_scan` | Scan text for flags |

---

## Adding a new tool plugin

1. Create `sentinel_ctf/tools/<category>/<toolname>.py`
2. Inherit from `BaseTool`
3. Implement `build_command(**kwargs) -> str` and `parse(result: ExecResult) -> dict`
4. Add an entry to `tool_map` in `sentinel_ctf/cli/main.py` and `sentinel_ctf/mcp/server.py`

```python
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.core.models import JobResult

class MyTool(BaseTool):
    name = "mytool"
    description = "Does something useful"

    def build_command(self, target: str, **kwargs) -> str:
        return f"mytool --target {target}"

    def parse(self, result: ExecResult) -> dict:
        return {
            "output": result.stdout,
            "flags_found": [],
        }
```

---

## See also

- [docs/categories/web.md](docs/categories/web.md)
- [docs/categories/forensics.md](docs/categories/forensics.md)
- [docs/categories/crypto.md](docs/categories/crypto.md)
- [docs/categories/reversing.md](docs/categories/reversing.md)
- [docs/categories/pwn.md](docs/categories/pwn.md)
- [docs/categories/osint.md](docs/categories/osint.md)
