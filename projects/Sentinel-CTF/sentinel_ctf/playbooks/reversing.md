# Reverse Engineering Challenges Playbook

> **Sentinel CTF Framework — Reversing Category**  
> Step-by-step decision tree for solving reverse engineering CTF challenges.

---

## Triage Checklist (First 5 Minutes)

- [ ] Run `file <binary>` — ELF? PE? Python bytecode? Java class? WASM?
- [ ] Run `checksec --file=<binary>` — note protections
- [ ] Run `strings <binary> | grep -i flag` — quick win attempt
- [ ] Look for interesting strings: URLs, error messages, license checks
- [ ] Check `ltrace`/`strace` output for suspicious syscalls or library calls
- [ ] Try running the binary and observe what it asks for / what it does
- [ ] Check if it's packed: `file` says "UPX" or "packed", or entropy is very high

---

## Phase 1: Static Analysis

### 1.1 Basic Recon

```bash
# File type and architecture
file target_binary
file -b target_binary

# Binary protections
checksec --file=target_binary

# Symbols / imports / exports
nm target_binary 2>/dev/null | grep -v "^$"
readelf -s target_binary
objdump -d target_binary | head -100

# Sections
readelf -S target_binary
objdump -h target_binary

# Shared libraries used
ldd target_binary
readelf -d target_binary | grep NEEDED

# Strings (with addresses)
strings -a -t x target_binary
strings -a -n 8 target_binary | grep -iE "flag|password|key|secret|correct|wrong"

# Radare2 quick info
r2 -A target_binary -q -c "iI; iE; iS" 2>/dev/null
```

### 1.2 Packer Detection

```bash
# Common tells
file target_binary          # "UPX compressed" or unusual section names
strings target_binary | grep UPX

# Detect-It-Easy (DIE) — best packer identifier
die target_binary

# Unpack UPX
upx -d target_binary -o target_unpacked

# High entropy = likely packed/encrypted
# Entropy > 7.0 across most sections = almost certainly packed
python3 -c "
import math, collections
data = open('target_binary','rb').read()
counts = collections.Counter(data)
entropy = -sum(c/len(data)*math.log2(c/len(data)) for c in counts.values())
print(f'Entropy: {entropy:.2f}')
"
```

### 1.3 Disassembly with Ghidra

```bash
# Headless Ghidra analysis (no GUI needed)
/opt/ghidra/support/analyzeHeadless /tmp/ghidra_proj MyProject \
  -import target_binary \
  -postScript PrintStrings.java \
  -deleteProject 2>/dev/null

# Key things to look for in Ghidra:
# 1. The main() function — start here
# 2. String cross-references — right-click a string → "Show References"
# 3. strcmp / strncmp calls — follow arguments
# 4. Functions named check*, verify*, validate* — decompile these
```

### 1.4 Radare2

```bash
# Open binary
r2 target_binary

# Inside r2:
aaa          # analyze all
afl          # list all functions
s main       # seek to main
pdf          # print disassembly of function
pdc          # pseudo C decompile
iz           # list strings in data sections
iI           # binary info
/flag        # search for "flag" string in binary
VV           # visual graph view (q to exit)
```

---

## Phase 2: Dynamic Analysis

### 2.1 ltrace / strace

```bash
# Trace library calls (strcmp, strcmp, fopen, etc.)
ltrace ./target_binary 2>&1 | grep -E "strcmp|strncmp|memcmp|strcpy|fopen|fgets"

# Trace system calls
strace ./target_binary 2>&1 | grep -E "read|write|open|execve"

# With input
echo "test_input" | ltrace ./target_binary
ltrace ./target_binary <<< "test_input"
```

### 2.2 GDB / pwndbg

```bash
# Install pwndbg (much better than raw GDB)
# Already on Kali, or: git clone https://github.com/pwndbg/pwndbg && cd pwndbg && ./setup.sh

gdb ./target_binary

# Inside GDB:
r                        # run
r <<< "input"            # run with input
b main                   # breakpoint at main
b *0xADDRESS             # breakpoint at address
b strcmp                 # break on every strcmp call
n                        # next instruction (step over)
si                       # step into
c                        # continue
x/20s $rsp               # examine 20 strings at stack pointer
x/20x $rsp               # examine 20 hex words
info registers           # show all registers
disas main               # disassemble main
set $rip = 0xADDRESS     # jump to address
```

---

## Phase 3: Common Patterns

### 3.1 Serial / License Key Checks

```bash
# Pattern: binary takes input, compares to expected
# Approach:
# 1. Find the comparison (strcmp, memcmp, custom loop)
# 2. Set breakpoint just before comparison
# 3. Read what the binary computes as the "valid" value

gdb ./crackme
b strcmp
r <<< "AAAA"
# At breakpoint: examine both arguments
x/s $rdi    # first arg
x/s $rsi    # second arg (often the expected value)
```

### 3.2 Anti-Debug Tricks

| Trick | What it does | Bypass |
|---|---|---|
| `ptrace(PTRACE_TRACEME)` | Returns -1 if being debugged | Patch the comparison / return value |
| `/proc/self/status` TracerPid check | Reads if a debugger is attached | Patch file read or comparison |
| `RDTSC` timing check | Times execution to detect stepping | NOP out the check |
| `IsDebuggerPresent` (Windows PE) | Windows API | Patch return to 0 |
| Checksum of own code | Detects patching | Run unpatched, note expected value |

```bash
# Patch a byte in the binary
# Find offset of instruction to patch
objdump -d target | grep -A2 "ptrace"

# Use radare2 to patch
r2 -w target_binary
# seek to address, write NOP
s 0xADDRESS
wx 9090    # NOP NOP
```

### 3.3 Obfuscated Strings

```bash
# XOR-obfuscated strings — look for loops that XOR memory
# Simulate in Python: if key is single byte
python3 -c "
data = [0x41, 0x42, 0x43]   # bytes from binary
key = 0x37                   # XOR key from binary
print(bytes(b ^ key for b in data))
"

# FLOSS — automatically deobfuscates strings in binaries
floss target_binary
```

---

## Lookup Table: If You See X, Try Y

| You see | Try |
|---|---|
| `strcmp` call with two args | Breakpoint, read both args in GDB |
| UPX in `file` output | `upx -d target -o unpacked` |
| Python `.pyc` file | `python3 -m uncompyle6` or `decompile3` |
| Java `.class` | `javap -c Class.class` or `jadx` |
| `.NET` / `C#` | `dnspy` or `ilspy` |
| WASM file | `wasm2wat file.wasm` |
| High entropy sections | Try `binwalk -e`, it may be packed |
| All strings are garbage | XOR obfuscation — find the loop |
| Binary checks time | Freeze time with `libfaketime` |

---

## Common Mistakes

- **Don't patch before understanding** — know what you're patching and why
- **ltrace lies** — library wrappers may not show the real comparison; verify in GDB
- **Always try `strings` first** — many easy crackmes have the flag in plaintext
- **Check the return value, not the call** — a function may compute the flag, not compare it
