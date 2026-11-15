"""
sentinel_ctf.tools.binary.objdump_tool
=========================================
objdump wrapper: disassemble, list sections, dump hex, cross-reference calls.
"""
from __future__ import annotations

import re
from sentinel_ctf.executor.base import ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class ObjdumpTool(BaseTool):
    name = "objdump"
    description = "objdump disassembler: full disasm, section dump, call graph"

    def build_command(self, filepath: str, mode: str = "disasm",
                      section: str = "", symbol: str = "",
                      arch: str = "", extra_flags: str = "", **kwargs) -> str:
        arch_flag = f"-m {arch}" if arch else ""
        if mode == "disasm":
            sec_flag = f"-j {section}" if section else "-d"
            return f"objdump {arch_flag} {sec_flag} -M intel {extra_flags} {filepath} 2>/dev/null"
        elif mode == "all_disasm":
            return f"objdump {arch_flag} -D -M intel {extra_flags} {filepath} 2>/dev/null"
        elif mode == "sections":
            return f"objdump -h {filepath} 2>/dev/null"
        elif mode == "strings":
            return f"objdump -s -j .rodata {filepath} 2>/dev/null"
        elif mode == "reloc":
            return f"objdump -R {filepath} 2>/dev/null"
        elif mode == "symbols":
            return f"objdump -t {filepath} 2>/dev/null"
        else:
            return f"objdump -d -M intel {filepath} 2>/dev/null | head -200"

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        findings: dict = {
            "functions": [],
            "calls": [],
            "sections": [],
            "interesting_addresses": [],
            "strings": [],
            "flags_found": [],
        }

        for line in out.splitlines():
            # Function labels: 00000000 <name>:
            m = re.match(r"([0-9a-f]+)\s+<([^>]+)>:", line)
            if m:
                findings["functions"].append({"addr": m.group(1), "name": m.group(2)})

            # call instructions
            m2 = re.search(r"call\s+([0-9a-f]+)\s+<([^>]+)>", line)
            if m2:
                findings["calls"].append({"addr": m2.group(1), "target": m2.group(2)})

            # sections from -h
            m3 = re.match(r"\s+\d+\s+(\.\S+)\s+([0-9a-f]+)\s+([0-9a-f]+)", line)
            if m3:
                findings["sections"].append({
                    "name": m3.group(1),
                    "size": m3.group(2),
                    "vma": m3.group(3),
                })

            # Interesting calls (system, exec, gets etc)
            dangerous = ["system", "execve", "gets", "strcpy", "sprintf", "printf", "win", "flag"]
            for d in dangerous:
                if d in line.lower():
                    findings["interesting_addresses"].append(line.strip())
                    break

        findings["flags_found"] = re.findall(r"flag\{[^}]+\}", out, re.I)
        return findings

    async def disassemble(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
