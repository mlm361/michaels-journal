#!/usr/bin/env bash
# Cloudflare Pages build entry point for michaelreflects.com (JOURNAL-CSP-01).
#
# The Pages dashboard runs: bash tools/pages-build.sh
# This revision declares CSP_PHASE=2b-enforce (Phase 2b: csp/phase2.policy is enforced,
# csp/phase3-report-only.policy is sent alongside as Report-Only, and violation reports go to
# functions/api/csp-report.js). The build steps below are the dashboard's baseline command
# recorded 2026-11-22 (docs/csp/phase0-baseline.md), unchanged. After them, three steps always
# run: the preview step (nothing changes on master), the inline-code data for the collector,
# then the header gate.
# Each later CSP phase edits this file and declares its own phase; the header gate
# always runs, with no skip path. See docs/csp/phase0-baseline.md for the rollback.
set -euo pipefail

CSP_PHASE=2b-enforce

# --- Baseline build (verbatim from the dashboard, one command per line) ---
archive="$(mktemp)"
zola_dir="$(mktemp -d)"
curl -fsSL -o "$archive" "https://github.com/getzola/zola/releases/download/v0.23.6/zola-v0.23.6-x86_64-unknown-linux-gnu.tar.gz"
printf '%s  %s\n' '8f5132b3522412d04e395e0b25f6d68613ad272a873e54a2b3ebf664873024a4' "$archive" | sha256sum -c -
tar -xzf "$archive" -C "$zola_dir"
"$zola_dir/zola" --version
"$zola_dir/zola" build

# --- Preview only: rebuild with the preview's own base URL, add the CSP fixtures (always runs) ---
node tools/csp-preview.mjs "$zola_dir/zola"

# --- Collector data: page routes, inline-code positions, shipped policies (always runs) ---
node tools/csp-inline-inventory.mjs emit public

# --- CSP header gate for this revision's declared phase (always runs) ---
node tools/csp-headers-check.mjs "$CSP_PHASE" public/_headers csp/phase2.policy csp/phase3-report-only.policy
