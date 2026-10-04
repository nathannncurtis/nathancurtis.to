---
title: "99.5% Agreement and Still Unusable: Distilling a Vision-LLM Judge Into a Small Head on DINOv2"
date: "October 2026"
readTime: "9 min"
tags: ["Python", "Machine Learning", "Document Processing"]
---

The document pipeline at the office decides, for every scanned page, whether it ships as 1-bit black-and-white or stays in color. A small classifier makes the first call. Then a vision LLM judges the page and can overrule it, because the classifier misses things like a photo in the corner of a typed report. The judge is good and slow. One copy of it on one GPU serves the whole fleet, the measured ceiling is about 2.4 judged pages a second, and one order of 199,689 pages was getting 1.25. At that rate the judging alone is about 44 hours for a single order.

The pipeline already computes a 384-dimension DINOv2 embedding for each page, for an earlier feature. So in August I started logging one row per judged page: the embedding as float16 and the judge's verdict, about 1.6 KB a page. The plan was to train a small head on those embeddings until it could do the judge's job.

## Agreement when 98% of pages are black-and-white

By October 1 the log held 1,196,282 distinct pages across 4,616 orders. The head is a 384-256-3 MLP. The whole run, loading and scoring included, took 102 seconds on CPU. I held out 460 whole orders, 148,891 pages, that it never saw.

```
SCORE held-out orders (10%, never trained on): pages=148891 agree=0.9951
  colour_lost=250 (14.59% of colour) false_colour=462 (0.31% of bw)
```

