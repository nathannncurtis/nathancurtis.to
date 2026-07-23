---
title: "Building a Custom Dark Win32 Title Bar Without Losing Aero Snap"
date: "May 2026"
readTime: "5 min"
tags: ["Go", "Windows", "Win32", "UI"]
---

I maintain a small internal Go tool that decrypts encrypted imaging discs sent over from other facilities, so our staff can open them without the vendor's own viewer software. It's a WebView2 GUI: dark background, purple accent, the works. Everything in the window matched the theme except one rectangle Windows insists on drawing itself: the title bar. Light gray, system font, right at the top of an otherwise dark app. I wanted it gone.

## Stripping the chrome

The first step is easy. `GetWindowLongPtrW` reads the current window style, you clear `WS_CAPTION` and `WS_SYSMENU`, and `SetWindowLongPtrW` writes it back:

```go
style, _, _ := procGetWindowLongPtrW.Call(h, gwlStyle)
style &^= wsCaption | wsSysMenu
style |= wsThickFrame | wsMinimizeBox | wsMaximizeBox
procSetWindowLongPtrW.Call(h, gwlStyle, style)
```

Keeping `WS_THICKFRAME | WS_MINIMIZEBOX | WS_MAXIMIZEBOX` in there matters. Drop those and you also lose resizing and Aero snap (Win+arrow, drag-to-edge), which nobody wants just because the caption bar is ugly. A final `SetWindowPos` call with `SWP_FRAMECHANGED` forces Windows to recompute the frame so the change actually shows.

Run that alone and the caption disappears, and you get a pale strip left over exactly where it used to be. Windows still reserves the non-client area for something; it just isn't drawing a caption into it anymore.

## The pale-strip bug and WM_NCCALCSIZE

The fix is `WM_NCCALCSIZE`. This message is Windows asking the window "how much of your rectangle is client area versus non-client area?" The default answer reserves space at the top for the caption. If you subclass the window procedure and return 0 for `wParam == TRUE`, you're telling Windows the client area is the whole window. No non-client area, no strip.

Subclassing in Go means swapping `GWLP_WNDPROC` for a callback built from `windows.NewCallback`, and keeping the original proc pointer around so you can chain to it for every message you don't care about:

```go
cb := windows.NewCallback(c.wndProc)
prev, _, _ := procSetWindowLongPtrW.Call(h, gwlpWndProc, cb)
```

```go
func (c *windowChrome) wndProc(hwnd, msg, wparam, lparam uintptr) uintptr {
	if msg == wmNCCalcSize && wparam != 0 {
		// ... maximized handling below ...
		return 0
	}
	ret, _, _ := procCallWindowProcW.Call(c.origProc, hwnd, msg, wparam, lparam)
	return ret
}
```

That's the whole trick. Everything else routes through `CallWindowProcW` to the proc WebView2 installed, unchanged.

## Maximizing clips the title bar

Returning 0 unconditionally works fine restored, and breaks the moment you maximize. Windows over-extends a maximized window past the visible screen by the resize-border width, then relies on the non-client calculation to pull it back in. Skip that and your custom title bar's top few pixels get maximized right off the top of the monitor.

The fix only applies when `IsZoomed()` is true: shrink the client rect by `SM_CXFRAME + SM_CXPADDEDBORDER` on every side.

```go
if zoomed != 0 {
	cx, _, _ := procGetSystemMetrics.Call(smCXFrame)
	pad, _, _ := procGetSystemMetrics.Call(smCXPaddedBorder)
	borderX := int32(cx) + int32(pad)
	p.Rgrc[0].Left += borderX
	p.Rgrc[0].Right -= borderX
	// same for Top/Bottom with SM_CYFRAME
}
```

Restored windows skip this branch entirely, because `rgrc[0]` already equals the full window rect there.

## Faking the OS drag

None of this gets you window dragging back, since there's no caption left for the user to grab. The standard trick, the same one Electron uses on platforms without `-webkit-app-region: drag`, is to fake it: on mousedown in the drag region, release whatever mouse capture the browser took and tell the window it just received a caption click.

```go
func (c *windowChrome) startDrag() {
	procReleaseCapture.Call()
	procSendMessageW.Call(h, wmNCLButtonDown, htCaption, 0)
}
```

`WM_NCLBUTTONDOWN` with `HTCAPTION` hands control to Windows' native move modal loop, as if the user had grabbed a real caption bar. Aero snap, snap-to-edge, and Win+arrow all come back for free, because as far as the window manager is concerned, a caption drag is exactly what's happening.

This gets bound to JS through go-webview2's `w.Bind`, along with minimize, maximize-toggle, close, and an `isMaximized` query the frontend polls to swap the maximize button's SVG for a restore glyph:

```js
$("tbDrag").addEventListener("mousedown", (e) => {
	if (e.button !== 0) return;
	window.windowStartDrag();
});
$("tbDrag").addEventListener("dblclick", async () => {
	await window.windowMaximizeToggle();
	refreshMaxIcon();
});
```

The HTML title bar itself is nothing exotic: a 32px flex row, a small gradient icon, the app title, then three buttons. The close button hovers Microsoft's own close-red (`#e81123`), same shade every native Windows app uses, so it still reads as "this is the close button" even with a fully custom bar.

## What shipped

`window_windows.go` came in at 199 new lines, all Win32 calls through `golang.org/x/sys/windows`, no extra dependency pulled in for what amounts to eleven syscalls. The whole change landed as version 0.1.4, one commit, four files touched. The title bar now matches the rest of the app, and Win+Left still snaps it to half the screen, which was the one thing I wasn't willing to give up to get there.
