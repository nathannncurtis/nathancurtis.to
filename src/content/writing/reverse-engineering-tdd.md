---
title: "Reverse-Engineering a Proprietary Binary Format to Automate CD Label Printing"
date: "October 2024"
readTime: "5 min"
tags: ["Python", "Reverse Engineering", "Automation"]
---

## The problem

The office uses Epson disc printers to print labels on CDs before they go out to clients. The workflow was entirely manual: someone opens Epson Total Disc Maker, types in the case number, facility name, patient info, and work order number, formats the label, and hits print. Every disc. By hand.

At volume, this was eating hours per day. The data already existed in a structured format upstream. The question was whether the label generation could be automated without going through the Epson GUI.

## Figuring out the format

Epson Total Disc Maker saves labels as .tdd files. There's no public documentation on the format. The Epson software is the only thing that's supposed to read and write them.

So I made a blank label in the GUI, saved it, and opened it in a hex editor. The .tdd format turned out to be simpler than expected: it's XML with a PNG thumbnail and a base64-encoded JPEG logo embedded in it. The label text fields are stored as plain text at specific positions within the XML structure.

The approach: take a blank .tdd file as a template, read it as raw bytes, and insert field values at the correct byte offsets. Each insertion shifts all subsequent offsets, so the code tracks the cumulative offset delta as it fills in each field.

```python
# Read the blank template as raw bytes
with open("blank.tdd", "rb") as f:
    data = bytearray(f.read())

# Insert fields at known byte offsets
# Each insertion shifts everything after it
offset_delta = 0
for field_name, value, position in fields:
    adjusted_pos = position + offset_delta
    encoded = normalize_text(value).encode("utf-8")
    data[adjusted_pos:adjusted_pos] = encoded
    offset_delta += len(encoded)
```

Unicode was a headache. The label data coming in had smart quotes, en dashes, and other characters that the Epson format doesn't handle well. The solution was a normalization pass that converts everything to ASCII equivalents before insertion.

XML special characters (&, <, >, quotes) also needed escaping since the .tdd content is XML under the hood. A bare ampersand in a patient name would corrupt the entire label file.

## The pipeline

The label data arrives as a PDF with a specific page structure. Each page contains one field: page 1 is the facility, page 2 is the case number, and so on through page 8. The script extracts text from each page using PyMuPDF, maps it to the corresponding label field, and generates the .tdd file.

The whole thing runs as a folder watcher on a server. A network folder is monitored for incoming PDFs. When one appears, the script waits for it to finish writing (stability check: compare file size and mtime over a 2-second window), processes it, writes the .tdd to an output folder, and deletes the source PDF.

Recovery is built in. If the monitoring loop crashes, it restarts with linear backoff (5s, 10s, 15s, up to 30s between retries). On startup, it sweeps the folder for any PDFs that arrived while it was down. A periodic 10-second sweep catches anything the filesystem watcher missed.

## The result

The Epson Total Disc Maker software doesn't need to be installed on the server at all. The script generates valid .tdd files directly from the template. The output files get opened and printed on a separate machine that has the Epson software.

What used to be minutes of manual data entry per disc is now automatic. The label appears in the output folder within seconds of the PDF arriving. Nobody touches the Epson GUI except to hit print.

## The takeaway

Proprietary formats are often simpler than they look. The .tdd format seemed opaque until I opened it in a hex editor and realized it was just XML with some embedded media. No compression, no encryption, no obfuscation. Just an undocumented structure that the vendor never expected anyone to look at.

A hex editor, a blank template, and the willingness to compare "before" and "after" files is usually enough to reverse-engineer a format like this. Fill in a field in the GUI, save, diff the bytes. Repeat for each field. Map the offsets. Write the generator.
