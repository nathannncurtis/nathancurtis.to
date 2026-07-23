---
title: "Automating a Vendor's Legacy ASP Form Because There Is No API"
date: "March 2026"
readTime: "5 min"
tags: ["Python", "Playwright", "Automation"]
---

## The problem

Part of the office's daily paperwork involves a category of scanned documents that need to go to an outside vendor for handling, and the vendor's only interface is a web form. Not a modern one. An ASP page from another era, with input fields named things like `order`, `location`, and `Findit`, and a login button that's actually an `<img>` tag with an `onclick` handler instead of a real `<button>`. There's no API. There's no export. There's a browser, a form, and whatever your script can convince that form to do.

The upstream half of the job was more tractable: a script called `getList.py` watches a network share for new PDFs and has to decide which ones are "legal" documents (handled elsewhere) and which are "non-legal" and need to go to the vendor. The distinction comes down to one string:

```python
def is_legal_document(pdf_path):
    try:
        with pdfplumber.open(pdf_path) as pdf:
            if pdf.pages:
                text = pdf.pages[0].extract_text()
                return 'notice of completion' in text.lower()
        return False
    except Exception as e:
        if "CropBox" in str(e):
            return False
        print(f"[!] Error processing {pdf_path}: {e}")
        return False
```

If page one contains the literal phrase "notice of completion," it's legal and gets left alone. Everything else, including anything pdfplumber chokes on (a handful of PDFs throw a CropBox error on malformed page geometry), defaults to non-legal. That default matters: when in doubt, the document goes to the vendor queue rather than getting silently filed as handled. A false "non-legal" costs someone a wasted lookup. A false "legal" loses the document.

The script runs on a loop, waking at 7:30 every morning (the function is named `wait_until_8am`, which nobody's gotten around to fixing) and checking file creation timestamps against a target date. Mondays get a three-day lookback to cover the weekend:

```python
def get_target_dates():
    today = datetime.datetime.now()
    if today.weekday() == 0:
        return [(today - datetime.timedelta(days=i)).date() for i in (1, 2, 3)]
    else:
        return [(today - datetime.timedelta(days=1)).date()]
```

Non-legal files get copied to a temp folder, classified, moved into a dated archive path, and their identifiers written to a CSV. Then `getList.py` launches a second script as its own process to actually deal with the vendor.

## Driving the form

That second script, `emailer.py`, uses Playwright to open a headless Chromium instance, log into the vendor's site, and for each identifier in the CSV: fill in the order and location fields, click Findit, read back two contact-email fields, merge them into one deduplicated field, clear the second, and click the send button. Then it verifies the form reset before moving to the next row.

The email merge is a small thing but worth getting right, since the same address duplicated across both fields would otherwise just get sent twice:

```python
def merge_emails(email1: str, email2: str) -> str:
    seen = set()
    valid_emails = []
    combined = f"{email1};{email2}".replace(",", ";")
    for e in combined.split(";"):
        e = e.strip()
        if e and EMAIL_REGEX.match(e) and e.lower() not in seen:
            seen.add(e.lower())
            valid_emails.append(e)
    return "; ".join(valid_emails)
```

Each work order gets up to three attempts. On failure, the script takes a screenshot, navigates back to the starting form as a universal recovery step, and retries:

```python
def reset_to_start(page):
    """Reset to the starting form - our universal recovery method"""
    try:
        page.goto(VENDOR_URL, timeout=30000)
        page.wait_for_selector('input[name="order"]', timeout=15000)
        return True
    except Exception as e:
        print(f"[!] Reset failed: {e}")
        return False
```

Screenshots on every failure (and on every success) mean that when a run finishes with some orders failed, there's a folder of exactly what the page looked like at the moment it broke, instead of a stack trace and a guess.

## The login problem

The part that actually took the longest to get right wasn't the form filling. It was logging in at all. A cold headless Chromium session, credentials filled programmatically and the image-button clicked, would intermittently fail to reach the page past login: sometimes the click didn't register the way a real click does, sometimes the resulting session just didn't behave like an authenticated one. A completely fresh, from-scratch headless browser talking to an old ASP site is a fragile combination, and it's the kind of failure that's hard to reproduce because it doesn't fail the same way twice.

The fix was a separate one-time script, `launch.py`, that opens the same browser with a visible window instead of headless, points it at a persistent `user_data_dir`, and waits for a human to log in by hand:

```python
context = p.chromium.launch_persistent_context(
    user_data_dir=USER_DATA_DIR,
    headless=False,
    args=["--start-maximized", "--enable-features=PasswordManagerOnLoginPage"],
)
page = context.new_page()
page.goto(VENDOR_URL)
print("[*] Chromium launched — manually log in and save password if prompted.")
input("Press ENTER to close the browser after you're done...")
```

That one manual login builds a real browser profile: cookies, saved-password state, whatever the site's session handling wants to see. Every subsequent daily run points `launch_persistent_context` at that same directory instead of starting from nothing, so it's never really a cold login again. The direct credential fill in `emailer.py` stayed in as a fallback for when a session does expire, but the profile is what made the headless runs reliable day over day.

## What's actually running

The whole pipeline is two scripts, a CSV file, and a Chrome profile directory sitting in a folder, gluing a PDF classifier to a legacy web form nobody at either end wants to rewrite. Getting it to run once wasn't the hard part. Getting a headless browser to look, to an old ASP session, indistinguishable from the same browser a person had already logged into by hand, was.
