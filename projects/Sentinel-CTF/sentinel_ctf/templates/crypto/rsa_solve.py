#!/usr/bin/env python3
"""
RSA CTF solver — factorisation and classical attack pipeline.

PURPOSE
-------
Automatically attempt several RSA attacks in order:

  1.  FactorDB lookup (HTTP API) — fastest; works for known composites.
  2.  Fermat factorisation — effective when p ≈ q (close primes).
  3.  Small-public-exponent attack (cube root / e-th root) — works when
      e is small (2, 3, …) and m^e < n (i.e. no modular reduction occurred).
  4.  Wiener's attack — works when d < n^(1/4) / 3 (very small private key).

If any attack succeeds the plaintext is decrypted and printed.  If all
fail, guidance on further steps is printed.

USAGE
-----
    python3 rsa_solve.py

Fill in the RSA parameters in the CONFIG block below.

REQUIREMENTS
------------
    pip install requests sympy

Pure-Python fallbacks are provided for environments without sympy.

AUTHOR: Sentinel CTF Framework
"""

from __future__ import annotations

import math
import sys
import struct
from typing import Optional

# Optional heavy dependencies
try:
    import requests as _requests  # type: ignore
    _HAS_REQUESTS = True
except ImportError:
    _HAS_REQUESTS = False

try:
    import sympy  # type: ignore
    from sympy import isprime, factorint, integer_nthroot  # type: ignore
    _HAS_SYMPY = True
except ImportError:
    _HAS_SYMPY = False


# =============================================================================
# CONFIG — fill in the RSA parameters from the challenge
# =============================================================================

N = 0   # Modulus              (required)
E = 65537  # Public exponent   (default 65537)
C = 0   # Ciphertext           (required; 0 to skip decryption)

# If p and q are already known (e.g. from a previous run), set them here
# to skip factorisation.
KNOWN_P: Optional[int] = None
KNOWN_Q: Optional[int] = None

# If the flag is a known-format string, set the prefix for heuristic checks.
FLAG_PREFIX = b"flag{"

# =============================================================================


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def int_to_bytes(n: int) -> bytes:
    """Convert an arbitrary-precision integer to bytes (big-endian)."""
    if n == 0:
        return b"\x00"
    length = (n.bit_length() + 7) // 8
    return n.to_bytes(length, "big")


def bytes_to_int(b: bytes) -> int:
    """Convert bytes to an arbitrary-precision integer (big-endian)."""
    return int.from_bytes(b, "big")


def _gcd(a: int, b: int) -> int:
    """Return the GCD of *a* and *b*."""
    while b:
        a, b = b, a % b
    return a


