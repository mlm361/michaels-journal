#!/usr/bin/env python3
"""Verify that every standard.site document in data/standard_site.json actually
resolves to a live michaelreflects.com page carrying the matching verification
<link> tags.

Why this exists: Bridgy Fed mints a `site.standard.document` record keyed to the
URL it bridged. `fetch_standard_site.py` maps that record's `path` -> at-URI, and
`themes/ergo/templates/base.html` renders `<link rel="site.standard.document">`
only when the page's `current_path` matches a key. If a post's slug later drifts
from the bridged path (e.g. Blog Poster regenerates a different slug), the live
page silently stops emitting the tag, and strict standard.site readers (pckt,
docs.surf, Leaflet) can no longer verify the doc. That failure is invisible at
publish time. This check makes it loud.

For each documents entry it confirms:
  1. SITE + path returns HTTP 200.
  2. The page emits `<link rel="site.standard.document" href="<at-uri>">` whose
     href equals the mapped record URI.
  3. The page emits `<link rel="site.standard.publication" href="<pub-uri>">`.

Exit non-zero (and emit GitHub `::error::` annotations) if any entry fails, so the
scheduled workflow goes red and notifies. Known-unfixable Bridgy-side strays are
listed in IGNORE_PATHS so the signal stays actionable.

Usage:
    python tools/verify_standard_site.py            # verify live site
    python tools/verify_standard_site.py --site http://localhost:1111
No auth required — reads the public map file and public pages.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import List, Tuple

SITE = "https://michaelreflects.com"
MAP_PATH = Path(__file__).resolve().parent.parent / "data" / "standard_site.json"

USER_AGENT = (
    "Mozilla/5.0 (compatible; MichaelsJournalStandardSiteVerifier/1.0; "
    "+https://michaelreflects.com)"
)

# Paths we know are broken at the record layer and cannot fix ourselves because
# the record lives on Bridgy Fed's DID (we can't sign it to delete/repath).
# Documented so this stays a deliberate exclusion, not a silent skip.
IGNORE_PATHS = {
    # Duplicate of the live /notes/british-humor/ record; the /blog/ permalink
    # 404s. Stray on Bridgy's PDS — cosmetic, not deletable by us.
    "/blog/british-humor/",
}

_LINK_RE = re.compile(
    r'<link\b[^>]*\brel="site\.standard\.(document|publication)"[^>]*\bhref="([^"]+)"',
    re.IGNORECASE,
)


def _fetch(url: str, *, attempts: int = 2, timeout: int = 20) -> Tuple[int, str]:
    """Fetch url, returning (status, body). Retries once on transient errors to
    ride out CDN/deploy propagation."""
    last_err: Exception | None = None
    for i in range(attempts):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return resp.getcode(), resp.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            return e.code, ""
        except Exception as e:  # URLError / timeout / socket
            last_err = e
            if i + 1 < attempts:
                time.sleep(5)
    raise last_err if last_err else RuntimeError("unreachable")


def _links(html: str) -> dict[str, set[str]]:
    """Extract {rel-suffix -> set(hrefs)} for the two standard.site rels."""
    out: dict[str, set[str]] = {"document": set(), "publication": set()}
    for kind, href in _LINK_RE.findall(html):
        out[kind.lower()].add(href)
    return out


def verify(site: str) -> List[str]:
    data = json.loads(MAP_PATH.read_text(encoding="utf-8"))
    pub_uri = data.get("publication") or ""
    documents = data.get("documents") or {}
    failures: List[str] = []

    if not pub_uri:
        failures.append("map has no publication URI")

    for path, want_uri in sorted(documents.items()):
        if path in IGNORE_PATHS:
            print(f"ignore  {path} (known Bridgy-side stray)")
            continue
        url = site.rstrip("/") + path
        try:
            code, html = _fetch(url)
        except Exception as e:
            failures.append(f"{path}: fetch error {e}")
            continue
        if code != 200:
            failures.append(f"{path}: HTTP {code} (page missing/moved)")
            continue
        found = _links(html)
        problems: List[str] = []
        if want_uri not in found["document"]:
            problems.append(
                f"{path}: missing/mismatched site.standard.document tag "
                f"(want {want_uri}, page has {sorted(found['document']) or 'none'})"
            )
        if pub_uri and pub_uri not in found["publication"]:
            problems.append(f"{path}: missing site.standard.publication tag")
        if problems:
            failures.extend(problems)
        else:
            print(f"ok      {path}")
    return failures


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site", default=SITE,
                        help=f"Base URL to verify against (default {SITE}).")
    args = parser.parse_args()

    try:
        failures = verify(args.site)
    except Exception as e:
        print(f"::error::standard.site verify aborted: {e}")
        return 2

    if failures:
        for f in failures:
            print(f"::error::standard.site drift: {f}")
        print(f"\nFAILED: {len(failures)} standard.site verification problem(s). "
              "A post's page is not exposing the <link> tag its Bridgy record "
              "expects — readers cannot verify it. Usually a slug drifted off the "
              "bridged path; realign the slug (+ alias the old URL).")
        return 1

    print("\nOK: every standard.site document resolves to a live page with matching tags.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
