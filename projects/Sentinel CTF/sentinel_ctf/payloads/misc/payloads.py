"""
sentinel_ctf.payloads.misc.payloads
=====================================
Misc category payload helpers: multi-encoder, esoteric langs, wordlists.
"""
from __future__ import annotations

import codecs
import re
import string
import urllib.parse


# ---------------------------------------------------------------------------
# Esoteric language lookup
# ---------------------------------------------------------------------------

ESOTERIC_LANGS: dict[str, dict] = {
    "brainfuck": {
        "detect": lambda s: all(c in "+-<>[].,\n\r " for c in s) and ("++" in s or "--" in s),
        "keywords": ["+++", "---", ">>", "<<", "[", "]"],
        "interpreter_url": "https://brainfuck.org/",
        "kali_cmd": "python3 -c \"\nimport sys\ndef bf(code):\n    tape=[0]*30000; tp=0; cp=0; out=''\n    brackets={}\n    stack=[]\n    for i,c in enumerate(code):\n        if c=='[': stack.append(i)\n        elif c==']': j=stack.pop(); brackets[i]=j; brackets[j]=i\n    while cp<len(code):\n        c=code[cp]\n        if c=='+': tape[tp]=(tape[tp]+1)%256\n        elif c=='-': tape[tp]=(tape[tp]-1)%256\n        elif c=='>': tp+=1\n        elif c=='<': tp-=1\n        elif c=='.': out+=chr(tape[tp])\n        elif c==',' : tape[tp]=ord(sys.stdin.read(1))\n        elif c=='[' and tape[tp]==0: cp=brackets[cp]\n        elif c==']' and tape[tp]!=0: cp=brackets[cp]\n        cp+=1\n    return out\nprint(bf(open('FILENAME').read()))\n\"",
    },
    "ook": {
        "detect": lambda s: "Ook" in s and ("Ook." in s or "Ook?" in s or "Ook!" in s),
        "keywords": ["Ook.", "Ook?", "Ook!"],
        "interpreter_url": "https://www.dcode.fr/ook-language",
    },
    "whitespace": {
        "detect": lambda s: all(c in " \t\n\r" for c in s) and "\t" in s,
        "keywords": [" ", "\t", "\n"],
        "interpreter_url": "https://vii5ard.github.io/whitespace/",
    },
    "jsfuck": {
        "detect": lambda s: all(c in "()[]!+" for c in s.replace("\n", "").replace(" ", "")) and "[]" in s,
        "keywords": ["[]", "![]", "()", "!+"],
        "interpreter_url": "Browser console — paste directly",
    },
    "cow": {
        "detect": lambda s: all(c in "moOMO \n" for c in s) and "MOo" in s,
        "keywords": ["MOo", "MoO", "moO", "mOo"],
        "interpreter_url": "https://www.dcode.fr/cow-programming-language",
    },
    "malbolge": {
        "detect": lambda s: len(s) > 10 and sum(1 for c in s if ord(c) in range(33, 127)) / max(len(s), 1) > 0.8,
        "keywords": [],
        "interpreter_url": "https://malbolge.doleczek.pl/",
    },
}


def detect_esoteric(code: str) -> list[str]:
    """Detect possible esoteric languages from code content."""
    detected = []
    for lang, info in ESOTERIC_LANGS.items():
        try:
            if info["detect"](code):
                detected.append(lang)
        except Exception:
            pass
    return detected


# ---------------------------------------------------------------------------
# Multi-layer decoder chain
# ---------------------------------------------------------------------------

DECODE_FUNCTIONS: dict[str, callable] = {
    "base64": lambda s: __import__("base64").b64decode(s + "==").decode("utf-8", errors="replace"),
    "base64_urlsafe": lambda s: __import__("base64").urlsafe_b64decode(s + "==").decode("utf-8", errors="replace"),
    "base32": lambda s: __import__("base64").b32decode(s.upper() + "=" * ((8 - len(s) % 8) % 8)).decode("utf-8", errors="replace"),
    "hex": lambda s: bytes.fromhex(s.replace(" ", "").replace("\n", "")).decode("utf-8", errors="replace"),
    "url": lambda s: urllib.parse.unquote_plus(s),
    "html": lambda s: __import__("html").unescape(s),
    "rot13": lambda s: codecs.decode(s, "rot_13"),
    "binary": lambda s: "".join(chr(int(b, 2)) for b in s.split() if len(b) == 8 and all(c in "01" for c in b)),
    "morse": lambda s: _decode_morse(s),
    "reverse": lambda s: s[::-1],
    "atbash": lambda s: "".join(chr(ord("z") - (ord(c) - ord("a"))) if c.islower() else chr(ord("Z") - (ord(c) - ord("A"))) if c.isupper() else c for c in s),
    "caesar_brute": lambda s: [f"ROT{i}: " + "".join(chr((ord(c) - 65 + i) % 26 + 65) if c.isupper() else chr((ord(c) - 97 + i) % 26 + 97) if c.islower() else c for c in s) for i in range(1, 26)],
}

