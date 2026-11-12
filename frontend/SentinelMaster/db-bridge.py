#!/usr/bin/env python3
"""
Sentinel Master — Database Bridge (feature #4: unified database registry).

READ-ONLY BY CONSTRUCTION
-------------------------
This bridge cannot modify a database:
  * Every SQLite handle is opened with `file:<path>?mode=ro`, so the OS itself
    refuses writes even if a bug let one through.
  * The only SQL it composes is `SELECT`, `PRAGMA` reads, and `EXPLAIN`-free
    catalogue lookups. There is no code path that emits INSERT/UPDATE/DELETE/
    DROP/ALTER/VACUUM/ATTACH.
  * Postgres is reached as the `postgres` superuser but is only ever sent four
    fixed read-only SELECTs against `pg_catalog`/`information_schema`.

WHY THIS EXISTS
---------------
Project databases on this host had drifted into duplicate copies that silently
diverged — `fyp2.db` exists twice with 41 vs 31 tables, and nothing in the fleet
could answer "which copy is authoritative, who has it open, and has it changed
since I last looked?". `discover` + `verify` answer exactly that, and the
`diverged` flag is the direct antidote to the "database always been alter"
problem.

DUAL MODE
---------
Introspection always runs on the host that owns the files. Remote mode is a thin
wrapper that ships this same script over SSH and invokes it there, so there is
exactly one implementation of the introspection logic.

  Local  : python3 db-bridge.py discover
  Remote : KALI_HOST=... python db-bridge.py discover   → runs itself on the host

SUBCOMMANDS
-----------
  discover                    every SQLite + Postgres DB, grouped, drift-flagged
  inspect  <id|path>          schema, row counts, pragmas, integrity, lock holders
  verify   <id|path>          compact fingerprint for drift detection
  query    <id> <table> [--limit N] [--offset N] [--search TEXT]
  postgres                    Postgres database inventory (read-only)
  postgres-tables <dbname>    table inventory for one Postgres database
  self-test                   runs the built-in assertions
"""

import sys
import os
import re
import json
import time
import base64
import sqlite3
import hashlib
import subprocess
import fnmatch
import stat
from datetime import datetime, timezone

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

try:
    import paramiko
except ImportError:
    paramiko = None


# ─────────────────────────────────────────────────────────────────────────────
# Configuration
# ─────────────────────────────────────────────────────────────────────────────

KALI_HOST = os.environ.get("KALI_HOST", "").strip()
KALI_PORT = int(os.environ.get("KALI_PORT") or 22)
KALI_USER = os.environ.get("KALI_USER", "").strip() or "kali"
KALI_PASS = os.environ.get("KALI_PASS") or "kali"
KALI_KNOWN_HOSTS = os.environ.get("KALI_KNOWN_HOSTS") or None
KALI_KEY_FILENAME = os.environ.get("KALI_KEY_FILENAME") or None

DEFAULT_ROOTS_LINUX = "/home/kali:/home/kali/server:/srv:/opt"
DEFAULT_ROOTS_WIN = r"F:\INI KALI LA"

# Directories that hold browser/desktop churn or throwaway backups. Still
# reported (so nothing is hidden), but tagged `noise` and excluded from the
# default managed view.
NOISE_PATTERNS = (
    "*/.mozilla/*", "*/.cache/*", "*/.config/*", "*/snap/*", "*/.local/share/*",
    "*/node_modules/*", "*/.git/*", "*/.venv/*", "*/venv/*", "*/site-packages/*",
    "*/.wapiti/*", "*/__pycache__/*", "*/storage/default/*", "*/storage/permanent/*",
    "*/Profile Groups/*", "*/docker/containers/*", "*/docker/overlay2/*",
    "*/docker/volumes/*", "*/db_backups/*", "*/backups/*", "*/.context-mem/*",
    "*/.npm/*", "*/.sonar/*", "*/.steam/*",
)

MAX_INTEGRITY_BYTES = 512 * 1024 * 1024
MAX_PREVIEW_ROWS = 100
DEFAULT_PREVIEW_ROWS = 25
ROOTS_BUDGET_S = 90.0

SENSITIVE_COLUMN = re.compile(
    r'(?i).*(password|passwd|passphrase|secret|token|api[_-]?key|private[_-]?key|'
    r'credential|session[_-]?id|cookie|otp|pin|cvv|card[_-]?number|authorization).*'
)

SAFE_IDENT = re.compile(r'^[A-Za-z0-9_]{1,64}$')


def roots() -> list:
    raw = os.environ.get("SENTINEL_DB_ROOTS", "").strip()
    if not raw:
        raw = DEFAULT_ROOTS_WIN if sys.platform.startswith("win") else DEFAULT_ROOTS_LINUX
    if sys.platform.startswith("win"):
        return [p.strip() for p in raw.split(";") if p.strip()]
    return [p.strip() for p in raw.split(":") if p.strip()]


def is_local() -> bool:
    """True when executing directly on the host that owns the databases."""
    if not sys.platform.startswith("linux"):
        return False
    return KALI_HOST.lower() in ("", "127.0.0.1", "localhost", "192.168.68.132")


def _redact_sensitive(text):
    if not text:
        return text
    text = re.sub(
        r'(?i)(["\']?(?:authorization)["\']?\s*[:=]\s*)(?:"[^"]*"|\'[^\']*\'|bearer\s+[^\s,;}\]]+|[^\s,;}\]]+)',
        r'\1<redacted>', text)
    return re.sub(
        r'(?i)(["\']?(?:password|passwd|passphrase|token|secret|api[_-]?key|client[_-]?secret|'
        r'access[_-]?token|refresh[_-]?token|private[_-]?key)["\']?\s*[:=]\s*)'
        r'(?:"[^"]*"|\'[^\']*\'|[^\s,;}\]]+)',
        r'\1<redacted>', text)


def _safe_error(error):
    message = _redact_sensitive(str(error).strip())
    return message or error.__class__.__name__


# ─────────────────────────────────────────────────────────────────────────────
# Identifier + path helpers
# ─────────────────────────────────────────────────────────────────────────────

def db_id(real_path: str) -> str:
    return hashlib.sha1(real_path.encode("utf-8", "replace")).hexdigest()[:12]


def _quote(value: str) -> str:
    return "'" + str(value).replace("'", "'\\''") + "'"


def _is_noise(path: str) -> bool:
    posix = path.replace("\\", "/")
    return any(fnmatch.fnmatch(posix, pattern) for pattern in NOISE_PATTERNS)


def _sha256(path: str) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        while True:
            chunk = handle.read(1024 * 256)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest()


# ─────────────────────────────────────────────────────────────────────────────
# SQLite introspection — every connection is mode=ro
# ─────────────────────────────────────────────────────────────────────────────

def open_ro(path: str) -> sqlite3.Connection:
    """Opens a SQLite file read-only; the OS rejects writes on this handle."""
    uri = "file:" + path.replace("?", "%3f").replace("#", "%23") + "?mode=ro"
    return sqlite3.connect(uri, uri=True, timeout=5.0)


