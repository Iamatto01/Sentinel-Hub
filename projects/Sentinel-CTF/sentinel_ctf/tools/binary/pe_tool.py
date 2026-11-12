"""
sentinel_ctf.tools.binary.pe_tool
====================================
PE (Windows EXE/DLL) binary inspector: headers, sections, imports, exports,
resources, strings, version info. Uses pefile if available, falls back to objdump.
"""
from __future__ import annotations

import re
import struct
from pathlib import Path

from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult

_MZ_MAGIC = b"MZ"


class PeTool(BaseTool):
    name = "pe_tool"
    description = "PE binary inspector: sections, imports, exports, resources, strings"

    def build_command(self, filepath: str, mode: str = "all", **kwargs) -> str:
        return (
            f"python3 -c \""
            f"try:\n"
            f"  import pefile; pe=pefile.PE('{filepath}');\n"
            f"  print('TYPE:PE')\n"
            f"  print(f'MACHINE:{{hex(pe.FILE_HEADER.Machine)}}')\n"
            f"  print(f'SECTIONS:{{\",\".join(s.Name.decode().rstrip(chr(0)) for s in pe.sections)}}')\n"
            f"  if hasattr(pe,'DIRECTORY_ENTRY_IMPORT'):\n"
            f"    for e in pe.DIRECTORY_ENTRY_IMPORT:\n"
            f"      for i in e.imports:\n"
            f"        if i.name: print(f'IMPORT:{{e.dll.decode()}}!{{i.name.decode()}}')\n"
            f"  if hasattr(pe,'DIRECTORY_ENTRY_EXPORT'):\n"
            f"    for e in pe.DIRECTORY_ENTRY_EXPORT.symbols:\n"
            f"      if e.name: print(f'EXPORT:{{e.name.decode()}}')\n"
            f"except:\n"
            f"  import subprocess; subprocess.run(['strings','-n','8','{filepath}'],check=False)\n"
            f"\" 2>/dev/null"
        )

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        findings: dict = {
            "type": "",
            "machine": "",
            "sections": [],
            "imports": [],
            "exports": [],
            "strings_sample": [],
            "flags_found": [],
        }

        for line in out.splitlines():
            if line.startswith("TYPE:"):
                findings["type"] = line[5:]
            elif line.startswith("MACHINE:"):
                mach = line[8:]
                machines = {"0x14c": "x86", "0x8664": "x86-64", "0x1c0": "ARM", "0xaa64": "AArch64"}
                findings["machine"] = machines.get(mach, mach)
            elif line.startswith("SECTIONS:"):
                findings["sections"] = line[9:].split(",")
            elif line.startswith("IMPORT:"):
                findings["imports"].append(line[7:])
            elif line.startswith("EXPORT:"):
                findings["exports"].append(line[7:])
            else:
                if len(line) > 4:
                    findings["strings_sample"].append(line)

        findings["strings_sample"] = findings["strings_sample"][:30]
        findings["flags_found"] = re.findall(r"flag\{[^}]+\}", out, re.I)
        return findings

    @staticmethod
    def parse_pe_header(filepath: str) -> dict:
        """Pure-Python minimal PE header parser."""
        try:
            data = Path(filepath).read_bytes()
        except Exception as e:
            return {"error": str(e)}

        if not data.startswith(_MZ_MAGIC):
            return {"error": "Not a PE/MZ file"}

        e_lfanew = struct.unpack_from("<I", data, 0x3C)[0]
        if e_lfanew + 24 > len(data):
            return {"error": "Truncated PE header"}

        pe_sig = data[e_lfanew:e_lfanew+4]
        if pe_sig != b"PE\x00\x00":
            return {"error": f"Invalid PE signature: {pe_sig.hex()}"}

        machine, num_sections, timestamp = struct.unpack_from("<HHI", data, e_lfanew+4)
        characteristics = struct.unpack_from("<H", data, e_lfanew+22)[0]

        opt_magic = struct.unpack_from("<H", data, e_lfanew+24)[0]
        bits = 64 if opt_magic == 0x20B else 32

        machines = {0x14C: "x86", 0x8664: "x86-64", 0x1C0: "ARM", 0xAA64: "AArch64"}
        return {
            "bits": bits,
            "machine": machines.get(machine, f"Unknown (0x{machine:04x})"),
            "sections": num_sections,
            "timestamp": timestamp,
            "characteristics": hex(characteristics),
            "is_dll": bool(characteristics & 0x2000),
            "is_exe": bool(characteristics & 0x0002),
        }

    async def inspect(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
