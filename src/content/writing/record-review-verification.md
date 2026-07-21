---
title: "Teaching a Vision Model to Verify Records the Way a Clerk Does"
date: "July 2026"
readTime: "7 min"
tags: ["Python", "AI", "vLLM", "OCR", "Document Processing"]
---

Part of our business is producing subpoenaed records. A law firm asks for medical, billing, and psych records from some facility, the facility produces them, and before anything ships, someone has to verify that what's in the PDF is what was asked for. That verification is a person flipping pages. It's checkbox work: "are medical records present, yes or no." The checkboxes just sit on top of hundreds or thousands of pages, and when the answer is wrong, the order comes back.

I wanted to know how much of that judgment a small vision model could do out of the box, before any fine-tuning. So I set up a sandbox on our inference box (Ministral 3 8B, the official FP8 checkpoint, served by vLLM next to the production classifier, everything local because these documents can't leave the building) and pointed it at real orders that had already gone wrong once, where I knew the answers.

## The blind run

The first test was deliberately unfair. One real order: 398 pages, requested types medical, billing, and psych, date range 2016 through 2026. The model got each page as an image. No OCR text, no context about the order. A strict JSON schema forced it to answer in checkboxes: which requested types are on this page, what's the page's own date, one line of evidence per claim. My code computed whether dates fell in the requested range; the model only reported dates.

It did better than I expected and failed exactly where I'd have paid money for it to fail. It correctly saw the production as medical and psych records. It correctly ignored the old prescription-start dates scattered through visit summaries and dated pages by the visit. And on one page it claimed billing records, on an order where the whole catch was that no billing was provided. The page it flagged was a financial responsibility agreement: a fee schedule and a promise to pay. Which is not billing. Billing shows what was actually charged or paid for care. A promise to pay is paperwork.

That distinction became two sentences in the system prompt and one few-shot exemplar, and the rerun made zero billing claims. The fix was a general rule, and it held up on every order after.

A confession about speed, since I initially got it wrong: I first reported the model at 6.5 seconds per page, which sounded grim. It was actually 2.2. I'd been counting the PDF rendering in the model's time. Batching (vLLM will happily decode eight requests in the same weight-streaming passes as one) brought it to about half a second per page. Dropping the evidence requirement would have halved it again, but I kept evidence on. Forcing the model to quote the page it's claiming keeps it honest, and when it isn't honest, the quote is how you find out.

## The model didn't know who sent the records

The interesting failures weren't traps. On an order requesting insurance records, 289 pages produced by an insurance adjuster, the model found insurance on two pages. On an employment-records order produced by an employer, it found nothing at all.

The problem is obvious in hindsight. "Insurance records" and "employment records" barely exist as page-level appearances. An adjuster's file is correspondence and log notes. A personnel file is memos and onboarding paperwork. What makes them insurance or employment records is who produced them. The human clerk always knows that; it's printed on the subpoena. The model was being held to a harder standard than the people it was standing in for.

So the harness started passing one more line: the name of the records custodian, framed as a hint about what record-like content probably is. The prompt warns that the producer never makes a page count by itself, and that custodians sometimes produce the wrong thing entirely. Insurance went from 2 pages to 63. Employment went from 0 to 14. The orders that were already correct moved by a page or two, and on the order with the known billing trap, the model kept its zero even with a plausible-sounding custodian in view.

One thing the hint couldn't fix: a dental production where the model found almost nothing, even when told it was looking at a dentist's chart. Dental charting is grids and tooth numbers, and the model doesn't know what it's looking at. No amount of prompting fixed that. It needs training data.

## Classification was the wrong job

At this point I had a per-page classifier scoring about 2,900 page judgments in thirteen minutes, and it took me embarrassingly long to notice that nobody asked for that. The actual job is verification. When a person checks a 30,000-page hospital chart against a request for medical records, they do not classify thirty thousand pages. They see it's from a hospital, the pages look like medical records, box checked.

So the harness got a verify mode that works the way the clerk does. Pages are sampled in a spread across the document. Each round asks only about the types not yet confirmed. The moment every requested type has been seen with an in-range date, it stops. A 254-page hospital chart confirmed "medical, in range" in 5.4 seconds after looking at eight pages.

Absence is the expensive half, and here the human workflow was ahead of me again. My first version gave up looking for a missing type after a page budget. That's not how it works. When something's missing, you go through every page, because "we looked at some of it" is not a certification. So a missing type now walks the entire document before the verdict says "absent, all 398 pages examined," and the walk only ends early if the thing turns up.

## The office already wrote down the answer

Full walks would make missing types brutally expensive at scale, except for the last realization: our own status notes already say what's missing. When records arrive, a clerk logs a templated intake note. Received from whom, what record types, what the custodian's declaration claims, and a "Needs" field for deficiencies. The templates are typed by a hotkey app, so the structure is machine-consistent and only the shorthand varies. On the trap order, months of notes documented the billing chase, ending with a new line item opened just to pursue the missing billing.

So the verify flow reads the notes first. A requested type explicitly called out as missing gets skipped entirely. The office already knows, there's no reason to burn a full walk re-proving it, and the verdict quotes the note it's trusting. Everything else has to be found independently, on the page. The loudest possible output is the combination nobody wrote down: requested, never noted missing, and still not found after every page. That's the discrepancy the whole system exists to catch.

Narrative mentions never trigger a skip. "Custodian says billing was sent" marks nothing missing, because custodians say a lot of things. Only the explicit callouts count, and a failed notes lookup fails open: nothing gets skipped, everything gets verified.

## Eighteen seconds

The full pipeline's first big test was a 1,693-page hospice production requesting medical records, billing, and (this is real) color photographs. The notes pre-check found an intake entry: received medical and photos, needs missing billing. So billing was skipped, with the note quoted in the verdict. The model then independently confirmed medical on a dated pain-assessment form and found the photographs, a wound photo on page 651. The same two types the intake clerk had logged, found from the pixels with nobody telling it what to expect.

Total: 18.4 seconds, 48 of 1,693 pages examined. Proving the billing absent by brute force would have taken about eight minutes. The note made it free.

The clerk record and the model checked each other, and I think that's the shape this problem wants. The office's paper trail settles what's already known, and the model spends its effort on the one question nobody has answered yet.

The model still hasn't been fine-tuned. That comes next. The same intake notes that make verification cheap are also a labeled training corpus: thousands of historical orders where a clerk already wrote down what arrived and what didn't.
