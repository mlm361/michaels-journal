# Tinylytics Webmention Support

> **BETA** — This feature is currently in beta and may be subject to changes.

Tinylytics supports collecting "likes" from across the web using the [Webmention](https://www.w3.org/TR/webmention/) protocol. When someone likes a post on their own IndieWeb site, or via bridge services like [Bridgy](https://bridgy.fed.wiki/Like), it is automatically verified and converted into a Kudo in your statistics dashboard.

---

## How It Works

1. **Detection** — A `<link>` tag in your site's `<head>` advertises your Webmention endpoint.
2. **Delivery** — When someone likes your post, a Webmention `POST` is sent to your unique Tinylytics endpoint.
3. **Verification** — Tinylytics servers verify that the source page actually contains a link to your target page and that it is a legitimate "like" or "mention".
4. **Integration** — Verified mentions appear in your **Community** tab. Likes are also automatically counted as a **Kudo** for that specific path.

---

## Implementation

### 1. Add the `<link>` tag to your site's `<head>`

```html
<link rel="webmention" href="https://tinylytics.app/webmention/YOUR_EMBED_CODE">
```

**For Michael's Blog Journal (Cloudflare Pages):**

```html
<link rel="webmention" href="https://tinylytics.app/webmention/h2Q2CzgAf-te_SJUBWQ1">
```

This is already present in `themes/ergo/templates/base.html`.

> Find your unique link tag under **Kudos setup** or the **Community** tab in your Tinylytics dashboard.

---

### 2. Outbound Webmentions (Pi RSS Processor)

The Pi automatically sends outgoing webmentions whenever new Zola posts are published.

| File | Location |
|------|----------|
| Poller script | `/home/mlm361/rss_processor/zola_webmention_poller.py` |
| State file | `/home/mlm361/rss_processor/zola_webmention_poller_state.json` |
| Service unit | `/etc/systemd/system/zola-webmention-poller.service` |
| Timer unit | `/etc/systemd/system/zola-webmention-poller.timer` |

The timer runs every **15 minutes** and checks the Zola `atom.xml` feed for posts published within the last `realtime_poll_days_back` days (default: 2). It calls `webmention_sender.py` to discover and send webmentions to any outbound links in each post.

**Useful systemd commands:**

```bash
# Check timer status
systemctl status zola-webmention-poller.timer

# Run manually (one-shot test)
sudo systemctl start zola-webmention-poller.service

# View recent logs
journalctl -u zola-webmention-poller.service -n 40

# Enable/disable
sudo systemctl enable  zola-webmention-poller.timer
sudo systemctl disable zola-webmention-poller.timer
```

**Relevant `config.yaml` keys** (under `webmention:`):

| Key | Default | Description |
|-----|---------|-------------|
| `realtime_poll_days_back` | `2` | How far back to look for new posts |
| `realtime_poll_max_posts_per_poll` | `10` | Max posts to process per run |
| `request_timeout` | `15` | HTTP timeout in seconds |
| `webmention_feed_enabled` | `true` | Master toggle for Zola poller |

---

## Features

| Feature | Details |
|---------|---------|
| **External Kudos** | Verified "likes" are recorded as a Kudo for the target path |
| **Source Information** | Filter for "External" in Kudos path statistics to see which sites sent appreciation |
| **Community Feed** | Shows recent verified mentions with source URL, title, and content snippet |

---

## Supported Mention Types

| Type | Behavior |
|------|----------|
| **Likes** | Registered as Kudos in your dashboard |
| **Mentions / Reposts** | Verified and shown in the Community feed |

---

## Site IDs

| Site | Tinylytics Embed Code | Notes |
|------|-----------------------|-------|
| Michael's Blog Journal (Cloudflare Pages) | `h2Q2CzgAf-te_SJUBWQ1` | Webmention + Kudos active |
| Blogger (michaelleemitchell.net) | `p5BXL--dSVSx7M1HT4S9` | Separate site ID — do not mix |

---

## Kudos Script (Cloudflare Pages)

```html
<script src="https://tinylytics.app/embed/h2Q2CzgAf-te_SJUBWQ1.js?kudos" defer></script>
```

The `?kudos` parameter enables the Kudos button widget on pages. This is already present in `themes/ergo/templates/base.html`.

---

## Cutting Over to webmention.io

The site is wired so that switching is a **2-line change** in `config.toml`. The Pi outbound poller needs no changes — it only sends webmentions, and that is unaffected by which service receives them.

### Step 1 — Register at webmention.io (browser only, you must do this)

1. Go to [webmention.io](https://webmention.io) and sign in with your domain: `michaels-journal.pages.dev`
2. webmention.io uses IndieAuth — your existing `rel="me"` Mastodon link (`mitchelltribe.social/@michael`) should verify ownership
3. After signing in, your receiving endpoint will be:
   ```
   https://webmention.io/michaels-journal.pages.dev/webmention
   ```

### Step 2 — Update `config.toml` (2 lines)

```toml
webmention_provider = "webmentions_io"
webmention_endpoint  = "https://webmention.io/michaels-journal.pages.dev/webmention"
```

That's it. On next Cloudflare Pages deploy:
- The `<link rel="webmention">` in `<head>` will point to webmention.io
- A **Webmentions** section will automatically appear at the bottom of every post, fetching and displaying received mentions live from the webmention.io API

### Step 3 — Remove Tinylytics webmention tag (optional)

The Tinylytics `<link rel="webmention">` tag will be gone automatically once you update the endpoint above. You may also want to remove the Tinylytics embed script from `base.html` if you no longer use Tinylytics at all (Kudos will stop working too).

### What you get with webmention.io vs Tinylytics

| | Tinylytics | webmention.io |
|--|-----------|---------------|
| Cost | Paid subscription | Free |
| Likes → Kudos | Yes (automatic) | No (display only) |
| On-page display | No (dashboard only) | Yes (shown under each post) |
| Analytics | Yes | No |
| Dashboard | Tinylytics dashboard | webmention.io dashboard |