_MORSE_TABLE = {
    ".-": "A", "-...": "B", "-.-.": "C", "-..": "D", ".": "E", "..-.": "F",
    "--.": "G", "....": "H", "..": "I", ".---": "J", "-.-": "K", ".-..": "L",
    "--": "M", "-.": "N", "---": "O", ".--.": "P", "--.-": "Q", ".-.": "R",
    "...": "S", "-": "T", "..-": "U", "...-": "V", ".--": "W", "-..-": "X",
    "-.--": "Y", "--..": "Z", "-----": "0", ".----": "1", "..---": "2",
    "...--": "3", "....-": "4", ".....": "5", "-....": "6", "--...": "7",
    "---..": "8", "----.": "9",
}


def _decode_morse(s: str) -> str:
    """Decode morse code (dot/dash or ./- format)."""
    s = s.strip().replace("·", ".").replace("–", "-").replace("—", "-")
    words = s.split("   ")
    result = []
    for word in words:
        chars = word.split()
        result.append("".join(_MORSE_TABLE.get(c, "?") for c in chars))
    return " ".join(result)


def try_decode_chain(data: str, chain: list[str]) -> str:
    """Apply a chain of decoders in sequence. Returns decoded result or raises."""
    result = data
    for step in chain:
        fn = DECODE_FUNCTIONS.get(step)
        if not fn:
            raise ValueError(f"Unknown decoder: {step}")
        result = fn(result)
        if isinstance(result, list):
            result = "\n".join(str(r) for r in result)
    return result


def auto_decode(data: str, flag_regex: str = r"flag\{[^}]+\}") -> dict[str, str]:
    """
    Try all single-step decoders. Return dict of {decoder: decoded_value}
    for any that work without throwing AND produce readable output.
    Also highlights any that contain flag-pattern matches.
    """
    results: dict[str, str] = {}
    import re as _re

    for name, fn in DECODE_FUNCTIONS.items():
        if name == "caesar_brute":
            continue
        try:
            decoded = fn(data)
            if isinstance(decoded, str) and len(decoded) > 0:
                printable_ratio = sum(1 for c in decoded if c in string.printable) / len(decoded)
                if printable_ratio > 0.7:
                    results[name] = decoded
        except Exception:
            pass

    # Caesar brute force
    try:
        for line in DECODE_FUNCTIONS["caesar_brute"](data):
            key, val = line.split(": ", 1)
            printable_ratio = sum(1 for c in val if c in string.printable) / max(len(val), 1)
            if printable_ratio > 0.85:
                results[key.lower().replace(" ", "_")] = val
    except Exception:
        pass

    return results


# ---------------------------------------------------------------------------
# Common CTF wordlists (built-in fallback when SecLists not on Kali)
# ---------------------------------------------------------------------------

COMMON_PASSWORDS: list[str] = [
    "password", "123456", "password123", "admin", "letmein", "qwerty",
    "monkey", "1234567890", "dragon", "master", "sunshine", "princess",
    "welcome", "shadow", "superman", "michael", "football", "baseball",
    "abc123", "pass", "secret", "root", "toor", "kali", "test",
    "hello", "1q2w3e4r", "iloveyou", "trustno1", "login", "admin123",
    "passw0rd", "p@ssword", "P@ssw0rd", "Password1", "changeme",
]

COMMON_USERNAMES: list[str] = [
    "admin", "root", "administrator", "user", "guest", "test", "demo",
    "webmaster", "info", "support", "security", "operator", "manager",
    "sysadmin", "sa", "oracle", "postgres", "mysql", "ftp", "www",
]

COMMON_DIRECTORIES: list[str] = [
    "admin", "administrator", "login", "wp-admin", "dashboard", "panel",
    "config", "backup", "backups", "db", "database", "upload", "uploads",
    "files", "images", "img", "static", "assets", "js", "css", "api",
    "v1", "v2", "test", "dev", "staging", "old", "bak", "tmp", "temp",
    "hidden", "secret", "private", "internal", "management", "cpanel",
    "phpmyadmin", "pma", "mysql", "sql", "shell", "cmd", "exec",
    ".git", ".svn", ".env", ".htaccess", "robots.txt", "sitemap.xml",
    "readme.txt", "README.md", "CHANGELOG", "phpinfo.php",
]
