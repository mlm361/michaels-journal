#!/usr/bin/env python3
"""Verify the Journal's fail-silent, feed-identity-safe Bubbles integration."""

from __future__ import annotations

import argparse
import base64
import hashlib
from html.parser import HTMLParser
from pathlib import Path
import sys
import urllib.request
from urllib.parse import urlsplit
import xml.etree.ElementTree as ET


SCRIPT_URL = "https://bubbles.town/vote-v1.js"
EXPECTED_SRI = "sha384-iPZ+izwo1AOEa00AnHP7pK0fffeEeeP05nk7pfPCHkmDnyYpi7/hzWJoMUtsJNvl"
EXPECTED_FEDIVERSE = "@michael@mitchelltribe.social"
FORBIDDEN_WIDGET_PATHS = {
    "/", "/about/", "/archive/", "/blogroll/", "/colophon/", "/gallery/",
    "/notes/", "/on-this-day/", "/privacy/", "/search/", "/stats/",
    "/townsquare/", "/tweets/",
}


class PageFacts(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.widget_urls: list[str] = []
        self.loader_count = 0
        self.official_script_count = 0
        self.og_url: str | None = None
        self.bubbles_fediverse: list[str] = []
        self.action_markers: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        classes = set((values.get("class") or "").split())
        if "data-bubbles-slot" in values:
            self.widget_urls.append(values.get("data-bubbles-url") or "")
            self.action_markers.append("bubbles")
        if "post-actions-break" in classes:
            self.action_markers.append("break")
        if "post-action-kudos" in classes:
            self.action_markers.append("kudos")
        if tag == "script" and values.get("src") == "/js/bubbles-vote-loader.js":
            self.loader_count += 1
        if tag == "script" and values.get("src") == SCRIPT_URL:
            self.official_script_count += 1
        if tag == "meta" and values.get("property") == "og:url":
            self.og_url = values.get("content")
        if tag == "meta" and values.get("name") == "bubbles:fediverse":
            self.bubbles_fediverse.append(values.get("content") or "")


def sri_for(data: bytes) -> str:
    digest = hashlib.sha384(data).digest()
    return "sha384-" + base64.b64encode(digest).decode("ascii")


def check_remote_hash() -> list[str]:
    request = urllib.request.Request(SCRIPT_URL, headers={"User-Agent": "michaels-journal-sri-check/1"})
    with urllib.request.urlopen(request, timeout=20) as response:
        data = response.read(100_000)
        if response.read(1):
            return ["Bubbles widget exceeded the 100 KB verification limit"]
    actual = sri_for(data)
    return [] if actual == EXPECTED_SRI else [f"Bubbles SRI changed: expected {EXPECTED_SRI}, got {actual}"]


def output_url(site_dir: Path, html_file: Path) -> str:
    relative = html_file.relative_to(site_dir).as_posix()
    if relative == "index.html":
        return "/"
    if relative.endswith("/index.html"):
        return "/" + relative[: -len("index.html")]
    return "/" + relative


def atom_urls(site_dir: Path) -> set[str]:
    atom = site_dir / "atom.xml"
    if not atom.is_file():
        return set()
    root = ET.parse(atom).getroot()
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    urls: set[str] = set()
    for entry in root.findall("atom:entry", ns):
        entry_id = (entry.findtext("atom:id", default="", namespaces=ns) or "").strip()
        alternate = ""
        for link in entry.findall("atom:link", ns):
            if link.attrib.get("rel") == "alternate":
                alternate = link.attrib.get("href", "").strip()
                break
        if not entry_id or entry_id != alternate:
            raise ValueError(f"Atom entry identity mismatch: id={entry_id!r}, alternate={alternate!r}")
        urls.add(entry_id)
    return urls


def check_built_site(site_dir: Path) -> list[str]:
    errors: list[str] = []
    feed_urls = atom_urls(site_dir)
    widget_by_url: dict[str, Path] = {}
    homepage_facts: PageFacts | None = None

    for html_file in site_dir.rglob("*.html"):
        facts = PageFacts()
        facts.feed(html_file.read_text(encoding="utf-8"))
        route = output_url(site_dir, html_file)
        if route == "/":
            homepage_facts = facts
        if facts.official_script_count:
            errors.append(f"Official script was emitted eagerly on {route}")
        if route in FORBIDDEN_WIDGET_PATHS and facts.widget_urls:
            errors.append(f"Widget leaked onto utility/listing route {route}")
        if not facts.widget_urls:
            if facts.loader_count:
                errors.append(f"Loader present without a widget slot on {route}")
            continue
        if len(facts.widget_urls) != 1 or facts.loader_count != 1:
            errors.append(f"Expected one slot and loader on {route}; got {len(facts.widget_urls)} and {facts.loader_count}")
            continue
        if facts.action_markers != ["bubbles", "break", "kudos"]:
            errors.append(
                f"Action order must preserve Bubbles before a forced break and Kudos last on {route}: "
                f"{facts.action_markers!r}"
            )
        widget_url = facts.widget_urls[0]
        if not widget_url or widget_url != facts.og_url:
            errors.append(f"Widget URL differs from og:url on {route}: {widget_url!r} != {facts.og_url!r}")
        widget_by_url[widget_url] = html_file

    for feed_url in feed_urls:
        if urlsplit(feed_url).path in FORBIDDEN_WIDGET_PATHS:
            continue
        if feed_url not in widget_by_url:
            errors.append(f"Atom entry has no byte-identical detail-page widget URL: {feed_url}")

    if homepage_facts is None:
        errors.append("Built site is missing the homepage")
    elif homepage_facts.bubbles_fediverse != [EXPECTED_FEDIVERSE]:
        errors.append(
            "Homepage must expose exactly one verified Bubbles Fediverse identity: "
            f"{homepage_facts.bubbles_fediverse!r}"
        )

    loader = site_dir / "js" / "bubbles-vote-loader.js"
    if not loader.is_file():
        errors.append("Built site is missing /js/bubbles-vote-loader.js")
    else:
        source = loader.read_text(encoding="utf-8")
        for required in (
            EXPECTED_SRI, "IntersectionObserver", "opens in a new tab",
            "MutationObserver", "crossOrigin", "markUnavailable", "8000",
        ):
            if required not in source:
                errors.append(f"Loader is missing required safety/accessibility marker: {required}")
        if ".focus(" in source or "autofocus" in source:
            errors.append("Loader must not move keyboard focus")

    privacy = (site_dir / "privacy" / "index.html").read_text(encoding="utf-8")
    for required in ("Bubbles.town", "post's exact public permalink", "random browser ID"):
        if required not in privacy:
            errors.append(f"Privacy disclosure is missing: {required}")
    colophon = (site_dir / "colophon" / "index.html").read_text(encoding="utf-8")
    if "Bubbles.town" not in colophon:
        errors.append("Colophon is missing the Bubbles credit")

    for stylesheet_name in ("default.css", "dark.css"):
        stylesheet = (site_dir / stylesheet_name).read_text(encoding="utf-8")
        for required in ("post-actions-break", "post-action-kudos:empty"):
            if required not in stylesheet:
                errors.append(f"{stylesheet_name} is missing the action-layout fallback: {required}")

    return errors


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-dir", type=Path)
    parser.add_argument("--check-remote-hash", action="store_true")
    args = parser.parse_args()
    if not args.site_dir and not args.check_remote_hash:
        parser.error("provide --site-dir and/or --check-remote-hash")

    errors: list[str] = []
    if args.site_dir:
        errors.extend(check_built_site(args.site_dir.resolve()))
    if args.check_remote_hash:
        errors.extend(check_remote_hash())

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1
    print("Bubbles widget verification passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
