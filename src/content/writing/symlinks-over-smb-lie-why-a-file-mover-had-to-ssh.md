---
title: "Symlinks Over SMB Lie: Why a File Mover Had to SSH Into the NAS"
date: "March 2026"
readTime: "5 min"
tags: ["Python", "Networking", "Automation"]
---

At the office we have a nightly script that sorts completed work order folders out of six busy network shares into `_COMPLETED` archive folders, keyed off a work order number pattern like `123456-01` (sometimes with an `OPP` prefix, sometimes a facility code like `A3` instead of two digits). It checks each folder's work order against an invoicing database and, if the order's been billed, moves the folder into a dated subfolder: `2026/03 March 2026`. Six locations, one loop, `shutil.move` doing the actual work.

Five of those locations are plain Windows folders. The sixth lives on a NAS and stores its mail-intake entries as symlinks pointing at the real files elsewhere on the box. I didn't know that when I wrote the mover. I found out because that one location was slow in a way the others weren't, and disk usage on the source share wasn't shrinking the way I expected after a "move."

## What was actually happening

`shutil.move` on a symlink doesn't move the link. Over SMB, Python (and Windows itself) follows the link, reads the entire target through the network share, writes a full copy at the destination, and then deletes the original. A move that should be a one-line metadata update on the NAS's own filesystem was crossing the network twice: once to read, once to write. For a folder of loose files that's slow. For anything with real size behind the symlink, it's a lot of wasted I/O for what amounts to a rename.

The fix isn't clever once you see the actual problem: don't move symlinks over SMB at all. SSH into the NAS and run `mv` on its own filesystem, where a symlink move really is just a rename.

## Routing by transport

I added a fourth field to each location's config tuple, `move_via`, so each of the six locations can say how it wants to be moved:

```python
LOCATIONS = [
    (r"\\SHARE1\...", r"\\SHARE1\..._COMPLETED", "dirs",  "smb"),
    (r"\\SHARE2\...", r"\\SHARE2\...(COMPLETED)", "both",  "smb"),
    (r"\\MAILSHARE\...", r"\\MAILSHARE\...COMPLETED", "both",  "ssh"),
    # ... three more, all "smb"
]
```

The NAS only knows its own local paths, not the Windows UNC path the rest of the script uses, so I needed a translation layer:

```python
SMB_TO_NAS = {
    r"\\MAILSHARE\mail": "/share/CACHEDEV3_DATA/Mail",
}

def _smb_to_nas(smb_path: str) -> str:
    for prefix, nas_prefix in SMB_TO_NAS.items():
        if smb_path.lower().startswith(prefix.lower()):
            rest = smb_path[len(prefix):].replace("\\", "/")
            return nas_prefix + rest
    raise ValueError(f"No NAS mapping for {smb_path}")
```

`nas_move_item` uses that mapping to convert both the source and destination into NAS-local paths, then runs one SSH command that does `mkdir -p`, clears any conflicting destination, and calls `mv`:

```python
def nas_move_item(source_smb, dest_root_smb, dry_run=False):
    nas_src = _smb_to_nas(source_smb)
    nas_dest_root = _smb_to_nas(dest_root_smb)
    nas_dest = nas_dest_root + "/" + os.path.basename(source_smb)
    cmd = (
        f'mkdir -p "{nas_dest_root}" && '
        f'rm -rf "{nas_dest}" 2>/dev/null; '
        f'mv "{nas_src}" "{nas_dest}"'
    )
    result = _nas_ssh(cmd)
    if result.returncode != 0:
        raise OSError(f"SSH move failed: {result.stderr.strip()}")
```

`_nas_ssh` is a thin `subprocess.run` wrapper around the `ssh` CLI with a key file, a 30-second timeout, and `StrictHostKeyChecking=no` since it only ever talks to one known host.

## Splitting the job queues

Before this, `full_scan` and `restructure` built one flat list of `(source, dest)` moves and handed all of it to an 8-thread pool, since the moves are network I/O bound and parallelize well over SMB. SSH moves don't need that: they're metadata operations on the NAS itself, already fast, and firing eight of them at once just serializes on the NAS's own SSH daemon anyway. So I split the queue in two, `ssh_jobs` and `smb_jobs`, and run the SSH jobs sequentially first, then hand the SMB jobs to the existing thread pool. Same pattern in `daily_clean`: each per-location entry now carries its `move_via` flag through to the point where it decides which move function to call.

I also had to fix `_nuke`, the helper that clears a destination before overwriting it. It used to check `os.path.exists()` before deciding whether to `os.remove()` or `shutil.rmtree()`, but SMB doesn't always report reparse points and symlinks truthfully through `exists()`. Now it tries `os.remove()` first regardless (works for files, symlinks, and reparse points), falls back to `rmtree()` on a `PermissionError`, and retries three times with a short sleep between attempts if the network share is being slow to release a handle.

## The number that mattered

The whole change was 163 insertions and 46 deletions in one file. Nothing about the invoicing logic changed, nothing about the matching pattern changed. The only thing that changed is which process does the `mv`: Windows reading through a symlink over the wire, or the NAS doing it locally in a single syscall. One of those is instant. The other one was quietly copying a NAS's worth of mail folders across the network every night and I hadn't noticed until the timing looked wrong.
