#!/usr/bin/env python3
"""Deploy Sentinel Master to a verified Kali Linux SSH host."""

import os
import posixpath
import re
import shlex
import sys
import tarfile
import time

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

try:
    import paramiko
except ImportError:
    print("[Error] 'paramiko' is required. Run: pip install paramiko")
    sys.exit(1)


def _env_int(name, default):
    value = os.environ.get(name)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc


KALI_HOST = os.environ.get("KALI_HOST", "192.168.68.132").strip()
KALI_PORT = _env_int("KALI_PORT", 22)
KALI_USER = os.environ.get("KALI_USER", "kali").strip()
KALI_PASS = os.environ.get("KALI_PASS", "kali") or None
KALI_KNOWN_HOSTS = os.environ.get("KALI_KNOWN_HOSTS") or None
KALI_KEY_FILENAME = os.environ.get("KALI_KEY_FILENAME") or None
REMOTE_DIR = os.environ.get("KALI_REMOTE_DIR", "/home/kali/server/SentinelMaster")
REMOTE_TAR = os.environ.get("KALI_REMOTE_TAR", "/home/kali/sentinel-master-deploy.tar.gz")
REMOTE_SYMLINK = os.environ.get("KALI_REMOTE_SYMLINK", "/home/kali/SentinelMaster")
ARCHIVE_NAME = "sentinel-master-deploy.tar.gz"
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

IGNORED_DIRECTORIES = {
    ".git",
    ".next",
    ".parcel-cache",
    ".system_generated",
    ".turbo",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "out",
    "venv",
    "llama.cpp",
    "_archives",
    ".browser_profiles",
}
IGNORED_FILES = {
    ".ds_store",
    ".dockerconfigjson",
    ".env",
    ".env.development",
    ".env.example",
    ".env.local",
    ".env.production",
    ".env.test",
    ".my.cnf",
    ".mylogin.cnf",
    ".netrc",
    ".npmrc",
    ".pgpass",
    ".pnpmrc",
    ".yarnrc",
    ".yarnrc.yml",
    "thumbs.db",
    "authorized_keys",
    "id_dsa",
    "id_ecdsa",
    "id_ed25519",
    "id_rsa",
}
IGNORED_SUFFIXES = {
    ".auth",
    ".bak",
    ".backup",
    ".cer",
    ".cert",
    ".credential",
    ".credentials",
    ".crt",
    ".env",
    ".jks",
    ".keystore",
    ".key",
    ".kubeconfig",
    ".log",
    ".p12",
    ".p8",
    ".passwd",
    ".password",
    ".pem",
    ".pfx",
    ".private",
    ".pyc",
    ".pyo",
    ".secret",
    ".secrets",
    ".swp",
    ".tar",
    ".tgz",
    ".token",
    ".tsbuildinfo",
    ".zip",
    ".gz",
}
SECRET_DIRECTORY_NAMES = {
    ".ssh",
    "certs",
    "certificates",
    "credential",
    "credentials",
    "keys",
    "private",
    "secret",
    "secrets",
}
DANGEROUS_REMOTE_PATHS = {
    "/",
    "/bin",
    "/boot",
    "/dev",
    "/etc",
    "/home",
    "/lib",
    "/lib64",
    "/mnt",
    "/proc",
    "/root",
    "/run",
    "/sbin",
    "/sys",
    "/tmp",
    "/usr",
    "/var",
}


def _is_dangerous_remote_path(path):
    if path in DANGEROUS_REMOTE_PATHS or path in {"/home/kali", "/home/kali/server"}:
        return True
    if path.startswith("/home/") and not path.startswith("/home/kali/"):
        return True
    return any(
        path.startswith(root + "/")
        for root in DANGEROUS_REMOTE_PATHS
        if root not in {"/home"}
    )


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


def _validate_ssh_config():
    if not KALI_HOST:
        raise ValueError("KALI_HOST is required")
    if not KALI_USER:
        raise ValueError("KALI_USER is required")
    if not 1 <= KALI_PORT <= 65535:
        raise ValueError("KALI_PORT must be between 1 and 65535")
    if KALI_KNOWN_HOSTS:
        path = os.path.abspath(
            os.path.expanduser(os.path.expandvars(KALI_KNOWN_HOSTS))
        )
        if not os.path.isfile(path):
            raise ValueError("known_hosts file not found")
    if KALI_KEY_FILENAME:
        key_path = os.path.abspath(
            os.path.expanduser(os.path.expandvars(KALI_KEY_FILENAME))
        )
        if not os.path.isfile(key_path):
            raise ValueError("SSH key file not found")
    _validate_deployment_paths()


