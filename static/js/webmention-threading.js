(function (root) {
  "use strict";

  function fillMissing(target, source, key) {
    if (!target[key] && source[key]) target[key] = source[key];
  }

  function mergeDuplicate(target, source) {
    fillMissing(target, source, "wm-id");
    fillMissing(target, source, "wm-parent-id");
    fillMissing(target, source, "platform");
    fillMissing(target, source, "published");
    fillMissing(target, source, "url");

    target.author = target.author || {};
    var sourceAuthor = source.author || {};
    fillMissing(target.author, sourceAuthor, "name");
    fillMissing(target.author, sourceAuthor, "url");
    fillMissing(target.author, sourceAuthor, "photo");

    target.content = target.content || {};
    var sourceContent = source.content || {};
    fillMissing(target.content, sourceContent, "text");
    fillMissing(target.content, sourceContent, "html");
  }

  function dedupeChildren(items) {
    var seen = Object.create(null);
    var output = [];
    items.forEach(function (item) {
      var property = item["wm-property"] || "mention-of";
      var author = item.author || {};
      var key = "";
      if (property === "like-of" || property === "repost-of") {
        key = property + "|" + String(author.url || author.name || "").toLowerCase();
      } else if (item.url) {
        key = "reply|" + item.url;
      }
      if (!key) {
        output.push(item);
        return;
      }
      if (seen[key]) {
        // Preserve the richest display data across legacy/native/Hub copies.
        // The static engagement record usually has the avatar and platform;
        // Hub adds durable thread IDs and sanitized text.
        mergeDuplicate(seen[key], item);
        return;
      }
      seen[key] = item;
      output.push(item);
    });
    return output;
  }

  function buildReplyForest(items) {
    var byId = Object.create(null);
    var nodes = items.map(function (item) {
      var node = { item: item, children: [] };
      if (item["wm-id"]) byId[String(item["wm-id"])] = node;
      return node;
    });
    var roots = [];
    nodes.forEach(function (node) {
      var parentId = node.item["wm-parent-id"]
        ? String(node.item["wm-parent-id"])
        : "";
      var parent = parentId ? byId[parentId] : null;
      if (parent && parent !== node) parent.children.push(node);
      else roots.push(node);
    });

    // Malformed cyclic data must remain visible and bounded. The renderer has
    // its own ancestor guard; retaining one cycle member as a root prevents a
    // remote payload from making the entire conversation disappear.
    if (!roots.length && nodes.length) roots.push(nodes[0]);
    return roots;
  }

  root.MichaelWebmentionThreads = {
    dedupeChildren: dedupeChildren,
    buildReplyForest: buildReplyForest
  };
})(typeof window !== "undefined" ? window : globalThis);
