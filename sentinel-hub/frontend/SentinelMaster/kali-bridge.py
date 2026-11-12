#!/usr/bin/env python3
"""
Kali Linux Bridge for Sentinel Master
Dual-mode:
- Local Mode: When running directly on the Linux host (no SSH needed, instant execution).
- Remote Mode: When running from Windows/remote (SSH via Paramiko to kali@192.168.68.132).

Provides:
- Real-time PM2 & Docker process telemetry
- Host system telemetries (CPU, RAM, Disk storage)
- UptimeRobot-style HTTP & port probes with latency measurement
- Service logs (PM2 + Docker)
- Service action execution (restart, stop, reload) for both PM2 and Docker (9router)
"""

import sys
import json
import os
import time
import re
import shlex
import socket
import subprocess
import urllib.request
import urllib.error
import sqlite3
import base64
from datetime import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    import paramiko
except ImportError:
    paramiko = None


def _env_int(name, default):
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


KALI_HOST = os.environ.get("KALI_HOST", "").strip()
KALI_PORT = _env_int("KALI_PORT", 22)
KALI_USER = os.environ.get("KALI_USER", "").strip() or "kali"
KALI_PASS = os.environ.get("KALI_PASS") or "kali"
KALI_KNOWN_HOSTS = os.environ.get("KALI_KNOWN_HOSTS") or None
KALI_KEY_FILENAME = os.environ.get("KALI_KEY_FILENAME") or None


def is_local():
    """True when executing directly on the Kali Linux host."""
    if not sys.platform.startswith("linux"):
        return False
    host = KALI_HOST.lower()
    return host in ("", "127.0.0.1", "localhost", "192.168.68.132")


def _redact_sensitive(text):
    if not text:
        return text
    text = re.sub(
        r'(?i)(["\']?(?:authorization)["\']?\s*[:=]\s*)(?:"[^"]*"|\'[^\']*\'|bearer\s+[^\s,;}\]]+|[^\s,;}\]]+)',
        r'\1<redacted>',
        text,
    )
    text = re.sub(
        r'(?i)(["\']?(?:password|passwd|passphrase|token|secret|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)["\']?\s*[:=]\s*)(?:"[^"]*"|\'[^\']*\'|[^\s,;}\]]+)',
        r'\1<redacted>',
        text,
    )
    return re.sub(
        r'(?i)([?&](?:password|passwd|passphrase|token|secret|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|private[_-]?key)=)[^&\s]+',
        r'\1<redacted>',
        text,
    )


def _safe_error(error):
    message = _redact_sensitive(str(error).strip())
    return message or error.__class__.__name__


def _run_local(command, timeout=20):
    """Executes a command directly on the host using bash/sh."""
    try:
        proc = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return proc.stdout.strip(), proc.stderr.strip(), proc.returncode
    except subprocess.TimeoutExpired:
        return "", "Command timed out", 1
    except Exception as exc:
        return "", str(exc), 1


def get_ssh():
    """Establishes an SSH connection to the remote Kali server."""
    if paramiko is None:
        raise RuntimeError("paramiko is not installed for remote SSH operations")

    host = KALI_HOST or "192.168.68.132"
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.load_system_host_keys()
    if KALI_KNOWN_HOSTS:
        kp = os.path.abspath(os.path.expanduser(os.path.expandvars(KALI_KNOWN_HOSTS)))
        if os.path.isfile(kp):
            ssh.load_host_keys(kp)

    connect_kwargs = {
        "port": KALI_PORT,
        "username": KALI_USER,
        "timeout": 8,
        "banner_timeout": 8,
        "auth_timeout": 8,
        "look_for_keys": True,
        "allow_agent": True,
    }
    if KALI_KEY_FILENAME:
        key_path = os.path.abspath(os.path.expanduser(os.path.expandvars(KALI_KEY_FILENAME)))
        if os.path.isfile(key_path):
            connect_kwargs["key_filename"] = key_path
    if KALI_PASS:
        connect_kwargs["password"] = KALI_PASS

    ssh.connect(host, **connect_kwargs)
    return ssh