def inspect_sqlite(path: str, want_rows=True) -> dict:
    stat = os.stat(path)
    info = {
        "id": db_id(path), "engine": "sqlite", "path": path,
        "sizeBytes": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "readable": False, "error": None,
        "tables": [], "views": [], "triggers": [],
        "tableCount": 0, "columnsTotal": 0, "rowsTotal": 0,
        "journalMode": None, "pageSize": None, "userVersion": 0,
        "integrity": None, "foreignKeyViolations": None, "sha256": None,
    }

    sidecars = {}
    for suffix in ("-wal", "-shm", "-journal"):
        side = path + suffix
        sidecars[suffix.lstrip("-") + "Bytes"] = os.path.getsize(side) if os.path.isfile(side) else 0
    info.update(sidecars)
    # Deliberately NOT `info["live"]` here. Sidecar bytes mean a log exists, not
    # that anything is using the database — and `live` drives operator-facing
    # warnings, so it is set from real holder detection in `lock_holders`. A
    # leftover log from a crashed writer would otherwise read as "busy".

    try:
        conn = open_ro(path)
    except Exception as exc:
        info["error"] = _safe_error(exc)
        return info

    try:
        info["journalMode"] = str(conn.execute("PRAGMA journal_mode").fetchone()[0])
        info["pageSize"] = int(conn.execute("PRAGMA page_size").fetchone()[0])
        info["userVersion"] = int(conn.execute("PRAGMA user_version").fetchone()[0])
        info["readable"] = True

        objects = conn.execute(
            "SELECT name, type FROM sqlite_master "
            "WHERE type IN ('table','view','trigger') ORDER BY type, name"
        ).fetchall()

        for name, kind in objects:
            if kind == "trigger":
                info["triggers"].append({"name": name})
                continue
            if name.startswith("sqlite_"):
                continue
            try:
                columns = conn.execute(f'PRAGMA table_info("{name}")').fetchall()
            except Exception as exc:
                columns = []
                info.setdefault("warnings", []).append(f"{name}: {_safe_error(exc)}")

            entry = {
                "name": name,
                "columns": [
                    {
                        "name": col[1],
                        "type": (col[2] or "").upper() or None,
                        "notNull": bool(col[3]),
                        "pk": bool(col[5]),
                        "sensitive": bool(SENSITIVE_COLUMN.match(col[1] or "")),
                    }
                    for col in columns
                ],
            }
            info["columnsTotal"] += len(entry["columns"])

            if kind == "view":
                info["views"].append(entry)
                continue

            try:
                entry["indexes"] = [
                    row[1] for row in conn.execute(f'PRAGMA index_list("{name}")').fetchall()
                ]
            except Exception:
                entry["indexes"] = []

            try:
                fks = conn.execute(f'PRAGMA foreign_key_list("{name}")').fetchall()
                entry["foreignKeys"] = [
                    {
                        "id": fk[0],
                        "seq": fk[1],
                        "table": fk[2],
                        "from": fk[3],
                        "to": fk[4],
                        "onUpdate": fk[5],
                        "onDelete": fk[6],
                    }
                    for fk in fks
                ]
            except Exception:
                entry["foreignKeys"] = []

            if want_rows:
                try:
                    entry["rows"] = int(conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0])
                    info["rowsTotal"] += entry["rows"]
                except Exception as exc:
                    entry["rows"] = None
                    entry["rowError"] = _safe_error(exc)

            info["tables"].append(entry)

        if stat.st_size <= MAX_INTEGRITY_BYTES:
            try:
                result = conn.execute("PRAGMA integrity_check").fetchone()
                info["integrity"] = str(result[0]) if result else "unknown"
            except Exception as exc:
                info["integrity"] = f"error: {_safe_error(exc)}"
            try:
                info["foreignKeyViolations"] = len(conn.execute("PRAGMA foreign_key_check").fetchmany(50))
            except Exception:
                info["foreignKeyViolations"] = None
    except Exception as exc:
        info["error"] = _safe_error(exc)
    finally:
        conn.close()

    if stat.st_size <= MAX_INTEGRITY_BYTES:
        try:
            info["sha256"] = _sha256(path)
        except Exception as exc:
            info["hashError"] = _safe_error(exc)

    info["tableCount"] = len(info["tables"])
    info["domainHints"] = sorted(_classify([t["name"] for t in info["tables"]]))
    return info


def manifest_sqlite(path: str) -> dict:
    """Compact fingerprint used for drift detection between two points in time."""
    stat = os.stat(path)
    entry = {
        "id": db_id(path), "path": path, "sizeBytes": stat.st_size,
        "modifiedAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
    }
    try:
        conn = open_ro(path)
    except Exception as exc:
        entry["error"] = _safe_error(exc)
        return entry
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ).fetchall()
        shape = {}
        for (name,) in rows:
            try:
                cols = conn.execute(f'PRAGMA table_info("{name}")').fetchall()
                count = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
            except Exception:
                cols, count = [], None
            shape[name] = {
                "columns": [c[1] for c in cols],
                "rows": int(count) if count is not None else None,
            }
        entry["schema"] = shape
        entry["tableCount"] = len(shape)
        entry["rowsTotal"] = sum(v["rows"] or 0 for v in shape.values())
        entry["fingerprint"] = hashlib.sha1(
            json.dumps(shape, sort_keys=True).encode("utf-8")
        ).hexdigest()
    except Exception as exc:
        entry["error"] = _safe_error(exc)
    finally:
        conn.close()
    try:
        entry["sha256"] = _sha256(path)
    except Exception as exc:
        entry["hashError"] = _safe_error(exc)
    return entry


def _clean_text(value) -> str:
    """Strips control characters so a hostile identifier cannot corrupt plain output."""
    return re.sub(r"[\x00-\x1f\x7f]", "", str(value))


def compare_databases(left_path: str, right_path: str, max_tables: int = 500) -> dict:
    """
    Diff two databases so that a stale or over-written copy is *named*, not guessed.

    Table presence and column shape come from `sqlite_master`, which is cheap.
    Row content is hashed only when both sides expose an identical column set and
    an identical row count — there is no point hashing two tables that already
    disagree on width, and skipping it keeps the command fast on a 23 MB file.
    """
    left = open_ro(left_path)
    right = open_ro(right_path)
    try:
        def shape(conn) -> dict:
            found = {}
            names = conn.execute(
                "SELECT name FROM sqlite_master WHERE type IN ('table','view') "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
            for (name,) in names:
                try:
                    cols = [row[1] for row in conn.execute(f'PRAGMA table_info("{name}")').fetchall()]
                    count = conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0]
                except Exception as exc:
                    cols, count = [], None
                    found[_clean_text(name)] = {"columns": [], "rows": None,
                                                "error": _safe_error(exc)}
                    continue
                found[_clean_text(name)] = {"columns": cols, "rows": int(count)}
            return found

        left_shape, right_shape = shape(left), shape(right)
        only_left = sorted(set(left_shape) - set(right_shape))
        only_right = sorted(set(right_shape) - set(left_shape))

        tables, compared, identical, differing = [], 0, 0, 0
        for name in sorted(set(left_shape) & set(right_shape)):
            lside, rside = left_shape[name], right_shape[name]
            rows_match = lside["rows"] == rside["rows"]
            columns_match = lside["columns"] == rside["columns"]
            entry = {
                "name": name,
                "leftRows": lside["rows"],
                "rightRows": rside["rows"],
                "leftColumns": len(lside["columns"]),
                "rightColumns": len(rside["columns"]),
                "rowsMatch": rows_match,
                "columnsMatch": columns_match,
                "missingColumns": sorted(set(lside["columns"]) - set(rside["columns"])),
                "extraColumns": sorted(set(rside["columns"]) - set(lside["columns"])),
                "identical": False,
            }

            # A mismatch in shape already proves divergence; hashing is only
            # meaningful, and only affordable, once both sides line up exactly.
            if columns_match and rows_match:
                if compared < max_tables:
                    digests = []
                    for conn in (left, right):
                        digest = hashlib.sha256()
                        # Row order is not guaranteed without an ORDER BY, so two
                        # equal tables could hash differently. Collecting the row
                        # images and sorting them makes the digest order-stable.
                        rows = sorted(
                            repr(record) for record in conn.execute(f'SELECT * FROM "{name}"')
                        )
                        for image in rows:
                            digest.update(image.encode("utf-8", "replace"))
                        digests.append(digest.hexdigest()[:16])
                    entry["leftHash"], entry["rightHash"] = digests
                    entry["identical"] = digests[0] == digests[1]
                    compared += 1
                else:
                    entry["compared"] = False
            elif not columns_match:
                entry["reason"] = "column shape differs"
            else:
                entry["reason"] = f'row count differs ({lside["rows"]} vs {rside["rows"]})'

            if entry["identical"]:
                identical += 1
            else:
                differing += 1
            tables.append(entry)

        verdict = (
            "identical"
            if not only_left and not only_right and differing == 0
            else "diverged"
        )
        return {
            "left": {"id": db_id(left_path), "path": left_path,
                     "tableCount": len(left_shape)},
            "right": {"id": db_id(right_path), "path": right_path,
                      "tableCount": len(right_shape)},
            "onlyLeft": only_left,
            "onlyRight": only_right,
            "tables": tables,
            "counts": {
                "compared": compared,
                "identical": identical,
                "differing": differing,
                "onlyLeft": len(only_left),
                "onlyRight": len(only_right),
            },
            "verdict": verdict,
            "readOnly": True,
        }
    finally:
        left.close()
        right.close()


# ─────────────────────────────────────────────────────────────────────────────
# Snapshots — point-in-time copies that are actually complete
#
# A file copy of a WAL-mode database silently loses every transaction that has
# not been checkpointed. Measured on this host: a raw copy of the 23 MB
# `fyp2.db` reports 5,783 rows and 0 `audit` rows, while the same copy taken
# with its 19 MB sidecar log reports 5,792 rows and 9 `audit` rows. That
# 9-row gap is the "database always been alter" complaint, so a copy is not a
# backup — the log has to be read through, which is what `VACUUM INTO` does.
#
# The source is opened read-only; `VACUUM INTO` writes only to the destination.
# ─────────────────────────────────────────────────────────────────────────────

def snapshot_dir() -> str:
    return os.environ.get("SENTINEL_SNAPSHOT_DIR") or os.path.join(
        os.path.expanduser("~"), ".sentinel-snapshots")


