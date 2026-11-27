// JOURNAL-CSP-01 Phase 3 step 0, F1: Cloudflare Email Address Obfuscation rewrites every tag that carries a
// mailto: link onto a single line at the edge. A tag that spans lines in the build therefore loses lines in
// the served page, and every later inline script stops matching the collector's build-time positions
// (step 0 found 581 'ambiguous' reports from the two-line Reply by email link). Keep such tags on one line.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const SOURCES = ['templates', 'themes/ergo/templates', 'content'];
// A whole start tag, quote-aware, so a '>' inside an attribute value doesn't end it.
const START_TAG = /<[a-z][a-z0-9-]*\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;

function files(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files(full, out);
    else if (/\.(html|md)$/.test(entry.name)) out.push(full);
  }
  return out;
}

export function multiLineMailtoTags(text) {
  const found = [];
  for (const m of text.matchAll(START_TAG)) {
    if (/mailto:/i.test(m[0]) && /[\r\n]/.test(m[0])) found.push(text.slice(0, m.index).split('\n').length);
  }
  return found;
}

test('F1: the scanner finds a multi-line mailto tag and accepts a one-line one', () => {
  assert.deepEqual(multiLineMailtoTags('<p>\n<a class="x"\n   href="mailto:a@example.com">hi</a>'), [2]);
  assert.deepEqual(multiLineMailtoTags("<a href='mailto:a@example.com'\n>hi</a>"), [1]);
  assert.deepEqual(multiLineMailtoTags('<a class="x" href="mailto:a@example.com?subject=a%20b">hi</a>\n<b>\n</b>'), []);
  assert.deepEqual(multiLineMailtoTags('<a\nhref="https://example.com">no mail</a>'), []);
});

test('F1: no template or content tag carrying a mailto: link spans more than one line', () => {
  const problems = [];
  for (const dir of SOURCES) {
    for (const file of files(path.join(root, dir))) {
      for (const line of multiLineMailtoTags(fs.readFileSync(file, 'utf8'))) problems.push(`${path.relative(root, file)}:${line}`);
    }
  }
  assert.deepEqual(problems, [], `put these mailto tags on one line: ${problems.join(', ')}`);
});
