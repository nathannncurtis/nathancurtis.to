---
title: "Writing A BER Parser From Scratch Because A Vendor's Toolkit Doesn't Speak DER"
date: "May 2026"
readTime: "6 min"
tags: ["Go", "Cryptography", "Reverse Engineering"]
---

## A second disc format shows up

The office has a small Go tool that decrypts encrypted patient discs so anyone can open the images in a normal DICOM viewer, since the viewer that ships on those discs is brittle and fails license checks the moment you copy it off the original media. It already handled one disc format, encrypted with a vendor's non-standard KDF that I'd reverse-engineered by hand. Then a disc showed up from a different vendor's software, using a completely different layout: a `DCSVALID` sentinel file, a `DICOMDIR` that wasn't plaintext, and no `.enc` extensions anywhere.

My first assumption was more of the same: open a hex editor, guess at a cipher, reimplement whatever proprietary nonsense the vendor cooked up. Instead I got lucky. The first bytes of `DICOMDIR` were `30 82 ...`, an ASN.1 SEQUENCE, and a few bytes in sat an OID: `1.2.840.113549.1.7.3`. That's `id-envelopedData`, from RFC 5652, the Cryptographic Message Syntax. No vendor magic. Just standard PKCS#7/CMS, the same structure that shows up in S/MIME and PDF signing.

## Standard, except for one thing

CMS EnvelopedData with a password recipient is documented behavior: RFC 5652 for the envelope, RFC 3211 for the password-based key wrap. The structure on these discs is:

```
RFC 5652 CMS EnvelopedData
  PasswordRecipientInfo
    keyDerivationAlgorithm = PBKDF2-HMAC-SHA1 (per-file 16-byte salt, 1000 iter)
    keyEncryptionAlgorithm = id-alg-PWRI-KEK over AES-256-CBC (per-file IV)
    encryptedKey = RFC 3211 double-CBC wrapped CEK
  encryptedContentInfo
    contentEncryptionAlgorithm = AES-256-CBC (per-file IV)
    encryptedContent = AES-256-CBC(CEK, IV, payload || PKCS#7 pad)
```

Go's `encoding/asn1` should have handled this without a line of custom code. It didn't. The vendor's disc software is built on a .NET library called DicomObjects, and .NET's ASN.1 writer emits BER, not DER. `encoding/asn1` only reads DER: definite lengths, no exceptions. The discs used indefinite-length SEQUENCEs (a length byte of `0x80`, terminated by a trailing `00 00`), and the big `encryptedContent` OCTET STRING was split into a constructed value with several primitive OCTET STRING chunks inside it rather than one contiguous blob. `encoding/asn1` rejects both of those outright.

So I wrote a small BER reader, `ber.go`, about 160 lines. It knows four things: how to read one TLV (tag, length, content) whether the length is definite or indefinite; how to enumerate the children of a constructed value; how to flatten a chunked OCTET STRING back into one slice; and how to read a plain INTEGER. That's it. No bit strings, no UTF8 strings, no DER strictness checks. The comment at the top of the file says it plainly: "Not a general ASN.1 library."

The indefinite-length case is the interesting bit:

```go
if L == 0x80 {
    // Indefinite length: must be constructed; walk children until EOC (00 00).
    if !t.constructed {
        return tlv{}, 0, errors.New("ber: indefinite length on primitive value")
    }
    t.indefinite = true
    start := off
    for off < len(b) {
        if off+1 < len(b) && b[off] == 0 && b[off+1] == 0 {
            t.content = b[start:off]
            return t, off + 2, nil
        }
        _, used, err := readTLV(b[off:])
        if err != nil {
            return tlv{}, 0, fmt.Errorf("ber: walking indefinite-length children: %w", err)
        }
        off += used
    }
    return tlv{}, 0, errors.New("ber: unterminated indefinite-length value")
}
```

It doesn't know how long the value is up front. It has to recursively parse each child TLV just to find where the value ends, watching for the two-byte end-of-contents marker between them.

## Walking down to the actual key

With a BER reader in hand, `crypto_cms.go` walks the tree by hand: `ContentInfo` down to a `[0]` EXPLICIT `EnvelopedData`, past the version INTEGER, into the `recipientInfos` SET looking for a `[3]` IMPLICIT `PasswordRecipientInfo`, then the `keyDerivationAlgorithm` and `keyEncryptionAlgorithm` AlgorithmIdentifiers to pull out the salt, iteration count, and per-file IVs. Every step checks the class and tag number against what CMS defines for that position, and every failure comes back as a specific error rather than a generic parse fault, since I was going to be reading these errors at 2am against a disc that didn't work.

The password unwrap is RFC 3211's double-CBC scheme: encrypt the formatted key once, then encrypt the result again using its own last ciphertext block as the second IV. Undoing it means decrypting from the back to recover the intermediate block, then CBC-decrypting the whole thing with the real IV. The formatted key carries a length byte and three check bytes, the one's complement of the key's first three bytes, so a wrong password is detectable without ever touching the actual image data:

```go
cekLen := int(formatted[0])
if cekLen < 1 || 4+cekLen > len(formatted) {
    return nil, errCMSWrongPassword
}
for j := 0; j < 3; j++ {
    if formatted[1+j] != ^formatted[4+j] {
        return nil, errCMSWrongPassword
    }
}
```

That distinction mattered for the UI: `errCMSWrongPassword` means "try the next password guess," while every other error means "this disc is malformed, stop retrying and say so."

## Keeping the old path untouched

The tool already had one working disc format in production, so the refactor had a hard constraint: nothing about the new format could put the old one at risk. I renamed the existing `disc` struct to `gearDisc` and `openDisc` to `openGearDisc`, added a `discReader` interface with `Variant`, `Count`, and `Decrypt`, and gave both formats a route through it. `disc.go` sniffs the source root in a fixed order: the original format's sentinel files first, so discs that already work keep hitting the exact code path that's been shipping; then the new CMS sentinel or an OID sniff on `DICOMDIR`; then an explicit unknown-format error if neither matches. There is no silent fallback: an unrecognized disc fails loudly instead of guessing.

I tested the new path end to end against a real patient disc, roughly 3,700 files, and it ran in 138 seconds, with every output file starting with the `DICM` magic bytes at offset 128, which is DICOM's own way of confirming the file is well-formed. The existing test suite for the first format, including its pinned reference vector against the vendor's original KDF, still passed untouched. Version went to 0.2.0.

The lesson I keep relearning on this tool: check whether the "proprietary" format is actually a standard wearing a vendor's paint job before reversing anything by hand. This time it was. The only custom code needed was an ASN.1 encoding variant, BER instead of DER, that Go's own standard library had simply chosen not to support.
