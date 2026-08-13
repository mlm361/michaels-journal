import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../static/js/webmention-submit.js", import.meta.url), "utf8");
const window = {
  URL,
  URLSearchParams,
  AbortController,
  setTimeout,
  clearTimeout
};
vm.runInNewContext(source, { window, globalThis: window, URL, URLSearchParams, AbortController, setTimeout, clearTimeout });
const webmention = window.MichaelWebmentionSubmit;

assert.equal(webmention.isPublicHttpUrl("https://source.example/reply"), true);
assert.equal(webmention.isPublicHttpUrl("javascript:alert(1)"), false);

let request;
const accepted = await webmention.submit({
  endpoint: "/webmention",
  source: "https://source.example/reply",
  target: "https://michaelreflects.com/post/",
  fetchImpl: async (url, options) => {
    request = { url, options };
    return { ok: true, status: 202 };
  }
});
assert.equal(accepted.ok, true);
assert.equal(accepted.status, 202);
assert.match(accepted.message, /accepted/i);
assert.equal(request.url, "/webmention");
assert.equal(request.options.method, "POST");
assert.equal(request.options.body.get("source"), "https://source.example/reply");
assert.equal(request.options.body.get("target"), "https://michaelreflects.com/post/");

const rejected = await webmention.submit({
  endpoint: "/webmention",
  source: "https://source.example/no-link",
  target: "https://michaelreflects.com/post/",
  fetchImpl: async () => ({ ok: false, status: 422 })
});
assert.equal(rejected.ok, false);
assert.equal(rejected.status, 422);
assert.match(rejected.message, /links to this post/i);

let invalidFetchCalled = false;
const invalid = await webmention.submit({
  endpoint: "/webmention",
  source: "file:///etc/passwd",
  target: "https://michaelreflects.com/post/",
  fetchImpl: async () => { invalidFetchCalled = true; }
});
assert.equal(invalid.ok, false);
assert.equal(invalidFetchCalled, false);
assert.match(invalid.message, /full http/i);

const unavailable = await webmention.submit({
  endpoint: "/webmention",
  source: "https://source.example/reply",
  target: "https://michaelreflects.com/post/",
  fetchImpl: async () => { throw new Error("offline"); }
});
assert.equal(unavailable.ok, false);
assert.match(unavailable.message, /could not be reached/i);

console.log("webmention submission: 4 tests passed");
