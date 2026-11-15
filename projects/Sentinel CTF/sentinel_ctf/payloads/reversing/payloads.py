"""
sentinel_ctf.payloads.reversing.payloads  (EXPANDED)
======================================================
Reversing CTF payloads: packer signatures, anti-debug patterns,
GDB/pwndbg cheatsheets, obfuscation detectors, decompiler hints,
license check patterns, interesting string patterns.
"""
from __future__ import annotations

# ---------------------------------------------------------------------------
# Packer / protector signatures
# ---------------------------------------------------------------------------
PACKER_SIGNATURES: dict[str, list[str]] = {
    "UPX":          ["UPX0", "UPX1", "UPX!", "PMAINDLL", "$Info: This file is packed with the UPX"],
    "MPRESS":       ["MPRESS1", "MPRESS2"],
    "ASPack":       [".aspack", "ASPack"],
    "PECompact":    ["PECompact2", "BobSoft Mini Delphi"],
    "Themida":      ["Themida", "WinLicense", "SecureEngine"],
    "VMProtect":    [".vmp0", ".vmp1", "VMProtect"],
    "Enigma":       ["Enigma Protector", ".enigma1", ".enigma2"],
    "Obsidium":     ["Obsidium"],
    "ExeCryptor":   ["ExeCryptor"],
    "Armadillo":    ["Armadillo", "Silicon Realms"],
    "PyInstaller":  ["PYARMOR", "_MEIPASS", "PKG_ARCHIVE", "pyi-runtime-tmpdir", "MEI_BUNDLE"],
    "PyC":          ["b'\x1f\x8b'", "marshal.loads", ".pyc", "co_code"],
    "Electron":     ["ASAR", "electron", "node_modules"],
    "Go":           ["go.buildid", "runtime.goexit", "syscall.Syscall"],
    "Rust":         ["rust_begin_unwind", "core::panicking", "__rust_"],
    ".NET":         ["mscoree.dll", "_CorExeMain", "BSJB"],
    "Java":         ["cafebabe", "java/lang/Object", "java/io/"],
    "Delphi":       ["TApplication", "Forms.TForm", "Borland"],
    "AutoIt":       ["AU3!EA06", "This is a compiled AutoIt"],
    "NSIS":         ["NullsoftInst", "Nullsoft.NSIS"],
}

# ---------------------------------------------------------------------------
# Anti-debug patterns
# ---------------------------------------------------------------------------
ANTI_DEBUG_PATTERNS: dict[str, list[str]] = {
    "Windows API": [
        "IsDebuggerPresent",
        "CheckRemoteDebuggerPresent",
        "NtQueryInformationProcess",
        "OutputDebugString",
        "GetTickCount",
        "QueryPerformanceCounter",
        "CloseHandle(InvalidHandle)",
        "FindWindow(OllyDbg)",
        "CreateMutex",
    ],
    "Linux": [
        "ptrace(PTRACE_TRACEME,0,0,0)",
        "/proc/self/status → TracerPid",
        "getppid() != expected_parent",
        "SIGINT/SIGTRAP handler differences",
        "/proc/self/exe != expected_path",
        "LD_PRELOAD environment variable check",
    ],
    "Timing": [
        "rdtsc delta measurement",
        "clock_gettime comparison",
        "gettimeofday comparison",
        "GetSystemTime comparison",
        "Sleep then check elapsed time",
    ],
    "Code integrity": [
        "CRC/hash of own code section",
        "Memory checksum of .text segment",
        "INT3 (0xCC) scan in code",
        "Hardware breakpoint check via DR registers",
        "Exception handler count verification",
    ],
    "VM detection": [
        "cpuid hypervisor bit",
        "VMware registry keys",
        "VirtualBox registry/files",
        "QEMU CPUID signature",
        "Hyper-V CPUID leaf",
        "SIDT / SGDT trick (red pill)",
        "MAC address OUI check (VMware: 00:0C:29)",
    ],
}