def _isqrt(n: int) -> int:
    """Integer square root (pure Python)."""
    if n < 0:
        raise ValueError("Square root of negative number.")
    if n == 0:
        return 0
    x = n
    y = (x + 1) // 2
    while y < x:
        x = y
        y = (x + n // x) // 2
    return x


def _is_perfect_square(n: int) -> Optional[int]:
    """
    Return the integer square root of *n* if *n* is a perfect square,
    else return ``None``.
    """
    s = _isqrt(n)
    return s if s * s == n else None


def _mod_inverse(a: int, m: int) -> int:
    """
    Return the modular inverse of *a* modulo *m* using the extended
    Euclidean algorithm.

    Raises
    ------
    ValueError
        If the inverse does not exist (gcd != 1).
    """
    g, x, _ = _extended_gcd(a, m)
    if g != 1:
        raise ValueError(f"Inverse of {a} mod {m} does not exist (gcd={g}).")
    return x % m


def _extended_gcd(a: int, b: int) -> tuple[int, int, int]:
    """Return (gcd, x, y) such that a*x + b*y == gcd."""
    if a == 0:
        return b, 0, 1
    g, x1, y1 = _extended_gcd(b % a, a)
    return g, y1 - (b // a) * x1, x1


def _integer_nthroot(n: int, k: int) -> tuple[int, bool]:
    """
    Return (root, exact) where root is the floor of n^(1/k).
    *exact* is True if root^k == n.

    Falls back to sympy if available for large k.
    """
    if _HAS_SYMPY:
        root, exact = integer_nthroot(n, k)
        return int(root), bool(exact)
    # Pure-Python Newton's method
    if n < 0:
        raise ValueError("n must be non-negative.")
    if k == 1:
        return n, True
    if n == 0:
        return 0, True
    # Initial guess
    root = int(round(n ** (1.0 / k)))
    # Adjust
    for _ in range(100):
        root_k = root ** k
        if root_k == n:
            return root, True
        if root_k < n:
            root += 1
        else:
            root -= 1
            if root ** k == n:
                return root, True
            root += 1
            break
    # Final check
    return root, root ** k == n


def _is_prime_miller_rabin(n: int, rounds: int = 20) -> bool:
    """Miller-Rabin primality test (pure Python)."""
    if n < 2:
        return False
    if n in (2, 3, 5, 7):
        return True
    if n % 2 == 0:
        return False
    small_primes = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]
    for p in small_primes:
        if n == p:
            return True
        if n % p == 0:
            return False
    # Write n-1 as 2^r * d
    r, d = 0, n - 1
    while d % 2 == 0:
        r += 1
        d //= 2
    witnesses = small_primes[:rounds]
    for a in witnesses:
        if a >= n:
            continue
        x = pow(a, d, n)
        if x == 1 or x == n - 1:
            continue
        for _ in range(r - 1):
            x = x * x % n
            if x == n - 1:
                break
        else:
            return False
    return True


def _is_prime(n: int) -> bool:
    if _HAS_SYMPY:
        return bool(isprime(n))
    return _is_prime_miller_rabin(n)


def _rsa_decrypt(p: int, q: int, e: int, c: int) -> int:
    """Decrypt RSA ciphertext *c* given *p*, *q*, *e*."""
    phi_n = (p - 1) * (q - 1)
    d     = _mod_inverse(e, phi_n)
    m     = pow(c, d, p * q)
    return m


# ---------------------------------------------------------------------------
# Attack 1: FactorDB
# ---------------------------------------------------------------------------

def attack_factordb(n: int) -> Optional[tuple[int, int]]:
    """
    Query the FactorDB API to retrieve known factors of *n*.

    Endpoint: ``http://factordb.com/api?query=<n>``

    Parameters
    ----------
    n:
        RSA modulus.

    Returns
    -------
    tuple[int, int] or None
        (p, q) if found, else ``None``.
    """
    if not _HAS_REQUESTS:
        print("[!] requests not installed — skipping FactorDB lookup.")
        return None

    print("[*] Trying FactorDB ...")
    try:
        url  = f"http://factordb.com/api?query={n}"
        resp = _requests.get(url, timeout=15)
        data = resp.json()
        status = data.get("status", "")
        # Statuses: FF = fully factored, P = prime, C = composite (unknown),
        #           CF = composite (partially factored), N = not in DB
        if status in ("FF", "P"):
            factors = data.get("factors", [])
            # factors is a list of [factor_str, exponent] pairs
            primes = []
            for item in factors:
                base = int(item[0])
                exp  = int(item[1])
                primes.extend([base] * exp)
            if len(primes) == 2:
                p, q = primes
                print(f"[+] FactorDB: p = {p}")
                print(f"[+] FactorDB: q = {q}")
                return p, q
            elif len(primes) > 2:
                print(f"[!] FactorDB: n has {len(primes)} prime factors — multi-prime RSA?")
                print(f"    Factors: {primes}")
                # Return first two for standard RSA; caller can adapt
                return primes[0], primes[1]
        else:
            print(f"[*] FactorDB status: {status!r} — not fully factored.")
    except Exception as exc:
        print(f"[!] FactorDB query failed: {exc}")
    return None


# ---------------------------------------------------------------------------
# Attack 2: Fermat factorisation
# ---------------------------------------------------------------------------

def attack_fermat(n: int, max_iterations: int = 1_000_000) -> Optional[tuple[int, int]]:
    """
    Fermat factorisation: effective when p and q are close together.

    Algorithm: find integers *a*, *b* such that ``n = a^2 - b^2 = (a+b)(a-b)``.

    Complexity: O(|p - q|) — fast when p ≈ q, impractical otherwise.

    Parameters
    ----------
    n:
        RSA modulus.
    max_iterations:
        Number of Fermat steps before giving up.

    Returns
    -------
    tuple[int, int] or None
        (p, q) with p > q if found, else ``None``.
    """
    print(f"[*] Trying Fermat factorisation (max {max_iterations:,} iterations) ...")
    a    = _isqrt(n)
    if a * a < n:
        a += 1
    b2   = a * a - n
    for i in range(max_iterations):
        sq = _is_perfect_square(b2)
        if sq is not None:
            b = sq
            p = a + b
            q = a - b
            if q > 1 and _is_prime(p) and _is_prime(q):
                print(f"[+] Fermat: found after {i} iterations.")
                print(f"[+] p = {p}")
                print(f"[+] q = {q}")
                return p, q
        a  += 1
        b2  = a * a - n
    print("[*] Fermat: not found within iteration limit.")
    return None


# ---------------------------------------------------------------------------
# Attack 3: Small e (e-th root attack)
# ---------------------------------------------------------------------------

def attack_small_e(n: int, e: int, c: int) -> Optional[int]:
    """
    Small-public-exponent attack (Coppersmith / e-th root).

    When *e* is small (typically 3) and the plaintext *m* satisfies
    ``m^e < n``, the ciphertext is ``c = m^e`` without modular reduction.
    We recover ``m = c^(1/e)`` using integer e-th root.

    Also handles the case where ``m^e`` wraps modularly a small number of
    times (Håstad's broadcast attack fragment) by trying ``c + k*n`` for
    small *k*.

    Parameters
    ----------
    n, e, c:
        RSA parameters and ciphertext.

    Returns
    -------
    int or None
        Plaintext integer if attack succeeds, else ``None``.
    """
    print(f"[*] Trying small-e attack (e = {e}) ...")
    if e > 1000:
        print("[*] e is large — small-e attack unlikely to work. Skipping.")
        return None

    MAX_K = 10_000
    for k in range(MAX_K):
        candidate = c + k * n
        root, exact = _integer_nthroot(candidate, e)
        if exact:
            print(f"[+] Small-e: plaintext found at k = {k}.")
            return root

    print("[*] Small-e: not found.")
    return None


# ---------------------------------------------------------------------------
# Attack 4: Wiener's attack
# ---------------------------------------------------------------------------

def _continued_fraction_convergents(num: int, den: int):
    """
    Generate convergents of the continued fraction expansion of num/den.

    Yields (p_k, q_k) numerator/denominator pairs.
    """
    p_prev, p_curr = 1, 0
    q_prev, q_curr = 0, 1
    while den:
        a        = num // den
        num, den = den, num % den
        p_prev, p_curr = p_curr, a * p_curr + p_prev
        q_prev, q_curr = q_curr, a * q_curr + q_prev
        yield p_curr, q_curr


def attack_wiener(n: int, e: int) -> Optional[tuple[int, int]]:
    """
    Wiener's attack on RSA with a small private exponent.

    Effective when ``d < n^(1/4) / 3``.  Uses the continued fraction
    expansion of ``e/n`` to recover *d* and hence *p*, *q*.

    Parameters
    ----------
    n:
        RSA modulus.
    e:
        Public exponent.

    Returns
    -------
    tuple[int, int] or None
        (p, q) if attack succeeds, else ``None``.
    """
    print("[*] Trying Wiener's attack ...")
    for k, d in _continued_fraction_convergents(e, n):
        if k == 0:
            continue
        # Check: phi_n = (e*d - 1) / k must be an integer
        if (e * d - 1) % k != 0:
            continue
        phi_n = (e * d - 1) // k
        # Reconstruct p + q and p * q from phi_n and n
        # p + q = n - phi_n + 1
        # p * q = n
        # Solve quadratic: x^2 - (p+q)x + n = 0
        b   = n - phi_n + 1
        # discriminant = b^2 - 4n
        disc = b * b - 4 * n
        if disc < 0:
            continue
        sq = _is_perfect_square(disc)
        if sq is None:
            continue
        p = (b + sq) // 2
        q = (b - sq) // 2
        if p * q == n and p > 1 and q > 1:
            print(f"[+] Wiener: d = {d}")
            print(f"[+] p = {p}")
            print(f"[+] q = {q}")
            return p, q
    print("[*] Wiener: not found.")
    return None


# ---------------------------------------------------------------------------
# Decryption
# ---------------------------------------------------------------------------

def decrypt(p: int, q: int, e: int, c: int) -> bytes:
    """
    Decrypt ciphertext *c* using the factored *p* and *q*.

    Parameters
    ----------
    p, q:
        Prime factors of n.
    e:
        Public exponent.
    c:
        Ciphertext integer.

    Returns
    -------
    bytes
        Decrypted plaintext bytes.
    """
    m = _rsa_decrypt(p, q, e, c)
    plaintext = int_to_bytes(m)
    return plaintext


# ---------------------------------------------------------------------------
# Guidance when all attacks fail
# ---------------------------------------------------------------------------

def print_guidance(n: int, e: int) -> None:
    """Print actionable guidance when automatic factorisation fails."""
    print("\n" + "=" * 60)
    print("[!] All automatic attacks failed.")
    print("=" * 60)
    print(f"\n  n ({n.bit_length()} bits) = {n}")
    print(f"  e = {e}\n")
    print("  Suggested next steps:")
    print("  1. Check FactorDB manually: http://factordb.com/index.php?query=" + str(n))
    print("  2. Try Msieve or YAFU for general-purpose factorisation:")
    print("       ./msieve -v -nf nfs.dat " + str(n))
    print("       ./yafu 'factor(" + str(n) + ")'")
    print("  3. Check for common modulus attack if multiple (n, e, c) pairs")
    print("     share the same n with different e values.")
    print("  4. If e is even, check for special constructions.")
    print("  5. Look for implementation weaknesses (e.g. Bleichenbacher,")
    print("     PKCS#1 padding oracle) if this is a real-world scenario.")
    print("  6. Try RsaCtfTool: https://github.com/RsaCtfTool/RsaCtfTool")
    print("       python3 RsaCtfTool.py --publickey ./pub.pem --uncipherfile ./flag.enc")
    print()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    """
    Run the RSA attack pipeline and decrypt if successful.
    """
    if N == 0:
        print("[!] N is not set. Fill in the CONFIG block before running.")
        sys.exit(1)

    print(f"[*] n = {N} ({N.bit_length()} bits)")
    print(f"[*] e = {E}")
    if C:
        print(f"[*] c = {C}")

    # Use known factors if provided
    if KNOWN_P and KNOWN_Q:
        p, q = KNOWN_P, KNOWN_Q
        print(f"[+] Using provided factors: p = {p}, q = {q}")
    else:
        p = q = None

        # Attack 1: FactorDB
        result = attack_factordb(N)
        if result:
            p, q = result

        # Attack 2: Fermat
        if p is None:
            result = attack_fermat(N)
            if result:
                p, q = result

        # Attack 4: Wiener (before small-e, as it also gives factors)
        if p is None:
            result = attack_wiener(N, E)
            if result:
                p, q = result

    # Attack 3: Small-e (does not give p/q, gives plaintext directly)
    if p is None and C:
        plaintext_int = attack_small_e(N, E, C)
        if plaintext_int is not None:
            plaintext = int_to_bytes(plaintext_int)
            print(f"\n[+] Plaintext (int): {plaintext_int}")
            print(f"[+] Plaintext (hex): {plaintext.hex()}")
            try:
                print(f"[+] Plaintext (str): {plaintext.decode(errors='replace')}")
            except Exception:
                pass
            return

    # Decrypt if we have factors
    if p and q:
        # Verify
        if p * q != N:
            print(f"[!] Warning: p * q = {p * q} != n = {N}. Factors may be wrong.")

        if C:
            plaintext = decrypt(p, q, E, C)
            print(f"\n[+] Decryption successful!")
            print(f"[+] Plaintext (hex): {plaintext.hex()}")
            try:
                decoded = plaintext.decode(errors="replace")
                print(f"[+] Plaintext (str): {decoded}")
            except Exception:
                pass
            if FLAG_PREFIX and FLAG_PREFIX in plaintext:
                idx   = plaintext.index(FLAG_PREFIX)
                flag  = plaintext[idx:]
                print(f"\n[+] FLAG: {flag.decode(errors='replace')}")
        else:
            print("[*] No ciphertext (C=0) — factorisation done, decryption skipped.")
            phi = (p - 1) * (q - 1)
            d   = _mod_inverse(E, phi)
            print(f"[+] p   = {p}")
            print(f"[+] q   = {q}")
            print(f"[+] phi = {phi}")
            print(f"[+] d   = {d}")
    else:
        print_guidance(N, E)


if __name__ == "__main__":
    main()
