// Run after building both the frozen parent and the sitemap-only correction.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const [site, baseline] = process.argv.slice(2);
assert.ok(site && baseline, 'usage: node tests/sitemap-build.assert.mjs SITE_DIR BASELINE_DIR');
function entries(directory) {
  const xml = fs.readFileSync(path.join(directory,'sitemap.xml'),'utf8');
  return [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => ({
    loc: /<loc>([\s\S]*?)<\/loc>/.exec(match[1])[1],
    lastmod: /<lastmod>([\s\S]*?)<\/lastmod>/.exec(match[1])?.[1] || null,
  }));
}
const before = entries(baseline), after = entries(site);
const shell = 'https://michaelreflects.com/reply-shell/';
assert.equal(before.filter(entry=>entry.loc===shell).length,1,'baseline must prove the reported internal entry exists');
assert.equal(after.filter(entry=>entry.loc===shell).length,0,'internal noindex shell must not be advertised in sitemap');
assert.equal(after.length,before.length-1,'remove exactly one entry');
const records = values => values.map(value=>JSON.stringify(value)).sort();
assert.deepEqual(records(after),records(before.filter(entry=>entry.loc!==shell)),'all other URLs and lastmod metadata must remain identical');
assert.match(fs.readFileSync(path.join(site,'reply-shell/index.html'),'utf8'), /<meta name="robots" content="noindex,nofollow,noarchive">/);
console.log(`Sitemap PASS: ${before.length} -> ${after.length}; only /reply-shell/ removed; every other URL/lastmod unchanged; shell still rendered and noindex`);