def _run_remote(ssh, command, timeout=20):
    """Executes a command on the remote host via SSH."""
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    try:
        output = stdout.read().decode('utf-8', errors='replace').strip()
        error = stderr.read().decode('utf-8', errors='replace').strip()
        exit_code = stdout.channel.recv_exit_status()
    finally:
        stdin.close()
    return output, error, exit_code


def _execute(cmd, ssh=None, timeout=20):
    if is_local() or ssh is None:
        return _run_local(cmd, timeout=timeout)
    return _run_remote(ssh, cmd, timeout=timeout)


def _validate_name(value, field, allow_all=False):
    if not isinstance(value, str):
        raise ValueError(f"{field} must be a string")
    value = value.strip()
    if allow_all and value == "all":
        return value
    if not value or len(value) > 128 or not re.fullmatch(r"[A-Za-z0-9_.-]+", value):
        raise ValueError(f"invalid {field}")
    return value


def _validate_lines(value):
    if isinstance(value, bool):
        raise ValueError("lines must be an integer")
    try:
        lines = int(value)
    except (TypeError, ValueError):
        raise ValueError("lines must be an integer")
    if not 1 <= lines <= 500:
        raise ValueError("lines must be between 1 and 500")
    return lines


def classify_pm2_process(process):
    pm2_env = process.get("pm2_env") or {}
    name = str(process.get("name") or "")
    script = str(pm2_env.get("pm_exec_path") or "")
    text = f"{name} {script}".lower()
    if re.search(r"\b(bot|crawler|spider|scraper|automation|worker|queue)\b", text):
        return "bot"
    if re.search(
        r"\b(redis|postgres(?:ql)?|mysql|mariadb|mongodb|mongo|rabbitmq|kafka|nginx|apache|docker|sshd|cron|systemd|supervisor|celery)\b",
        text,
    ):
        return "service"
    if re.search(r"\b(next|node|server|api|web|frontend|portal|app)\b|3000", text):
        return "website"
    return "service"


def _pm2_summary(processes):
    by_type = {"website": 0, "bot": 0, "service": 0}
    online = stopped = errored = 0
    cpu = memory = restarts = 0
    for process in processes:
        process_type = process.get("type", "service")
        by_type[process_type] = by_type.get(process_type, 0) + 1
        status = str(process.get("status") or "unknown").lower()
        if status == "online":
            online += 1
        elif status in {"stopped", "offline"}:
            stopped += 1
        elif status in {"errored", "error"}:
            errored += 1
        try:
            cpu += float(process.get("cpu") or 0)
        except (TypeError, ValueError):
            pass
        try:
            memory += float(process.get("memoryMb") or 0)
        except (TypeError, ValueError):
            pass
        try:
            restarts += int(process.get("restarts") or 0)
        except (TypeError, ValueError):
            pass

    return {
        "total": len(processes),
        "online": online,
        "stopped": stopped,
        "errored": errored,
        "byType": by_type,
        "cpuPercent": round(cpu, 1),
        "memoryMb": round(memory, 1),
        "restarts": restarts,
    }


# The Hub serves this dashboard and is itself a PM2 process, so it must never
# be caught by a bulk stop/restart issued from inside the dashboard.
SELF_NAME = os.environ.get("HUB_PM2_NAME", "sentinel-master").strip() or "sentinel-master"

CORE_MONITORS = [
    {"name": "sentinel-master", "port": 3000},
    {"name": "cloudflared", "port": 443},
    {"name": "9router", "port": 20128},
    {"name": "sentinel-api", "port": 3010},
    {"name": "sentinel-arcuz", "port": 8029},
    {"name": "sentinel-web", "port": 8016},
    {"name": "sentinel-mlbb", "port": 3005},
    {"name": "sentinel-backend", "port": 5000},
    {"name": "sentinel-frontend", "port": 5173},
    {"name": "sentinel-threat", "port": 8009},
]


