(function (root) {
  "use strict";

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
        // The Hub copy carries thread IDs that webmention.io does not. Merge
        // those identifiers into the first card instead of rendering twice.
        if (!seen[key]["wm-id"] && item["wm-id"]) seen[key]["wm-id"] = item["wm-id"];
        if (!seen[key]["wm-parent-id"] && item["wm-parent-id"]) {
          seen[key]["wm-parent-id"] = item["wm-parent-id"];
        }
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