def _validate_remote_path(value, field):
    if not isinstance(value, str) or not value.strip():
        raise ValueError(f"{field} is required")
    normalized = posixpath.normpath(value)
    if not normalized.startswith("/") or _is_dangerous_remote_path(normalized):
        raise ValueError(f"{field} must be an absolute path outside dangerous paths")
    if normalized != value:
        raise ValueError(f"{field} must be normalized")
    return normalized


def _validate_deployment_paths():
    remote_dir = _validate_remote_path(REMOTE_DIR, "KALI_REMOTE_DIR")
    remote_tar = _validate_remote_path(REMOTE_TAR, "KALI_REMOTE_TAR")
    remote_symlink = _validate_remote_path(REMOTE_SYMLINK, "KALI_REMOTE_SYMLINK")
    if remote_dir == remote_symlink:
        raise ValueError("KALI_REMOTE_DIR and KALI_REMOTE_SYMLINK must differ")
    for candidate in (remote_tar, remote_symlink):
        if candidate == remote_dir or candidate.startswith(remote_dir + "/"):
            raise ValueError("KALI_REMOTE_TAR and KALI_REMOTE_SYMLINK must be outside KALI_REMOTE_DIR")


def _connect_ssh():
    _validate_ssh_config()
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.load_system_host_keys()
    if KALI_KNOWN_HOSTS:
        ssh.load_host_keys(os.path.expanduser(os.path.expandvars(KALI_KNOWN_HOSTS)))

    connect_kwargs = {
        "port": KALI_PORT,
        "username": KALI_USER,
        "timeout": 15,
        "banner_timeout": 15,
        "auth_timeout": 15,
        "look_for_keys": True,
        "allow_agent": True,
    }
    if KALI_KEY_FILENAME:
        connect_kwargs["key_filename"] = os.path.expanduser(
            os.path.expandvars(KALI_KEY_FILENAME)
        )
    if KALI_PASS:
        connect_kwargs["password"] = KALI_PASS

    ssh.connect(KALI_HOST, **connect_kwargs)
    return ssh


def _run_remote(ssh, command, timeout=180):
    stdin, stdout, stderr = ssh.exec_command(command, timeout=timeout)
    try:
        output = stdout.read().decode("utf-8", errors="replace")
        error = stderr.read().decode("utf-8", errors="replace")
        exit_code = stdout.channel.recv_exit_status()
    finally:
        stdin.close()
    return output, error, exit_code


def _relative_path(path):
    try:
        rel = os.path.relpath(path, PROJECT_ROOT)
    except ValueError:
        return None
    return rel.replace("\\", "/").replace("//", "/")


def _is_next_app_tree(rel):
    """True when `rel` lives anywhere under a Next.js `app` directory.

    `src/app/api/router/credentials/route.ts` is a public URL path segment that
    happens to be spelled like a secrets store. The blanket component-name match
    in SECRET_DIRECTORY_NAMES pruned that directory out of every deploy archive,
    so the Hub shipped without its credentials route on both hosts at once.
    """
    segments = [segment.lower() for segment in rel.split("/") if segment]
    if "app" not in segments:
        return False
    app_index = len(segments) - 1 - segments[::-1].index("app")
    if app_index == 0:
        return False
    # `app` must be a top-level project folder (e.g. src/app, web/app) and the
    # chain above it must not itself be a genuine secrets directory.
    if app_index > 1 and segments[app_index - 1] not in {"src", "web", "client", "frontend"}:
        return False
    return not any(segment in SECRET_DIRECTORY_NAMES for segment in segments[:app_index])


def should_ignore(path):
    rel = _relative_path(path)
    if not rel or rel == "." or rel == ".." or rel.startswith("../"):
        return True

    parts = rel.split("/")
    parts_lower = [part.lower() for part in parts]
    base = parts_lower[-1]
    if rel == ARCHIVE_NAME or base == ARCHIVE_NAME:
        return True
    if any(part in IGNORED_DIRECTORIES for part in parts_lower):
        return True
    if _is_next_app_tree(rel):
        # Application source under src/app is never a secrets store, even when a
        # URL segment is spelled like one (`router/credentials`).
        return False
    if any(part in SECRET_DIRECTORY_NAMES for part in parts_lower):
        return True
    if base in IGNORED_FILES or base.startswith(".env"):
        return True
    if any(base.endswith(suffix) for suffix in IGNORED_SUFFIXES):
        return True
    return base.startswith(("npm-debug.log", "yarn-debug.log", "yarn-error.log"))


