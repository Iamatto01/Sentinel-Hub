"""
sentinel_ctf.tools.forensics.foremost_tool
============================================
File carving from binary blobs using foremost.
"""
from __future__ import annotations

import re
from sentinel_ctf.executor.base import BaseExecutor, ExecResult
from sentinel_ctf.tools.base import BaseTool
from sentinel_ctf.core.models import JobResult


class ForemostTool(BaseTool):
    name = "foremost"
    description = "File carving from binary blobs"

    def build_command(self, filepath: str, output_dir: str = "/tmp/foremost_out",
                      file_types: str = "", **kwargs) -> str:
        type_arg = f"-t {file_types}" if file_types else ""
        return f"foremost {type_arg} -i {filepath} -o {output_dir} -q 2>&1 && ls -la {output_dir}/ 2>/dev/null"

    def parse(self, result: ExecResult) -> dict:
        out = result.stdout or ""
        success = result.return_code == 0 and ("Processing" in out or "Finish" in out or "-rw" in out)

        carved = []
        for line in out.splitlines():
            # ls -la output
            m = re.match(r"-rw.+\s+(\S+)$", line)
            if m and m.group(1) not in (".", ".."):
                carved.append(m.group(1))
            # foremost output
            if "Carved" in line or "Extracting" in line:
                carved.append(line.strip())

        flags_found = re.findall(r"flag\{[^}]+\}", out, re.I)
        return {
            "success": success,
            "carved_files": carved,
            "total_carved": len(carved),
            "flags_found": flags_found,
        }

    async def carve(self, filepath: str, **kwargs) -> JobResult:
        return await self.run(filepath=filepath, **kwargs)
