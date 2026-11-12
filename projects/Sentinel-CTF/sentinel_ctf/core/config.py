"""
sentinel_ctf.core.config
========================
Loads settings from environment / .env file.
"""
from __future__ import annotations

import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from the project root (two levels above this file)
_env_path = Path(__file__).resolve().parent.parent.parent / ".env"
if _env_path.exists():
    load_dotenv(_env_path)
else:
    load_dotenv()   # fall back to system env


class Config:
    """Central config object. Read once at import time."""

    # Kali connection
    KALI_HOST: str = os.getenv("KALI_HOST", "127.0.0.1")
    KALI_PORT: int = int(os.getenv("KALI_PORT", "2222"))
    KALI_USER: str = os.getenv("KALI_USER", "kali")
    KALI_KEY_PATH: Path = Path(os.getenv("KALI_KEY_PATH", "~/.ssh/id_rsa")).expanduser()
    KALI_TUNNEL_HOSTNAME: str = os.getenv("KALI_TUNNEL_HOSTNAME", "ssh.sentinelai.studio")

    # Paths
    KALI_CHALLENGE_ROOT: str = os.getenv("KALI_CHALLENGE_ROOT", "/home/kali/ctf")
    HOST_CHALLENGE_ROOT: Path = Path(
        os.getenv("HOST_CHALLENGE_ROOT", str(Path(__file__).resolve().parent.parent.parent / "workspace"))
    )
    DB_PATH: Path = Path(os.getenv("DB_PATH", str(Path(__file__).resolve().parent.parent.parent / "sentinel_ctf.db")))

    # Router / AI
    ROUTER_BASE_URL: str = os.getenv("ROUTER_BASE_URL", "https://router.sentinelai.studio/v1")
    ROUTER_API_KEY: str = os.getenv("ROUTER_API_KEY", "")

    # Flags
    DEFAULT_FLAG_REGEX: str = os.getenv("DEFAULT_FLAG_REGEX", r"flag\{[^}]+\}")

    # MCP
    MCP_HOST: str = os.getenv("MCP_HOST", "127.0.0.1")
    MCP_PORT: int = int(os.getenv("MCP_PORT", "8765"))


config = Config()