def create_archive(output_tar):
    output_path = os.path.abspath(output_tar)
    print(f"[1/4] Compressing Sentinel Master from {PROJECT_ROOT}...")
    start_time = time.time()
    file_count = 0
    with tarfile.open(output_path, "w:gz") as tar:
        for root, dirs, files in os.walk(PROJECT_ROOT):
            dirs[:] = [
                directory
                for directory in dirs
                if not should_ignore(os.path.join(root, directory))
            ]
            for filename in files:
                full_path = os.path.join(root, filename)
                if should_ignore(full_path):
                    continue
                rel_path = _relative_path(full_path)
                if not rel_path:
                    continue
                tar.add(full_path, arcname=rel_path, recursive=False)
                file_count += 1

    size_mb = os.path.getsize(output_path) / (1024 * 1024)
    print(
        f"   Archived {file_count} files ({size_mb:.2f} MB) "
        f"in {time.time() - start_time:.1f}s"
    )


def _remote_commands():
    remote_dir = shlex.quote(REMOTE_DIR)
    staging_dir = shlex.quote(f"{REMOTE_DIR}.staging")
    previous_dir = shlex.quote(f"{REMOTE_DIR}.previous")
    secret_manifest = shlex.quote(f"{REMOTE_DIR}/.sentinel-secrets-paths")
    secret_backup = shlex.quote(f"{REMOTE_DIR}/.sentinel-secrets.tar.gz")
    remote_tar = shlex.quote(REMOTE_TAR)
    symlink = shlex.quote(REMOTE_SYMLINK)
    return f"""
set -eu
REMOTE_DIR={remote_dir}
STAGING_DIR={staging_dir}
PREVIOUS_DIR={previous_dir}
SECRET_MANIFEST={secret_manifest}
SECRET_BACKUP={secret_backup}
REMOTE_TAR={remote_tar}
REMOTE_SYMLINK={symlink}

rm -rf -- "$STAGING_DIR" "$PREVIOUS_DIR"
rm -f -- "$SECRET_MANIFEST" "$SECRET_BACKUP"
mkdir -p -- "$STAGING_DIR"
tar -xzf "$REMOTE_TAR" -C "$STAGING_DIR"

if [ -d "$REMOTE_DIR" ]; then
    (
        cd "$REMOTE_DIR"
        find . \\( -type f -o -type l \\) \\( \\
            -iname '.env' -o -iname '.env.*' -o -iname '*.env' -o -iname '*.env.*' -o \\
            -iname '.dockerconfigjson' -o -iname '.my.cnf' -o -iname '.mylogin.cnf' -o \\
            -iname '.netrc' -o -iname '.npmrc' -o -iname '.pgpass' -o \\
            -iname '.pnpmrc' -o -iname '.yarnrc' -o -iname '.yarnrc.yml' -o \\
            -iname '*.auth' -o -iname '*.credential' -o -iname '*.credentials' -o \\
            -iname '*.kubeconfig' -o -iname '*.token' -o \\
            -iname '*.pem' -o -iname '*.key' -o -iname '*.crt' -o \\
            -iname '*.cer' -o -iname '*.cert' -o -iname '*.p12' -o \\
            -iname '*.p8' -o -iname '*.pfx' -o -iname '*.jks' -o \\
            -iname '*.keystore' -o -iname '*.secret' -o -iname '*.secrets' -o \\
            -iname '*.password' -o -iname '*.passwd' -o -iname '*.private' -o \\
            -ipath './secrets/*' -o -ipath './secret/*' -o \\
            -ipath './credentials/*' -o -ipath './credential/*' -o \\
            -ipath './keys/*' -o -ipath './certs/*' -o -ipath './certificates/*' -o \\
            -ipath './.ssh/*' \\
        \\) -print0 > "$SECRET_MANIFEST"
        if [ -s "$SECRET_MANIFEST" ]; then
            tar --null -T "$SECRET_MANIFEST" -czf "$SECRET_BACKUP"
        fi
    )
fi

if [ ! -f "$STAGING_DIR/package.json" ] || [ ! -f "$STAGING_DIR/server.cjs" ]; then
    echo "Deployment archive is missing package.json or server.cjs" >&2
    exit 1
fi

if [ -f "$SECRET_BACKUP" ]; then
    tar -xzf "$SECRET_BACKUP" -C "$STAGING_DIR"
fi

if [ -e "$REMOTE_DIR" ] || [ -L "$REMOTE_DIR" ]; then
    mv -- "$REMOTE_DIR" "$PREVIOUS_DIR"
fi
mv -- "$STAGING_DIR" "$REMOTE_DIR"
rm -f -- "$SECRET_MANIFEST" "$SECRET_BACKUP"

mkdir -p /home/kali
ln -sfn -- "$REMOTE_DIR" "$REMOTE_SYMLINK"

cd "$REMOTE_DIR"
if [ -f package-lock.json ]; then
    npm ci --silent
else
    npm install --silent
fi

node node_modules/next/dist/bin/next build --webpack

pm2 restart sentinel-master --update-env || pm2 start "$REMOTE_DIR/server.cjs" --name "sentinel-master" --cwd "$REMOTE_DIR" --update-env
pm2 save

pm2_is_online() {{
    pm2 jlist 2>/dev/null | node -e 'let data=""; process.stdin.on("data", chunk => {{ data += chunk; }}); process.stdin.on("end", () => {{ try {{ const processes = JSON.parse(data); const app = processes.find(process => process.name === "sentinel-master"); process.exit(app && app.pm2_env && app.pm2_env.status === "online" ? 0 : 1); }} catch (_) {{ process.exit(1); }} }});'
}}

ready=0
for attempt in $(seq 1 15); do
    if pm2_is_online && curl --fail --silent --show-error --max-time 5 http://127.0.0.1:3000/ >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 2
done

if [ "$ready" -ne 1 ]; then
    echo "Remote health check failed after 15 attempts" >&2
    exit 1
fi

rm -rf -- "$PREVIOUS_DIR"
rm -f -- "$REMOTE_TAR"
echo "Sentinel Master deployed and healthy"
"""


