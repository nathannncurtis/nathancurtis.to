---
title: "Two Ways to List a Disk: the MFT Journal vs NtQueryDirectoryFile"
date: "June 2026"
readTime: "6 min"
tags: ["C++", "Windows Internals", "Concurrency"]
---

Canopy is a WinDirStat clone I've been building: a disk space analyzer with a squarified treemap and a WPF front end, backed by a C++ scan engine. The interesting part isn't the UI. It's that the engine has two completely different ways of listing a directory tree, picked at runtime, and building the second one exposed a bug in the first one that had been sitting there for nine minutes before I caught it.

## The fork in the road

`scanner_router.cpp` decides how to walk a path before any walking happens:

```cpp
if (path[0] == L'\\' && path[1] == L'\\') {
    thread_proc = DirScanThread;
} else if (RouterIsNtfs(path) && RouterIsElevated()) {
    thread_proc = MftScanThread;
} else {
    thread_proc = DirScanThread;
}
```

UNC paths (`\\server\share`) always go to the directory scanner, because there's no local MFT to read on a remote share. A local NTFS volume gets the MFT scanner, but only if the process is elevated (`RouterIsElevated()` checks `TokenElevation` via `GetTokenInformation`), since `FSCTL_ENUM_USN_DATA` requires admin rights. Everything else, including non-NTFS volumes, falls back to the same directory walker. Canopy's README calls this out directly: "falls back to directory scan without elevation."

## The fast path: reading the journal instead of the tree

The MFT scanner never opens a single file or calls a single `FindNextFile`. It opens the volume itself (`\\.\C:`), queries `FSCTL_QUERY_USN_JOURNAL` to get the journal's `MaxUsn`, then calls `FSCTL_ENUM_USN_DATA` in a loop with a 64 KB buffer, walking every `USN_RECORD_V2` on the volume regardless of directory structure. Each record has a `FileReferenceNumber` and a `ParentFileReferenceNumber`, but no path and no directory nesting. Reconstructing the tree takes two passes: the first pass allocates a node per record and stashes the parent FRN temporarily inside the node's `size` field (a comment marks it: "we'll fix it in the second pass"), the second pass looks up each parent FRN in an `unordered_map<DWORDLONG, uint32_t>` and links the node into its parent's child list.

What the journal doesn't give you is a file size. `USN_RECORD_V2` just doesn't carry one. My first version of `mft_scanner.cpp` wrote `node->size = 0` with a comment saying so, and left it there. It compiled, it ran, and it produced a tree with every file reporting zero bytes.

## The directory-walker fallback

`dir_scanner.cpp` is the classic approach, but parallelized: it calls `NtQueryDirectoryFile` directly out of `ntdll.dll` instead of the documented `FindFirstFile`/`FindNextFile` pair, and fans the walk out across a Windows thread pool (`CreateThreadpool`, capped at `min(32, processors * 4)` threads). Each directory becomes a `DirWorkItem` on a shared queue; a worker callback pops one, lists it, and pushes any subdirectories back onto the same queue for another worker to pick up. Unlike the MFT scanner, this path gets real sizes for free: `FILE_DIRECTORY_INFORMATION` includes `AllocationSize` per entry.

## The bug the review caught

Nine minutes after I committed the two scanners, I went back through the diff before moving on and found a data race in the directory walker. `NodePool`, the arena allocator both scanners write nodes into, says right in its header comment: "Not thread-safe; callers must synchronize." The directory scanner's critical section (`state->cs`) only protected the pending-path queue. The actual `AllocNode()`, `AppendName()`, and the write that links a new node into its parent's `first_child` chain all happened outside the lock, from up to 32 threads at once. There was even a comment defending it: "Single atomic link -- no extra lock needed; each thread owns its parent slot." That's false whenever two children share a parent, which is every sibling in every directory with more than one entry.

The fix moves the `AllocNode`/`AppendName`/field-write/link sequence inside the critical section, and builds the child path string *before* taking the lock, so the lock only guards the pool and the queue, not a `std::wstring` heap allocation:

```cpp
uint32_t idx = UINT32_MAX;
{
    EnterCriticalSection(&state->cs);
    if (!ctx->pool.Full()) {
        idx = ctx->pool.AllocNode();
        // ...node writes and parent link, still under the lock...
    }
    LeaveCriticalSection(&state->cs);
}
```

The same review pass fixed the zero-size problem in the MFT scanner: a third pass over every non-directory node, opening it by its FRN with `OpenFileById` against a handle to the volume root, then calling `GetFileInformationByHandleEx(FileStandardInfo)` to read the real `AllocationSize`. It also caught that `Smon_GetResult` called `RollupSizes` unconditionally, meaning a second call to the API would add every node's size into its parent a second time; the fix was a one-line `rolled_up` boolean on the scan context. And `NodePool::AllocNode` didn't check whether its 256 MB `VirtualAlloc` reservation had actually succeeded before writing through the pointer.

Four bugs, all in code I'd written the same afternoon, none of which showed up until I reread the diff with the assumption that something in it was wrong. The commit that introduced the race is `8955c1b`. The commit that fixed it, nine minutes later by the timestamps, is `8724218`.