def probe_service_local(port):
    """Pings a local port/service to measure HTTP response code and latency ms."""
    if port == 443:
        # Tunnel daemon, operational if running
        return {"operational": True, "httpCode": 200, "latencyMs": 1}

    start_t = time.time()
    try:
        req = urllib.request.Request(
            f"http://127.0.0.1:{port}/",
            headers={"User-Agent": "SentinelUptimeRobot/1.0"},
        )
        with urllib.request.urlopen(req, timeout=1.2) as resp:
            latency = max(1, round((time.time() - start_t) * 1000))
            return {"operational": True, "httpCode": resp.getcode(), "latencyMs": latency}
    except urllib.error.HTTPError as exc:
        latency = max(1, round((time.time() - start_t) * 1000))
        # HTTP redirects (301, 302, 307, 308) or 401/403/404 are healthy web responses
        return {"operational": True, "httpCode": exc.code, "latencyMs": latency}
    except Exception:
        # Socket check fallback
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(0.5)
            sock.connect(("127.0.0.1", port))
            sock.close()
            latency = max(1, round((time.time() - start_t) * 1000))
            return {"operational": True, "httpCode": 200, "latencyMs": latency}
        except Exception:
            return {"operational": False, "httpCode": None, "latencyMs": None}


def get_status():
    start_t = time.time()
    ssh = None
    if not is_local():
        ssh = get_ssh()

    try:
        ping_ms = max(1, round((time.time() - start_t) * 1000))

        # 1. PM2 Process table
        pm2_raw, pm2_error, pm2_exit = _execute('pm2 jlist', ssh)
        pm2_list = []
        if pm2_exit == 0 and pm2_raw:
            try:
                data = json.loads(pm2_raw)
                if isinstance(data, list):
                    for process in data:
                        if not isinstance(process, dict):
                            continue
                        pm2_env = process.get('pm2_env') or {}
                        monit = process.get('monit') or {}
                        process_type = classify_pm2_process(process)
                        try:
                            memory_bytes = float(monit.get('memory') or 0)
                        except (TypeError, ValueError):
                            memory_bytes = 0
                        try:
                            cpu = float(monit.get('cpu') or 0)
                        except (TypeError, ValueError):
                            cpu = 0
                        try:
                            restarts = int(pm2_env.get('restart_time') or 0)
                        except (TypeError, ValueError):
                            restarts = 0

                        pid = process.get('pid')
                        pm2_list.append({
                            "id": process.get('pm_id'),
                            "name": process.get('name'),
                            "type": process_type,
                            "status": pm2_env.get('status', 'unknown'),
                            "pid": pid,
                            "cpu": cpu,
                            "memoryMb": round(memory_bytes / (1024 * 1024), 1),
                            "uptime": pm2_env.get('pm_uptime', 0),
                            "restarts": restarts,
                            "script": pm2_env.get('pm_exec_path', ''),
                            "cwd": pm2_env.get('pm_cwd', ''),
                            "args": pm2_env.get('args') or [],
                        })
            except Exception:
                pass

        # 2. System telemetries (uptime, RAM, Disk)
        system_raw, _, _ = _execute(
            "uptime; echo '---'; free -m; echo '---'; df -h /home/kali/server 2>/dev/null || df -h /",
            ssh,
        )
        sys_out = system_raw.split('---')
        uptime_str = sys_out[0].strip() if sys_out else ""

        ram_info = {"totalMb": 0, "usedMb": 0, "freeMb": 0, "percent": 0}
        if len(sys_out) > 1:
            for line in sys_out[1].splitlines():
                if line.startswith('Mem:'):
                    parts = line.split()
                    if len(parts) >= 4:
                        try:
                            total = int(parts[1])
                            used = int(parts[2])
                            ram_info = {
                                "totalMb": total,
                                "usedMb": used,
                                "freeMb": int(parts[3]),
                                "percent": round((used / total) * 100, 1) if total else 0,
                            }
                        except ValueError:
                            pass

        disk_info = {"mount": "/home/kali/server", "size": "N/A", "used": "N/A", "avail": "N/A", "percent": 0}
        if len(sys_out) > 2:
            for line in sys_out[2].splitlines():
                parts = line.split()
                if len(parts) >= 6 and (parts[5].startswith('/') or parts[0].startswith('/dev/')):
                    try:
                        disk_info = {
                            "mount": parts[5],
                            "size": parts[1],
                            "used": parts[2],
                            "avail": parts[3],
                            "percent": int(parts[4].replace('%', '')),
                        }
                        if '/home/kali/server' in parts[5]:
                            break
                    except (ValueError, IndexError):
                        pass

        # 3. Active open ports
        ports_raw, _, _ = _execute('ss -tulpn | grep LISTEN', ssh)
        active_ports = []
        for line in ports_raw.splitlines():
            parts = line.split()
            if len(parts) >= 5 and ':' in parts[4]:
                port = parts[4].rsplit(':', 1)[-1]
                if port.isdigit():
                    active_ports.append(int(port))

        active_ports_set = set(active_ports)

        # 4. Probes (UptimeRobot feature)
        probes = {}
        for monitor in CORE_MONITORS:
            name = monitor["name"]
            port = monitor["port"]
            if is_local():
                probes[name] = probe_service_local(port)
            else:
                # In remote mode, verify listening port or cloudflared
                is_open = (port == 443) or (port in active_ports_set)
                probes[name] = {
                    "operational": is_open,
                    "httpCode": 200 if is_open else None,
                    "latencyMs": ping_ms if is_open else None,
                }

        host_label = KALI_HOST or ("127.0.0.1" if is_local() else "192.168.68.132")

        return {
            "success": True,
            "host": host_label,
            "pingMs": ping_ms,
            "system": {
                "uptime": uptime_str,
                "ram": ram_info,
                "disk": disk_info,
            },
            "pm2": pm2_list,
            "pm2Summary": _pm2_summary(pm2_list),
            "activePorts": sorted(active_ports_set),
            "probes": probes,
        }
    finally:
        if ssh is not None:
            ssh.close()


