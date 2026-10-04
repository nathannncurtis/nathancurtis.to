---
title: "45 GB Free and a 3 MB Allocation Fails: Commit Charge on Windows"
date: "October 2026"
readTime: "9 min"
tags: ["Python", "Windows", "Memory"]
---

At the office one 64 GB Windows box does most of the document work. It runs the queue workers that render and OCR incoming PDFs, an older folder-watcher app that converts PDFs to JPEG and TIFF, and a handful of small Python services. On September 8 the queue workers started failing with `MemoryError` and `BrokenProcessPool: A child process terminated abruptly, the process pool is not usable anymore`.

I opened Task Manager on the box and memory was at 30%. A probe that calls `GlobalMemoryStatusEx` agreed about the RAM:

```
total_phys  = 63.7 GiB
avail_phys  = 44.6 GiB
memory_load = 29%
commit_total= 179.9 GiB  commit_avail=0.9 GiB
```

The last line is the one that mattered. `commit_total` is the commit limit and `commit_avail` is how much of it is left.

## What commit charge is

The percentage on Task Manager's memory graph is physical RAM in use. Whether an allocation succeeds depends on a different number, labelled "Committed" further down the same page.

Commit charge is Windows' count of memory it has promised to processes. Private memory is charged against a system-wide limit when a process commits it, whether or not the process ever touches it again. The limit is RAM plus the pagefile. On this box that came to 179.9 GB: 63.7 GB of RAM and a pagefile Windows had grown to about 116 GB. Three weeks earlier the same probe had read 127.7. Windows doesn't overcommit, so when the charge reaches the limit the next request fails, however much RAM is sitting idle.

A process's working set is the part of its memory that is in RAM right now. An idle process can have its working set trimmed to almost nothing and still hold every byte of its commit. So a box can be 70% free and unable to hand out 3 MB.

## The first diagnosis, and the sweep

There were 214 `python.exe` processes holding 165.7 GB of private memory. Grouped by start time they went back to August 28, the last boot. Of the five I sampled, four had no living parent. The queue workers use a `ProcessPoolExecutor` for page rendering, so the first read was that these were render-pool children left behind every time a worker was restarted.

The plan was to stop the ones whose parent was dead. The cleanup that actually ran went further and stopped every `python.exe` that wasn't listening on a socket.

```
killed: 196
commit_total= 179.1 GiB  commit_avail=84.3 GiB
```

That was wrong for two reasons. The box runs several unrelated programs that all show up as `python.exe`, and an image name plus "not a listener" doesn't identify any of them. It took down things that had nothing to do with the problem.

It also destroyed the evidence. The 196 were gone before anything had read their command lines, so I still can't say what most of them were. What I could do was look at what came back. Once everything had restarted I grouped the Python processes by parent, with commit and whether each one sat inside a Job Object. Each queue worker had 8 render children at 0.8 to 1 GB apiece, all inside a job. The watcher app's UI, ten minutes after it restarted, already had 49 children holding 65.1 GB, none of them in a job.

## The watcher app

The watcher app starts two long-lived processes per user profile, one for JPEG and one for TIFF. With 20 profiles that is 40 watchers by design. A few minutes after that probe there were 43 running, because some folders had picked up a second watcher. Per watcher, with the thread, start time and folder columns trimmed:

```
watchers=43 commitGB=60.5 rssGB=14.4
commitGB=14.28  rssGB=6.96   cpu_s=939   jpeg
commitGB=14.28  rssGB=4.94   cpu_s=943   jpeg
commitGB=0.78   rssGB=0.06   cpu_s=0     tiff
commitGB=0.78   rssGB=0.06   cpu_s=0     jpeg
```

The other 39 rows match the last two. A watcher that has done no work at all holds 0.78 GB of commit with 0.06 GB of it in RAM. The two at the top were mid-job. The one whose log I read was working through a 3,592-page PDF.

Two things were wrong with how these processes lived.

The UI only stopped watchers it was tracking in its own session, and it didn't put them in a Job Object. A watcher it lost track of, or one left over from a UI that had been killed, kept running against the same folder. I don't have a count of how many had piled up by the 8th. The sweep took that with it.

And a folder job ran inside the watcher, which never exits. Each chunk holds 250 rendered pages in memory, and the two busy watchers were at 14.28 GB each. I never measured one after its job finished, so I don't have a number for how much of that it kept.

There was also this, in the watcher's own cleanup code:

