---
title: "My Exe Was python.exe in a Costume, So CPython Ate My Flags"
date: "October 2026"
readTime: "8 min"
tags: ["Python", "C", "Windows", "Tooling"]
---

Coil is the Python-to-exe bundler I wrote, and the tools I ship at the office are built with it. In early September I added a small side tool to Study Aggregator: two right-click menu entries that import a folder, drive or zip of DICOM files into a third-party viewer. The registry commands looked like any other Windows verb:

```python
f'"{exe_path}" --import "%1"'
f'"{exe_path}" --clear-import "%1"'
```

The argument parser and the registry strings both had tests, and the change had been through three review passes. I installed the build, right-clicked a folder, and nothing was imported.

## Running the installed exe

I ran the installed exe by hand with a few argument shapes and printed the exit code, how many lines the app's log grew by, and stderr. Trimmed, with the install path shortened:

```
args=[] rc=2 newlog=7 stderr=
args=[--import C:\nope] rc=2 newlog=0 stderr=unknown option --import
  usage: C:\...\tool.exe [option] ... [-c cmd | -m mod | file | -] [arg] ...
  Try `python -h' for more information.
args=[foo] rc=2 newlog=7 stderr=
args=[--import=C:\nope] rc=2 newlog=0 stderr=unknown option --import=C:\nope
  (same usage text)
```

With no arguments the tool starts, writes seven log lines and exits 2 with its own usage error, which is correct. With `--import` it also exits 2, but the log doesn't grow and the usage text on stderr isn't mine. `[-c cmd | -m mod | file | -]` is CPython's usage line with my exe's name in it. My code never ran.

Dropping the dashes got further. `tool.exe import "C:\nope"` started the tool, and the tool logged "No action given". The parser only knew the dashed spellings at that point, so that message was coming either way. The problem underneath was that `main()` parsed `sys.argv[1:]`, and the verb wasn't in that slice. A probe exe built with the published Coil 0.2.4 and run as `main.exe import D:\disc` reports:

```python
sys.argv == ['import', 'D:\\disc']
```

With no arguments it reports `['']`.

## The exe was the interpreter

In bundled mode, the launcher Coil 0.2.x produced was a copy of the interpreter:

```python
source_exe_name = "pythonw.exe" if use_gui else "python.exe"
...
shutil.copy2(source_exe, target_exe)
```

Every bundled exe was `python.exe` or `pythonw.exe` from the embedded runtime, copied, renamed and stamped with an icon. A generated `sitecustomize.py` looked at the exe's name during interpreter startup, found the matching `_boot_<name>.py`, ran it, and called `os._exit` with the result.

That works until the app takes arguments. The process is the interpreter, so the interpreter's command-line parser runs on the user's arguments before any of my code does. `--import` is an unknown interpreter option, so CPython prints its usage and exits 2. A bare word like `import` is, to CPython, the script to run, so it goes into `sys.argv[0]`. The script is never opened, because `sitecustomize` runs the app and exits first, but the slot is taken. No arguments means no script, and `sys.argv` is `['']`, the same as an interactive `python`.

## I had already worked around this twice

On March 17 I committed this to Study Aggregator's main app, with the message "Fix argv parsing for COIL bundled mode":

```python
# Find input path from argv (COIL may put it in argv[0] instead of argv[1])
raw_input_path = None
for arg in sys.argv:
    if os.path.exists(arg):
        raw_input_path = arg
        break
```

It scans every element of `sys.argv` and takes the first one that exists on disk. "COIL may put it in argv[0]" is a strange thing to write about my own compiler and not look into. By September the comment had been trimmed to `# Find input path from argv`, and the loop just looked sloppy.

On April 25, in a tray app at the office, the "Check for Updates" menu item did nothing. The tray spawned `update_checker.exe --manual`, the child exited 2, and no log line was written. Both exes are GUI-subsystem, so the child had no console and no usable stderr, and CPython's "unknown option" went nowhere. I reproduced it with `subprocess.DEVNULL` for stdio and put three cases in the commit message:

```
- bare arg "manual": exits 0, runs main(), shows toast
- flag "--manual":   exits 2 immediately, no log lines emitted
- flag "--foo":      same exit 2 — confirms it's the leading dashes,
                     not the word
```

The next paragraph of that message says "Coil's wrapper (or Python's interpreter init beneath it) treats any argv element starting with `--` as a Python interpreter option." That is the bug, written down in April. I treated it as a quirk of GUI parents with NULL stdio, renamed the flag to `manual`, bumped the app to 1.7.0 and moved on.

