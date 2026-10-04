---
title: "The Name Filter That Returned the Wrong Folder"
date: "October 2026"
readTime: "7 min"
tags: ["Python", "APIs", "Reliability"]
---

At the office, staff deliver a finished order by dropping a zip into a staging folder. A small Python service picks it up on a schedule, works out which client the order belongs to, uploads the zip into that client's folder in a cloud file-sharing service, and emails the client a download link. The client folders are named after the firms, so finding one means asking the service for a child of the production folder by name. The API has an OData filter for that, and the first version of `find_child` used it the obvious way:

```python
safe = name.replace("'", "''")
resp = self._api(
    "GET",
    f"/Items({parent_id})/Children",
    params={"$filter": f"Name eq '{safe}'", "$top": 1, "$select": "Id,Name"},
)
...
items = body.get("value") or body.get("Items") or []
return items[0] if items else None
```

That function was wrong in two different ways, and I found them ten days apart. What follows is what I saw against our account on August 24 and September 3, 2026. The firm, patient and order names are invented.

## Nine folders, four with the same Id

Before go-live I had a map from customer code to folder name: 91 codes across 9 folders. I wrote a throwaway script to resolve each folder name against the live account and print `OK` or `MISSING`:

```
OK      Alder Law Offices  (Id fo3c1a77-e90...)
OK      Brandt  (Id fo81d2b4-07a...)
OK      R. J. Castellan & Associates  (Id fo52f9c0-b16...)
OK      Harlow, Pike, & Dunn  (Id fo52f9c0-b16...)
OK      Linden - Northside  (Id fo6e40d8-2cf...)
OK      Mercer East  (Id fo947a15-d3c...)
OK      Daniel K. Marsh  (Id fo52f9c0-b16...)
OK      Voss, Ibarra, & Lindqvist  (Id fo52f9c0-b16...)
OK      Stroud  (Id fo2b8873-a05...)
```

Nine `OK`s, because all the script checked was that something came back. Four of those rows carry the same Id. Three of the four names contain an ampersand, and the fourth is the folder all three resolved to.

I listed the production folder's real children and compared Ids. Every name without an `&` matched. Every name with one came back as Daniel K. Marsh: a successful response with one item in it, and the item was a different firm. Those three folders account for 26 of the 91 codes. On the first real order for any of them, the service would have uploaded one firm's records into another firm's folder.

`requests` percent-encodes the parameter, so my `&` isn't splitting the query string on the way out. What the server does with it after that I can't see.

The fix was to check the name on whatever comes back, and if it isn't the one I asked for, page the folder and compare names myself:

```python
if items and (items[0].get("Name") or "").casefold() == name.casefold():
    return items[0]
return self._find_child_by_listing(parent_id, name)
```

`_find_child_by_listing` pulls children 500 at a time with `$top` and `$skip` and does a casefolded comparison on each. I reran the comparison and all nine matched.

## The shortcut that undid half of it

That version also sent every empty filter result to the listing. Nothing I'd seen required that. It was just how the fallthrough was written.

The next commit, 46 minutes after that one, was an audit pass, and it took the fallthrough away. `find_child` runs before every upload as a duplicate check, and again for each ` (1)`, ` (2)` candidate when a name is taken, and the answer to most of those calls is "nothing there." Paging a whole client folder to confirm an absence the filter had already reported looked like waste, so I added a short-circuit:

```python
if not items and "&" not in name:
    # Empty result for a name the filter handles correctly = truly
    # absent. Skipping the full listing avoids paging the whole
    # folder on every collision probe.
    return None
```

The comment calls it "a name the filter handles correctly." What I actually knew was that the filter mishandled `&`. I hadn't tried any other character.

## Four alerts for one file

On September 3 someone staged an order for a patient with an apostrophe in the surname. The service log:

```
2026-09-03 05:55:00 [INFO] src.pipeline - Picked up: 481207-07 O'Hara.zip
2026-09-03 05:55:55 [ERROR] src.pipeline - FAILED 481207-07 O'Hara.zip: Upload failed: Uploaded but could not find "481207-07 O'Hara.zip" in folder
```

The same pair of lines repeats at 6:57, 7:28 and 9:01. Each failure moved the zip to the failed folder and emailed the person who staged it. The alert said the upload did not go through, that the transfer had "failed part-way," that this was usually a temporary hiccup, and that they should move the file back into staging so the system would try again. So they did, three more times, and then sent the order to the client by hand.

The error string says what happened if you read it literally: uploaded, but could not find. The upload POST had returned success. The response to that POST is typically a small JSON body or a plain OK, so the code looks the new item up by name afterwards to get an Id for the share link. That lookup came back empty, the code raised, and the pipeline filed the whole thing under `upload_failed`. The duplicate check before the upload uses the same lookup, so every retry asked whether the file was already there, was told no, and sent it again. I don't know what the service did with the repeats. When I listed the folder around noon it held one copy.

I reproduced it against the folder with the file sitting in it:

```
OData filter -> 200 []
find_child -> None
listing fallback -> 481207-07 O'Hara.zip
```

The apostrophe was escaped correctly. OData wants single quotes doubled, the code doubles them, and there had been a unit test asserting `Name eq 'Don''t break.zip'` since the initial scaffold in May. It was green the whole time, because it tests my escaping against a mock. The live server takes the correctly escaped literal and returns a 200 with an empty list.

So the same filter fails two ways. With an ampersand it returns the wrong item, with an apostrophe it returns nothing, and neither comes back as an error.

## The second fix

This time I replaced the denylist of one character with an allowlist:

```python
_FILTER_SAFE_NAME = re.compile(r"^[A-Za-z0-9 ._()\-]+$")
```

```python
if items and (items[0].get("Name") or "").casefold() == name.casefold():
    return items[0]
if not items and _FILTER_SAFE_NAME.match(name):
    return None
return self._find_child_by_listing(parent_id, name)
```

A hit counts only if the name on it matches. An empty result counts only if the name is made of letters, digits, spaces, dots, underscores, hyphens and parentheses. Parentheses are in there because collision names look like `123456-01 SMITH (1).zip`, and those probes are the calls the short-circuit exists for. Anything else pages the folder. The listing stops after 200 pages no matter what, and it keeps going as long as any items come back instead of stopping at the first short page, in case the server caps `$top` below the 500 I asked for.

The tests for this use fakes that misbehave the way the server did. One returns the wrong firm's folder for the filter call and the right one in the listing. One returns an empty list for the filter and the file in the listing. A third asserts that a plain name with an empty result never touches the listing, so the collision probes stay at one request each. The suite was at 142 tests when the second fix shipped.

I still don't know which other characters the filter gets wrong. I haven't tested any. The production folder had 30 client folders in it when I listed it in August, and when someone adds one with a `#` or a `+` in the name, the lookup will page the folder.