```python
# More aggressive memory cleanup on Windows
if platform.system() == 'Windows':
    try:
        import ctypes
        ctypes.windll.kernel32.SetProcessWorkingSetSize(-1, -1)
    except Exception as e:
        logging.warning(f"Error freeing memory on Windows: {str(e)}")
```

It went in during mid-2025 as memory cleanup. `SetProcessWorkingSetSize` is aimed at the working set, which is the number Task Manager graphs. It doesn't touch commit. The watcher's one Windows-specific cleanup step was pointed at the number that already looked fine.

I did ask about just making the pagefile bigger. Nothing put a ceiling on how many watchers could pile up, so a larger pagefile would have moved the limit out and the same failure would have arrived later.

The fix was about process lifetime and left the rendering code alone. The UI now puts each watcher in a kill-on-close Job Object and keeps the handle, so the watchers die when the UI does. Before spawning a watcher it stops any earlier one on the same folder, matched on the full command line. And a folder job no longer runs inside the watcher. The watcher spawns a child for it (logging and error handling trimmed):

```python
cmd = [
    sys.executable,
    os.path.abspath(script_path),
    f"--watch-dir={args.watch_dir}",
    f"--output-dir={args.output_dir}",
    f"--max-workers={args.max_workers}",
    f"--dpi={getattr(args, 'dpi', 200)}",
    f"{ONE_FOLDER_FLAG}={folder_path}",
]
with _folder_lock(folder_path):
    proc = subprocess.run(cmd, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
```

When the child exits, the OS takes back everything the job allocated. After the UI restart there were 40 watchers on 40 folders, 40 of 40 inside a job, each at the 0.78 GB baseline for 31.2 GB total.

## Eight days later it was the render pools

On September 16 an order failed in OCR twice in a row. The OCR worker exited with 3221226505, which is 0xC0000409, the code a Windows process leaves behind when it aborts. Its stderr:

```
memory allocation of 54400000 bytes failed
memory allocation of 3090000 bytes failed
```

RAM was fine again: 45.0 GB available of 63.7. This time I listed processes by private bytes next to working set before touching anything:

```
1129 MB priv      1 MB ws  pid  66552  python.exe  ... spawn_main(parent_pid=39984, pipe_handle=10176) --multiprocessing-fork
1128 MB priv      1 MB ws  pid  64656  python.exe  ... spawn_main(parent_pid=39984, pipe_handle=6784) --multiprocessing-fork
```

A `multiprocessing` spawn child carries its parent's PID in its own command line, so a census by dead parent is a few lines of psutil:

```
live render children (parent alive): 16
orphaned render children (parent dead): 118, holding 111.0 GB private
```

Fifteen dead queue workers had each left their render pool behind. That is what the first read on the 8th had described, and this time every process had a command line to show it.

Two of those workers were ones the probe on the 8th had shown with all their children inside a Job Object. In the post about hardening four Windows apps I wrote that Job Objects can't be bypassed by a hard kill. These children were in one and outlived their worker anyway, and I haven't pinned down why.

So the children now look after themselves. The pool gets an initializer:

```python
_render_process_pool = ProcessPoolExecutor(
    max_workers=target_size,
    max_tasks_per_child=_render_process_max_tasks_per_child(),
    initializer=watch_parent,
    initargs=(os.getpid(),),
)
```

`watch_parent` starts a daemon thread in each child that opens a handle to the parent process and waits on it:

```python
handle = kernel32.OpenProcess(SYNCHRONIZE, False, ppid)
...
kernel32.WaitForSingleObject(handle, INFINITE)
```

When the wait returns, the parent is gone, however it died, and the thread calls `os._exit(0)`.

Behind that is a reaper that runs at worker startup, for children spawned before the fix and for the day the watchdog doesn't fire. It needs two facts before it terminates anything:

```python
parent = int(m.group(1))
if alive(parent):
    continue
if not (log_dir / f"worker_{parent}.log").is_file():
    continue
out.append((int(p.pid), parent))
```

The parent PID from the child's command line has to be dead, and a `worker_<pid>.log` for that PID has to exist in the queue's log directory, which proves the parent was one of our workers. A dead parent on its own isn't enough on a box that runs other people's Python. The second condition is there because of the sweep.

The launcher also prints whether its Job Object attached, every time, because on the 16th nothing in the logs could tell me.

## What I look at now

When an allocation fails on Windows, I read Committed before I read the graph, and per process I sort by private bytes. Working set is the column that told me a 1.1 GB process was using 1 MB.

Terminating the 118 orphans gave back the 111.0 GB they were holding. Available RAM read 47.0 GB afterwards. Before, it had been 45.0.
