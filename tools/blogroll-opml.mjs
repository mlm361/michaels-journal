// The blogroll as OPML (static/blogroll.opml), generated from templates/partials/blogroll.html so the
// page stays the one list to edit. Michael's own sites ("My other blogs", and any link to one of
// his domains) are left out.
//
//   node tools/blogroll-opml.mjs           rewrite static/blogroll.opml
//   node tools/blogroll-opml.mjs --check   npm test: fail if the committed file is out of date
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PARTIAL = 'templates/partials/blogroll.html';
export const OUTPUT = 'static/blogroll.opml';
export const SKIPPED_CATEGORIES = new Set(['My other blogs']);
export const OWN_DOMAINS = [
  'michaelreflects.com', 'mitchelltribe.com', 'michaelmusings.com', 'michaelmitchell.blog',
  'michaelponders.com', 'michaelleemitchell.net',
];

const decode = (text) => text.replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function isOwnSite(url) {
  const host = new URL(url).hostname.toLowerCase();
  return OWN_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
}

// [{ category, items: [{ name, htmlUrl, xmlUrl }] }] in page order.
export function readBlogroll(html) {
  const categories = [];
  const blocks = html.split('<div class="blogroll-category">').slice(1);
  for (const block of blocks) {
    const heading = block.match(/<h4 class="blogroll-cat-heading">([^<]+)<\/h4>/);
    if (!heading) throw new Error('blogroll: a category has no heading');
    const category = decode(heading[1].trim());
    const items = [];
    for (const item of block.split('<div class="blogroll-item').slice(1)) {
      const name = item.match(/<a href="([^"]+)" class="blogroll-name[^"]*"[^>]*>\s*(?:<span[^>]*>.*?<\/span>\s*)?(?:<span>)?([^<]+)/s);
      const feed = item.match(/<a href="([^"]+)" class="blogroll-rss"/);
      if (!name || !feed) throw new Error(`blogroll: an item in "${category}" has no name link or feed link`);
      items.push({ name: decode(name[2].trim()), htmlUrl: decode(name[1]), xmlUrl: decode(feed[1]) });
    }
    categories.push({ category, items });
  }
  return categories;
}

export function toOpml(categories) {
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '  <head>',
    '    <title>Michael Mitchell\'s blogroll</title>',
    '    <ownerName>Michael Mitchell</ownerName>',
    '    <ownerId>https://michaelreflects.com/</ownerId>',
    '    <docs>https://opml.org/spec2.opml</docs>',
    '  </head>',
    '  <body>',
  ];
  for (const { category, items } of categories) {
    if (SKIPPED_CATEGORIES.has(category)) continue;
    const kept = items.filter((i) => !isOwnSite(i.htmlUrl) && !isOwnSite(i.xmlUrl));
    if (!kept.length) continue;
    lines.push(`    <outline text="${escape(category)}" title="${escape(category)}">`);
    for (const i of kept) {
      lines.push(`      <outline type="rss" text="${escape(i.name)}" title="${escape(i.name)}" xmlUrl="${escape(i.xmlUrl)}" htmlUrl="${escape(i.htmlUrl)}"/>`);
    }
    lines.push('    </outline>');
  }
  lines.push('  </body>', '</opml>');
  return lines.join('\n') + '\n';
}

export function generate(dir = root) {
  return toOpml(readBlogroll(fs.readFileSync(path.join(dir, PARTIAL), 'utf8')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const want = generate();
  const file = path.join(root, OUTPUT);
  if (process.argv.includes('--check')) {
    const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (have !== want) {
      console.error(`blogroll-opml: ${OUTPUT} is out of date; run: node tools/blogroll-opml.mjs`);
      process.exit(1);
    }
    console.log(`blogroll-opml: ${OUTPUT} matches the blogroll`);
  } else {
    fs.writeFileSync(file, want);
    console.log(`blogroll-opml: wrote ${OUTPUT}`);
  }
}
