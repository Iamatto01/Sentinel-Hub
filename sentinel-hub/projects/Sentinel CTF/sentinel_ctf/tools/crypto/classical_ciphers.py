"""
sentinel_ctf.tools.crypto.classical_ciphers
=============================================
Pure-Python utility class providing static methods for classical cipher
operations used in CTF challenges.  This is NOT a BaseTool subclass —
it is a standalone utility meant to be imported directly.

Ciphers covered:
    Caesar, Atbash, ROT13, Rail Fence, Columnar Transposition,
    Polybius Square, Affine, Substitution scoring, Morse Code,
    Bacon's Cipher, Pigpen hint.
"""
from __future__ import annotations

import math
import re
import string
from collections import Counter
from math import gcd
from typing import Any


# ---------------------------------------------------------------------------
# English letter frequencies for scoring (lowercase index: 0=a … 25=z)
# ---------------------------------------------------------------------------
_ENG_FREQ: dict[str, float] = {
    "a": 8.167, "b": 1.492, "c": 2.782, "d": 4.253, "e": 12.702,
    "f": 2.228, "g": 2.015, "h": 6.094, "i": 6.966, "j": 0.153,
    "k": 0.772, "l": 4.025, "m": 2.406, "n": 6.749, "o": 7.507,
    "p": 1.929, "q": 0.095, "r": 5.987, "s": 6.327, "t": 9.056,
    "u": 2.758, "v": 0.978, "w": 2.360, "x": 0.150, "y": 1.974,
    "z": 0.074,
}

# Morse code tables
_MORSE_ENCODE: dict[str, str] = {
    "A": ".-",   "B": "-...", "C": "-.-.", "D": "-..",  "E": ".",
    "F": "..-.", "G": "--.",  "H": "....", "I": "..",   "J": ".---",
    "K": "-.-",  "L": ".-..", "M": "--",   "N": "-.",   "O": "---",
    "P": ".--.", "Q": "--.-", "R": ".-.",  "S": "...",  "T": "-",
    "U": "..-",  "V": "...-", "W": ".--",  "X": "-..-", "Y": "-.--",
    "Z": "--..",
    "0": "-----", "1": ".----", "2": "..---", "3": "...--", "4": "....-",
    "5": ".....", "6": "-....", "7": "--...", "8": "---..", "9": "----.",
    ".": ".-.-.-", ",": "--..--", "?": "..--..", "'": ".----.",
    "!": "-.-.--", "/": "-..-.",  "(": "-.--.",  ")": "-.--.-",
    "&": ".-...",  ":": "---...", ";": "-.-.-.", "=": "-...-",
    "+": ".-.-.",  "-": "-....-", "_": "..--.-", '"': ".-..-.",
    "$": "...-..-", "@": ".--.-.",
}
_MORSE_DECODE: dict[str, str] = {v: k for k, v in _MORSE_ENCODE.items()}