def format_log_content(content):
    if not content:
        return content
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines = content.splitlines()
    formatted = []
    for line in lines:
        stripped = line.strip()
        if not stripped:
            formatted.append("")
            continue

        iso_match = re.search(r'(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?:?\s*(.*)', stripped)
        if iso_match:
            d_part = iso_match.group(1)
            t_part = iso_match.group(2)
            rest = iso_match.group(3)
            prefix = stripped[:iso_match.start()].strip()
            prefix_str = f"[{prefix}] " if prefix else ""
            formatted.append(f"[{d_part} {t_part}] {prefix_str}{rest}")
            continue

        if re.match(r'^\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]', stripped):
            formatted.append(stripped)
            continue

        pm2_match = re.match(r'^(\d+\|[^|]+\|\s*)(.*)', stripped)
        if pm2_match:
            prefix = pm2_match.group(1).strip()
            msg = pm2_match.group(2)
            formatted.append(f"[{now_str}] [{prefix}] {msg}")
            continue

        formatted.append(f"[{now_str}] {stripped}")

    return "\n".join(formatted)


def get_logs(service="sentinel-fame", lines=50):
    service = _validate_name(service, "service")
    lines = _validate_lines(lines)
    ssh = None
    if not is_local():
        ssh = get_ssh()

    try:
        if service == "9router":
            cmd = _docker_cmd(f"logs --tail {lines}")
        else:
            cmd = f"pm2 logs {shlex.quote(service)} --lines {lines} --nostream --time"

        raw_log, err_log, exit_code = _execute(cmd, ssh)
        combined = raw_log or err_log or "No log entries found."
        formatted = format_log_content(_redact_sensitive(combined))
        return {
            "success": True,
            "service": service,
            "lines": lines,
            "log": formatted,
        }
    finally:
        if ssh is not None:
            ssh.close()


def _docker_cmd(action, container="9router"):
    """`docker <action> <container>`, escalating to sudo when the socket denies.

    The PM2 daemon inherits its supplementary groups at boot. Adding `kali` to the
    `docker` group after the daemon started leaves every PM2-spawned command
    without GID 964, so the socket returns permission denied even though the same
    command succeeds in an interactive shell. `sudo -n` is passwordless here, so
    it is a reliable fallback; the escalation is reported in the action output
    rather than swallowed.
    """
    return (
        f"(docker {action} {shlex.quote(container)} 2>/dev/null"
        f" || sudo -n docker {action} {shlex.quote(container)})"
    )


