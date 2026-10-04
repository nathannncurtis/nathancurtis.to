---
title: "Illegal Instruction: The Release That Only Crashed on the Newer CPU"
date: "October 2026"
readTime: "6 min"
tags: ["Zig", "CI/CD", "Windows", "Debugging"]
---

The office server rack has a 1280x400 monitor mounted in it that shows what each machine is doing. Every machine runs an agent, a single static Zig binary that serves its metrics as JSON on a port, and one Linux box draws the panel. Two of the machines are Windows servers, where the agent runs as a service installed by an Inno Setup installer that GitHub Actions builds whenever I push a tag.

v0.8.0 was the release that finally got real CPU temperatures on Windows, by bundling a signed kernel driver into the installer. I ran the installer on both Windows boxes and asked each agent for its version and temps:

```
server-a: agent=0.8.0 temps=cpu=54
server-b OFFLINE
```

Both installers came out of the same release build and I'd run them back to back. One box reported 54°C and the other had no agent at all.

## The driver was the obvious suspect

The files were all on the second box: the agent exe with a fresh timestamp, the driver's DLL, the MSR module. There was no agent process and nothing listening on the port.

The new thing in 0.8.0 on Windows was the kernel driver, and that box runs with HVCI on, the Windows feature that refuses to load kernel drivers it doesn't trust. So I suspected the driver. `Get-Service PawnIO*` printed nothing, and I took that as confirmation that the driver's files had landed and the driver had never registered. That was wrong. `Get-Service` doesn't list kernel drivers, so it would have printed nothing on the working box too.

I lost another round to this, typed into a Windows PowerShell admin prompt:

```
sc query RackDisplayAgent; sc start RackDisplayAgent
```

In Windows PowerShell, `sc` is an alias for `Set-Content`. Neither command talks to the service manager. They silently write two files into the current directory, one named `query` and one named `start`. It has to be `sc.exe`.

## Running it in the foreground

With `sc.exe`, starting the service failed with error 1053, which is what the service control manager reports when a service process never checks in. I also ran the exe directly in the same admin prompt:

```
& "C:\Program Files\RackDisplay\agent\rack-agent.exe"
```

It printed `Illegal instruction`, then a recursive panic, and exited.

An illegal instruction means the CPU was handed an opcode it doesn't implement. That comes from how the exe was compiled, and a driver that fails to load doesn't produce it. My read on the recursive panic is that Zig's panic handler tried to report the fault and hit the same kind of instruction. Either way the process was dead before it could tell the service manager it had started, so the service manager timed out and reported 1053.

## The build had no target

The box that worked has a Xeon Platinum 8160. The box that crashed has a Core Ultra 9 285. The Core Ultra is the newer chip by years, and it has no AVX-512. The Xeon does.

Here is the release build step as it stood at v0.8.0:

```yaml
- name: Build agent (ReleaseSafe)
  run: zig build -Doptimize=ReleaseSafe "-Dversion=${{ steps.ver.outputs.version }}"
```

There's no `-Dtarget` and no `-Dcpu`. In `build.zig` the target came from `b.standardTargetOptions(.{})`, and when you don't give Zig a target it builds for the machine it's running on, including every CPU feature that machine reports. That's a fine default for a build you're going to run where you built it. This one ran on a `windows-latest` hosted runner, and its output got installed on two servers the runner knows nothing about.

So the release was compiled for whatever CPU the runner happened to have that afternoon. If that was a Xeon with AVX-512, the binary would run on my Xeon and fault on my Core Ultra, which is what I had. I never looked up the runner's CPU or disassembled the 0.8.0 exe to find the instruction, so the AVX-512 part is an inference from which box lived and which died.

The release workflow runs an integration test against the built exe before packaging it. That test passed, because it runs on the runner and the runner can execute a binary built for itself. Local builds didn't show it either. My dev machine is a Core Ultra too, and it built for its own CPU. I'd tested a locally built 0.8.0 with the driver right before tagging and it read 60°C.

The same Core Ultra box had been running 0.5.1 from the same pipeline without trouble. I don't think 0.5.1 was any more correct. Hosted runners aren't all the same hardware, and my guess is that release was built on a runner with nothing the Core Ultra lacks.

## The fix

Three files, 13 insertions, 6 deletions. `build.zig` now defaults the CPU model instead of inheriting the host's:

```zig
const target = b.standardTargetOptions(.{
    .default_target = .{ .cpu_model = .baseline },
});
```

The five ReleaseSafe build lines in `ci.yml` and `release.yml` pass it explicitly as well:

```yaml
run: zig build -Doptimize=ReleaseSafe -Dcpu=baseline "-Dversion=${{ steps.ver.outputs.version }}"
```

`-Dcpu` still overrides the default if I ever want a tuned build for one machine. With baseline, the unit tests passed 36/36 and the integration suite passed 20. I tagged v0.8.1 and ran the new installer on the box that had crashed:

```
server-a: agent=0.8.0 temps=cpu=65
server-b: agent=0.8.1 temps=cpu=90
```

That was a little under ten minutes after the first `OFFLINE`. The driver I'd blamed is the same one in both releases, and under 0.8.1 it read 90°C on the box where 0.8.0 wouldn't start. The version field in the agent's JSON went in at 0.5.1 so I could check remotely which build a box was running, and here it showed the second box on the new one.

I left the Xeon on 0.8.0. It has the instructions.