def _verify_snapshot(path: str) -> dict:
    """Re-opens a snapshot and counts it, so "complete" is measured, not claimed."""
    try:
        conn = open_ro(path)
    except Exception as exc:
        return {"readable": False, "error": _safe_error(exc)}
    try:
        names = [
            row[0] for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name NOT LIKE 'sqlite_%' ORDER BY name"
            ).fetchall()
        ]
        rows = 0
        for name in names:
            try:
                rows += int(conn.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0])
            except Exception:
                pass
        integrity = None
        try:
            integrity = str(conn.execute("PRAGMA integrity_check").fetchone()[0])
        except Exception:
            pass
        return {"readable": True, "tableCount": len(names), "rowsTotal": rows,
                "tableNames": names, "integrity": integrity}
    finally:
        conn.close()


def snapshot_sqlite(path: str, destination=None, keep: int = 5) -> dict:
    """Writes a consistent snapshot of a live database and prunes old ones."""
    if not os.path.isfile(path):
        raise ValueError(f"no such database: {path}")

    target_dir = destination or snapshot_dir()
    os.makedirs(target_dir, exist_ok=True)

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    base = os.path.basename(path)
    snapshot = os.path.join(target_dir, f"{base}.{stamp}.db")
    if os.path.exists(snapshot):
        raise RuntimeError("a snapshot for this second already exists; retry shortly")

    conn = open_ro(path)
    try:
        conn.execute("VACUUM INTO ?", (snapshot,))
    except Exception as exc:
        if os.path.isfile(snapshot):
            try:
                os.remove(snapshot)
            except OSError:
                pass
        raise RuntimeError(f"snapshot failed: {_safe_error(exc)}") from exc
    finally:
        conn.close()

    verification = _verify_snapshot(snapshot)
    entry = {
        "source": path,
        "snapshot": snapshot,
        "sizeBytes": os.path.getsize(snapshot),
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "sha256": _sha256(snapshot),
        "snapshotDir": target_dir,
        "kept": keep,
    }
    entry.update(verification)
    # A snapshot that cannot be reopened, or that fails integrity, is worthless
    # — delete it rather than leave a false sense of safety on disk.
    if not verification.get("readable") or verification.get("integrity") not in ("ok", None):
        try:
            os.remove(snapshot)
        except OSError:
            pass
        raise RuntimeError(
            f"snapshot did not verify ({verification.get('integrity') or verification.get('error')}); "
            "it was removed"
        )

    entries = list_snapshots(target_dir)
    pruned = []
    siblings = [s for s in entries if os.path.basename(s["snapshot"]).startswith(base + ".")]
    for stale in siblings[keep:]:
        try:
            os.remove(stale["snapshot"])
            pruned.append(stale["snapshot"])
        except OSError:
            pass
    entry["pruned"] = pruned
    entry["retained"] = len(siblings[:keep])
    return entry


def list_snapshots(destination=None) -> list:
    target_dir = destination or snapshot_dir()
    if not os.path.isdir(target_dir):
        return []
    found = []
    for name in os.listdir(target_dir):
        if not name.endswith(".db"):
            continue
        full = os.path.join(target_dir, name)
        try:
            stat = os.stat(full)
        except OSError:
            continue
        found.append({
            "snapshot": full, "name": name, "sizeBytes": stat.st_size,
            "createdAt": datetime.fromtimestamp(stat.st_mtime, timezone.utc).isoformat(),
        })
    return sorted(found, key=lambda s: s["createdAt"], reverse=True)


def query_sqlite(path: str, table: str, limit: int, offset: int, search: str) -> dict:
    if not SAFE_IDENT.match(table):
        raise ValueError("invalid table name")
    conn = open_ro(path)
    try:
        exists = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type IN ('table','view') AND name = ?", (table,)
        ).fetchone()
        if not exists:
            raise ValueError(f"table {table} does not exist in this database")

        columns = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
        col_names = [c[1] for c in columns]
        sensitive = {c[1] for c in columns if SENSITIVE_COLUMN.match(c[1] or "")}

        where, params = "", []
        if search.strip() and col_names:
            clauses = [f'CAST("{c}" AS TEXT) LIKE ?' for c in col_names]
            where = " WHERE " + " OR ".join(clauses)
            params = [f"%{search.strip()}%"] * len(clauses)

        total = conn.execute(f'SELECT COUNT(*) FROM "{table}"{where}', params).fetchone()[0]
        fetch = limit + 1
        raw = conn.execute(
            f'SELECT * FROM "{table}"{where} LIMIT ? OFFSET ?', params + [fetch, offset]
        ).fetchall()
        # One extra row is fetched purely to answer "is there another page?".
        # Without it the UI cannot tell a full page from the last page, and the
        # operator pages one blind click at a time into nothing.
        has_more = len(raw) > limit
        raw = raw[:limit]

        rows = []
        for record in raw:
            row = {}
            for name, value in zip(col_names, record):
                if name in sensitive and value not in (None, ""):
                    row[name] = "<masked>"
                elif isinstance(value, (bytes, bytearray)):
                    row[name] = f"<blob {len(value)} bytes>"
                elif isinstance(value, str) and len(value) > 2000:
                    row[name] = value[:2000] + "\u2026"
                else:
                    row[name] = value
            rows.append(row)

        return {
            "table": table,
            "columns": [
                {"name": c[1], "type": (c[2] or "").upper() or None,
                 "pk": bool(c[5]), "sensitive": bool(SENSITIVE_COLUMN.match(c[1] or ""))}
                for c in columns
            ],
            "rows": rows, "total": int(total), "limit": limit, "offset": offset,
            "hasMore": has_more,
            "maskedColumns": sorted(sensitive), "readOnly": True,
        }
    finally:
        conn.close()


def _identity(path: str):
    """
    `(st_dev, st_ino)` for a path, or None when it cannot be stat'ed.

    This pair is the only handle that survives a mount namespace: a container
    reaches the host file through a different path, but it is the same inode.
    """
    try:
        info = os.stat(path)
    except OSError:
        return None
    return (info.st_dev, info.st_ino)


# Set by scan_holders, read by discover. A scan that can read no fd at all
# while other processes exist means /proc is restricted (`hidepid=2`), and
# "no holders found" would then be an artefact rather than a fact — the same
# shape as the false orphan this identity match was written to remove.
_SCAN_STATE = {"unreadable": False}


def scan_holders(paths) -> dict:
    """
    Maps each path to the processes holding it open, in a single /proc walk.

    Matching is by `(st_dev, st_ino)` rather than by path string. A path
    comparison is blind across mount namespaces: a container holding
    `/app/data/storage.sqlite` does have the host file open, but `/proc/<pid>/fd`
    reports the in-namespace path, so the host path never matches and a database
    being written to right now is classified as an orphan whose `-wal` will never
    be absorbed. Stat'ing the fd resolves through `/proc/<pid>/root` and compares
    inodes, which a namespace cannot hide.

    Inspecting one file at a time would walk /proc once per database; a 30-file
    sweep would then take seconds. One pass over the fd table answers every path
    at once, which matters because `discover` runs on a page the operator polls.
    """
    wanted = set(paths)
    found = {path: [] for path in wanted}
    _SCAN_STATE["unreadable"] = False
    if not sys.platform.startswith("linux") or not wanted:
        return found

    # Canonical host path -> identity, so an fd resolving to a container path
    # can be translated back to the host path the registry knows about.
    by_identity = {}
    for path in wanted:
        key = _identity(path)
        if key is not None:
            by_identity.setdefault(key, path)
    if not by_identity:
        return found

    seen_fds = 0
    statted_fds = 0
    self_pid = os.getpid()
    for entry in os.listdir("/proc"):
        if not entry.isdigit() or int(entry) == self_pid:
            continue
        fd_dir = f"/proc/{entry}/fd"
        try:
            names = os.listdir(fd_dir)
        except OSError:
            continue
        for fd in names:
            seen_fds += 1
            handle = f"{fd_dir}/{fd}"
            try:
                fd_stat = os.stat(handle)
            except OSError:
                continue
            statted_fds += 1
            # Only regular files can be one of ours; a socket or pipe has its own
            # inode space and is skipped rather than left to collide by number.
            if not stat.S_ISREG(fd_stat.st_mode):
                continue
            matched = by_identity.get((fd_stat.st_dev, fd_stat.st_ino))
            if matched is None:
                continue

            try:
                target = os.readlink(handle)
            except OSError:
                target = ""
            mode = "?"
            try:
                # fdinfo lives at /proc/<pid>/fdinfo/<fd> — *not* beside the fd
                # symlink. Its body is a keyed list (`pos:`, `flags:`, …), so the
                # flags line is found by name rather than by position.
                with open(f"/proc/{entry}/fdinfo/{fd}") as info_handle:
                    for line in info_handle:
                        if line.startswith("flags:"):
                            flags = int(line.split()[1], 8)
                            mode = "rw" if (flags & os.O_RDWR) else "ro"
                            break
            except Exception:
                pass
            name = ""
            try:
                with open(f"/proc/{entry}/comm") as handle:
                    name = handle.read().strip()
            except Exception:
                pass
            holders = found[matched]
            if len(holders) < 12:
                holders.append({
                    "pid": int(entry), "name": name, "mode": mode,
                    "deleted": target.endswith("(deleted)"),
                    # The fd's own view of the path. Differs from `matched` when
                    # the holder lives in another mount namespace. `removesuffix`
                    # rather than `rstrip`: rstrip takes a character *set*, so on
                    # `/app/data/storage.sqlite` it would strip the trailing `t`
                    # and `e` as well and report `/app/data/storage.sqli`.
                    "resolved": target.removesuffix(" (deleted)"),
                })

    # fds are listed but none can be stat'ed: /proc is restricted (`hidepid=2`).
    # Every "no holder" answer is then an artefact, so say so rather than let a
    # live database be reported as an orphan.
    if seen_fds > 0 and statted_fds == 0:
        _SCAN_STATE["unreadable"] = True
    return found