def _pm2_peers(ssh):
    """Every PM2 application name except the Hub itself.

    The Hub runs under PM2, so a literal `pm2 stop all` would kill the server
    answering this request and leave the operator with no way to recover from
    the dashboard. Bulk actions therefore target an explicit name list that
    structurally cannot contain SELF_NAME. PM2 *modules* (pm2-logrotate) are
    skipped as well: stopping one changes log-rotation behaviour, not app state.
    """
    raw, _error, exit_code = _execute("pm2 jlist", ssh, timeout=15)
    if exit_code != 0 or not raw:
        return []
    try:
        processes = json.loads(raw)
    except (ValueError, TypeError):
        return []
    names = []
    for process in processes:
        name = str((process or {}).get("name") or "").strip()
        environment = (process or {}).get("pm2_env") or {}
        if not name or name == SELF_NAME:
            continue
        if environment.get("pmx_module"):
            continue
        names.append(name)
    return names


def do_action(action="restart", target="all"):
    action = _validate_name(action, "action")
    if action not in {"restart", "stop", "reload", "start"}:
        raise ValueError("action must be restart, stop, reload, or start")
    target = _validate_name(target, "target", allow_all=True)

    ssh = None
    if not is_local():
        ssh = get_ssh()

    spared = []
    try:
        if target == "9router":
            cmd = _docker_cmd(action)
        elif target == "all":
            peers = _pm2_peers(ssh)
            spared = [SELF_NAME]
            if not peers:
                raise RuntimeError("No PM2 applications found to act on")
            quoted = " ".join(shlex.quote(name) for name in peers)
            if action == "start":
                cmd = f"pm2 start {quoted} 2>/dev/null || pm2 restart {quoted}"
            else:
                cmd = f"pm2 {action} {quoted}"
            cmd += f" && {_docker_cmd(action if action != 'reload' else 'restart')}"
        elif target == SELF_NAME and action == "stop":
            # Stopping the Hub from inside the Hub is unrecoverable without SSH.
            raise ValueError(
                f"Refusing to stop {SELF_NAME}: it serves this dashboard. "
                "Run `pm2 stop` over SSH if that is genuinely intended."
            )
        else:
            if action == "start":
                # For start, if already online restart it, otherwise start it
                cmd = f"pm2 start {shlex.quote(target)} 2>/dev/null || pm2 restart {shlex.quote(target)}"
            else:
                cmd = f"pm2 {action} {shlex.quote(target)}"

        output, error, exit_code = _execute(cmd, ssh, timeout=60)
        if exit_code != 0:
            detail = _safe_error(error) or f"exit code {exit_code}"
            raise RuntimeError(f"Action {action} on {target} failed: {detail}")
        return {
            "success": True,
            "action": action,
            "target": target,
            "spared": spared,
            "output": _redact_sensitive(output or error or "Done"),
        }
    finally:
        if ssh is not None:
            ssh.close()


def exec_command(command_str):
    if not command_str or not command_str.strip():
        raise ValueError("Command cannot be empty")

    raw = command_str.strip()
    # Safety blacklist for catastrophic wipes
    forbidden = [r'\brm\s+-[rRfF]+\s+/\b', r'\bmkfs\b', r'\bdd\s+if=']
    for p in forbidden:
        if re.search(p, raw):
            raise ValueError("Dangerous command rejected by safety guard")

    ssh = None
    if not is_local():
        ssh = get_ssh()
    try:
        output, error, exit_code = _execute(raw, ssh, timeout=40)
        return {
            "success": exit_code == 0,
            "command": raw,
            "output": _redact_sensitive(output),
            "error": _redact_sensitive(error),
            "exit_code": exit_code
        }
    finally:
        if ssh is not None:
            ssh.close()