class ClassicalCipherTool:
    """
    Utility class for classical cipher operations.

    All methods are ``@staticmethod``; no instantiation is required::

        from sentinel_ctf.tools.crypto.classical_ciphers import ClassicalCipherTool as CC

        print(CC.caesar_brute("Khoor, Zruog!"))
        print(CC.atbash("HSVOOL"))
        print(CC.morse_decode(".... . .-.. .-.. ---   .-- --- .-. .-.. -.."))
    """

    # ------------------------------------------------------------------
    # Caesar
    # ------------------------------------------------------------------

    @staticmethod
    def caesar_decrypt(text: str, shift: int) -> str:
        """
        Decrypt *text* using Caesar cipher with the given *shift*.

        Non-alphabetic characters are preserved unchanged.
        Case is preserved.

        Parameters
        ----------
        text:
            Ciphertext string.
        shift:
            Integer shift value (0–25).  May be negative.

        Returns
        -------
        str
            Decrypted plaintext.
        """
        result: list[str] = []
        shift = shift % 26
        for ch in text:
            if ch.isalpha():
                base = ord("A") if ch.isupper() else ord("a")
                result.append(chr((ord(ch) - base - shift) % 26 + base))
            else:
                result.append(ch)
        return "".join(result)

    @staticmethod
    def caesar_brute(text: str) -> list[tuple[int, str]]:
        """
        Try all 25 non-trivial Caesar shifts and return them sorted by
        English word likelihood (best first).

        Scoring is done via :meth:`substitution_score`.

        Returns
        -------
        list[tuple[int, str]]
            List of ``(shift, decrypted_text)`` sorted best-first.
        """
        candidates: list[tuple[float, int, str]] = []
        for shift in range(1, 26):
            decrypted = ClassicalCipherTool.caesar_decrypt(text, shift)
            score = ClassicalCipherTool.substitution_score(decrypted)
            candidates.append((score, shift, decrypted))
        # Lower chi-squared = better fit
        candidates.sort(key=lambda x: x[0])
        return [(shift, dec) for _, shift, dec in candidates]

    # ------------------------------------------------------------------
    # Atbash
    # ------------------------------------------------------------------

    @staticmethod
    def atbash(text: str) -> str:
        """
        Apply Atbash cipher (A↔Z, B↔Y, …).

        The cipher is its own inverse — applying it twice returns the
        original text.  Case is preserved; non-letters pass through.

        Parameters
        ----------
        text:
            Input string.

        Returns
        -------
        str
            Atbash-transformed string.
        """
        result: list[str] = []
        for ch in text:
            if ch.isalpha():
                base = ord("A") if ch.isupper() else ord("a")
                result.append(chr(base + (25 - (ord(ch) - base))))
            else:
                result.append(ch)
        return "".join(result)

    # ------------------------------------------------------------------
    # ROT13
    # ------------------------------------------------------------------

    @staticmethod
    def rot13(text: str) -> str:
        """
        Apply ROT13 substitution.

        ROT13 is its own inverse.  Equivalent to
        ``caesar_decrypt(text, 13)``.

        Parameters
        ----------
        text:
            Input string.

        Returns
        -------
        str
            ROT13-transformed string.
        """
        return ClassicalCipherTool.caesar_decrypt(text, 13)

    # ------------------------------------------------------------------
    # Rail Fence
    # ------------------------------------------------------------------

    @staticmethod
    def rail_fence_encrypt(text: str, rails: int) -> str:
        """
        Encrypt *text* using the Rail Fence cipher with *rails* rails.

        The algorithm writes the text in a zigzag pattern across *rails*
        rows and then reads off each row in sequence.

        Parameters
        ----------
        text:
            Plaintext string.
        rails:
            Number of rails (must be ≥ 2).

        Returns
        -------
        str
            Encrypted ciphertext.

        Raises
        ------
        ValueError
            If *rails* < 2 or *rails* ≥ len(text).
        """
        if rails < 2:
            raise ValueError("rails must be >= 2")
        fence: list[list[str]] = [[] for _ in range(rails)]
        rail = 0
        direction = 1

        for ch in text:
            fence[rail].append(ch)
            if rail == 0:
                direction = 1
            elif rail == rails - 1:
                direction = -1
            rail += direction

        return "".join("".join(row) for row in fence)

    @staticmethod
    def rail_fence_decrypt(text: str, rails: int) -> str:
        """
        Decrypt *text* that was encrypted with the Rail Fence cipher
        using *rails* rails.

        The algorithm reconstructs the zigzag index pattern, determines
        how many characters belong to each rail, then reassembles the
        plaintext.

        Parameters
        ----------
        text:
            Ciphertext string.
        rails:
            Number of rails used during encryption (must be ≥ 2).

        Returns
        -------
        str
            Decrypted plaintext.

        Raises
        ------
        ValueError
            If *rails* < 2.
        """
        if rails < 2:
            raise ValueError("rails must be >= 2")
        n = len(text)
        if n == 0:
            return ""

        # Build index pattern
        indices = list(range(n))
        pattern = [0] * n
        rail = 0
        direction = 1
        for i in range(n):
            pattern[i] = rail
            if rail == 0:
                direction = 1
            elif rail == rails - 1:
                direction = -1
            rail += direction

        # Sort indices by their rail assignment to know how many chars per rail
        order = sorted(range(n), key=lambda i: pattern[i])
        result = [""] * n
        pos = 0
        for idx in order:
            result[idx] = text[pos]
            pos += 1

        return "".join(result)

    # ------------------------------------------------------------------
    # Columnar Transposition
    # ------------------------------------------------------------------

    @staticmethod
    def columnar_transpose_decrypt(text: str, key: str) -> str:
        """
        Decrypt columnar transposition cipher with the given *key*.

        The key is a string whose alphabetical ordering gives the column
        reordering.  For example, key ``"CARGO"`` has sorted order
        ``A=1, C=0, G=3, O=4, R=2`` → columns were written in that order.

        Parameters
        ----------
        text:
            Ciphertext string (no spaces).
        key:
            Keyword used during encryption.

        Returns
        -------
        str
            Decrypted plaintext (trailing padding chars may appear if the
            original message length was not a multiple of the key length).
        """
        ncols = len(key)
        nrows = math.ceil(len(text) / ncols)
        # Number of cells in the last (short) row
        n_long = len(text) % ncols  # columns that have one extra char
        # If n_long == 0, all columns are full
        if n_long == 0:
            n_long = ncols

        # Sorted key positions → column order used during encryption
        sorted_key = sorted(range(ncols), key=lambda i: key[i])

        # Determine actual column lengths
        col_lengths: list[int] = []
        for rank in range(ncols):
            original_col = sorted_key.index(rank)
            if original_col < n_long:
                col_lengths.append(nrows)
            else:
                col_lengths.append(nrows - 1)

        # Split ciphertext into columns
        columns: list[str] = []
        pos = 0
        for rank in range(ncols):
            length = col_lengths[rank]
            columns.append(text[pos: pos + length])
            pos += length

        # Read off row by row
        result: list[str] = []
        for row in range(nrows):
            for rank in range(ncols):
                if row < len(columns[rank]):
                    result.append(columns[rank][row])

        return "".join(result)

    # ------------------------------------------------------------------
    # Polybius Square
    # ------------------------------------------------------------------

    @staticmethod
    def polybius_decode(
        pairs: str,
        square: str = "ABCDEFGHIKLMNOPQRSTUVWXYZ",
    ) -> str:
        """
        Decode a Polybius square cipher (5×5, I/J combined).

        Input *pairs* is a string of digit pairs separated by spaces, e.g.
        ``"35 15 44 44 43"`` decodes to ``"HELLO"`` using the default square.

        Parameters
        ----------
        pairs:
            Space-separated numeric pairs (row col, 1-indexed).
        square:
            25-character string representing the 5×5 grid left-to-right,
            top-to-bottom.  Defaults to the standard square omitting J.

        Returns
        -------
        str
            Decoded plaintext (uppercase).

        Raises
        ------
        ValueError
            If *square* is not exactly 25 characters or a pair is out of range.
        """
        if len(square) != 25:
            raise ValueError("Polybius square must be exactly 25 characters.")
        square = square.upper()
        tokens = pairs.strip().split()
        result: list[str] = []
        for token in tokens:
            if len(token) == 2 and token.isdigit():
                row = int(token[0]) - 1
                col = int(token[1]) - 1
                idx = row * 5 + col
                if 0 <= idx < 25:
                    result.append(square[idx])
                else:
                    result.append("?")
            elif token:
                result.append("?")
        return "".join(result)

    # ------------------------------------------------------------------
    # Affine Cipher
    # ------------------------------------------------------------------

    @staticmethod
    def _mod_inverse(a: int, m: int) -> int:
        """Extended Euclidean Algorithm to find modular inverse of *a* mod *m*."""
        g, x, _ = ClassicalCipherTool._extended_gcd(a % m, m)
        if g != 1:
            raise ValueError(f"{a} has no inverse mod {m}")
        return x % m

    @staticmethod
    def _extended_gcd(a: int, b: int) -> tuple[int, int, int]:
        if a == 0:
            return b, 0, 1
        g, x, y = ClassicalCipherTool._extended_gcd(b % a, a)
        return g, y - (b // a) * x, x

    @staticmethod
    def affine_decrypt(text: str, a: int, b: int) -> str:
        """
        Decrypt affine cipher: ``D(y) = a_inv * (y - b) mod 26``.

        Only alphabetic characters are affected; case is preserved.

        Parameters
        ----------
        text:
            Ciphertext string.
        a:
            Multiplicative key.  Must satisfy gcd(a, 26) = 1.
        b:
            Additive key (0–25).

        Returns
        -------
        str
            Decrypted plaintext.

        Raises
        ------
        ValueError
            If gcd(a, 26) ≠ 1.
        """
        if gcd(a, 26) != 1:
            raise ValueError(f"a={a} is not coprime with 26 — not a valid affine key.")
        a_inv = ClassicalCipherTool._mod_inverse(a, 26)
        result: list[str] = []
        for ch in text:
            if ch.isalpha():
                base = ord("A") if ch.isupper() else ord("a")
                y = ord(ch) - base
                x = (a_inv * (y - b)) % 26
                result.append(chr(x + base))
            else:
                result.append(ch)
        return "".join(result)

    @staticmethod
    def affine_brute(text: str) -> list[tuple[int, int, str]]:
        """
        Brute-force all valid affine keys (a values coprime with 26 × 26 b values).

        Valid *a* values (gcd(a, 26) = 1): 1,3,5,7,9,11,15,17,19,21,23,25.

        Returns
        -------
        list[tuple[int, int, str]]
            List of ``(a, b, decrypted_text)`` sorted by English letter
            frequency fit (best first, lowest chi-squared).
        """
        valid_a = [a for a in range(1, 26) if gcd(a, 26) == 1]
        candidates: list[tuple[float, int, int, str]] = []
        for a in valid_a:
            for b in range(26):
                try:
                    dec = ClassicalCipherTool.affine_decrypt(text, a, b)
                    score = ClassicalCipherTool.substitution_score(dec)
                    candidates.append((score, a, b, dec))
                except ValueError:
                    continue
        candidates.sort(key=lambda x: x[0])
        return [(a, b, dec) for _, a, b, dec in candidates]

    # ------------------------------------------------------------------
    # Substitution scoring
    # ------------------------------------------------------------------

    @staticmethod
    def substitution_score(text: str) -> float:
        """
        Score *text* against English letter frequency using chi-squared.

        A lower score indicates a better fit to English.  Returns
        ``float('inf')`` if the text contains no alphabetic characters.

        Parameters
        ----------
        text:
            Text to score.

        Returns
        -------
        float
            Chi-squared statistic (lower = more English-like).
        """
        letters = [c.lower() for c in text if c.isalpha()]
        n = len(letters)
        if n == 0:
            return float("inf")

        counts = Counter(letters)
        chi2 = 0.0
        for char, expected_pct in _ENG_FREQ.items():
            observed = counts.get(char, 0) / n * 100.0
            expected = expected_pct
            chi2 += (observed - expected) ** 2 / expected
        return chi2

    # ------------------------------------------------------------------
    # Morse Code
    # ------------------------------------------------------------------

    @staticmethod
    def morse_encode(text: str) -> str:
        """
        Encode *text* to Morse code.

        Letters are separated by a single space; words are separated by
        three spaces.  Unknown characters are represented as ``?``.

        Parameters
        ----------
        text:
            Plaintext string.

        Returns
        -------
        str
            Morse-encoded string.
        """
        words = text.upper().split()
        encoded_words: list[str] = []
        for word in words:
            encoded_chars = []
            for ch in word:
                encoded_chars.append(_MORSE_ENCODE.get(ch, "?"))
            encoded_words.append(" ".join(encoded_chars))
        return "   ".join(encoded_words)

    @staticmethod
    def morse_decode(code: str) -> str:
        """
        Decode a Morse code string.

        Conventions:
        - Single space between individual letter codes.
        - Three spaces (or ``/``) between words.
        - Dot (``·``) or period (``.``) and dash/hyphen (``-``) are
          the signal characters.

        Parameters
        ----------
        code:
            Morse code string.

        Returns
        -------
        str
            Decoded plaintext (uppercase).
        """
        # Normalise: replace slash word separator with triple space
        code = code.replace(" / ", "   ").replace("/", "   ")
        words = re.split(r"\s{2,}", code.strip())
        decoded_words: list[str] = []
        for word in words:
            chars = word.strip().split(" ")
            decoded_chars: list[str] = []
            for char_code in chars:
                char_code = char_code.strip()
                if char_code:
                    decoded_chars.append(_MORSE_DECODE.get(char_code, "?"))
            if decoded_chars:
                decoded_words.append("".join(decoded_chars))
        return " ".join(decoded_words)

    # ------------------------------------------------------------------
    # Bacon's Cipher
    # ------------------------------------------------------------------

    # Standard 24-letter Bacon alphabet (I=J, U=V)
    _BACON_ALPHABET: dict[str, str] = {
        "AAAAA": "A", "AAAAB": "B", "AAABA": "C", "AAABB": "D",
        "AABAA": "E", "AABAB": "F", "AABBA": "G", "AABBB": "H",
        "ABAAA": "I", "ABAAB": "J", "ABABA": "K", "ABABB": "L",
        "ABBAA": "M", "ABBAB": "N", "ABBBA": "O", "ABBBB": "P",
        "BAAAA": "Q", "BAAAB": "R", "BAABA": "S", "BAABB": "T",
        "BABAA": "U", "BABAB": "V", "BABBA": "W", "BABBB": "X",
        "BBAAA": "Y", "BBAAB": "Z",
    }

    @staticmethod
    def bacon_decode(text: str) -> str:
        """
        Decode Bacon's cipher (Biliteral cipher).

        Accepts either A/B encoding (standard) or a/b encoding
        (case-insensitive).  Input must be groups of 5 A/B characters,
        optionally separated by spaces or commas.

        Example::

            CC.bacon_decode("AABBA AABAA ABAAA ABAAA ABBBA")
            # → "GHILO"  (using I for J, standard 24-letter variant)

        Parameters
        ----------
        text:
            Bacon cipher text (groups of A/B or a/b).

        Returns
        -------
        str
            Decoded plaintext.
        """
        # Normalise to uppercase A/B only
        normalised = text.upper().replace(",", " ").replace("-", "")
        # Remove anything that is neither A, B, nor whitespace
        cleaned = re.sub(r"[^AB\s]", "", normalised)
        # Split into chunks of 5
        condensed = cleaned.replace(" ", "")
        groups: list[str] = [condensed[i: i + 5] for i in range(0, len(condensed), 5)]
        result: list[str] = []
        for group in groups:
            if len(group) == 5:
                result.append(ClassicalCipherTool._BACON_ALPHABET.get(group, "?"))
            else:
                result.append("?")
        return "".join(result)

    # ------------------------------------------------------------------
    # Pigpen Cipher
    # ------------------------------------------------------------------

    @staticmethod
    def pigpen_hint() -> str:
        """
        Return a printable ASCII-art representation of the Pigpen cipher key.

        The hint shows both the basic grid (A–I, J–R) and the dotted grid
        (S–Z) plus the X variant.

        Returns
        -------
        str
            Multi-line ASCII string.
        """
        return r"""
Pigpen Cipher Key
=================

Grid 1 (A–I, no dot):        Grid 2 (J–R, with dot):
 ___________                  ___________
| A | B | C |                | J·| K·| L·|
|___|___|___|                |___|___|___|
| D | E | F |                | M·| N·| O·|
|___|___|___|                |___|___|___|
| G | H | I |                | P·| Q·| R·|
|___|___|___|                |___|___|___|

X Grid 1 (S–V, no dot):      X Grid 2 (W–Z, with dot):
   S         T                   W·        X·
    \   |   /                     \   |   /
     \  |  /                       \  |  /
  ----\ | /----               ----\ | /----
      /|\                         /|\
     / | \                       / | \
    /  |  \                     /  |  \
   U         V                  Y·        Z·

Letter shapes are formed by the segments of the enclosing box/X.
A dot in the shape distinguishes Grid 2 / X Grid 2 from their pairs.
"""
