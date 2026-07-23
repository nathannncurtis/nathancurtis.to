---
title: "Reimplementing .NET's Deprecated PasswordDeriveBytes KDF in Go"
date: "April 2026"
readTime: "5 min"
tags: ["Go", "Cryptography", "Reverse Engineering"]
---

Patients leave the office with a CD. The disc holds their imaging study and a bundled viewer so they can look at it on any Windows machine without installing anything. In practice the bundled viewer is the weak link: it does a license/media check on startup, and that check fails constantly the moment the disc has been copied to a hard drive or handed to a second machine, which is the exact situation most patients are in. The fix wasn't to prop up someone else's viewer. It was to skip it and decrypt the disc's payload directly into plain DICOM files that any real viewer (MicroDicom, RadiAnt, Weasis) can open. That meant reverse-engineering the disc's encryption with no source code for the program that produced it.

## What the bytes turned out to be

The disc layout is `DICOMDIR.enc`, `hash.bin`, and a `DICOM\` folder full of `.enc` files. Nothing in the file names says what the cipher is. Getting there took poking at the vendor's viewer with a decompiler and matching what it did against the file layout: AES-256-CBC, PKCS#7 padding, a fixed 16-byte IV, and a key derived from a password using .NET's `System.Security.Cryptography.PasswordDeriveBytes` with a hardcoded salt, the literal ASCII string `s@1tValue`. The password itself isn't stored anywhere on the disc. It's supplied by whoever opens it, and it's the patient's own date of birth.

`hash.bin` is how the original viewer (and now this tool) knows the password worked before touching the rest of the disc: it's a SHA-1 or MD5 digest of the *decrypted* `DICOMDIR`, computed once and shipped alongside the ciphertext.

## PasswordDeriveBytes is not what you think

`PasswordDeriveBytes` sounds like PBKDF2. It isn't. Microsoft marked it obsolete years ago, and for good reason: it's really PBKDF1 with an undocumented extension bolted on so it can produce more output bytes than the underlying hash naturally gives you. There's no public spec for the extension, just Microsoft's own implementation, which meant reproducing it in Go without any reference beyond behavior:

```go
func passwordDeriveBytes(password, salt []byte, newHash func() hash.Hash, iterations, length int) []byte {
	h := newHash()
	h.Write(password)
	h.Write(salt)
	base := h.Sum(nil)

	for i := 1; i < iterations-1; i++ {
		h.Reset()
		h.Write(base)
		base = h.Sum(nil)
	}

	out := make([]byte, 0, length+h.Size())
	h.Reset()
	h.Write(base)
	out = append(out, h.Sum(nil)...)

	for n := 1; len(out) < length; n++ {
		h.Reset()
		h.Write([]byte(strconv.Itoa(n)))
		h.Write(base)
		out = append(out, h.Sum(nil)...)
	}
	return out[:length]
}
```

The first hash chunk is just `HASH(HASH(password || salt))`. Every chunk after that prepends the ASCII decimal digits of a counter, `"1"`, `"2"`, `"3"`, ahead of that same base hash and hashes again. It's a strange scheme once you see it written out, and there's no way to know you've gotten it right just by reading the code. You need a real `PasswordDeriveBytes` output to check against.

So I got one. I wrote a small .NET snippet to call the real class with a known password, salt, hash name, and iteration count, and captured its output as a fixed hex string. That became the entire correctness bar for the Go port:

```go
// want is the hex output of .NET's real PasswordDeriveBytes for this same
// password, salt, hash, and iteration count, captured once from a small
// C# harness and pasted in as a literal.
func TestPasswordDeriveBytes_NetReferenceVector(t *testing.T) {
	got := hexLower(passwordDeriveBytes([]byte(password), fixedSalt, sha1.New, 2, 32))
	if got != want {
		t.Fatalf("PasswordDeriveBytes mismatch:\n got  %s\n want %s", got, want)
	}
}
```

One test, one pinned byte string. If a future refactor of that function changes so much as the loop bounds, the test catches it before it turns into a disc full of files that fail to decrypt.

## Two variants, one hash check

The viewer actually ships two code paths, presumably from an older version that never got fully retired: a FIPS-compliant one (`AesCryptoServiceProvider`, SHA-1 for both the KDF and the verify hash) and a legacy one (`RijndaelManaged`, MD5 for both). The disc doesn't say which one it needs. The tool tries FIPS first, and if the decrypted `DICOMDIR` doesn't hash to what's in `hash.bin`, it falls back to legacy and tries again. A wrong password shows up as either a PKCS#7 padding failure or a hash mismatch, both handled the same way: try the next candidate.

Since the password is a date of birth, and people type dates in whatever order feels natural to them, one typed guess gets expanded into several candidates before any of them touch the disc: the digits reversed (`MMDDYYYY` vs `YYYYMMDD`), and dashed and slashed variants of both. All of it runs against both KDF variants until one clears the hash check.

## What it comes down to

There's no vendor documentation for any of this: not the disc layout, not the cipher choice, not the KDF, not the fixed IV and salt that make the whole scheme weaker than it needed to be. Everything here came from a decompiler, a hex editor on `hash.bin`, and one deliberately generated reference vector from the real .NET class to pin the Go port against. `crypto.go` is 145 lines. `crypto_test.go`, the thing that makes any of it trustworthy, is 26.
