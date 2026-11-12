import subprocess
import sys
import json
sys.stdout.reconfigure(encoding='utf-8')

def run_ssh(cmd):
    res = subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", "kali@192.168.68.132", cmd],
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    return res.stdout, res.stderr

def run_remote_py(code):
    res = subprocess.run(
        ["ssh", "-o", "StrictHostKeyChecking=no", "kali@192.168.68.132", "python3 -"],
        input=code,
        capture_output=True,
        text=True,
        encoding="utf-8"
    )
    return res.stdout, res.stderr

if __name__ == "__main__":
    if len(sys.argv) > 1:
        cmd = " ".join(sys.argv[1:])
        out, err = run_ssh(cmd)
        print("OUT:", out)
        if err:
            print("ERR:", err)
