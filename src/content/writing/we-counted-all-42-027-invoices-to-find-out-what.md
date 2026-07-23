---
title: "We Counted All 42,027 Invoices to Find Out What 'Automatic Billing' Actually Means"
date: "June 2026"
readTime: "6 min"
tags: ["Python", "SQL Server", "Data Analysis"]
---

## The question nobody could answer with a number

Someone wants to build a dashboard that promises "automatic billing." Before anyone writes a line of it, I want to know what fraction of our actual invoicing is already mechanical versus how much still needs a human to type something in. Everyone has an opinion. Nobody has a number. So I decided to get one, and to get it from every invoice we'd issued in 2026 so far, not a sample.

That turned out to be 42,027 invoices and 226,699 individual line items, from January 1 through June 23. I extracted each invoice's header (both the ordering customer and the bill-to customer, which are frequently not the same entity), every detail line, and the full reference set the billing engine actually uses: rate cards, item codes, billing styles, customer types, sales tax rules, and the general ledger mapping. The extraction itself was a single serial pass over the database, index-seeked so it didn't compete with production traffic; everything after that ran offline against CSVs.

I split the work across several agents so I could get through all six months and a few cross-cutting questions in the same session instead of one long linear pass. One agent per month, plus a few specialists on relationships that only show up when you look across the whole year at once.

## Classifying every line against its rate card

The billing engine's own rule is simple: for a given (customer type, billing style) pair, an item is either on the rate card with automatic billing turned on, on the card with automatic billing turned off (meaning someone has to manually enter a quantity), or not on the card at all, meaning it got typed in free-form. I classified all 226,699 lines into those three buckets.

The headline split held steady across every one of the six months: about 76% of lines were auto-billed off the card, about 23% were manual-but-catalogued, and just over 1% were free-form off-card entries.

## The number I had to walk back

I reported that 1% figure once and then had to correct it. The classifier matches a line's title against the rate card by looking up the corresponding item code, but title-to-item-code is not one-to-one. The same service title can map to two different item codes depending on context, and some customers' rate cards fold several distinct services into a single combined item. A naive matcher sees a title that doesn't match the specific code it expected and flags the line as off-card, when the work was in fact catalogued, just filed under a different or combined code.

That mismatch was inflating the off-card count by roughly three points of the underlying line population. Once I accounted for the folded and aliased codes, the true free-form share came out smaller than my first pass reported, which only strengthens the case that billing is more automatable than it looks, not less. The lesson: when a classifier's "no match" bucket is doing a lot of work, check whether "no match" actually means "no match" or just "no match against the one code I thought to check."

## Tax turned out to be a solved problem already

Before I trusted the classifier on anything else, I checked whether the tax math held up across all 42,027 invoices. It did, exactly, every month: taxable amount equals the sum of line totals flagged taxable, and tax due equals taxable amount times the jurisdiction's rate, to the penny, with zero exceptions. The taxable flag lives per line, not per billing style, which matters: a style that's mostly untaxed can still carry one individually taxable line, so a check that tries to shortcut by style instead of by line will misfire.

## Designing the check instead of the rebuild

With the classification in hand, tiering the invoices themselves was the real payoff. About a third needed zero human input at all: every line on the invoice was already an automatic card item. Another majority chunk added only manual-but-catalogued items, meaning the rate and the item are both known, someone just has to say which enhancements were done and how many, most of which is a page count anyway. The remainder, roughly one in twenty invoices, had at least one genuinely free-form line or was a credit reversing a prior invoice.

That's the finding that mattered: about 95% of what we bill is mechanically reproducible straight from the rate cards. The dashboard people wanted didn't need to reinvent billing logic. It needed to capture the manual-but-catalogued add-ons at order time and route the small free-form remainder to a human queue instead of trying to automate it away. I sketched the check itself as: validate the tax math, confirm every charged line maps to a card row (checking all candidate codes and folded items, not just the first-guess one), and flag anything off-card or any credit line for a person. One rule I deliberately left out was requiring every possible automatic item to be present on an invoice. Several of the automatic items are usage-driven and are correctly absent most of the time, so a completeness check like that would false-positive on the majority of invoices for no reason.

## The one recurring customer that didn't fit the model

Everything above assumed a customer maps cleanly to one price tier. One high-volume law firm blew that up: the same firm's business was split across dozens of separate billing codes, differing by which regional office took the order and which insurer was footing the bill, with no single code as the "real" one. The billing engine sets price tier per invoice from whichever code got picked, and two of those codes for what should have been the identical service came out at roughly double each other's automatic base fee. Worse, I found one case where the same insurer, billed through two different regional codes for the same firm, resolved to two different price tiers, which reads less like intentional pricing and more like a data entry drift nobody caught.

That isn't free-form work at all. It's a lookup problem, and the lookup has to happen at order intake, where someone picks the correct code for that office and that insurer instead of guessing off the firm's name. Once the right code is attached to the order, both the price tier and the tax jurisdiction fall out as pure lookups. Getting that one selection right at the front door turned out to matter more than any billing logic downstream of it.

The number I walked in with was a guess. The number I walked out with was 95%, and I can point to the invoice, the line, and the rate-card row behind every percentage point of it.
