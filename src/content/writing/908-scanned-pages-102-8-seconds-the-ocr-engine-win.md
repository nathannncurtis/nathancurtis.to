---
title: "908 Scanned Pages, 102.8 Seconds: The OCR Engine Windows Already Ships"
date: "October 2026"
readTime: "6 min"
tags: ["PowerShell", "OCR", "Windows", "Python"]
---

I had a folder of documents from the office that I needed as plain text. Most of it was easy: spreadsheets, a Word file, PDFs with a text layer. One PDF was 908 scanned pages, 285 MB, and PyMuPDF got zero characters out of the first five. I didn't need a searchable PDF back, only the text, one file per page.

Tesseract wasn't on the machine, so I pip-installed `rapidocr-onnxruntime` 1.4.4, rendered page 1 at 200 dpi, and timed it: 5.7 seconds for 21 lines I could read. Good enough. I wrapped it in a resumable script (one `.txt` per page, skip the page if the file exists) and started it with `Pool(4)`.

## Tuning the wrong thing

Two minutes in there were 11 page files on disk. Going by the timestamps, the recent ones were landing at about 10 a minute, so roughly 90 minutes for the whole PDF. The PC has 14 logical processors, so the obvious move was more workers:

```python
_ocr = RapidOCR(intra_op_num_threads=2)
...
with Pool(7) as pool:
```

Seven workers at two threads each is all 14. I interrupted that run 22 seconds in, because I still wanted to use the PC. When I came back to it nothing was running and there were 26 pages on disk. The restart got three workers. A per-process CPU counter put them at 15.6, 14.3 and 14.2 percent of the machine, about 44 percent between them.

The estimate I was working from at that point was 1.5 pages a minute, which is 8 to 9 hours for the pages that were left. I tried the other knob, resolution, on one dense page:

```
dpi=200 time=19.3s lines=42 chars=2193
dpi=150 time=16.7s lines=42 chars=2176
dpi=120 time=14.8s lines=42 chars=2131
```

Going from 200 to 120 dpi saved 4.5 seconds on that page and lost 62 characters. I left it at 200.

## The estimate was wrong too

I went back through the page counts afterwards. The three-worker run started at 15:27:56 with 26 pages already on disk. At 15:30:10 there were 66. At 15:32:16, 104. At 15:35:13, 168. That is 142 pages in 7 minutes 17 seconds, or 19.5 pages a minute. At that rate the remaining 740 pages needed about 38 minutes. The 8 to 9 hour figure was off by more than ten times, and I never checked it against the file count that was sitting right there.

So the number to beat was about 38 minutes at 44 percent CPU.

## The engine that was already installed

Windows has had an OCR engine in the box since Windows 10: `Windows.Media.Ocr.OcrEngine`, a WinRT class. Windows PowerShell 5.1 can load WinRT types directly if you name them with their assembly and `ContentType=WindowsRuntime`. The catch is that the calls you need are async. They return `IAsyncOperation<T>`, and PowerShell 5.1 has no `await`. The workaround is to find the generic `AsTask` extension method by reflection, close it over the result type, and block on the task.

This is the whole script, 23 lines:

```powershell
param([string]$InDir,[string]$OutDir)
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null=[Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
$null=[Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
$null=[Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
$asTaskGeneric=([System.WindowsRuntimeSystemExtensions].GetMethods()|?{$_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'})[0]
function Await($t,$rt){$m=$asTaskGeneric.MakeGenericMethod($rt);$nt=$m.Invoke($null,@($t));$nt.Wait(-1)|Out-Null;$nt.Result}
$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromLanguage([Windows.Globalization.Language]::new("en-US"))
if(-not $engine){$engine=[Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()}
$sw=[Diagnostics.Stopwatch]::StartNew()
Get-ChildItem $InDir -Filter *.png | Sort-Object Name | ForEach-Object {
  $out=Join-Path $OutDir ($_.BaseName+".txt")
  if(Test-Path $out){return}
  $file=Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($_.FullName)) ([Windows.Storage.StorageFile])
  $stream=Await ($file.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
  $dec=Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
  $bmp=Await ($dec.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
  $res=Await ($engine.RecognizeAsync($bmp)) ([Windows.Media.Ocr.OcrResult])
  $lines=$res.Lines | ForEach-Object { $_.Text }
  [IO.File]::WriteAllLines($out,$lines,[Text.UTF8Encoding]::new($false))
  $bmp.Dispose(); $stream.Dispose()
  Write-Host ("{0} {1:N1}s" -f $_.Name,$sw.Elapsed.TotalSeconds)
}
```

It takes a folder of PNGs, so the PDF still has to be rendered first. PyMuPDF does that: `d[i].get_pixmap(dpi=200,colorspace=fitz.csGRAY).save(fn)`. The `Test-Path` check makes it resumable the same way the Python script was.

I tried it on three pages. The stopwatch is cumulative:

```
0004.png 0.3s
0011.png 0.5s
0051.png 0.6s
```

Then all of them:

```
0906.png 102.6s
0907.png 102.7s
0908.png 102.8s
```

908 pages in 102.8 seconds, one PowerShell process, one page at a time. That is about 530 pages a minute against 19.5. Rendering the PNGs took longer than reading them: 2 minutes 11 seconds, and 354 MB on disk. Render plus OCR comes to just under four minutes.

The three RapidOCR workers were alive for all of it. I had stopped their background job before the OCR run and the stop reported success, but the parent and all three workers were still in the process list when it finished.

## The line that fails every run

Every run printed this before any page output:

```
Unable to find type [Windows.Globalization.Language].
    + FullyQualifiedErrorId : TypeNotFound
```

The script loads three WinRT types by their qualified names and then uses a fourth, `Windows.Globalization.Language`, that it never loaded. The error doesn't stop the script. `$engine` stays null, the next line sees that and calls `TryCreateFromUserProfileLanguages()`, and everything works. So the `en-US` on line 8 has never been applied, and the engine uses whatever language my Windows profile has. I think the fix is one more `$null=[...]` line of the same shape as the other three. I haven't run it.

## Is the text any good

I compared the two engines on the 334 pages RapidOCR had finished when I killed it.

Non-whitespace characters across those pages: 284,936 from RapidOCR, 289,348 from Windows. Whitespace-separated words: 33,744 against 54,602. That is nearly the same amount of text in far fewer words, because RapidOCR drops spaces. A date line it returned as `Wednesday,December09,200912:21PM` came out of Windows as `Wednesday, December 09, 2009 12:21 PM`. For anything I want to grep, that matters more than the character count.

I ran `difflib.SequenceMatcher` with `autojunk=False` over each pair of pages, whitespace stripped and case folded. Median similarity was 0.962. 283 of the 334 pages scored 0.90 or better and 327 scored 0.80 or better. The measure is crude: the two engines emit lines in different orders and the ratio punishes that.

Three pages scored under 0.5:

- On one, Windows returned 6 characters where RapidOCR returned 382. I haven't looked at the page image to see why.
- One is a degraded attachment that neither engine read well. RapidOCR got 906 characters out of it and Windows got 359.
- One is a two-column price list. Both engines returned 580 characters. Windows emitted the labels first and the prices after, so the prices ended up detached from the items they belong to. My Python script had been grouping RapidOCR's boxes into rows by y-coordinate; the PowerShell one writes `$res.Lines` in whatever order the engine hands them over.

None of the 908 Windows files is empty. The two shortest are 4 and 6 characters.

So Windows lost two of those three pages, and the third is a line-ordering problem. For text I'm going to search, I'll take that.

I killed the RapidOCR pool at 15:43, a minute and a half after the Windows run finished. It was on page 334.