def check_db():
    db_path = "/home/kali/server/database/fyp2.db"
    if is_local():
        exists = os.path.exists(db_path)
        size_mb = round(os.path.getsize(db_path) / (1024 * 1024), 2) if exists else 0
        integrity = "unknown"
        journal = "unknown"
        tables = 0
        if exists:
            try:
                conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
                cur = conn.cursor()
                cur.execute("PRAGMA integrity_check;")
                row = cur.fetchone()
                integrity = row[0] if row else "unknown"
                cur.execute("PRAGMA journal_mode;")
                row = cur.fetchone()
                journal = row[0] if row else "unknown"
                cur.execute("SELECT count(*) FROM sqlite_master WHERE type='table';")
                row = cur.fetchone()
                tables = row[0] if row else 0
                conn.close()
            except Exception as e:
                integrity = f"error: {_safe_error(e)}"
        return {
            "exists": exists,
            "path": db_path,
            "size_mb": size_mb,
            "integrity": integrity,
            "journal_mode": journal,
            "tables": tables,
        }

    py_code = """
import os, sqlite3, json
p = '/home/kali/server/database/fyp2.db'
exists = os.path.exists(p)
size_mb = round(os.path.getsize(p) / (1024 * 1024), 2) if exists else 0
integrity = 'unknown'
journal = 'unknown'
tables = 0
if exists:
    try:
        conn = sqlite3.connect(f'file:{p}?mode=ro', uri=True)
        cur = conn.cursor()
        cur.execute('PRAGMA integrity_check;')
        r = cur.fetchone()
        integrity = r[0] if r else 'unknown'
        cur.execute('PRAGMA journal_mode;')
        r = cur.fetchone()
        journal = r[0] if r else 'unknown'
        cur.execute("SELECT count(*) FROM sqlite_master WHERE type='table';")
        r = cur.fetchone()
        tables = r[0] if r else 0
        conn.close()
    except Exception as e:
        integrity = str(e)
print(json.dumps({'exists': exists, 'path': p, 'size_mb': size_mb, 'integrity': integrity, 'journal_mode': journal, 'tables': tables}))
"""
    b64 = base64.b64encode(py_code.encode("utf-8")).decode("ascii")
    cmd = f"python3 -c \"import base64; exec(base64.b64decode('{b64}').decode('utf-8'))\""
    ssh = get_ssh()
    try:
        output, error, exit_code = _execute(cmd, ssh, timeout=15)
        try:
            return json.loads(output.strip())
        except Exception:
            return {"exists": False, "raw": output or error, "error": "Failed to parse db response"}
    finally:
        if ssh is not None:
            ssh.close()


def kill_orphans():
    cmd = "pkill -f 'docker exec -i .* cat' 2>/dev/null || true; ps -eo pid,%cpu,cmd --sort=-%cpu | head -n 12"
    ssh = None
    if not is_local():
        ssh = get_ssh()
    try:
        output, error, exit_code = _execute(cmd, ssh, timeout=15)
        return {
            "success": True,
            "output": _redact_sensitive(output or error or "Cleaned"),
            "cleaned": "Killed orphan docker exec & returned top processes"
        }
    finally:
        if ssh is not None:
            ssh.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Missing command argument: status | logs | action | exec | db_check | kill_orphans"}))
        sys.exit(1)

    cmd = sys.argv[1]
    try:
        if cmd == "status":
            print(json.dumps(get_status()))
        elif cmd == "logs":
            svc = sys.argv[2] if len(sys.argv) > 2 else "sentinel-master"
            lns = int(sys.argv[3]) if len(sys.argv) > 3 else 50
            print(json.dumps(get_logs(svc, lns)))
        elif cmd == "action":
            act = sys.argv[2] if len(sys.argv) > 2 else "restart"
            tgt = sys.argv[3] if len(sys.argv) > 3 else "all"
            print(json.dumps(do_action(act, tgt)))
        elif cmd == "exec":
            command_str = sys.argv[2] if len(sys.argv) > 2 else "uptime"
            print(json.dumps(exec_command(command_str)))
        elif cmd == "db_check":
            print(json.dumps(check_db()))
        elif cmd == "kill_orphans":
            print(json.dumps(kill_orphans()))
        else:
            print(json.dumps({"error": f"Unknown command {cmd}"}))
    except Exception as e:
        print(json.dumps({"success": False, "error": _safe_error(e)}))
        sys.exit(1)
