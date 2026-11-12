#!/usr/bin/env python3
"""Run a shell command on the Kali host over SSH.

Credentials are NEVER hardcoded here. They are read, in order, from:
  1. the process environment (KALI_HOST / KALI_PORT / KALI_USER / KALI_PASS,
     HUB_ROUTER_KEY, HUB_ROUTER_URL)
  2. `.env.local` in the project root (gitignored, and preserved across
     deploys by deploy-kali.py's secret-backup step)

Usage:
  python scripts/kali_exec.py 'uptime'
  python scripts/kali_exec.py --test-9router
"""

import os
import shlex
import sys

import paramiko

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV_FILE = os.path.join(PROJECT_ROOT, ".env.local")


def load_env_file(path):
    """Parse a .env file into a dict. Silently returns {} when absent."""
    values = {}
    if not os.path.isfile(path):
        return values
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as handle:
            for raw in handle:
                line = raw.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                name, _, value = line.partition("=")
                name = name.strip()
                value = value.strip()
                if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
                    value = value[1:-1]
                if name:
                    values[name] = value
    except OSError:
        return {}
    return values


def setting(name, default=None):
    """Environment wins over .env.local, which wins over the default."""
    value = os.environ.get(name)
    if value:
        return value
    value = load_env_file(ENV_FILE).get(name)
    if value:
        return value
    return default


def emit(text):
    if not text:
        return
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    print(text)


def run_remote(cmd):
    """Mirrors deploy-kali.py's _connect_ssh so both tools trust the same keys."""
    host = setting("KALI_HOST", "192.168.68.132")
    port = int(setting("KALI_PORT", "22"))
    user = setting("KALI_USER", "kali")
    password = setting("KALI_PASS")
    key_filename = setting("KALI_KEY_FILENAME")

    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    client.load_system_host_keys()

    connect_args = {
        "port": port,
        "username": user,
        "timeout": 15,
        "banner_timeout": 15,
        "auth_timeout": 15,
        "look_for_keys": True,
        "allow_agent": True,
    }
    if key_filename:
        connect_args["key_filename"] = os.path.expanduser(os.path.expandvars(key_filename))
    if password:
        connect_args["password"] = password
    try:
        client.connect(host, **connect_args)
    except Exception as exc:  # noqa: BLE001 - surface any transport failure verbatim
        print(f"[ERR]: SSH connect to {user}@{host}:{port} failed: {exc}")
        return 1
    try:
        _, stdout, stderr = client.exec_command(cmd)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
    finally:
        client.close()
    emit(f"[OUT]: {out}" if out else "")
    emit(f"[ERR]: {err}" if err else "")
    return 0


def test_9router():
    key = setting("HUB_ROUTER_KEY")
    if not key:
        print(
            "[ERR]: HUB_ROUTER_KEY is not set (env or .env.local). "
            "Refusing to send an unauthenticated probe."
        )
        return 1
    base = (setting("HUB_ROUTER_URL", "http://127.0.0.1:20128") or "").rstrip("/")
    model = setting("ROUTER_PROBE_MODEL", "glm-5.3-flash")
    payload = (
        '{"model":"%s","messages":[{"role":"user","content":"say hello in 3 words"}]}' % model
    )
    cmd = (
        f"curl -s {shlex.quote(base)}/v1/chat/completions "
        f"-H {shlex.quote('Authorization: Bearer ' + key)} "
        f"-H 'Content-Type: application/json' "
        f"-d {shlex.quote(payload)}"
    )
    return run_remote(cmd)


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--test-9router":
        sys.exit(test_9router())
    command = sys.argv[1] if len(sys.argv) > 1 else "uptime"
    sys.exit(run_remote(command))
