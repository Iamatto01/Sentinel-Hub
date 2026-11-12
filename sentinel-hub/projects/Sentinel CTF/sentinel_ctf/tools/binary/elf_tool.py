"""
sentinel_ctf.tools.binary.elf_tool
=====================================
ELF binary inspector: sections, segments, symbols, PLT/GOT, dynamic entries,
RPATH/RUNPATH, imported/exported symbols. Pure Python via readelf + custom parser.
"""
from __future__ import annotations

import re
import struct
from pathlib import Path

from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

# ELF magic
_ELF_MAGIC = b"\x7fELF"

# e_type values
_E_TYPE = {1: "ET_REL (relocatable)", 2: "ET_EXEC (executable)",
           3: "ET_DYN (shared object / PIE)", 4: "ET_CORE"}
_E_MACHINE = {3: "x86", 62: "x86-64", 40: "ARM", 183: "AArch64",
              8: "MIPS", 21: "PPC64", 43: "SPARC"}


class ElfTool(BaseTool):
    name = "elf_tool"
    description = "ELF binary inspector: sections, symbols, PLT/GOT, imports/exports, protections"

    def build_command(self, filepath: str, mode: str = "all", **kwargs) -> str:
        parts = []
        if mode in ("all", "headers"):
            parts.append(f"echo '=== HEADERS ==='; readelf -h {filepath} 2>/dev/null")
        if mode in ("all", "sections"):
            parts.append(f"echo '=== SECTIONS ==='; readelf -S {filepath} 2>/dev/null")
        if mode in ("all", "symbols"):
            parts.append(f"echo '=== SYMBOLS ==='; readelf -s {filepath} 2>/dev/null")
        if mode in ("all", "dynamic"):
            parts.append(f"echo '=== DYNAMIC ==='; readelf -d {filepath} 2>/dev/null")
        if mode in ("all", "plt"):
            parts.append(f"echo '=== PLT/GOT ==='; objdump -d -j .plt {filepath} 2>/dev/null | head -80")
        if mode in ("all", "imports"):
            parts.append(f"echo '=== IMPORTS ==='; nm -D {filepath} 2>/dev/null | grep ' U '")
        if mode in ("all", "exports"):
            parts.append(f"echo '=== EXPORTS ==='; nm -D {filepath} 2>/dev/null | grep -v ' U '")
        return "; ".join(parts) if parts else f"readelf -h {filepath} 2>/dev/null"

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        findings: dict = {
            "headers": {},
            "sections": [],
            "symbols": [],
            "imports": [],
            "exports": [],
            "dynamic_entries": [],
            "plt_entries": [],
            "flags_found": [],
        }

        # Headers
        for key, pat in [
            ("type",    r"Type:\s+(.+)"),
            ("machine", r"Machine:\s+(.+)"),
            ("entry",   r"Entry point address:\s+(\S+)"),
            ("arch",    r"Class:\s+ELF(\d+)"),
        ]:
            m = re.search(pat, out)
            if m:
                findings["headers"][key] = m.group(1).strip()

        # Sections
        sec_pattern = re.compile(
            r"\s+\[\s*\d+\]\s+(\S+)\s+(\S+)\s+([0-9a-f]+)\s+([0-9a-f]+)\s+([0-9a-f]+)", re.M
        )
        for m in sec_pattern.finditer(out):
            findings["sections"].append({
                "name": m.group(1),
                "type": m.group(2),
                "addr": m.group(3),
                "offset": m.group(4),
                "size": m.group(5),
            })

        # Imports (nm -D undefined)
        for line in out.splitlines():
            if " U " in line:
                sym = line.split()[-1]
                findings["imports"].append(sym)

        # Dynamic entries (NEEDED libs, RPATH etc)
        for m in re.finditer(r"\((\w+)\)\s+(.+)", out):
            tag, val = m.group(1), m.group(2).strip()
            if tag in ("NEEDED", "RPATH", "RUNPATH", "SONAME"):
                findings["dynamic_entries"].append({"tag": tag, "value": val})

        # PLT
        for line in out.splitlines():
            m = re.match(r"([0-9a-f]+)\s+<(.+)@plt>:", line)
            if m:
                findings["plt_entries"].append({"addr": m.group(1), "name": m.group(2)})

        findings["flags_found"] = re.findall(r"flag\{[^}]+\}", out, re.I)
        return findings

    @staticmethod
    def parse_elf_header(filepath: str) -> dict:
        """Pure-Python ELF header parser (no external tools)."""
        try:
            data = Path(filepath).read_bytes()
        except Exception as e:
            return {"error": str(e)}

        if not data.startswith(_ELF_MAGIC):
            return {"error": "Not an ELF file"}

        ei_class = data[4]  # 1=32bit, 2=64bit
        ei_data = data[5]   # 1=LE, 2=BE
        bits = 64 if ei_class == 2 else 32
        endian = ">" if ei_data == 2 else "<"

        if bits == 64:
            fmt = f"{endian}HHIQQQIHHHHHH"
            size = struct.calcsize(fmt)
            e_type, e_machine, e_version, e_entry, e_phoff, e_shoff, \
                e_flags, e_ehsize, e_phentsize, e_phnum, e_shentsize, e_shnum, e_shstrndx = \
                struct.unpack(fmt, data[16:16+size])
        else:
            fmt = f"{endian}HHIIIIIHHHHHH"
            size = struct.calcsize(fmt)
            e_type, e_machine, e_version, e_entry, e_phoff, e_shoff, \
                e_flags, e_ehsize, e_phentsize, e_phnum, e_shentsize, e_shnum, e_shstrndx = \
                struct.unpack(fmt, data[16:16+size])

        return {
            "bits": bits,
            "endianness": "Big" if ei_data == 2 else "Little",
            "type": _E_TYPE.get(e_type, f"Unknown (0x{e_type:04x})"),
            "machine": _E_MACHINE.get(e_machine, f"Unknown (0x{e_machine:04x})"),
            "entry_point": hex(e_entry),
            "program_header_offset": hex(e_phoff),
            "section_header_offset": hex(e_shoff),
            "section_count": e_shnum,
            "program_header_count": e_phnum,
        }

    async def inspect(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