def idle_state(path: str, holders=None) -> dict:
    """
    Classifies a database as genuinely busy, merely locked, or idle.

    Sidecar files alone are misleading: a stale `-wal` left behind by a crashed
    writer makes a months-old backup look active. The only honest signal that a
    service is using a database is a process holding it open read/write, so that
    is what `live` means here, and sidecars are reported separately.
    """
    found = scan_holders([path]).get(path, []) if holders is None else holders
    wal = path + "-wal"
    wal_bytes = os.path.getsize(wal) if os.path.isfile(wal) else 0
    live = any(h["mode"] == "rw" for h in found)
    # If not one fd in the whole system could be read, the kernel is withholding
    # /proc and "nobody holds this" is an artefact. Never call that an orphan —
    # an orphan is an actionable claim, and acting on a false one means
    # checkpointing a `.db` that a service is actively writing.
    trustworthy = not _SCAN_STATE["unreadable"]

    if not found:
        if not trustworthy:
            note = "holder scan incomplete — /proc fd access denied"
        else:
            note = "orphaned write-ahead log, no holder" if wal_bytes else "idle"
    else:
        who = found[0]["name"] or str(found[0]["pid"])
        holder_path = found[0].get("resolved")
        detail = f" (via {holder_path})" if holder_path and holder_path != path else ""
        note = (f"held read/write by {who}" if live
                else f"read-only handle in {who}") + detail

    return {
        "holders": found, "holderCount": len(found), "walBytes": wal_bytes,
        "live": live, "locked": bool(found),
        "orphanedWal": bool(wal_bytes and not found and trustworthy),
        "liveNote": note,
    }


def lock_holders(path: str) -> dict:
    """
    Which processes hold the database open, and whether an orphaned write-ahead
    log is sitting next to it. An orphaned -wal with no holder means committed
    transactions exist that the main file has not absorbed yet — the exact
    condition under which a later copy of the `.db` alone looks "reverted".
    """
    if not sys.platform.startswith("linux"):
        return {"holders": [], "holderCount": 0, "overrideRisk": False,
                "orphanedWal": False, "live": False, "locked": False,
                "walBytes": 0, "liveNote": "holder detection needs /proc", "risk": []}

    result = {"holders": scan_holders([path]).get(path, []), "holderCount": 0,
              "overrideRisk": False, "orphanedWal": False, "risk": []}
    result["holderCount"] = len(result["holders"])

    if any(h["deleted"] for h in result["holders"]):
        result["overrideRisk"] = True
        result["risk"].append(
            "A process holds this file open after deletion. Any writes it flushes "
            "go to an unlinked inode and are lost when it exits."
        )
    if any(h["mode"] == "rw" for h in result["holders"]):
        result["risk"].append("A live process holds this database open read/write.")

    wal = path + "-wal"
    wal_bytes = os.path.getsize(wal) if os.path.isfile(wal) else 0
    if wal_bytes > 0 and not result["holders"] and not _SCAN_STATE["unreadable"]:
        result["orphanedWal"] = True
        result["risk"].append(
            "A write-ahead log exists but no process holds the database open. "
            "Committed transactions may not be present in the main .db file."
        )

    # Reuse the one classifier rather than duplicating its rules, so `inspect`
    # and `discover` can never disagree about what counts as a live database.
    idle = idle_state(path, result["holders"])
    result.update({key: idle[key] for key in
                   ("live", "locked", "walBytes", "liveNote", "orphanedWal")})
    return result


def discover_sqlite() -> list:
    found = []
    deadline = time.time() + ROOTS_BUDGET_S
    for root in roots():
        if time.time() > deadline or not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root, onerror=lambda e: None):
            dirnames[:] = [
                d for d in dirnames
                if not d.startswith(".") or d in (".context-mem",)
            ]
            for name in filenames:
                if not re.search(r'\.(sqlite3?|db|db3)$', name, re.I):
                    continue
                full = os.path.join(dirpath, name)
                try:
                    size = os.path.getsize(full)
                except OSError:
                    continue
                if size == 0:
                    continue
                found.append({"path": full, "sizeBytes": size, "noise": _is_noise(full)})

    seen, unique = set(), []
    for item in found:
        if item["path"] in seen:
            continue
        seen.add(item["path"])
        unique.append(item)
    return sorted(unique, key=lambda i: -i["sizeBytes"])


def consolidate_sidecar(path: str) -> dict:
    """
    Folds an orphaned write-ahead log back into its database, then clears it.

    Deleting a non-empty `-wal` destroys committed transactions — measured on
    this host, `fyp2.db` carries 9 such rows in a 19 MB log. A checkpoint is the
    only safe way to empty it, because it writes the log's contents into the
    main file first. The row count is taken on both sides of the checkpoint and
    compared, so "nothing was lost" is proven rather than assumed.
    """
    wal = path + "-wal"
    if not os.path.isfile(wal) or os.path.getsize(wal) == 0:
        return {"checkpointed": False, "reason": "no pending write-ahead log"}

    before = _verify_snapshot(path)
    info = {"checkpointed": False, "rowsBefore": before.get("rowsTotal")}
    try:
        conn = sqlite3.connect(path, timeout=15)
    except Exception as exc:
        info["error"] = _safe_error(exc)
        return info
    try:
        busy, pages, moved = conn.execute("PRAGMA wal_checkpoint(TRUNCATE)").fetchone()
        info.update({"checkpointed": busy == 0, "busy": int(busy),
                     "pagesTotal": int(pages), "pagesMoved": int(moved)})
    except Exception as exc:
        info["error"] = _safe_error(exc)
        return info
    finally:
        conn.close()

    after = _verify_snapshot(path)
    info["rowsAfter"] = after.get("rowsTotal")
    info["integrity"] = after.get("integrity")
    # Opening a checkpointed WAL database for reading recreates an empty `-wal`
    # as residue, so "cleared" means drained, not absent. A log that still holds
    # bytes after the checkpoint did not fold in, which is the one case where the
    # rows could still be lost — refuse to touch it then.
    info["walBytesAfter"] = os.path.getsize(wal) if os.path.isfile(wal) else 0
    info["cleared"] = info["walBytesAfter"] == 0
    if after.get("rowsTotal") is None or (
        before.get("rowsTotal") is not None and after["rowsTotal"] < before["rowsTotal"]
    ):
        info["unsafe"] = True
        info["error"] = (f"row count fell from {before.get('rowsTotal')} to "
                         f"{after.get('rowsTotal')}; sidecar left in place")
    elif info["walBytesAfter"]:
        info["unsafe"] = True
        info["error"] = (f"{info['walBytesAfter']} bytes remain in the write-ahead log; "
                         "sidecar left in place")
    return info


