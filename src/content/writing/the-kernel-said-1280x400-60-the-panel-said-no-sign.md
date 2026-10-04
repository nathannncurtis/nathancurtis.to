---
title: "The Kernel Said 1280x400@60. The Panel Said No Signal."
date: "October 2026"
readTime: "8 min"
tags: ["Linux", "Zig", "DRM/KMS", "Hardware"]
---

The office server rack has a 7.84-inch, 1280x400 HDMI panel mounted on it, showing CPU, memory, disk and network for three machines. The dashboard is a Zig binary on a Linux box, driving the panel from the Intel iGPU with no display server underneath. It opened the DRM device, created a dumb buffer, called `SETCRTC`, and copied pixels in.

The first run on the real panel stayed up. I ran the binary under `timeout 8` and got exit code 124, meaning it sat in the render loop until the timeout killed it. I installed it as a systemd unit at 11:45 and the dashboard was on the rack by 11:47. The panel is mounted upside down, so I added a 180-degree flip to the blit and redeployed at 11:56. Still on. At 12:04 I deployed a layout fix, which restarted the service. By 12:05 the panel was dark.

It was 13:35 before the dashboard was back and right side up. For the first 46 minutes of that the panel showed nothing, and the kernel reported that everything was fine.

## What the kernel said

A one-liner over systemd and the connector's sysfs files printed this:

```
svc=active restarts=0 dpms=On enabled=enabled status=connected
```

The CRTC in the DRM state dump under debugfs:

```
crtc[88]: pipe A
	enable=1
	active=1
	self_refresh_active=0
	mode: "1280x400": 60 43720 1280 1300 1310 1440 400 404 409 506 0x48 0x5
```

Service up, zero restarts, connector connected and enabled, DPMS on, pipe A active at the panel's native mode. The process was in its render loop.

So I believed it, and went looking for reasons a correctly driven panel would be dark.

## Three wrong fixes

First I went after mode selection. The code took `modes[0]` with a comment saying "first = preferred", which is an assumption, so I replaced it with a scan for the PREFERRED type flag:

```zig
var mode = modes[0];
for (modes) |m| {
    if (m.type & (1 << 3) != 0) {
        mode = m;
        break;
    }
}
```

It went out with the next build and the panel stayed dark.

Second, I decided the panel was sitting in standby, and that re-setting an identical mode on restart was a no-op to the driver, so the panel never saw a real off-to-on edge. I added one:

```zig
var off = crtc{ .crtc_id = crtc_id };
_ = linux.ioctl(fd, SETCRTC, @intFromPtr(&off));
std.time.sleep(800 * std.time.ns_per_ms);
```

I checked that the "off" happened by sampling the connector's `enabled` file every 100 ms across a restart: 8 samples `disabled`, 32 `enabled`. The cycle was real and the panel stayed dark.

Third, with two software changes shipped and nothing to show for them, I blamed the hardware. The argument sounded good. The kernel only knows a monitor is "connected" because the EDID chip answers, and the EDID chip runs off the HDMI 5V line, so it answers whether or not the panel itself has power. The panel takes its power over a separate USB lead. Check the lead.

The lead was fine. Power-cycling the panel brought up its own "no signal" message, which a panel without power can't show. And it had been working before noon.

## A field that read zero

"No signal" is the panel reporting what's on the wire. Everything I'd been reading was the kernel reporting what it intended to put there. The same state dump has a block per connector, and grepping it for the link fields gave:

```
connector[289]: HDMI-A-2
	max_requested_bpc=12
	colorspace=Default
	is_limited_range=n
	output_bpc=0
	tmds_char_rate=0
```

A TMDS character rate of zero, on a connector the kernel said it was driving at 1280x400. I decoded the panel's EDID by hand to rule out bad timings: 1280x400 with a 43720 kHz pixel clock, the same numbers as the kernel's mode line. I took that to mean the mode was right and no clock was going out.

## Bisecting, late

At 12:51 I ran the binary from the release I'd tagged right after bring-up, built from the commit that was on the panel at 11:47. The panel lit up, upside down.

