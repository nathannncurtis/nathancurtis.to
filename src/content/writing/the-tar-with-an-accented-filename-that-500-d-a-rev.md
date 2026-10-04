---
title: "The Tar With an Accented Filename That 500'd a Review Page Forever"
date: "October 2026"
readTime: "8 min"
tags: ["Python", "Unicode", "JSON", "Testing"]
---

The upload portal I'm building for the office quarantines any file it doesn't trust. Nobody downloads or opens a quarantined file. A sandboxed container renders it to page images and writes a `manifest.json` describing what it found (a kind, a page count, and for archives a list of member names and sizes), and an admin reviews the images on a detail page before releasing or deleting the file.

The manifest is written inside the sandbox from a file already judged hostile, so the portal treats every value in it as attacker-controlled. The pull request that hardened the renderer went through review in rounds, and by the sixth round each value had a coercion helper. The page count was clamped to 500 after `1e999` and `10**30` each crash-looped the render job. The member list was bounded after a size of `10**400` turned the review page into a 500. The read caught `RecursionError`. Every helper checked type, range or length, and none of them checked whether a string could be encoded.

## The bug

The container lists tar members with Python's `tarfile`:

```python
with tarfile.open(path) as tf:
    for info in tf:
        ...
        members.append({
            "name": info.name,
            "size": info.size,
            "kind": member_kind(info.name),
        })
```

`tarfile` decodes member names with `errors='surrogateescape'` by default, so a name that isn't valid UTF-8 doesn't raise. Each undecodable byte becomes a lone surrogate code point so the original bytes can be recovered later. A file named `café.pdf` and archived on a Latin-1 system is stored as `b"caf\xe9.pdf"`, and comes out of `tarfile` as `'caf\udce9.pdf'`.

That's a legal Python `str` with the right type and a sensible length, and it can't be encoded as UTF-8.

The container then writes the manifest with `json.dump`, whose default is `ensure_ascii=True`, so the surrogate lands on disk as the six ASCII characters `\udce9`. The file is plain ASCII. It's under the size cap, it parses, the top level is an object, and `json.load` hands the lone surrogate straight back. `_manifest_text` saw a `str` under the length cap and passed it on to the template.

Jinja rendered it into a `<td>` without complaint. Then Starlette encoded the finished body:

```
UnicodeEncodeError: 'utf-8' codec can't encode character '\ud800' in position 3953
```

(That line is from the review's proof of concept, which planted `\ud800` in a manifest by hand. The tar path produces `\udce9`, and the review confirmed it fails the same way. I just don't have that traceback saved.)

The exception is raised after the template has run, while the response is being encoded, so nothing in the route handler sees it. Every view of that file's detail page returns 500 from then on.

## Why nothing noticed

The manifest for that tar is healthy by every measure the pipeline has: a kind, a page count, no error. The render job doesn't retry and doesn't escalate. The queue list shows the row normally, with a thumbnail if any member rendered. The one page that can't load is the one that shows the rendered pages.

The queue list does carry its own Release and Delete buttons for a superadmin, so the file isn't stuck. But whoever clicks one is deciding blind, on a file that was quarantined so somebody would look at it first.

It doesn't take an attacker. The review round that found this had planted `"\ud800"` in a manifest by hand, and then pointed out that the tar lister produces a surrogate on its own, because Latin-1, CP1252 and Shift-JIS filenames in tar archives are routine. The zip branch is safe by accident: `zipfile` decodes names as cp437, or raises into an `except Exception`.

## The fix

One function, called from every helper that produces text:

```python
_CONTROL_TO_SPACE = {c: " " for c in range(0x20)}
_CONTROL_TO_SPACE[0x7F] = " "

def safe_text(s: str) -> str:
    return s.encode("utf-8", "replace").decode("utf-8").translate(_CONTROL_TO_SPACE)
```

`errors='replace'` maps one code point to one `?`, so the length cap applied afterwards still counts what it says it counts, and running it twice is a no-op. The admin sees `caf?.pdf`. I replaced instead of rejecting because the member list is what the admin triages from, and `caf?.pdf` tells them more than an empty cell.

There are two of those helpers. One feeds the template. The other feeds the pipeline, where the same review had planted a lone surrogate in the manifest's `error` field and crashed the render job on the SQLite bind, since `sqlite3` encodes text parameters as UTF-8. The audit row and the escalation email take the same string after that.

The control-character table came along in the same change. A newline in a manifest value could forge a line in the escalation email, which writes one field per line and puts this value last.

A later round added a test that builds a real tar with the Latin-1 name and asserts the lister emits `'caf\udce9.pdf'`. Three other test modules hardcode `chr(0xDCE9)` and describe it as what `tarfile` produces. Without that test, a later change to the lister would leave all three passing against a value the app could no longer receive.

## The write side had the same gap

The same round found a second value that was well-shaped and unusable. The round before had made `read_manifest` catch `RecursionError`, and I'd written down that no separate nesting limit was needed. That was true for the read.

On a timeout, the portal rebuilds a manifest from the one the container left behind and carries the raw `kind` into it. It wrote that with `json.dump(obj, f)`, the file variant, which runs json's pure-Python encoder at one Python frame per nesting level. On my machine that gives out around depth 997. The C scanner that had just parsed the same value reaches 2997. Anything nested between those two parses cleanly and then blows up on the way back out:

```
depth 1200: *** render_quarantined RAISED RecursionError -- 'Never raises' contract broken
            job_render_quarantine RAISED RecursionError -> job failure -> 8 retries at up to 330 s each
            manifest.json left on disk: 1002 bytes, TRUNCATED/INVALID (JSONDecodeError)
```

That manifest was 2.4 KB. It's left truncated because `O_TRUNC` has already fired and the encoder writes as it goes. I fixed it by coercing every field through the manifest schema before serialising, instead of widening the `except`. Three scalars reach the encoder now, and a key with no rule is dropped.

## The tests only passed on Windows

Two rounds later the review found that the three tests covering `except RecursionError` had been red on CI since they were written. They planted a manifest 4000 levels deep and asserted it was refused. On my Windows dev box it was. The pull request description said "343 passing", which was the dev box's number, and nobody had looked at CI.

The C scanner doesn't spend the Python frame budget, and `sys.setrecursionlimit()` doesn't move it. It spends a C recursion budget seeded from a compile-time constant. In CPython 3.12.10:

```c
#  elif defined(_WIN32)
#    define C_RECURSION_LIMIT 3000
#  elif defined(_Py_ADDRESS_SANITIZER)
#    define C_RECURSION_LIMIT 4000
#  else
     // This value is duplicated in Lib/test/support/__init__.py
#    define C_RECURSION_LIMIT 10000
```

Depth 4000 is past the limit on Windows and well inside it in the Linux container the app ships in. On the platform that mattered, the guard had no passing coverage at all. Every comment that said "measured on the shipped interpreter" had been measured on a dev box.

The limit also moves with how much C stack is already spent when the parse starts. Same interpreter, same fixture: 2972 at module import under pytest, 2978 inside a test function, 2993 inside a request handler, 2996 at the top level of a script. The request handler runs on a fresh worker thread, which starts with the whole budget.

The tests measure the limit now. A fixture that must be refused is sized past the limit measured on a fresh thread, plus a margin of 64 levels. A fixture that must be accepted measures the limit in the context doing the reading. One more test asserts the fixtures really are past the limit on whatever interpreter is running, and that one would have failed on CI from the start.

The tar lister and the review page had been on main since the end of August. The fix merged on September 15, and the first tagged release was cut on the 17th, so no tagged release has shipped without `safe_text`.