def deploy_to_kali(local_tar):
    print(f"[2/4] Connecting via SSH to {KALI_USER}@{KALI_HOST}:{KALI_PORT}...")
    ssh = _connect_ssh()
    try:
        sftp = None
        try:
            print(f"[3/4] Uploading archive to {REMOTE_TAR} via SFTP...")
            sftp = ssh.open_sftp()
            last_reported = 0

            def sftp_progress(transferred, total):
                nonlocal last_reported
                if total <= 0:
                    return
                pct = int((transferred / total) * 100)
                if pct >= last_reported + 25 or pct == 100:
                    print(
                        f"   Transferring: {pct}% "
                        f"({transferred / (1024 * 1024):.1f} MB / "
                        f"{total / (1024 * 1024):.1f} MB)"
                    )
                    last_reported = pct

            sftp.put(os.path.abspath(local_tar), REMOTE_TAR, callback=sftp_progress)
        finally:
            if sftp is not None:
                sftp.close()

        print("[4/4] Extracting, building, and checking the remote release...")
        remote_commands = "bash -lc " + shlex.quote(_remote_commands())
        try:
            output, error, exit_code = _run_remote(ssh, remote_commands)
        finally:
            try:
                _run_remote(ssh, f"rm -f -- {shlex.quote(REMOTE_TAR)}", timeout=15)
            except Exception:
                pass

        if output:
            for line in output.splitlines():
                print(_redact_sensitive(line))
        if error:
            for line in error.splitlines():
                print(_redact_sensitive(line), file=sys.stderr)
        if exit_code != 0:
            detail = _safe_error(error) or f"exit code {exit_code}"
            raise RuntimeError(f"remote deployment failed: {detail}")

        print("\n========================================================")
        print("Sentinel Master successfully deployed and running on Kali")
        print(f"Portal: http://{KALI_HOST}:3000")
        print(f"Remote directory: {REMOTE_DIR}")
        print("========================================================\n")
    finally:
        ssh.close()


def main():
    archive_path = os.path.join(PROJECT_ROOT, ARCHIVE_NAME)
    try:
        create_archive(archive_path)
        deploy_to_kali(archive_path)
    except Exception as exc:
        print(f"[Error] {_safe_error(exc)}", file=sys.stderr)
        sys.exit(1)
    finally:
        if os.path.exists(archive_path):
            try:
                os.remove(archive_path)
            except OSError:
                pass


if __name__ == "__main__":
    main()