(The logs spell it "colour." I've trimmed them and left the spelling alone.)

That's 99.5% agreement with the judge. It's also 250 of the 1,713 color pages in the held-out set that the head would have converted to black-and-white, which is one in seven. The label mix explains how both are true:

```
labels={'bw_text': 1173438, 'color_document': 22335, 'xray': 509}
```

98.1% of the log is black-and-white. In the held-out orders it's 98.8%, so a model that answers "black-and-white" to every page would have scored 98.8% on the same test. The training log shows how little agreement says. From one epoch to another it barely moved while the count of lost color pages on the validation set swung by a hundred:

```
epoch 5: val cost 3777 (colour lost 309, false colour 687) agree 0.9907
epoch 7: val cost 4565 (colour lost 412, false colour 445) agree 0.9919
```

Epoch 7 has the better agreement and loses 103 more color pages. The script was already picking its epoch by `10 * colour_lost + false_colour` for that reason. The two mistakes do not cost the same. A black-and-white page kept in color is a bigger file, and operators don't report those unless it gets excessive. A photo converted to 1-bit is a ruined page, and those get reported.

## Using it as a filter

A full replacement was out. The next idea was a one-sided filter: let the head decide only the pages it is very sure are black-and-white, and send everything else to the judge as before.

```
p(bw) >= 0.9:    student decides 97.4% of pages as bw | colour pages lost 148 of 1713
p(bw) >= 0.99:   student decides 44.6% of pages as bw | colour pages lost 46 of 1713
p(bw) >= 0.995:  student decides 9.0% of pages as bw  | colour pages lost 29 of 1713
p(bw) >= 0.999:  student decides 0.5% of pages as bw  | colour pages lost 12 of 1713
p(bw) >= 0.9999: student decides 0.0% of pages as bw  | colour pages lost 0 of 1713
```

The only cutoff that lost no color pages took no pages off the judge.

## The wrong explanation

I had tried this once before, in September, with 174,578 training pages and 3,814 pages from a set of problem orders held out. On those pages the September head lost 127 color pages. The new one, with 935,450 training pages, lost 137. Five times the data had not moved the number, so I blamed the input. DINOv2-small sees a 224-pixel version of the page, and a thumbnail-sized photo at the bottom of a report mostly disappears at that size.

So I built a detailed fingerprint: the whole page, plus the same model run over full-resolution tiles, plus direct pixel measurements of how much color is on the page. That needed the original pages, because delivered black-and-white pages have already had their color stripped. I re-rendered 57,142 pages from 381 orders, and 372 of the orders lined up page-for-page with what had been judged, 52,019 pages. Then I trained two heads on the same split, one on the whole-page embedding and one on the full detail, and scored them on 74 held-out orders: 7,370 pages, 39 of them color.

The full-detail head lost 7 of the 39 where the whole-page head lost 13. As a filter it was no better. At 0.995 the whole-page head took 88.2% of pages and lost 3. The full-detail head took 80.3% and lost 2.

## Looking at the pages

By then I had spent an evening on counts of lost color pages and had not looked at one. The three pages the whole-page head lost at 0.99 were all in one order. I pulled them up. All three were fine as black-and-white. I asked for the next three, the ones either head lost only at the loosest cutoff, 0.9, and the student was right about those too.

All six "lost" pages were the judge over-calling color. That is by design. The judge's instructions resolve doubt toward color, and when its answer can't be parsed the page stays color. That's the right policy for a judge whose mistakes ship. It also means "color lost against the judge" counts the judge's caution as the student's error.

I had seen this in September and not generalized it. In that run the student converted two webmail printouts that the judge had kept in color. The only color on them was banner ads and the mail client's toolbar; the message was black text. The student was right, and the judge's instructions got a new line saying advertising color is not content.

## Reviewing the disagreements

What I needed was to look at every page where the two disagreed in the direction that matters. I retrained the whole-page head on the production embeddings for the same orders (the vectors the pipeline actually has in hand), set the cutoff at 0.995, and ran it over every order outside that set:

```
orders 4235, pages 1135390, student would decide 984424 (86.7%)
```

On 1,953 of those pages, across 287 orders, the student said black-and-white and the judge had not.

The first review format was going to be one long PDF of sheets, and with more than a thousand pages to rule on I'd have had no way to answer it. The second was a small web page I could use from my phone: one order per screen, tap only the pages that must stay color.

Not every page could be shown. For 72 orders the original files no longer added up to the page count that had been judged, and I wasn't going to rule on a page that might be the wrong page. The board ended up with 943 pages from 211 orders.

The student was right on 941. The two I kept in color were in the same order, at p(bw) 0.99504 and 0.99716. One was a text-message screenshot with colored bubbles, where the color is who said what. So I moved the cutoff to 0.998. By then some of the missing orders had been rebuilt, and I reviewed their disagreements at or above the new line: 172 pages across 19 orders. None needed to stay color. Another 635 disagreement pages in 44 orders could not be matched page-for-page, and I have not looked at those.

There is one thing I can't explain. The head trained from the 1.2-million-page log decided 9.0% of its held-out pages at 0.995. The head trained from the 52,019-page set, same architecture and same loss weights, decided 87.9% of its own. So 0.998 is a number for this one set of weights, and a retrained head would need its own review.

## What shipped

```python
for cls, p in zip(scored, student_p_bw(head, [c.embedding for c in scored])):
    if p >= settings.student_threshold:
        _record_verdict(
            cls,
            {
                "verdict": "agree" if cls.label == "bw_text" else "override",
                "suggested_label": "bw_text",
                "mn_verdict": "student",
                "reason": f"DINO student p(bw_text)={p:.4f}",
                "gate_hit": False,
            },
            settings,
            stats,
            now,
            student_p=p,
        )
        decided.add(cls.page_number)
```

The student can say one thing, "black-and-white," and only at 0.998 or above. Every page it is less sure about goes to the judge, including every page it thinks is color, so the judge still makes every color call. Student verdicts are stamped and kept out of the training log so the next head never learns from the last one's output. A missing or malformed weights file means every page is judged, same as before.

The 199,689-page order went back in that night:

```
03:56:29 QA override: DINO student decided 193035 page(s) at p(bw) >= 0.998; 6654 go to the judge
04:14:41 QA override pass complete: judged=6654 ...
```

Eighteen minutes for a pass that had been on track for about 44 hours. The full-detail fingerprint I spent the evening building isn't in production.
