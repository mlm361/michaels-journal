import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../static/js/webmention-threading.js", import.meta.url), "utf8");
const template = fs.readFileSync(
  new URL("../themes/ergo/templates/partials/webmentions.html", import.meta.url),
  "utf8"
);
const window = {};
vm.runInNewContext(source, { window, globalThis: window });
const threads = window.MichaelWebmentionThreads;

assert.doesNotMatch(template, /webmention\.io\/api\/mentions/);
assert.doesNotMatch(template, /wmFetch/);
assert.doesNotMatch(template, /id="webmention-submit-form"/);
assert.doesNotMatch(template, /webmention-submit\.js/);
assert.doesNotMatch(template, /MichaelWebmentionSubmit/);

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

// Visual-parity fixture from the accepted Star Trek post presentation:
// two Bluesky likes remain a two-face facepile and one reply remains a rich
// avatar/name/date/content card when Hub returns duplicate copies.
const outpostsPhoto = "https://cdn.bsky.app/img/avatar/plain/did:plc:oacup636yferhxysjhig4odp/avatar";
const staticEngagement = [
  {
    "wm-property": "like-of",
    platform: "bluesky",
    published: "2026-06-08T10:19:28.437Z",
    author: {
      name: "Star Trek: Outposts Unknown",
      url: "https://bsky.app/profile/stoutposts.bsky.social",
      photo: outpostsPhoto
    }
  },
  {
    "wm-property": "like-of",
    platform: "bluesky",
    published: "2026-06-08T02:08:04.713Z",
    author: {
      name: "Guillaume Pierre",
      url: "https://bsky.app/profile/legulm.bsky.social",
      photo: "https://cdn.bsky.app/img/avatar/plain/did:plc:fx4yf7pmkldzla34woev3krs/avatar"
    }
  },
  {
    "wm-property": "in-reply-to",
    platform: "bluesky",
    published: "2026-06-08T10:19:36.773Z",
    url: "https://bsky.app/profile/stoutposts.bsky.social/post/3mnrhgjg3h22p",
    author: {
      name: "Star Trek: Outposts Unknown",
      url: "https://bsky.app/profile/stoutposts.bsky.social",
      photo: outpostsPhoto
    },
    content: { html: "Time to lead your crew! 🖖" }
  }
];
const hubEngagement = [
  {
    "wm-property": "like-of",
    "wm-id": "event:like-outposts",
    author: {
      name: "Star Trek: Outposts Unknown",
      url: "https://bsky.app/profile/stoutposts.bsky.social"
    }
  },
  {
    "wm-property": "in-reply-to",
    "wm-id": "event:reply-outposts",
    url: "https://bsky.app/profile/stoutposts.bsky.social/post/3mnrhgjg3h22p",
    author: {
      name: "Star Trek: Outposts Unknown",
      url: "https://bsky.app/profile/stoutposts.bsky.social"
    },
    content: { text: "Time to lead your crew! 🖖" }
  }
];
const parity = threads.dedupeChildren(staticEngagement.concat(hubEngagement));
const parityLikes = parity.filter((item) => item["wm-property"] === "like-of");
const parityReplies = parity.filter((item) => item["wm-property"] === "in-reply-to");
assert.equal(parity.length, 3);
assert.equal(parityLikes.length, 2);
assert.equal(parityReplies.length, 1);
assert.equal(parityLikes[0].author.photo, outpostsPhoto);
assert.equal(parityLikes[0]["wm-id"], "event:like-outposts");
assert.equal(parityReplies[0].author.photo, outpostsPhoto);
assert.equal(parityReplies[0].content.html, "Time to lead your crew! 🖖");
assert.equal(parityReplies[0].content.text, "Time to lead your crew! 🖖");
assert.equal(parityReplies[0].platform, "bluesky");
assert.equal(parityReplies[0]["wm-id"], "event:reply-outposts");

const reverseParity = threads.dedupeChildren(hubEngagement.concat(staticEngagement));
const reverseOutpostsLike = reverseParity.find(
  (item) => item["wm-id"] === "event:like-outposts"
);
const reverseOutpostsReply = reverseParity.find(
  (item) => item["wm-id"] === "event:reply-outposts"
);
assert.equal(reverseParity.length, 3);
assert.equal(reverseOutpostsLike.author.photo, outpostsPhoto);
assert.equal(reverseOutpostsLike.platform, "bluesky");
assert.equal(reverseOutpostsReply.author.photo, outpostsPhoto);
assert.equal(reverseOutpostsReply.content.text, "Time to lead your crew! 🖖");
assert.equal(reverseOutpostsReply.content.html, "Time to lead your crew! 🖖");

assert.deepEqual(
  { ...threads.platformInfo(staticEngagement[0]) },
  { key: "bluesky", label: "Bluesky", mark: "B" }
);
assert.equal(
  threads.platformInfo({ url: "https://mastodon.social/@alice/123" }).label,
  "Mastodon"
);
assert.equal(
  threads.platformInfo({ url: "https://example.com/a-webmention" }).label,
  "Webmention"
);

const a = { "wm-id": "a", "wm-parent-id": "b" };
const b = { "wm-id": "b", "wm-parent-id": "a" };
assert.equal(threads.buildReplyForest([a, b]).length, 1);

console.log("webmention threading: 4 tests passed");