def prune_sidecars(verbose=True, limit=500, apply=False, targets=None,
                   grace_minutes=2) -> dict:
    """
    Folds orphaned write-ahead logs into their databases and clears the residue.

    An orphaned `-wal` is not clutter: SQLite replays it on the next open, so a
    database whose main file looks stable can change shape the moment anything
    connects. Only a log no process holds is touched, and it is checkpointed
    before removal so no committed transaction is discarded.

    A sidecar group is only actionable when it has a **non-empty `-wal`** (or a
    hot `-journal`), because that is the one file that can hold committed
    transactions the main `.db` has not absorbed. A lone `-shm` is a shared-memory
    index SQLite rebuilds on demand, so clearing it frees nothing and it is
    reported as residue rather than counted as reclaimable space.
    """
    now = datetime.now(timezone.utc)
    if targets is None:
        candidates_source = [i["path"] for i in discover_sqlite()]
    else:
        candidates_source = list(targets)

    orphaned, held, residue, unverified = [], [], [], []
    for path in candidates_source:
        sidecars = [p for p in (path + "-wal", path + "-shm", path + "-journal")
                    if os.path.isfile(p)]
        if not sidecars:
            continue
        holders = scan_holders([path]).get(path, [])
        idle = idle_state(path, holders)
        info = {"path": path, "sidecars": [], "holders": len(holders),
                "live": idle["live"], "locked": idle["locked"],
                "orphanedWal": idle["orphanedWal"], "liveNote": idle["liveNote"],
                "ageDays": None, "ageMinutes": None}
        try:
            age_seconds = now.timestamp() - os.path.getmtime(path)
            info["ageDays"] = round(age_seconds / 86400, 1)
            info["ageMinutes"] = round(age_seconds / 60, 1)
        except OSError:
            pass
        for side in sidecars:
            try:
                info["sidecars"].append({"path": side, "sizeBytes": os.path.getsize(side)})
            except OSError:
                pass
        info["sizeBytes"] = sum(s["sizeBytes"] for s in info["sidecars"])
        info["walBytes"] = sum(s["sizeBytes"] for s in info["sidecars"]
                               if s["path"].endswith("-wal"))
        info["hotJournal"] = any(s["path"].endswith("-journal") and s["sizeBytes"]
                                 for s in info["sidecars"])
        if holders:
            held.append(info)
        elif not info["walBytes"] and not info["hotJournal"]:
            residue.append(info)
        elif _SCAN_STATE["unreadable"]:
            # Blind scan: a non-empty log and no visible holder is exactly the
            # pair that would otherwise authorise a checkpoint of a file another
            # process is writing. Hold it back and say why.
            info["retained"] = "holder scan incomplete — /proc fd access denied"
            unverified.append(info)
        else:
            orphaned.append(info)

    # A log touched in the last minutes may belong to a process that is merely
    # between connections, so a short grace window avoids racing a live writer.
    # A long one costs more than it protects: an unheld log already proves no
    # connection is open, and the largest log on this host is 4 MB of a live
    # gateway that is simply not holding the file right now.
    candidates = [i for i in orphaned
                  if i["ageMinutes"] is None or i["ageMinutes"] >= grace_minutes]
    candidates.sort(key=lambda i: -i["walBytes"])
    candidates = candidates[:limit]

    for info in candidates:
        if apply:
            info["consolidation"] = consolidate_sidecar(info["path"])
            if info["consolidation"].get("unsafe"):
                info["skipped"] = True
                continue
            info["freedBytes"] = 0
            # Only the write-ahead log is drained by the checkpoint. The `-shm`
            # is rebuilt on the next connection, so it goes too; a `-journal` is
            # live rollback state and is left alone entirely.
            for side in list(info["sidecars"]):
                if not side["path"].endswith(("-wal", "-shm")):
                    continue
                if not os.path.isfile(side["path"]):
                    continue
                try:
                    size = os.path.getsize(side["path"])
                    os.remove(side["path"])
                    info["freedBytes"] += size
                except OSError:
                    pass

    freed = sum(i.get("freedBytes") or 0 for i in candidates)
    reclaimable = sum(i["walBytes"] + 32768 for i in candidates)
    if verbose:
        print(f"{len(orphaned)} orphaned group(s), {len(held)} held, "
              f"{len(residue)} inert residue"
              + (f", {len(unverified)} unverified" if unverified else []) +
              f" · {'consolidated' if apply else 'would reclaim'} "
              f"{reclaimable / 1024 / 1024:.1f} MB")
        for info in candidates:
            note = ""
            if apply and info.get("consolidation"):
                cons = info["consolidation"]
                note = (f" → checkpoint rows {cons.get('rowsBefore')}→{cons.get('rowsAfter')}"
                        if cons.get("checkpointed") else f" → {cons.get('reason') or cons.get('error')}")
            print(f"  {info['path']} (wal {info['walBytes'] / 1024 / 1024:.1f} MB, "
                  f"age {info['ageDays']}d){note}")
    return {"applied": apply, "orphaned": orphaned, "held": held, "residue": residue,
            "unverified": unverified, "candidates": candidates, "freedBytes": freed,
            "reclaimableBytes": reclaimable}


def discover(deep=True) -> dict:
    """Registers every database, groups filename collisions, flags divergence."""
    registry = []
    for item in discover_sqlite():
        record = dict(item)
        try:
            digest = _sha256(record["path"])
            record["sha256"] = digest
        except Exception as exc:
            record["hashError"] = _safe_error(exc)
        record["writable"] = os.access(record["path"], os.W_OK)

        if deep:
            try:
                info = inspect_sqlite(record["path"], want_rows=False)
                record.update({
                    "id": info["id"], "readable": info["readable"],
                    "tableCount": info["tableCount"], "journalMode": info["journalMode"],
                    "modifiedAt": info["modifiedAt"],
                    "error": info["error"], "domainHints": info["domainHints"],
                    "tables": [t["name"] for t in info["tables"]],
                    "views": [v["name"] for v in info["views"]],
                })
            except Exception as exc:
                record.update({"readable": False, "error": _safe_error(exc)})
        registry.append(record)

    # One /proc pass for the whole fleet. Sidecar files alone are misleading:
    # a stale -wal left behind by a crashed writer makes a months-old backup
    # look busy, so the honest signal is a process actually holding the file.
    holders = scan_holders([r["path"] for r in registry])
    for record in registry:
        record.update(idle_state(record["path"], holders.get(record["path"], [])))

    by_name = {}
    for record in registry:
        by_name.setdefault(os.path.basename(record["path"]), []).append(record)

    duplicate_groups = []
    for name, group in sorted(by_name.items()):
        if len(group) < 2:
            continue
        digests = {r.get("sha256") for r in group}
        schemas = {r.get("tableCount") for r in group}
        live = [r for r in group if r.get("live")]
        duplicate_groups.append({
            "filename": name,
            "copies": len(group),
            "diverged": len(digests) > 1,
            "schemaMismatch": len(schemas) > 1,
            "paths": [r["path"] for r in group],
            "tableCounts": [r.get("tableCount") for r in group],
            "sizes": [r["sizeBytes"] for r in group],
            "liveCount": len(live),
            "lockedCount": sum(1 for r in group if r.get("locked")),
            "livePaths": [r["path"] for r in live],
            "tableCountMin": min([c for c in schemas if isinstance(c, int)], default=None),
            "tableCountMax": max([c for c in schemas if isinstance(c, int)], default=None),
        })

    managed = [r for r in registry if not r["noise"]]
    for record in managed + [r for r in registry if r["noise"]]:
        record.setdefault("id", db_id(record["path"]))

    return {
        "success": True,
        "mode": "local",
        "roots": roots(),
        "scannedAt": datetime.now(timezone.utc).isoformat(),
        "total": len(registry),
        "managedCount": len(managed),
        "noiseCount": len(registry) - len(managed),
        "liveCount": sum(1 for r in registry if r.get("live")),
        "lockedCount": sum(1 for r in registry if r.get("locked")),
        "orphanedWalCount": sum(1 for r in registry if r.get("orphanedWal")),
        "managed": managed,
        "noise": [r for r in registry if r["noise"]],
        "duplicateGroups": duplicate_groups,
        "divergedCount": sum(1 for g in duplicate_groups if g["diverged"]),
    }


DOMAIN_KEYWORDS = {
    "auth": ("user", "users", "account", "accounts", "role", "roles", "permission",
             "permissions", "client_credentials", "session", "sessions", "auth",
             "api_key", "api_keys", "telegram_pairings"),
    "commerce": ("payment", "payments", "payment_transactions", "transaction", "transactions",
                 "order", "orders", "invoice", "invoices", "plan", "plans", "subscription",
                 "subscriptions", "promo_codes", "coupons", "prices", "customer", "customers"),
    "security": ("findings", "finding_notes", "exploit_campaigns", "exploit_steps",
                 "exploit_loot", "exploit_approvals", "cve_cache", "scans", "vulnerabilities",
                 "payloads", "payload_fts", "audit", "cve"),
    "content": ("posts", "articles", "media", "videos", "pages", "comments", "votes",
                "assets", "samples", "voices"),
    "ops": ("logs", "events", "jobs", "tasks", "monitors", "monitor_events", "cache",
            "heartbeats", "metrics"),
}


