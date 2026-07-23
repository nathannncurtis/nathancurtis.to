---
title: "Embedding an .exe Icon With Nothing But ctypes"
date: "February 2026"
readTime: "6 min"
tags: ["Python", "Windows", "ctypes"]
---

Coil is my Python-to-executable compiler: point it at a project directory and it builds a portable .exe or a bundled directory, no PyInstaller spec files, no hook scripts. By late February it already handled VERSIONINFO stamping and per-entry PE subsystem control (console vs. GUI), so the exe Task Manager shows is named after your app instead of "Python." The one thing still missing was an icon. A compiled tool that ships with the default blank-page Python icon looks unfinished, so I sat down to fix that.

The obvious move is to shell out to a resource compiler, but Coil's whole pitch is zero external dependencies beyond the embeddable Python runtime it bundles. So the icon had to go in with what's already on the machine: Python's stdlib and the Windows API via `ctypes`. No `rc.exe`, no `windres`.

## What actually has to happen

An .ico file on disk is one format. The icon resource inside a PE executable is a different, related format. A `.ico` is an `ICONDIR` header followed by `ICONDIRENTRY` structs, one per image size, each pointing at a raw bitmap blob. A PE resource section wants two separate resource types: one `RT_ICON` entry per image, holding the raw bitmap, and one `RT_GROUP_ICON` entry that's basically the same ICONDIR table but with each entry's file offset replaced by the numeric resource ID of the matching `RT_ICON`. Windows uses the group entry to pick the right size at render time and then looks up the actual bits by ID.

So the plan was: parse the .ico by hand with `struct.unpack`, split it into its constituent images, write each one in as its own resource, then reassemble a matching group directory pointing at them.

```python
reserved, ico_type, count = struct.unpack_from("<HHH", ico_data, 0)
if ico_type != 1 or count == 0:
    raise ValueError("Not a valid .ico file")

for i in range(count):
    offset = 6 + i * 16
    width, height, colors, res, planes, bits, size, img_offset = (
        struct.unpack_from("<BBBBHHII", ico_data, offset)
    )
```

Each `ICONDIRENTRY` is 16 bytes: width, height, color count, a reserved byte, planes, bit depth, the image's byte size, and its offset into the file. That's the whole format, and it's small enough to unpack by hand without pulling in Pillow or any other imaging library.

## The Windows side

Updating a PE's resources is a three-call sequence: `BeginUpdateResourceW` opens the exe for resource editing and hands back a handle, `UpdateResourceW` writes one resource at a time against that handle, and `EndUpdateResourceW` commits (or discards) everything. All three live in `kernel32.dll` and none of them ship a Python wrapper, so it's raw `ctypes.windll.kernel32` calls with explicit `argtypes`/`restype` on each one:

```python
kernel32.UpdateResourceW.argtypes = [
    ctypes.c_void_p,  # hUpdate
    ctypes.c_void_p,  # lpType (MAKEINTRESOURCE)
    ctypes.c_void_p,  # lpName (MAKEINTRESOURCE)
    ctypes.c_ushort,  # wLanguage
    ctypes.c_void_p,  # lpData
    ctypes.c_ulong,   # cb
]
```

For each parsed image, I slice the raw bitmap bytes out of the .ico buffer, wrap them in a `ctypes.create_string_buffer`, and call `UpdateResourceW` with `RT_ICON` (3) as the type and a 1-based index as the resource ID. Then I build the `RT_GROUP_ICON` (14) entry by re-packing the same header and entry fields, but swapping the file offset field for the `nID` that points back at the matching `RT_ICON` resource:

```python
grp_data = struct.pack("<HHH", 0, 1, count)
for i, entry in enumerate(entries):
    grp_data += struct.pack(
        "<BBBBHHIH",
        entry["width"], entry["height"], entry["colors"],
        entry["reserved"], entry["planes"], entry["bits"],
        entry["size"], i + 1,  # nID references the RT_ICON resource ID
    )
```

Notice the format string changes from `<BBBBHHII` to `<BBBBHHIH` at the end: the file-format entry ends in a 4-byte offset, the resource-group entry ends in a 2-byte ID. Getting that field width wrong is the kind of bug that doesn't crash, it just silently corrupts the pairing between the group directory and its icons, so I want it visible in the diff, not buried behind a shared struct format.

Failure handling matters here because `BeginUpdateResourceW` locks the file for the duration: if anything raises between begin and end, the `except` clause calls `EndUpdateResourceW(handle, True)`, where the `True` (`fDiscard`) tells Windows to throw away the pending changes and unlock the exe rather than leave it half-written.

## Wiring it into the build

The CLI change is small: if `--icon` isn't passed, Coil globs the project directory for `*.ico`, prefers one whose filename matches the app name, and falls back to the first alphabetically. The packager then calls `set_exe_icon` against the built exe in both portable and bundled modes, wrapped in a try/except that prints a warning and moves on rather than failing the whole build over a cosmetic icon.

I wrote the tests before I had Windows API access nailed down, which forced a decision: `test_set_exe_icon_calls_windows_api` and `test_set_exe_icon_multi_image` mock out `ctypes.windll.kernel32` entirely and assert on call counts, `BeginUpdateResourceW` called once, `UpdateResourceW` called once per image plus one for the group, `EndUpdateResourceW` called with `False` (commit) on the happy path. The three .ico-parsing tests, missing file, invalid type byte, truncated header, run on any platform since they never touch the Windows API at all. A hand-rolled binary format parser is exactly the kind of code where "looks right" and "is right" diverge, and building a `_make_ico` helper that constructs a real minimal .ico byte-for-byte was worth the 103 lines that landed in `test_platforms.py`.

The result: `coil build ./myproject` now finds `myproject.ico` on its own, and the exe that comes out the other end shows that icon in Explorer and the taskbar, with zero new dependencies and zero calls to an external resource compiler.
