+++
title = "Privacy Policy"
date = 2026-07-13
template = "page.html"
[extra]
no_kudos = true
skip_feed = true
body_class = "privacy-policy-page"
extra_css = ["/css/privacy-policy.css?v=20260522-privacy-dark-1"]
+++

<img src="/img/privacy-policy.png" alt="Privacy Policy" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:1.5rem;">

*Last Updated: August 8, 2026*

This Privacy Policy describes how I (the owner of this blog) use and protect any information collected when you visit **Michael's Journal** (hosted at `michaelreflects.com or as originally on michaels-journal.pages.dev`). This is a personal blog where I share my opinions, reviews, and thoughts on a variety of subjects; these opinions are mine alone and are subject to change.

By continuing to use this site, you consent to the practices described in this Privacy Policy.

---

## 1. Information Collected via Third-Party Services

### Tinylytics

I use [Tinylytics](https://tinylytics.app) to understand how visitors engage with my blog. Tinylytics takes a privacy-first approach:

- **No cookies.** Tinylytics does not use cookies or local storage for visitor tracking.
- **No persistent identifiers.** It generates unique hit counts via one-way hashing with a rotating daily salt, meaning no individual visitor is tracked across sessions.
- **Anonymized data only.** Usage data (pages viewed, referral sources, general device type, country-level location) is aggregated and non-personally identifiable.
- **EU-based data centers.** Data never leaves the EU.

I use this data solely to understand traffic patterns and improve content. I do not collect, store, or have access to any data that would directly identify you individually, so there is nothing for me to delete on request.

### Cloudflare Pages

This site is hosted on [Cloudflare Pages](https://pages.cloudflare.com). As part of normal CDN and hosting operations, Cloudflare may collect server-side data such as IP addresses, request logs, and performance metrics. This is standard infrastructure logging handled entirely by Cloudflare; I do not have access to or control over this data. For details, see [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/).

### Fonts, icons, and page features

Some pages load small third-party assets or scripts for presentation and site features:

- [Google Fonts](https://fonts.google.com/) provides the Montserrat and Raleway fonts used by the site.
- [Font Awesome](https://fontawesome.com/) provides some icons.
- [Simple Icons](https://simpleicons.org/) provides several social and service icons.
- [jsDelivr](https://www.jsdelivr.com/) is used on specific pages for JavaScript/CSS libraries such as Chart.js and GLightbox.
- [Creative Commons](https://creativecommons.org/) provides the license badge image shown in the footer.

These services are used for display and site functionality. I do not use them for advertising, behavioral profiling, or selling visitor data.

### Bubbles.town

Eligible post pages can show an optional vote count from [Bubbles.town](https://bubbles.town/), a community-ranked blog discovery service that reads this site's public Atom feed. The widget is loaded only when its reserved space near the response controls approaches the visible part of your browser; simply opening an article without reaching that area does not load it.

When the widget loads, your browser requests a pinned script from `bubbles.town` and sends that post's exact public permalink to retrieve its vote count. The request does not send cookies, but Bubbles' server necessarily receives ordinary connection information such as your IP address, the requested article URL, and the time of the request. If you follow the resulting link, you leave Michael's Journal and Bubbles' own policies apply.

---

## 2. Features I Host Myself

Some of this site's interactive features run on my own infrastructure rather than a third-party service, which keeps the data involved under my control.

### Webmentions and reactions

Webmentions sent to this site are received by an endpoint I host myself. When you send a webmention, my system processes the source and target URLs and fetches the public content of the linking page so the reply or like can be displayed under the post. Older mentions are still displayed from [webmention.io](https://webmention.io/), the hosted service that received them in earlier years, and a post page may request that historical data from webmention.io when it loads.

Public reactions to the syndicated copies of my posts on Mastodon, Bluesky, Sharkey, and Nostr, such as likes, boosts, and replies, are gathered by my own engagement sync and displayed on the matching post here. This is information those platforms already publish, shown with the public display name, avatar, and link from the original platform.

### The Town Square

The [Town Square](/townsquare/) is a small live-presence widget I self-host. While you are on a page with the town square, your browser holds an open WebSocket connection to my server so you and other visitors can appear, move around, and chat. It requires no account or sign-in.

- Your browser's local storage keeps a random browser ID, a server-issued browser secret, your optional display name and color, and message-board read state. These values support recognition and reconnection across visits; they are not an account and can be removed using your browser's site-data controls.
- The connection sends those random identity values, your optional profile choices, the current page title and URL, focus and widget visibility, movement and presence state, and any chat text needed to provide the live experience.
- Recent chat may be held temporarily in server memory for live and reconnect display, but it is not written as long-term chat history on disk or published as site content.
- Ordinary hosting and network layers necessarily receive IP addresses and request metadata, although Town Square does not use an IP address as the visitor identity.
- Closing the page ends the live connection and presence. If Town Square is offline, the rest of the site remains available and the widget hides itself.

---

## 3. Data I Do Not Collect

- I do not use Google Analytics or any other advertising-based analytics.
- I do not run ads.
- I do not operate an account-based comment system.
- I do not collect email addresses, names, or any form of registration data.

---

## 4. Third-Party Links

My blog may contain links to other websites. I am not responsible for the privacy practices or content of those sites. I encourage you to read the privacy statements of any site you visit that may collect personally identifiable information.

For more information on Tinylytics data collection and privacy compliance:

- [Tinylytics Privacy Documentation](https://tinylytics.app/docs/privacy)
- [Tinylytics Privacy Compliance Documentation](https://tinylytics.app/docs/privacy_compliance)

---

## 5. Children's Privacy

This blog is a personal site and is not directed toward children under the age of 13. I do not knowingly collect any personal information from children.

---

## 6. Changes to This Policy

I may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date at the top.

---

## 7. Contact

If you have any questions about this Privacy Policy, please contact me at **[michael@michaelmitchell.email](mailto:michael@michaelmitchell.email)**.