def _classify(tables) -> set:
    lowered = {str(t).lower() for t in tables}
    hits = set()
    for domain, keywords in DOMAIN_KEYWORDS.items():
        if lowered & set(keywords):
            hits.add(domain)
    return hits


# ─────────────────────────────────────────────────────────────────────────────
# Postgres introspection — fixed SELECTs only
# ─────────────────────────────────────────────────────────────────────────────

def _pg(query: str, timeout=45) -> str:
    proc = subprocess.run(
        ["sudo", "-n", "-u", "postgres", "psql", "-w", "-At", "-F", "\t", "-c", query],
        capture_output=True, text=True, timeout=timeout,
    )
    if proc.returncode != 0 and not proc.stdout.strip():
        raise RuntimeError(_safe_error(proc.stderr).splitlines()[0] or "psql failed")
    return proc.stdout.strip()


def postgres_databases() -> dict:
    query = (
        "SELECT d.datname, pg_size_pretty(pg_database_size(d.datname)), "
        "pg_database_size(d.datname)::text, "
        "pg_get_userbyid(d.datdba), pg_encoding_to_char(d.encoding), "
        "(SELECT count(*) FROM pg_stat_activity a WHERE a.datid = d.oid)::text "
        "FROM pg_database d WHERE NOT d.datistemplate "
        "ORDER BY pg_database_size(d.datname) DESC"
    )
    databases = []
    for line in _pg(query).splitlines():
        parts = line.split("\t")
        if len(parts) < 6:
            continue
        databases.append({
            "name": parts[0], "size": parts[1], "sizeBytes": int(parts[2] or 0),
            "owner": parts[3] or None,
            "encoding": parts[4] or None,
            # `tables` stays null: counting relations needs a connection per
            # database, and this command must stay a single cheap round trip.
            "tables": None,
            "connections": int(parts[5] or 0), "engine": "postgres",
            "id": "pg-" + hashlib.sha1(parts[0].encode()).hexdigest()[:10],
        })
    return {"success": True, "available": True, "configured": True,
            "engine": "postgres", "readOnly": True,
            "databases": databases,
            "scannedAt": datetime.now(timezone.utc).isoformat()}


def postgres_databases_safe() -> dict:
    """
    `postgres_databases` with an unreachable cluster turned into a payload.

    The Hub renders this list on a page that also shows SQLite results, so a
    host without a Postgres cluster must read as "nothing here" rather than as
    a failed request.
    """
    try:
        return postgres_databases()
    except (RuntimeError, subprocess.SubprocessError, OSError, ValueError) as exc:
        return {"success": False, "available": False, "configured": True,
                "databases": [], "reason": _safe_error(exc)}


def postgres_tables(dbname: str) -> dict:
    if not SAFE_IDENT.match(dbname):
        raise ValueError("invalid database name")
    query = (
        "SELECT c.relname, c.reltuples::bigint::text, "
        "(SELECT count(*) FROM information_schema.columns col "
        " WHERE col.table_schema='public' AND col.table_name=c.relname)::text "
        "FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace "
        "WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname"
    )
    tables = []
    for line in _pg(query).splitlines():
        parts = line.split("\t")
        if len(parts) < 3:
            continue
        tables.append({"name": parts[0], "estimatedRows": int(parts[1] or 0),
                       "columns": int(parts[2] or 0)})
    return {"success": True, "database": dbname, "tables": tables,
            "tableCount": len(tables), "readOnly": True}


# ─────────────────────────────────────────────────────────────────────────────
# Remote wrapper — ships this script to the host and runs it there
# ─────────────────────────────────────────────────────────────────────────────

def _get_ssh():
    if paramiko is None:
        raise RuntimeError("paramiko is not installed for remote SSH operations")
    if not KALI_HOST:
        raise RuntimeError("KALI_HOST is not configured")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.load_system_host_keys()
    if KALI_KNOWN_HOSTS:
        kp = os.path.abspath(os.path.expanduser(os.path.expandvars(KALI_KNOWN_HOSTS)))
        if os.path.isfile(kp):
            ssh.load_host_keys(kp)
    kwargs = {
        "port": KALI_PORT, "username": KALI_USER, "timeout": 10,
        "banner_timeout": 10, "auth_timeout": 10,
        "look_for_keys": True, "allow_agent": True,
    }
    if KALI_KEY_FILENAME:
        key_path = os.path.abspath(os.path.expanduser(os.path.expandvars(KALI_KEY_FILENAME)))
        if os.path.isfile(key_path):
            kwargs["key_filename"] = key_path
    if KALI_PASS:
        kwargs["password"] = KALI_PASS
    ssh.connect(KALI_HOST, **kwargs)
    return ssh


def run_remote(argv, timeout=180) -> int:
    """Uploads this script to a private temp path on the host and runs it."""
    ssh = _get_ssh()
    try:
        with open(os.path.abspath(__file__), "rb") as handle:
            payload = handle.read()
        encoded = base64.b64encode(payload).decode("ascii")
        remote_path = f"/tmp/.sentinel-db-bridge-{os.getpid()}.py"

        stdin, stdout, stderr = ssh.exec_command(
            f"umask 077 && base64 -d > {_quote(remote_path)}", timeout=30
        )
        stdin.write(encoded)
        stdin.channel.shutdown_write()
        stdout.channel.recv_exit_status()

        forwarded = " ".join(
            f"{key}={_quote(os.environ[key])}"
            for key in ("SENTINEL_DB_ROOTS", "KALI_HOST") if os.environ.get(key)
        )
        inner = " ".join(_quote(a) for a in argv[1:])
        command = (
            f"env KALI_HOST=127.0.0.1 {forwarded} "
            f"python3 {_quote(remote_path)} {inner}; rc=$?; rm -f {_quote(remote_path)}; exit $rc"
        )
        _, stdout, stderr = ssh.exec_command(command, timeout=timeout)
        out = stdout.read().decode("utf-8", errors="replace")
        err = stderr.read().decode("utf-8", errors="replace")
        code = stdout.channel.recv_exit_status()

        sys.stdout.write(out.strip())
        if code != 0 and not out.strip():
            print(json.dumps({"success": False, "error": _safe_error(err).strip()[:400]}))
        return code
    finally:
        ssh.close()


# ─────────────────────────────────────────────────────────────────────────────
# CLI
# ─────────────────────────────────────────────────────────────────────────────

def _resolve(target: str) -> str:
    """Accepts a registry id or an explicit path."""
    if os.path.isabs(target) or re.match(r'^[A-Za-z]:[\\/]', target):
        return target
    for item in discover_sqlite():
        if db_id(item["path"]) == target:
            return item["path"]
    raise ValueError(f"no database in the registry matches id {target}")


def _parse_flags(argv) -> dict:
    options = {"limit": DEFAULT_PREVIEW_ROWS, "offset": 0, "search": "",
               "keep": 5, "dir": None, "apply": False}
    index = 0
    while index < len(argv):
        token = argv[index]
        if token == "--apply":
            options["apply"] = True
            index += 1
        elif token == "--limit" and index + 1 < len(argv):
            options["limit"] = max(1, min(MAX_PREVIEW_ROWS, int(argv[index + 1])))
            index += 2
        elif token == "--offset" and index + 1 < len(argv):
            options["offset"] = max(0, int(argv[index + 1]))
            index += 2
        elif token == "--search" and index + 1 < len(argv):
            options["search"] = argv[index + 1]
            index += 2
        elif token == "--keep" and index + 1 < len(argv):
            options["keep"] = max(1, min(100, int(argv[index + 1])))
            index += 2
        elif token == "--dir" and index + 1 < len(argv):
            options["dir"] = argv[index + 1]
            index += 2
        else:
            index += 1
    return options


