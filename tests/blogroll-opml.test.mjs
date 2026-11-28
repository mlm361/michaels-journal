// static/blogroll.opml is generated from templates/partials/blogroll.html (tools/blogroll-opml.mjs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { OUTPUT, PARTIAL, generate, isOwnSite, readBlogroll, toOpml } from '../tools/blogroll-opml.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('the committed OPML matches the blogroll page (run: node tools/blogroll-opml.mjs)', () => {
  assert.equal(read(OUTPUT), generate(root));
  assert.doesNotMatch(read(OUTPUT), /\r/);
});

test('every blogroll entry outside "My other blogs" is in the OPML, with its page and feed', () => {
  const categories = readBlogroll(read(PARTIAL));
  const opml = read(OUTPUT);
  const feeds = [...opml.matchAll(/<outline type="rss" text="([^"]*)" title="[^"]*" xmlUrl="([^"]*)" htmlUrl="([^"]*)"\/>/g)];
  const expected = categories.filter((c) => c.category !== 'My other blogs').flatMap((c) => c.items);
  assert.equal(feeds.length, expected.length);
  assert.ok(expected.length >= 35);
  for (const f of feeds) {
    assert.match(f[2], /^https?:\/\//);
    assert.match(f[3], /^https?:\/\//);
  }
  assert.ok(opml.includes('text="Dale Mellor" title="Dale Mellor" xmlUrl="https://khleedril.org/blog/rss" htmlUrl="https://khleedril.org/blog"'));
  const tech = opml.split('<outline text="Tech &amp; Gadgets"')[1].split('</outline>\n    <outline text=')[0];
  assert.ok(tech.includes('Dale Mellor'), 'Dale Mellor is filed under Tech & Gadgets');
});

test("Michael's own sites are never in the OPML", () => {
  const categories = readBlogroll(read(PARTIAL));
  const own = categories.find((c) => c.category === 'My other blogs');
  assert.ok(own && own.items.length === 4, 'the page still lists his other blogs');
  const body = read(OUTPUT).split('<body>')[1];
  for (const d of ['michaelreflects.com', 'mitchelltribe.com', 'michaelmusings.com', 'michaelmitchell.blog', 'michaelponders.com', 'michaelleemitchell.net']) {
    assert.ok(!body.includes(d), `${d} in the OPML body`);
  }
  assert.ok(!body.includes('My other blogs'));
  // An own-domain entry filed under another category is dropped too.
  const sneaky = toOpml([{ category: 'Personal', items: [
    { name: 'Me', htmlUrl: 'https://www.mitchelltribe.com/', xmlUrl: 'https://mitchelltribe.com/feed.xml' },
    { name: 'Friend', htmlUrl: 'https://friend.example/', xmlUrl: 'https://friend.example/feed' },
  ] }]);
  assert.ok(!sneaky.includes('Me"') && sneaky.includes('Friend'));
  assert.ok(isOwnSite('https://bio.michaelmusings.com/') && !isOwnSite('https://notmichaelmusings.com/'));
});

test('names, categories and URLs are XML-escaped', () => {
  const out = toOpml([{ category: 'Tech & "Stuff"', items: [{ name: 'A <b> & Co', htmlUrl: 'https://a.example/?x=1&y=2', xmlUrl: 'https://a.example/feed?a=1&b=2' }] }]);
  assert.ok(out.includes('text="Tech &amp; &quot;Stuff&quot;"'));
  assert.ok(out.includes('text="A &lt;b&gt; &amp; Co"'));
  assert.ok(out.includes('xmlUrl="https://a.example/feed?a=1&amp;b=2"'));
});

test('the blogroll page links to the OPML and advertises it', () => {
  const page = read('templates/blogroll.html');
  assert.match(page, /<link rel="blogroll" type="text\/x-opml" title="[^"]+" href="\/blogroll\.opml">/);
  assert.match(page, /<a href="\/blogroll\.opml" type="text\/x-opml">/);
});
