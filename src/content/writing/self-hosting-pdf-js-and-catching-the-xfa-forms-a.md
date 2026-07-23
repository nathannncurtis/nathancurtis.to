---
title: "Self-Hosting PDF.js and Catching the XFA Forms a Byte Scan Misses"
date: "June 2026"
readTime: "7 min"
tags: ["PHP", "PDF.js", "Python", "pypdf"]
---

The internal tool at the office serves a library of forms: releases, authorizations, attorney signature pages, requests to government agencies. For years the viewer was just `<object data="form.pdf" type="application/pdf">` with an `<iframe>` fallback, letting the browser's built-in PDF plugin do the work. That's fine until you want the viewer to look like part of the tool instead of a gray rectangle, or until one of the forms turns out to be a kind of PDF the browser plugin quietly can't handle.

I replaced the native embed with a self-hosted PDF.js viewer (the prebuilt v6 legacy build, vendored under `assets/vendor/pdfjs`) across all three places the tool serves PDFs. The interesting part wasn't the recolor. It was realizing that "does this PDF have form fields" is not a yes/no question, and that the obvious way to check it lies to you.

## The easy 90 percent

Most forms in the library are plain AcroForm PDFs: a `/AcroForm` dictionary with a `/Fields` array, the kind PDF.js renders and fills natively. Swapping the viewer for those was mechanical. I kept the vendored PDF.js untouched and put all customization in two override files loaded after the library's own script, so the vendored copy stays a straight drop-in on future updates. The recolor is a gradient toolbar and sidebar header, light icons with the dark ones restored inside the find and secondary popups, square thumbnails, a `#f6f8fb` canvas, page-fit as the default zoom, and the thumbnail rail open on load. None of that touches how forms render.

Then I ran an audit script over the forms directory and found three that don't play by AcroForm rules at all: a VA medical records request, a request to a workers' compensation appeals board, and a Veterans Affairs form (`vha-10-5345`). These are hybrid XFA forms: a static AcroForm layer sits on top for viewers that can't do XFA, but the real form logic lives in an embedded XFA packet that only Adobe Acrobat actually renders.

## Why the byte scan lies

My first instinct for detecting XFA was the cheap one: open the file, scan the bytes for the literal string `/XFA`. It works on some PDFs and fails silently on others, because `/XFA` frequently lives inside a compressed object stream, not as plaintext in the file. A raw scan can report "no XFA" on a file that has one, and there's no way to tell from the negative result alone that it lied.

The fix was to stop scanning bytes and start asking a real PDF parser. I wrote `setup/generate_xfa_manifest.py`, which uses `pypdf` to open each file, resolve `/Root/AcroForm` (dereferencing indirect objects properly, which is what a naive scan doesn't do), and check for `/XFA` on the resolved dictionary:

```python
def has_xfa(path):
    reader = PdfReader(path)
    root = reader.trailer["/Root"]
    if "/AcroForm" not in root:
        return False
    acro = deref(root["/AcroForm"])
    return acro is not None and "/XFA" in acro
```

That script walks the forms directory and a second directory of standalone PDFs, then writes the result to `includes/xfa_forms.json`, a flat list of three relative paths. A companion script, `inspect_pdf_forms.py`, printed a table of every form with its XFA/AcroForm/field-count status, so I could eyeball the whole library once instead of trusting the manifest blind. A third script, `inspect_xfa_page1.py`, answered a narrower question: what does page one of these three forms look like in a non-Acrobat viewer today? If it was already Adobe's "please wait, this document requires Acrobat" placeholder, switching to PDF.js was the same broken experience with a better exit, not a regression.

The PHP side reads the manifest once per request and checks membership by relative path. I kept the raw `/XFA` byte scan too, but demoted it to a secondary net: it only fires when a path isn't in the manifest, to catch a form added after the last manifest regeneration and before compression made it invisible to a plain scan.

```php
function pdfIsXfa($appRel) {
    static $manifest = null;
    if ($manifest === null) {
        $manifest = [];
        $j = json_decode((string)@file_get_contents(__DIR__ . '/includes/xfa_forms.json'), true);
        if (isset($j['xfa']) && is_array($j['xfa'])) {
            $manifest = array_flip($j['xfa']);
        }
    }
    if (isset($manifest[str_replace('\\', '/', $appRel)])) {
        return true;
    }
    // secondary net: catches a form added after the manifest was last built
    ...
}
```

## The third net, in the browser

Two nets on the server side still leave a gap: someone can hit the viewer directly with a `?file=` URL that never passed through `pdfIsXfa` at all. So the third check runs client-side, in the override script loaded after PDF.js's own viewer script. It forces `enableXfa = false` so a hybrid form renders its static AcroForm page instead of a half-built XFA layer, then listens for two PDF.js events: `documentloaded`, checked against `pdfDocument.isPureXfa` for documents that have no static fallback page at all, and `documenterror` for anything that just fails to parse. Either one swaps the viewer for a "Download to fill" panel with a download button and an open-in-new-tab link, instead of leaving the user staring at a blank canvas.

Three independent checks for the same fact feels like overkill until you remember each one is watching a different failure mode: the manifest is authoritative but goes stale, the byte scan is fast but blind to compressed streams, and the browser-side check is the only one that sees a raw URL hit or an actual parse failure at render time. None of them alone was trustworthy enough to hang a user-facing fallback on.

The manifest itself is three lines of JSON:

```json
{
  "xfa": [
    "forms/Facility Authorizations/VA Medical Records Request.pdf",
    "forms/Veterans vha-10-5345-fill.pdf",
    "forms/WCAB Request for public files.pdf"
  ]
}
```

Three forms, out of a library of dozens, that a plain `grep` for `/XFA` would have told me didn't exist.