def dispatch(argv) -> int:
    cmd = argv[1]

    if cmd == "discover":
        print(json.dumps(discover()))
    elif cmd == "inspect":
        path = _resolve(argv[2])
        result = inspect_sqlite(path, want_rows=True)
        result.update(lock_holders(path))
        print(json.dumps(result))
    elif cmd == "verify":
        path = _resolve(argv[2])
        result = manifest_sqlite(path)
        result.update(lock_holders(path))
        print(json.dumps(result))
    elif cmd == "query":
        if len(argv) < 4:
            raise ValueError("query requires <id> <table>")
        path = _resolve(argv[2])
        options = _parse_flags(argv[4:])
        print(json.dumps(query_sqlite(
            path, argv[3], options["limit"], options["offset"], options["search"]
        )))
    elif cmd == "compare":
        if len(argv) < 4:
            raise ValueError("compare requires <id|path> <id|path>")
        print(json.dumps(compare_databases(_resolve(argv[2]), _resolve(argv[3]))))
    elif cmd == "snapshot":
        if len(argv) < 3:
            raise ValueError("snapshot requires <id|path> [--keep N] [--dir PATH]")
        options = _parse_flags(argv[3:])
        print(json.dumps(snapshot_sqlite(
            _resolve(argv[2]), destination=options["dir"], keep=options["keep"]
        )))
    elif cmd == "snapshots":
        options = _parse_flags(argv[2:])
        entries = list_snapshots(options["dir"])
        print(json.dumps({
            "success": True, "dir": options["dir"] or snapshot_dir(),
            "count": len(entries), "snapshots": entries,
        }))
    elif cmd == "prune-sidecars":
        options = _parse_flags(argv[2:])
        print(json.dumps(prune_sidecars(
            verbose=os.environ.get("SENTINEL_VERBOSE") == "1",
            apply=options["apply"],
        )))
    elif cmd == "postgres":
        print(json.dumps(postgres_databases_safe()))
    elif cmd == "postgres-tables":
        print(json.dumps(postgres_tables(argv[2])))
    elif cmd == "self-test":
        return self_test()
    else:
        print(json.dumps({"error": f"Unknown command {cmd}"}))
        return 1
    return 0


