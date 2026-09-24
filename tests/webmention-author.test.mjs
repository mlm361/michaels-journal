import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const template = fs.readFileSync('themes/ergo/templates/partials/webmentions.html', 'utf8');
const window = {};
const context = vm.createContext({window, URL});
vm.runInContext(fs.readFileSync('static/js/url-safety.js', 'utf8'), context);
vm.runInContext(template.slice(template.indexOf('    function escapeHtml'),
                              template.indexOf('    function authorPhoto')), context);
vm.runInContext(template.slice(template.indexOf('    function hubEntryToChild'),
                              template.indexOf('    // Source 1:')), context);

for (const [label, entry, expected] of [
  ['missing name', {actor_url: 'https://michaelharley.net', source_url: 'https://other.example/reply'}, 'michaelharley.net'],
  ['blank name', {actor_name: '  ', actor_url: 'https://www.michaelharley.net/'}, 'michaelharley.net'],
  ['source fallback', {actor_url: 'javascript:bad', source_url: 'https://source.example/reply'}, 'source.example'],
  ['real name', {actor_name: 'Michael Harley', actor_url: 'https://michaelharley.net'}, 'Michael Harley'],
  ['no identity', {}, 'Someone'],
  ['unsafe URLs', {actor_url: 'https://user:secret@example.org', source_url: 'data:text/html,x'}, 'Someone'],
]) {
  test(label, () => assert.equal(context.authorName(context.hubEntryToChild(entry)), expected));
}

test('native engagement author remains intact and escaped for rendering', () => {
  const name = context.authorName({author: {name: '<b>Real author</b>', url: 'https://example.org'}});
  assert.equal(context.escapeHtml(name), '&lt;b&gt;Real author&lt;/b&gt;');
});
