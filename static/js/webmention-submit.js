(function (root) {
  "use strict";

  function isPublicHttpUrl(value) {
    try {
      var parsed = new URL(String(value || "").trim());
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (_error) {
      return false;
    }
  }

  function statusMessage(status) {
    if (status >= 200 && status < 300) {
      return "Webmention accepted. It will appear after verification and moderation.";
    }
    if (status === 400) {
      return "That page could not be verified. Make sure it is public and links to this post.";
    }
    if (status === 403) return "That target is not accepted by this endpoint.";
    if (status === 415) return "The source page must be an HTML page.";
    if (status === 429) return "Too many attempts. Please wait a little while and try again.";
    if (status === 504) return "The source page took too long to respond. Please try again.";
    return "The Webmention could not be submitted right now. Please try again later.";
  }

  async function submit(options) {
    var endpoint = String(options.endpoint || "");
    var source = String(options.source || "").trim();
    var target = String(options.target || "").trim();
    var fetchImpl = options.fetchImpl || root.fetch;

    if (!isPublicHttpUrl(source)) {
      return { ok: false, status: 0, message: "Enter the full http:// or https:// URL of your page." };
    }
    if (!isPublicHttpUrl(target)) {
      return { ok: false, status: 0, message: "This post does not have a valid Webmention target." };
    }

    var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, 20000) : null;
    try {
      var body = new URLSearchParams();
      body.set("source", source);
      body.set("target", target);
      var response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "Accept": "text/plain" },
        body: body,
        signal: controller ? controller.signal : undefined
      });
      return {
        ok: response.ok,
        status: response.status,
        message: statusMessage(response.status)
      };
    } catch (_error) {
      return {
        ok: false,
        status: 0,
        message: "The Webmention endpoint could not be reached. Please try again later."
      };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  root.MichaelWebmentionSubmit = {
    isPublicHttpUrl: isPublicHttpUrl,
    statusMessage: statusMessage,
    submit: submit
  };
})(typeof window !== "undefined" ? window : globalThis);