So the September fix was the third workaround: bare verbs in the registry commands, and a `command_line_args()` that reads all of `sys.argv`. I committed that the same afternoon. The compiler fix merged about an hour later.

## The native launcher

Coil 0.3.0 replaces the copied interpreter with a small native exe. `launcher.c` loads the bundle's `python3xx.dll` and initialises it through `PyConfig`. The lines that matter:

```c
config.parse_argv = 0;
config.use_environment = 0;
config.site_import = 0;
...
argv[0] = (wchar_t *)identity;
CHECK(config_argv(&config, argc, argv));
...
CHECK(config_string(&config, &config.executable, identity));
...
CHECK(config_string(&config, &config.run_filename, paths->boot));
...
result = run_main(); /* Handles SystemExit, tracebacks, atexit and flushing. */
```

`parse_argv = 0` tells CPython the command line belongs to the application. `sys.argv` is what the process was started with, with the exe's full path in slot zero. `run_main` is `Py_RunMain`, looked up in the DLL at runtime. It replaces the `os._exit` call, so shutdown is normal again. The boot script's name is patched into each launcher, so a renamed exe still runs its own entry instead of guessing from the filename. `PyConfig` isn't part of the stable ABI, so there is one compiled stub per CPython minor version, 3.9 through 3.13, checked into the package. Building an app still needs no C compiler.

The launcher came out of an audit of the published 0.2.4, done by building real exes and running them. It found more than the argv bug. A `multiprocessing.Process` re-entered application startup, reported success, and never ran its worker. `atexit` handlers were skipped. A non-daemon thread never finished. Outside the launcher, a build with `name='../victim'` deleted a sibling directory. The fixes went into one PR: 45 files, 5,747 insertions, 1,509 deletions.

## The fix broke the workaround

The commit message for the launcher change ends with "Breaking for apps that worked around the old launcher: sys.argv[0] is now the executable path." Study Aggregator was one of those apps.

Its main app still had the March loop: take the first element of `sys.argv` that exists on disk. Under the old launcher that was the folder the user dropped on it. Under 0.3.0 the first element is the exe, which exists on disk. The app would have tried to aggregate itself.

A `[1:]` slice would be right for 0.3.0 and wrong for an exe built with the older Coil, and I wanted the same source to work under both. So the app skips any argument that is the running exe:

```python
def is_this_executable(arg):
    try:
        return os.path.normcase(os.path.abspath(arg)) == os.path.normcase(os.path.abspath(sys.executable))
    except (TypeError, ValueError, OSError):
        return False


def candidate_inputs(argv=None):
    args = list(sys.argv if argv is None else argv)
    return [arg for arg in args if arg and not is_this_executable(arg)]
```

That handles `[exe, 'D:\\disc']`, `['D:\\disc']` and `['']`. A third app at the office had its own scan-all-of-argv loop, and it got the same kind of check that afternoon.

## The missing test

Every review pass had tested the Python code against argument lists typed out by hand. Those lists were what I assumed the exe would receive. Nothing ran the built exe, and the built exe is the only place the interpreter's parser runs.

Coil's suite now builds a real bundle and runs each exe through `subprocess`, console and GUI entries both:

```python
@pytest.mark.parametrize("entry", ["main", "Helper With Space", "gui"])
@pytest.mark.parametrize("args", [[], ["--flag", "file"], ["import", "D:\\disc"],
    ["D:\\quoted path with spaces\\café 猫"], ["--flag", "", 'embedded"quote', "ends in slash\\"],
    ["-X", "dev", "-c", "print('must not run')", "--help"]])
def test_exact_application_argv(launcher_bundle, tmp_path, entry, args):
    exe = launcher_bundle / (entry + ".exe")
    proc, observed = run_probe(exe, tmp_path, args)
    assert proc.returncode == 0, proc.stderr
    assert observed["argv"] == [str(exe), *args]
    ...
```

The last case hands the exe a set of real interpreter options and asserts they come back as plain strings in `sys.argv`. The audit ran a shorter version, `-X dev -c ignored`, against the published 0.2.4. The exe exited 0, the app saw `sys.argv == ['-c']`, and stderr had a `ResourceWarning` from Coil's own `sitecustomize.py`, because `-X dev` had put the interpreter in dev mode.
