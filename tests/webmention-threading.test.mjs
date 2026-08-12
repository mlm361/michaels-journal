import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../static/js/webmention-threading.js", import.meta.url), "utf8");
const window = {};
vm.runInNewContext(source, { window, globalThis: window });
const threads = window.MichaelWebmentionThreads;

const root = { "wm-id": "event:1", url: "https://a.example/root" };
const michael = {
  "wm-id": "reply:opaque",
  "wm-parent-id": "event:1",
  url: "https://michaelreflects.com/reply/opaque/"
};
const followUp = {
  "wm-id": "event:2",
  "wm-parent-id": "reply:opaque",
  url: "https://a.example/follow-up"
};
const forest = threads.buildReplyForest([followUp, root, michael]);
assert.equal(forest.length, 1);
assert.equal(forest[0].item["wm-id"], "event:1");
assert.equal(forest[0].children[0].item["wm-id"], "reply:opaque");
assert.equal(forest[0].children[0].children[0].item["wm-id"], "event:2");

const ioCopy = { url: "https://a.example/root", "wm-property": "in-reply-to" };
const hubCopy = {
  url: "https://a.example/root",
  "wm-property": "in-reply-to",
  "wm-id": "event:1",
  "wm-parent-id": "reply:older"
};
const deduped = threads.dedupeChildren([ioCopy, hubCopy]);
assert.equal(deduped.length, 1);
assert.equal(deduped[0]["wm-id"], "event:1");
assert.equal(deduped[0]["wm-parent-id"], "reply:older");

const a = { "wm-id": "a", "wm-parent-id": "b" };
const b = { "wm-id": "b", "wm-parent-id": "a" };
assert.equal(threads.buildReplyForest([a, b]).length, 1);

console.log("webmention threading: 3 tests passed");
