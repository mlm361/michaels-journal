#!/usr/bin/env bash
# Cloudflare Pages build entry point for michaelreflects.com (JOURNAL-CSP-01 Phase 0).
#
# The Pages dashboard runs: bash tools/pages-build.sh
# This revision declares CSP_PHASE=none. The build steps below are the dashboard's
# baseline command recorded 2026-11-22 (docs/csp/phase0-baseline.md), unchanged.
# Each later CSP phase edits this file and declares its own phase; the header gate
# always runs, with no skip path. See docs/csp/phase0-baseline.md for the rollback.
set -euo pipefail

CSP_PHASE=none

# --- Baseline build (verbatim from the dashboard, one command per line) ---
archive="$(mktemp)"
zola_dir="$(mktemp -d)"
curl -fsSL -o "$archive" "https://github.com/getzola/zola/releases/download/v0.23.6/zola-v0.23.6-x86_64-unknown-linux-gnu.tar.gz"
printf '%s  %s\n' '8f5132b3522412d04e395e0b25f6d68613ad272a873e54a2b3ebf664873024a4' "$archive" | sha256sum -c -
tar -xzf "$archive" -C "$zola_dir"
"$zola_dir/zola" --version
"$zola_dir/zola" build

# --- CSP header gate for this revision's declared phase (always runs) ---
node tools/csp-headers-check.mjs "$CSP_PHASE" public/_headers