# ---------------------------------------------------------------------------
# GDB / pwndbg cheatsheet commands
# ---------------------------------------------------------------------------
GDB_COMMANDS: dict[str, str] = {
    # Basic
    "Run with args":        "r arg1 arg2",
    "Run with stdin":       "r < input.txt",
    "Set breakpoint":       "b *0xaddress  |  b main  |  b function",
    "Continue":             "c",
    "Next instruction":     "ni",
    "Step into":            "si",
    "Finish function":      "finish",
    "Print register":       "p $rax  |  info registers",
    "All registers":        "info registers all",
    "Examine memory":       "x/20gx $rsp  |  x/s $rdi  |  x/10i $rip",
    "Backtrace":            "bt",
    "Disassemble":          "disas  |  disas function  |  disas 0xaddr,+0x50",
    # pwndbg extras
    "Heap chunks":          "heap",
    "Heap bins":            "bins",
    "GOT table":            "got",
    "PLT table":            "plt",
    "Checksec":             "checksec",
    "ROP gadgets":          "rop --grep 'pop rdi'",
    "Find pattern":         "search -t bytes -l 100 AAAA",
    "Cyclic pattern":       "cyclic 200  |  cyclic -l 0x41414141",
    "Find offset":          "cyclic_find 0x6161616162616161",
    "Stack layout":         "stack 20",
    "Memory map":           "vmmap",
    "Function info":        "info functions  |  info functions main",
    "Symbol address":       "p system  |  p &puts",
    # Dynamic analysis
    "Catch syscall":        "catch syscall read  |  catch syscall all",
    "Watchpoint":           "watch *0xaddress",
    "Condition break":      "b *0xaddr if $rax==0",
    "Set memory":           "set *0xaddr = 0x90",
    "Set register":         "set $rax = 0",
    "Attach process":       "attach PID",
    "Load symbols":         "symbol-file binary",
    "Skip function":        "return 0  (when stopped at function entry)",
    # Scripting
    "Python in GDB":        "python import gdb; ...",
    "Source script":        "source script.gdb",
    "Define command":       "define hook-stop\n  info registers\nend",
    "Log output":           "set logging on  |  set logging file gdb.log",
}

# ---------------------------------------------------------------------------
# pwndbg-specific commands
# ---------------------------------------------------------------------------
PWNDBG_COMMANDS: dict[str, str] = {
    "Heap overview":        "heap",
    "Fastbins":             "fastbins",
    "Unsorted/small/large": "bins",
    "Visualize heap":       "vis_heap_chunks",
    "Malloc arena":         "arena",
    "Track allocations":    "malloc_chunk 0xaddr",
    "Find libc base":       "p/x &__malloc_hook - (offset)",
    "FSOP structures":      "p *(FILE*)0xaddr",
    "Proc info":            "procinfo",
    "Telescope stack":      "telescope $rsp 30",
    "Find string":          "search -s 'flag'",
    "Xor find":             "search -t qword 0xdeadbeef",
    "Context":              "context  (auto-runs on each stop)",
    "Rewind execution":     "record  (requires rr or reverse-debugging)",
}

# ---------------------------------------------------------------------------
# Interesting string patterns (for strings / grep)
# ---------------------------------------------------------------------------
INTERESTING_STRING_PATTERNS: list[str] = [
    r"flag\{",
    r"CTF\{",
    r"HTB\{",
    r"picoCTF\{",
    r"password",
    r"passwd",
    r"secret",
    r"key\s*=",
    r"token",
    r"auth",
    r"admin",
    r"root",
    r"http[s]?://",
    r"[A-Za-z0-9+/]{40,}={0,2}",   # base64
    r"[0-9a-f]{32,}",               # hex strings
    r"/etc/passwd",
    r"/bin/sh",
    r"/bin/bash",
    r"strcmp",
    r"strncmp",
    r"memcmp",
    r"system\(",
    r"exec[vl]",
    r"popen",
    r"gets\(",
    r"scanf",
    r"sprintf",
    r"congrat",
    r"correct",
    r"wrong",
    r"invalid",
    r"success",
    r"win\(",
    r"\.so\.",
    r"LICENSE",
    r"TRIAL",
    r"REGISTER",
    r"serial",
    r"crack",
]

