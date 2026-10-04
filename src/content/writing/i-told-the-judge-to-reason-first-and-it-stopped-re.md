---
title: "I Told the Judge to Reason First and It Stopped Reaching a Verdict"
date: "October 2026"
readTime: "6 min"
tags: ["Python", "LLM", "Document Processing"]
---

At the office, scanned pages go through a classifier that decides whether each one stays colour or gets converted to 1-bit black and white. Behind the classifier sits a second opinion: a vision model served by vLLM that looks at the page and answers in JSON, a verdict plus a one-line reason. We call it the judge. Its output is constrained by a JSON schema.

In early September I moved one line in that schema. Two days later I was looking at a 19,405-page order that had come out with 15,846 pages in colour.

## Why I moved the line

The schema used to list `verdict` first and `reason` second. Constrained decoding emits properties in schema order, so the model committed to an answer and then wrote its justification. An operator sent back an order where 12 pages had shipped in black and white and shouldn't have. On two pages of that order the judge had recorded `convert` under a reason that read "a real-world photograph of a house ... it is ALWAYS keep_color". It gave the wrong answer and then argued for the right one.

The usual advice is to make the model reason before it decides, so I swapped the order:

```python
_SCHEMA = {
    "type": "object",
    "properties": {
        "reason": {"type": "string", "maxLength": 250},
        "verdict": {"type": "string", "enum": ["keep_color", "convert", "film_image", "uncertain"]},
    },
    "required": ["reason", "verdict"],
    "additionalProperties": False,
}
```

The prompt got a matching instruction: write the reason before the verdict, never decide first and explain after. A test pinned the property order. 61 of 61 passed.

## The cap I didn't resize

There was already a token cap on the judge's replies, set eight days earlier for a different problem. One page had sent the model into a repetition loop inside `reason`, and with no cap it generated to the model default (about 6k tokens, about two minutes) and landed past every client timeout. So:

```python
_MAX_COMPLETION_TOKENS = 400
```

The comment above it says verdicts are under 100 tokens. With verdict first, a cut-off reply still had its verdict anyway: it's enum-locked and already in the prefix, and a regex pulled it out of the broken JSON.

With reason first, everything the model writes before the verdict counts against the cap, and the reasons ran long. The schema says `maxLength: 250` on `reason`, but the constrained decoder evidently doesn't enforce it, so the token cap was the only ceiling. A cut-off reply has this shape (this one is the fixture from the test I wrote afterwards, not a real page):

```
{"reason": "a plain text page with black text on white paper and it goes on and on and
```

The string never closes, `json.loads` raises `JSONDecodeError`, and there's no verdict in the prefix for the regex to find.

I had thought about this case when I swapped the order, and decided it was fine. A truncated reply with no verdict falls through to a default of `keep_color`, which is the safe direction: a page wrongly kept in colour is a bigger file, a page wrongly converted is a ruined photograph. I wrote a comment saying the fallthrough was deliberate. I never asked how often it would happen.

## How often it happened

In three hours on the inference box, 1,377 of 7,021 judge calls hit the cap before the verdict. That's 20%.

The code retries once on invalid output. The retry sent the same messages with the same schema at temperature 0, and on 419 of those it failed the same way. Those took the colour default, about 6% of pages.

Nothing errored. Every one of those pages got a verdict and a reason, and the reason was "defaulted to color: verdict unrecoverable".

I only went looking because a different machine fell over. The 19,405-page order came out with 15,846 pages in colour. The colour renders went to a temp drive on a second box that was already carrying 48 GB of leftovers from earlier orders (a separate bug), the drive filled, and the step that combines the pages back into a PDF died with "encoder error -2".

## The fix

Three changes, one commit.

The cap went from 400 to 900. A repetition loop is still bounded, at roughly 20 seconds, and a long reason has room to finish.

The prompt now caps the reason at 25 words and tells the model why: "a reply that runs long is cut off before the verdict and the page is judged wrong."

The retry became a different request. After a `JSONDecodeError` on the first attempt, the second attempt carries one more user turn:

```python
_TRUNCATION_NUDGE = (
    "Your previous reply was cut off before the verdict. Answer again with the "
    "same JSON, keeping the reason to at most 25 words, then the verdict."
)
```

```python
if isinstance(exc, json.JSONDecodeError) and attempt == 1:
    # Truncated mid-reason: make attempt 2 a different
    # request, not a replay
    messages = messages + [{"role": "user", "content": _TRUNCATION_NUDGE}]
```

The new test feeds the judge that truncated fixture, then a complete reply. It asserts that the second request has exactly one more message than the first, that the message contains "cut off", and that the verdict from the second reply is the one used. 65 of 65 passed.

## What I check now

Reason-first was the right change and it's still in. What I got wrong was the cap. 400 was sized for a reply with the answer at the front, and I moved the answer to the back without touching it.

The colour default hid it. Every truncated page still came back with a valid verdict, so the only trace was a warning in the inference server's log. After any change to the prompt or the schema I now check the invalid-output rate first.

The schema change went in on a Wednesday morning. I committed the fix that Friday just after noon, and the comment above the cap now carries the number: 1,377 of 7,021.