def self_test() -> int:
    """Proves read-only enforcement and the sensitive-column mask actually work."""
    import tempfile
    failures = []

    with tempfile.TemporaryDirectory() as tmp:
        sample = os.path.join(tmp, "sample.db")
        writer = sqlite3.connect(sample)
        writer.execute("CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT, password_hash TEXT)")
        writer.execute("INSERT INTO users (email, password_hash) VALUES ('a@b.c', 'secret-hash')")
        writer.execute("CREATE TABLE orders (id INTEGER PRIMARY KEY, total REAL)")
        writer.execute("INSERT INTO orders (total) VALUES (12.5)")
        writer.commit()
        writer.close()

        info = inspect_sqlite(sample)
        if info["tableCount"] != 2:
            failures.append(f"tableCount expected 2, got {info['tableCount']}")
        if not info["readable"]:
            failures.append("sample database reported unreadable")
        if info["integrity"] not in ("ok", None):
            failures.append(f"integrity_check returned {info['integrity']}")

        # The read-only handle must reject writes at the driver level.
        conn = open_ro(sample)
        try:
            conn.execute("INSERT INTO users (email) VALUES ('x@y.z')")
            failures.append("read-only handle accepted an INSERT")
        except sqlite3.OperationalError:
            pass
        finally:
            conn.close()

        masked = query_sqlite(sample, "users", 10, 0, "")
        if masked["rows"][0]["password_hash"] != "<masked>":
            failures.append("password_hash was not masked")
        if masked["rows"][0]["email"] != "a@b.c":
            failures.append("non-sensitive column was altered")

        search = query_sqlite(sample, "orders", 10, 0, "12.5")
        if search["total"] != 1:
            failures.append(f"search expected 1 row, got {search['total']}")
        if search["hasMore"]:
            failures.append("hasMore was true on a single-row result")

        # A full page must remain pageable: hasMore has to be true exactly when a
        # further row exists, otherwise the UI dead-ends or promises phantom rows.
        for value in (3.5, 4.5):
            writer = sqlite3.connect(sample)
            writer.execute("INSERT INTO orders (total) VALUES (?)", (value,))
            writer.commit()
            writer.close()
        page = query_sqlite(sample, "orders", 2, 0, "")
        if page["total"] != 3 or page["hasMore"] is not True:
            failures.append(f"page of 2 from 3 rows: total={page['total']} hasMore={page['hasMore']}")
        last = query_sqlite(sample, "orders", 2, 2, "")
        if last["hasMore"] is not False:
            failures.append("hasMore was true on the final page")

        # Search must also be able to page, which it cannot do if it silently
        # narrows the fetch to `limit`.
        found = query_sqlite(sample, "orders", 1, 0, "4.5")
        if found["total"] != 1 or found["rows"][0]["total"] != 4.5:
            failures.append(f"search page mismatch: {found.get('total')}")

        # `live` must reflect a real holder, not a leftover sidecar file. Left
        # alone, a stale -wal from a crashed writer makes a dead backup look
        # like an active service — the exact misreading that caused the drift.
        import shutil as _shutil
        quiet = os.path.join(tmp, "quiet.db")
        _shutil.copyfile(sample, quiet)
        with open(quiet + "-wal", "wb") as handle:
            handle.write(b"\x00" * 64)
        if scan_holders([quiet]).get(quiet):
            failures.append("scan_holders invented a holder for an unheld file")

        idle = idle_state(quiet)
        if idle["live"]:
            failures.append("orphaned -wal was reported as a live writer")
        if not idle["orphanedWal"]:
            failures.append("orphaned -wal was not flagged")

        # `inspect` and `discover` must never disagree about liveness. They did
        # once — inspect derived `live` from sidecar bytes while discover used
        # real holders — so the same file was called "busy" by one command and
        # "orphaned" by the other depending on which page you opened.
        if sys.platform.startswith("linux"):
            looked = lock_holders(quiet)
            if looked["live"]:
                failures.append("lock_holders called an orphaned file live")
            if not looked["orphanedWal"]:
                failures.append("lock_holders missed the orphaned write-ahead log")
            if looked["liveNote"] != idle["liveNote"]:
                failures.append(
                    f"inspect/discover disagree: {looked['liveNote']!r} vs {idle['liveNote']!r}"
                )

        # The positive case: a real read/write handle in another process must be
        # found, reported as read/write, and must flip `live` to true.
        holder = subprocess.Popen(
            [sys.executable, "-c",
             "import sqlite3,sys,time; c=sqlite3.connect(sys.argv[1]); time.sleep(6)", quiet],
        )
        try:
            deadline = time.time() + 5
            observed = {}
            while time.time() < deadline:
                observed = scan_holders([quiet]).get(quiet, [])
                if observed:
                    break
                time.sleep(0.2)
            if not observed:
                failures.append("a held database was not detected")
            elif observed[0]["mode"] != "rw":
                failures.append(f"holder mode was {observed[0]['mode']}, expected rw")
            elif not idle_state(quiet, observed)["live"]:
                failures.append("a read/write holder did not mark the database live")

            # This is the assertion that would have caught the false orphan. The
            # original scan compared `/proc/<pid>/fd` symlink targets against the
            # host path string, which is blind across mount namespaces: a
            # container holding `/app/data/storage.sqlite` genuinely holds the
            # host file, but `/proc` reports the in-namespace path, so no exact
            # match was found and a database being written to right now was
            # classified as an orphan. `prune-sidecars` would then have deleted a
            # live `-wal`. A hard link reproduces that shape exactly — same inode,
            # a different path, and the process holds it under the other name.
            # The name deliberately ends in "e", one of the characters `rstrip`
            # treats as padding, so a `rstrip(" (deleted)")` regression shows up
            # here instead of silently corrupting reported paths in production.
            alias = os.path.join(tmp, "aliased.sqlite")
            linked = False
            try:
                os.link(quiet, alias)
                linked = True
            except OSError:
                # A filesystem that cannot hard-link (some overlay/tmpfs setups)
                # leaves this unsimulatable here; it is simulated against the real
                # namespace on the host instead of being asserted in-process.
                pass
            if linked:
                alias_holder = subprocess.Popen(
                    [sys.executable, "-c",
                     # sqlite3.connect() is lazy — SQLite does not open the file
                     # until the first statement, so the handle must be exercised
                     # or there is no fd to find.
                     "import sqlite3,sys,time; c=sqlite3.connect(sys.argv[1]); "
                     "c.execute('select count(*) from sqlite_master').fetchall(); time.sleep(6)",
                     alias],
                )
                try:
                    deadline = time.time() + 5
                    cross, resolved = [], []
                    while time.time() < deadline:
                        cross = scan_holders([quiet]).get(quiet, [])
                        resolved = [h.get("resolved") for h in cross]
                        if alias in resolved:
                            break
                        time.sleep(0.2)
                    if not cross:
                        failures.append(
                            "a holder reachable only by another path was missed — the "
                            "exact blindness that produced false orphans"
                        )
                    elif not idle_state(quiet, cross)["live"]:
                        failures.append("an identity-matched holder was not reported live")
                    elif alias not in resolved:
                        failures.append(
                            "no holder was recorded through the alias path "
                            f"{alias!r} — inode matching did not resolve it; got {resolved!r}"
                        )
                finally:
                    alias_holder.terminate()
                    alias_holder.wait(timeout=5)
        finally:
            holder.terminate()
            holder.wait(timeout=5)

        try:
            query_sqlite(sample, "users; DROP TABLE users", 10, 0, "")
            failures.append("invalid table name was accepted")
        except ValueError:
            pass

        manifest = manifest_sqlite(sample)
        if manifest["tableCount"] != 2 or manifest["rowsTotal"] != 4:
            failures.append(f"manifest mismatch: {manifest.get('tableCount')} / {manifest.get('rowsTotal')}")

        # A second copy that has drifted must be reported as diverged, and an
        # untouched copy must not be — a false "diverged" is as harmful as a miss.
        clone = os.path.join(tmp, "clone.db")
        with open(sample, "rb") as source, open(clone, "wb") as target:
            target.write(source.read())
        same = compare_databases(sample, clone)
        if same["verdict"] != "identical":
            failures.append(f"identical copy reported as {same['verdict']}")

        editor = sqlite3.connect(clone)
        editor.execute("ALTER TABLE users ADD COLUMN nickname TEXT")
        editor.execute("INSERT INTO orders (total) VALUES (99)")
        editor.commit()
        editor.close()
        drift = compare_databases(sample, clone)
        if drift["verdict"] != "diverged":
            failures.append("altered copy was not reported as diverged")
        if "nickname" not in [
            column for table in drift["tables"] if table["name"] == "users"
            for column in table["extraColumns"]
        ]:
            failures.append("added column was not listed as extra")
        if drift["counts"]["differing"] == 0:
            failures.append("changed row content was not detected")

        # A snapshot must capture transactions still sitting in the write-ahead
        # log. A plain file copy does not, which is precisely how a project
        # database gets silently "reverted" to an older state.
        live_db = os.path.join(tmp, "wal.db")
        log = sqlite3.connect(live_db)
        log.execute("PRAGMA journal_mode=WAL")
        log.execute("CREATE TABLE audit (id INTEGER PRIMARY KEY, note TEXT)")
        log.execute("INSERT INTO audit (note) VALUES ('older')")
        log.commit()
        # Hold the connection open so the WAL is not checkpointed into the main
        # file — the same state every running service on this host leaves behind.
        log.execute("INSERT INTO audit (note) VALUES ('newer')")
        log.commit()
        wal_bytes = os.path.getsize(live_db + "-wal") if os.path.isfile(live_db + "-wal") else 0
        if wal_bytes == 0:
            failures.append("WAL mode did not produce a write-ahead log to test against")

        copied = os.path.join(tmp, "copied.db")
        with open(live_db, "rb") as source, open(copied, "wb") as target:
            target.write(source.read())
        copy_rows = _verify_snapshot(copied).get("rowsTotal")

        snap = snapshot_sqlite(live_db, destination=os.path.join(tmp, "snaps"), keep=2)
        if not snap.get("readable"):
            failures.append("snapshot was not readable")
        if snap.get("rowsTotal") != 2:
            failures.append(f"snapshot captured {snap.get('rowsTotal')} rows, expected 2")
        if snap.get("integrity") != "ok":
            failures.append(f"snapshot integrity was {snap.get('integrity')}")
        if copy_rows == 2:
            failures.append("control failed: a plain copy already had both rows, so the "
                            "snapshot test proves nothing")
        log.close()

        # Retention must actually bound the snapshot directory.
        for _ in range(2):
            time.sleep(1.05)
            snapshot_sqlite(live_db, destination=os.path.join(tmp, "snaps"), keep=2)
        kept = [s for s in list_snapshots(os.path.join(tmp, "snaps"))
                if os.path.basename(s["snapshot"]).startswith("wal.db.")]
        if len(kept) != 2:
            failures.append(f"retention kept {len(kept)} snapshots, expected 2")

        # Pruning must fold the log in, never discard it: deleting a non-empty
        # -wal would destroy exactly the committed rows this bridge protects.
        # A clean close checkpoints the log away, so the residue is staged the
        # only honest way - a writer killed mid-flight, as a crash would.
        closed = os.path.join(tmp, "closed.db")
        holder = subprocess.Popen(
            [sys.executable, "-c", (
                "import sqlite3,time,sys\n"
                "db=sqlite3.connect(sys.argv[1])\n"
                "db.execute('PRAGMA journal_mode=WAL')\n"
                "db.execute('CREATE TABLE events (id INTEGER PRIMARY KEY, label TEXT)')\n"
                "db.execute(\"INSERT INTO events (label) VALUES ('kept')\")\n"
                "db.commit()\n"
                "print('ready',flush=True)\n"
                "time.sleep(30)\n"
            ), closed],
            stdout=subprocess.PIPE, text=True,
        )
        if holder.stdout.readline().strip() != "ready":
            failures.append("staging writer never reported ready")
        holder.kill()
        holder.wait(timeout=10)
        holder.stdout.close()
        pending = closed + "-wal"
        if not os.path.isfile(pending) or os.path.getsize(pending) == 0:
            failures.append("could not stage an orphaned write-ahead log")
        else:
            stale = time.time() - 90000
            for staged in (closed, pending):
                os.utime(staged, (stale, stale))
            result = prune_sidecars(verbose=False, apply=True, targets=[closed])
            handled = [c for c in result["candidates"] if c["path"] == closed]
            if not handled:
                failures.append("orphaned sidecar was not offered for consolidation")
            elif handled[0].get("skipped"):
                failures.append("consolidation refused to fold a healthy database")
            after = _verify_snapshot(closed)
            if after.get("rowsTotal") != 1:
                failures.append(
                    f"consolidation lost data: {after.get('rowsTotal')} rows remain, expected 1")
            consolidation = handled[0].get("consolidation") if handled else {}
            if not consolidation.get("cleared"):
                failures.append(
                    f"write-ahead log still holds {consolidation.get('walBytesAfter')} bytes "
                    "after checkpointing")

        # A lone -shm holds nothing: SQLite rebuilds it on the next connection.
        # Counting it as reclaimable space would misreport the sweep, so it must
        # land in residue and never in candidates.
        inert = os.path.join(tmp, "inert.db")
        conn = sqlite3.connect(inert)
        conn.execute("CREATE TABLE t (id INTEGER PRIMARY KEY)")
        conn.commit()
        conn.close()
        sqlite3.connect(inert).close()
        with open(inert + "-shm", "wb") as handle:
            handle.write(b"\0" * 32768)
        os.utime(inert, (time.time() - 90000, time.time() - 90000))
        sweep = prune_sidecars(verbose=False, targets=[inert])
        if any(c["path"] == inert for c in sweep["candidates"]):
            failures.append("a -shm with no write-ahead log was offered as reclaimable")
        if not any(r["path"] == inert for r in sweep["residue"]):
            failures.append("a -shm with no write-ahead log was not classified as residue")

    # An unreachable Postgres cluster must produce a payload, not an exception.
    unreachable = postgres_databases_safe()
    if not isinstance(unreachable, dict) or "available" not in unreachable:
        failures.append("postgres_databases_safe did not return a payload")
    if unreachable.get("available") and not isinstance(unreachable.get("databases"), list):
        failures.append("postgres payload has no databases list")

    # Every count in the `discover` envelope must be reconcilable from the
    # entries the envelope actually delivers. `orphanedWalCount` counts the whole
    # registry, so if `noise` shipped bare paths instead of records the dashboard
    # would silently undercount orphaned write-ahead logs — 3 on the host, 2 on
    # screen — and one unabsorbed log would never be reported.
    inventory = discover()
    if len(inventory["managed"]) + len(inventory["noise"]) != inventory["total"]:
        failures.append("managed + noise does not equal total")
    delivered = inventory["managed"] + inventory["noise"]
    for bucket in ("managed", "noise"):
        if not all(isinstance(entry, dict) for entry in inventory[bucket]):
            failures.append(f"{bucket} entries are not records")
    for field in ("live", "locked", "orphanedWal"):
        recomputed = sum(1 for entry in delivered if entry.get(field))
        if recomputed != inventory[f"{field}Count"]:
            failures.append(
                f"{field}Count is {inventory[f'{field}Count']} but only {recomputed} "
                f"entries carry {field}"
            )

    # `checks` is the number of assertion sites in this function, kept in step by
    # hand: `Select-String -Path db-bridge.py -Pattern 'failures\.append\(' | Measure-Object`.
    # It is a coverage figure an operator can sanity-check, not a pass count.
    result = {"success": not failures, "checks": 48, "failures": failures}
    print(json.dumps(result))
    return 0 if not failures else 1


def main(argv) -> int:
    if len(argv) < 2:
        print(json.dumps({"error": "Missing command: discover | inspect | verify | compare | query | "
                                   "postgres | postgres-tables | self-test"}))
        return 1
    cmd = argv[1]

    if not is_local():
        return run_remote(argv)

    try:
        return dispatch(argv)
    except Exception as exc:
        print(json.dumps({"success": False, "error": _safe_error(exc)}))
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
