#!/usr/bin/env python3
"""Fetch standard.site AT Protocol records from Bridgy Fed and write a
build-time map for the Zola theme.

Output: data/standard_site.json with shape:
    {
      "publication": "at://did:plc:.../site.standard.publication/<rkey>",
      "documents": {
        "/ai-isnt-black-and-white/": "at://did:plc:.../site.standard.document/<rkey>",
        ...
      }
    }

The Zola theme reads this at build time and emits matching <link> tags
in <head> so Bluesky can render enhanced cards for michaelreflects.com
posts. See themes/ergo/templates/base.html.

Source of truth: Bridgy Fed's AT Protocol PDS at https://atproto.brid.gy
where this site's bridged records live. Bridgy Fed mints these records
automatically when posts get bridged to Bluesky.

Atomicity: writes to a tmp file, validates parse + non-empty publication,
then os.replace() onto the live file. On any fetch or validation
failure leaves the existing file untouched and exits non-zero with a
"kept previous good map" message. The GitHub Action that runs this on
an hourly schedule commits the file only when it changes.

Usage:
    python tools/fetch_standard_site.py            # write data/standard_site.json
    python tools/fetch_standard_site.py --dry-run  # print, don't write

No auth required — the PDS endpoints are public reads.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, List, Tuple


REPO_DID = "did:plc:2nnlojyhluftr7pcobjecpxr"
PDS_BASE = "https://atproto.brid.gy"
LIST_RECORDS = "/xrpc/com.atproto.repo.listRecords"
DOC_COLLECTION = "site.standard.document"
PUB_COLLECTION = "site.standard.publication"

USER_AGENT = (
    "Mozilla/5.0 (compatible; MichaelsJournalStandardSiteFetcher/1.0; "
    "+https://michaelreflects.com)"
)

OUT_PATH = Path(__file__).resolve().parent.parent / "data" / "standard_site.json"


def _fetch_collection(collection: str) -> List[Dict[str, Any]]:
    """Paginate listRecords for a collection. Returns all records."""
    records: List[Dict[str, Any]] = []
    cursor: str | None = None
    page = 0
    while True:
        page += 1
        params = [
            f"repo={REPO_DID}",
            f"collection={collection}",
            "limit=100",
        ]
        if cursor:
            params.append(f"cursor={cursor}")
        url = f"{PDS_BASE}{LIST_RECORDS}?" + "&".join(params)
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        with urllib.request.urlopen(req, timeout=20) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        records.extend(payload.get("records", []))
        cursor = payload.get("cursor")
        if not cursor:
            break
        if page > 50:
            # Bail-out so a misbehaving PDS can't spin us forever.
            raise RuntimeError(f"{collection} pagination exceeded 50 pages")
    return records


def _build_map(
    pub_records: List[Dict[str, Any]],
    doc_records: List[Dict[str, Any]],
) -> Tuple[Dict[str, Any], Dict[str, int]]:
    summary = {
        "publication_records": len(pub_records),
        "document_records": len(doc_records),
        "documents_mapped": 0,
        "documents_dropped_missing_path": 0,
        "documents_deduped": 0,
    }

    if not pub_records:
        raise RuntimeError("No site.standard.publication records found")

    # Pick the first publication record. There should only ever be one;
    # if Bridgy Fed ever publishes more, prefer the lowest-sorted URI for
    # deterministic output and log the rest.
    pub_uri = sorted(r["uri"] for r in pub_records)[0]

    # Sort doc records by path then by createdAt descending (most-recent
    # wins on duplicates).
    by_path: Dict[str, Dict[str, Any]] = {}
    for r in doc_records:
        value = r.get("value") or {}
        path = value.get("path")
        if not path:
            summary["documents_dropped_missing_path"] += 1
            continue
        existing = by_path.get(path)
        if existing is None:
            by_path[path] = r
            continue
        # Duplicate path. Keep the one with later createdAt (or higher uri
        # as a tiebreaker).
        ex_value = existing.get("value") or {}
        old_created = ex_value.get("createdAt") or ""
        new_created = value.get("createdAt") or ""
        if (new_created, r["uri"]) > (old_created, existing["uri"]):
            by_path[path] = r
        summary["documents_deduped"] += 1

    documents = {
        path: rec["uri"]
        for path, rec in sorted(by_path.items())
    }
    summary["documents_mapped"] = len(documents)

    return {"publication": pub_uri, "documents": documents}, summary


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true",
                        help="Print the JSON without writing to disk.")
    args = parser.parse_args()

    try:
        pub_records = _fetch_collection(PUB_COLLECTION)
        doc_records = _fetch_collection(DOC_COLLECTION)
    except urllib.error.URLError as e:
        print(f"FETCH FAILURE: {e}", file=sys.stderr)
        print("kept previous good map (no write)", file=sys.stderr)
        return 1
    except Exception as e:
        print(f"FETCH FAILURE: {e}", file=sys.stderr)
        print("kept previous good map (no write)", file=sys.stderr)
        return 1

    try:
        payload, summary = _build_map(pub_records, doc_records)
    except Exception as e:
        print(f"BUILD FAILURE: {e}", file=sys.stderr)
        print("kept previous good map (no write)", file=sys.stderr)
        return 1

    body = json.dumps(payload, indent=2, sort_keys=False) + "\n"

    if args.dry_run:
        print(body, end="")
        print(f"summary: {summary}", file=sys.stderr)
        return 0

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = OUT_PATH.with_suffix(".json.tmp")
    tmp_path.write_text(body, encoding="utf-8")

    # Validate: re-parse the tmp file before swapping into place.
    try:
        reparsed = json.loads(tmp_path.read_text(encoding="utf-8"))
        if not reparsed.get("publication"):
            raise ValueError("validation: publication is empty")
    except Exception as e:
        print(f"VALIDATION FAILURE: {e}", file=sys.stderr)
        try:
            tmp_path.unlink()
        except Exception:
            pass
        print("kept previous good map (no write)", file=sys.stderr)
        return 1

    os.replace(tmp_path, OUT_PATH)
    print(f"wrote {OUT_PATH}", file=sys.stderr)
    print(f"summary: {summary}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