So it was my regression. I reverted the mode scan and the disable cycle, kept the rotation, deployed, and it was dark again.

Then I found `fb0` reporting `blank=4`, decided the console blank timer had powered the output down, wrote 0 to it and unbound the framebuffer console. The state dump now showed a plane on pipe A scanning out a framebuffer `allocated by = rack-display`, and still `tmds_char_rate=0`. I put the bring-up release's binary back. Zero again. I rebound the console, unblanked, restarted the service, and the panel came on.

After that, every build that wasn't that exact binary went dark. The rotation build flashed some white console text and went off. I moved the rotation out of the blit, so the copy loop was the bring-up release's again and the flip was a `std.mem.reverse` on the pixel array beforehand. Dark. I checked out the bring-up commit in a worktree, added that one `reverse` line and nothing else, and built it. Dark. I tried letting the display engine do it by setting the plane's `rotation` property to 180. The driver accepted it, my log line said `180 rotation: display engine`, and the panel was off.

Reversing an array of pixels in memory can't take down an HDMI link. If a build that differs by that one line goes dark, I'd been misreading the results all along. Each failure looked like "the last change broke it" when the change had nothing to do with it.

The console was the part that behaved. Twice it had been visible on the panel right up until my program started: the white text on the rotation build, and on the last failed attempt the kernel console itself, upside down, before my modeset put the screen out.

## Stop modesetting

The fix was to stop taking the display. The new backend opens `/dev/fb0`, asks for the geometry with two ioctls, mmaps it, and writes pixels. It never becomes DRM master and never sets a mode. The 180-degree flip lives in that blit:

```zig
const dst = self.map[y * self.line_length ..][0..row_bytes];
if (self.flip180) {
    const src_row = buf.px[(h - 1 - y) * buf.w ..][0..w];
    var x: usize = 0;
    while (x < w) : (x += 1) {
        const p = src_row[w - 1 - x];
        const o = x * 4;
        dst[o] = @truncate(p); // B
        dst[o + 1] = @truncate(p >> 8); // G
        dst[o + 2] = @truncate(p >> 16); // R
        dst[o + 3] = 0;
    }
} else {
    @memcpy(dst, std.mem.sliceAsBytes(buf.px[y * buf.w ..][0..w]));
}
```

The unit bounces the console before the program starts, so the kernel does the modeset and the dashboard draws into whatever it brought up:

```
ExecStartPre=/bin/sh -c 'for v in /sys/class/vtconsole/vtcon*/bind; do echo 0 > $v 2>/dev/null || true; done; sleep 2; for v in /sys/class/vtconsole/vtcon*/bind; do echo 1 > $v 2>/dev/null || true; done; sleep 3; echo 0 > /sys/class/graphics/fb0/blank 2>/dev/null || true'
```

It logged `fbdev: 1280x400 32bpp stride=5120 rotate180=true` and the dashboard was on the panel, right side up, at 13:35. The commit is 192 insertions and 37 deletions. `fbdev.zig` is 132 lines, 48 of them two struct definitions transcribed from the kernel's framebuffer header. The old KMS path is still in the binary behind `RACK_DRM=1`, with a note in the README not to use it on this panel.

## What I don't know

I never found out why my modeset fails on that encoder. i915 names it `DDI TC4/PHY TC4`, a Type-C PHY port carrying HDMI, and a legacy `SETCRTC` on it sometimes leaves the kernel reporting an active pipe and the panel reporting no signal. The same call worked at 11:45 and again at 11:56. I also can't explain why the bring-up release's binary came up after a console bounce when the same source rebuilt with one extra line didn't.

I never got a reading of `tmds_char_rate` while the panel was lit either. The one time I tried, the grep came back empty. It read zero under the bring-up release's binary too, a minute before a console rebind and a restart brought the picture back, so I can't say the field means anything on this driver.
What I do have is the timeline. The panel went dark at 12:05, after working since 11:47. I ran the last working binary at 12:51. The 46 minutes in between went to a mode-selection fix, a signal-cycle fix and a lecture about USB power, all argued from kernel state that said the display was fine.
