---
title: "Bookmarkable URLs in a Legacy HTML Frameset, Without Giving Up the Frameset"
date: "June 2026"
readTime: "6 min"
tags: ["PHP", "Apache", "Legacy Systems"]
---

## The frameset problem

The office intranet is old-school in the literal sense: it's an HTML frameset. A persistent sidebar in one iframe, page content in another, both loaded inside `index.php`. That layout has one permanent side effect: the address bar never changes. Click through five calendars and ten forms and the URL sitting in the browser is still just `/`. You can't bookmark a specific calendar. You can't send someone a link to a form. You can't hit back and expect anything sensible to happen.

The obvious fix is to rip out the frameset and rebuild the navigation as real pages. That's also a multi-week rewrite of a tool people use every day, for a benefit that doesn't require touching a single page's contents. So the actual fix was: keep the frameset, and fake the URL.

## Faking a URL without owning the page

The trick has three parts. First, `.htaccess` rewrites clean paths like `/calendars/riverside` or `/lists/area-sheet` to `index.php`, the same frameset entry point that used to only handle `/`. Second, `index.php` looks at the requested path and decides what the content iframe should actually load:

```php
$mainSrc = content_src_for(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
if (!$mainSrc) {
    $mainSrc = 'pages/directory.php';
}
```

`content_src_for()` lives in a new file, `includes/routes.php`, and it's the single source of truth for the clean-path-to-content-page map. Some routes are static lookups (`/zip-codes` maps straight to `pages/zipcode.php`), others are pattern matches with a capture group:

```php
if (preg_match('#^/calendars/([^/]+)$#', $path, $m)) {
    return 'pages/calendar.php?slug=' . rawurlencode(rawurldecode($m[1]));
}
```

Third, once the right page is loaded in the iframe, something has to write the pretty URL back into the address bar, because the browser still thinks it's looking at `index.php`.

## Real files always win

Before any of the pretty-path rewriting, `.htaccess` has to get out of the way of anything that's an actual file or directory on disk: CSS, images, the raw PDFs under `forms/`, the `pages/` and `admin/` directories themselves. That check comes first in the rule order for a reason. If a form named `PTORequest.pdf` sits at a real path and a rewrite rule fires anyway and hands it to `index.php`, the download breaks silently and looks like a server bug to whoever reported it. So the ordering is: does a real file answer this request? If yes, serve it and stop. Only after that check fails does the pretty-URL layer get a turn.

Slugs get the same "don't collide with reality" treatment on the PHP side. Calendars didn't get a new database column for their slug. `getCalendarByUrlSlug()` just slugifies the calendar name on the fly and compares:

```php
function getCalendarByUrlSlug($slug) {
    $slug = slugify($slug);
    foreach (getCalendars(false) as $c) {
        if (slugify($c['name']) === $slug) {
            return $c;
        }
    }
    return null;
}
```

No migration, no backfill. The name is still the name; the slug is just a derived view of it that has to stay unique, which is exactly the kind of assumption that needs a test rather than a hope.

## Keeping the address bar honest

The last piece is a small same-origin script sitting in `index.php`, listening for the content iframe's `load` event. When it fires, the script reads the iframe's current location (same-origin, so this is allowed) and works out what the equivalent pretty path should be, then calls `history.replaceState()` to swap it into the address bar without a navigation:

```js
function sync() {
    var cp;
    try {
        var w = frame.contentWindow;
        cp = w.__cleanPath || derive(w.location.pathname, w.location.search);
    } catch (e) { return; }
    if (cp && cp !== location.pathname + location.search) {
        try { history.replaceState(null, '', cp); } catch (e) {}
    }
}
```

Most pages don't need to say anything; the script can derive the clean path just from the loaded PHP file and its query string (`calendar.php` plus a `dept` param becomes `/actions/customer-service`, for instance). A few pages, like the calendar view, set `window.__cleanPath` explicitly instead, because the slug already exists server-side and there's no reason to reverse-engineer it in JavaScript. Either way, once `sync()` runs, Ctrl+D bookmarks the real thing.

## Testing it before it ships

Two routing tables have to agree with each other forever: `content_src_for()`'s pretty-path-to-content-page map, and the reverse map baked into the sync script's `derive()` function. Nothing enforces that they match except discipline, so I wrote `setup/test_routes.php` to at least catch drift in the half that's easy to check in PHP: every static route, every pattern route, the department-code round trip (`billing` / `csr` / `field` / `oe` through their slugs and back), and a full round trip against the live calendar table so slug collisions get caught before a user does. I also added `setup/dev-router.php`, because PHP's built-in dev server ignores `.htaccess` entirely, so without it none of the pretty paths work locally at all.

The run against the current data: 24 route assertions, 36 calendar slug round-trips, 0 collisions. That last number is the one that matters. A collision means two calendars slugify to the same string, and `getCalendarByUrlSlug()` would silently hand back whichever one it found first. Zero collisions today doesn't mean zero forever, which is exactly why that test stays in the repo instead of being a one-off script I ran once and threw away.