# ---------------------------------------------------------------------------
# Known libc version gadget offsets (common CTF environments)
# ---------------------------------------------------------------------------
LIBC_OFFSETS: dict[str, dict[str, int]] = {
    "libc-2.27-ubuntu18": {
        "system":       0x04f440,
        "puts":         0x080aa0,
        "printf":       0x064e80,
        "__libc_start_main": 0x021dd0,
        "__malloc_hook":0x3ebc30,
        "__free_hook":  0x3ed8e8,
        "one_gadget_1": 0x4f2c5,
        "one_gadget_2": 0x4f322,
        "one_gadget_3": 0x10a38c,
        "binsh":        0x1b3e9a,
    },
    "libc-2.31-ubuntu20": {
        "system":       0x055410,
        "puts":         0x084420,
        "__libc_start_main": 0x026d90,
        "__malloc_hook":0x1ecb70,
        "__free_hook":  0x1eee48,
        "one_gadget_1": 0xe6c7e,
        "one_gadget_2": 0xe6c81,
        "one_gadget_3": 0xe6c84,
        "binsh":        0x18ce57,
    },
    "libc-2.35-ubuntu22": {
        "system":       0x050d70,
        "puts":         0x080e50,
        "__libc_start_main": 0x029d90,
        "one_gadget_1": 0xebd43,
        "one_gadget_2": 0xebd3f,
        "binsh":        0x1d8698,
    },
}

# ---------------------------------------------------------------------------
# File format magic bytes (for reversing/forensics overlap)
# ---------------------------------------------------------------------------
KNOWN_FILE_HEADERS: dict[str, bytes] = {
    "ELF":          b"\x7fELF",
    "PE/MZ":        b"MZ",
    "Java class":   b"\xca\xfe\xba\xbe",
    "Mach-O 32":    b"\xfe\xed\xfa\xce",
    "Mach-O 64":    b"\xfe\xed\xfa\xcf",
    "Python pyc":   b"\x55\x0d\x0d\x0a",  # 3.11+
    ".NET":         b"MZ",                  # same as PE
    "WASM":         b"\x00asm",
    "Lua 5.4":      b"\x1bLua",
    "Ruby marshal": b"\x04\x08",
    "LLVM bitcode": b"BC\xc0\xde",
    "LLVM IR":      b"; ModuleID",
    "APK/ZIP":      b"PK\x03\x04",
    "DEX":          b"dex\n035\x00",
    "OAT":          b"oat\n",
    "V8 snapshot":  b"\x56\x38",
    "Flash SWF":    b"CWS",
    "Flash SWF2":   b"FWS",
}


class ReversingPayloads:
    """Reversing CTF helpers."""

    @staticmethod
    def detect_packer(filepath: str) -> list[str]:
        """Scan file for known packer signatures. Returns list of detected packers."""
        try:
            with open(filepath, "rb") as f:
                data = f.read()
            text = data.decode("latin-1", errors="replace")
            detected = []
            for packer, sigs in PACKER_SIGNATURES.items():
                for sig in sigs:
                    if sig in text or sig.encode("latin-1", errors="replace") in data:
                        detected.append(packer)
                        break
            return detected
        except Exception as e:
            return [f"Error: {e}"]

    @staticmethod
    def detect_anti_debug(strings_output: str) -> list[str]:
        """Scan strings output for anti-debugging signatures."""
        findings = []
        for category, patterns in ANTI_DEBUG_PATTERNS.items():
            for pat in patterns:
                if pat.lower() in strings_output.lower():
                    findings.append(f"{category}: {pat}")
        return findings

    @staticmethod
    def get_libc_offsets(libc_version: str) -> dict[str, int]:
        """Return known offsets for a libc version string."""
        for key, offsets in LIBC_OFFSETS.items():
            if libc_version in key or key in libc_version:
                return offsets
        return {}

    @staticmethod
    def calculate_base(leaked_addr: int, known_offset: int) -> int:
        """Calculate ASLR base: base = leaked_addr - known_offset."""
        return leaked_addr - known_offset

    @staticmethod
    def identify_file_type(data: bytes) -> str:
        """Identify file type from magic bytes."""
        for name, magic in KNOWN_FILE_HEADERS.items():
            if data.startswith(magic):
                return name
        return "Unknown"

    @staticmethod
    def score_ascii_probability(data: bytes) -> float:
        """Return fraction of bytes that are printable ASCII (useful for XOR brute)."""
        if not data:
            return 0.0
        printable = sum(1 for b in data if 32 <= b <= 126)
        return printable / len(data)
