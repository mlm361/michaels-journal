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

This Privacy Policy describes how I (the owner of this blog) use and protect any information collected when you visit **Michael's Journal**, hosted at `michaelreflects.com` and originally available at `michaels-journal.pages.dev`. This is a personal blog where I share my opinions, reviews, and thoughts on a variety of subjects; these opinions are mine alone and are subject to change.

This policy describes the browser requests and data handling involved when the site and its optional interactive features are used.

---

## 1. Information Collected via Third-Party Services

### Tinylytics

I use [Tinylytics](https://tinylytics.app) to understand how visitors engage with my blog. Tinylytics takes a privacy-first approach:

- **No tracking cookies.** Tinylytics does not use cookies or local storage to build a visitor-tracking profile.
- **No persistent visitor identifiers.** Its documented unique-hit process uses a one-way hash that resets daily.
- **Limited reporting data.** It processes page paths, referral information, general browser or device information, and country-level location. Its current documentation says raw IP addresses are not stored in analytics hits and user-agent strings and filtered server logs are deleted after seven days.
- **Hosted in Europe.** Tinylytics documents European hosting while also identifying infrastructure and limited service providers in its own privacy documentation.

I use the reporting available to me solely to understand traffic patterns and improve content. The dashboard gives me site-usage reporting rather than a visitor account or a direct personal identity.

### Cloudflare Pages

This site is hosted on [Cloudflare Pages](https://pages.cloudflare.com). As part of normal DNS, CDN, security, and hosting operations, Cloudflare processes connection data such as IP addresses, request metadata, and performance information. Cloudflare controls its underlying network logs and retention and may expose aggregate or operational information to me through my account.

Cloudflare Web Analytics is enabled and injects a JavaScript beacon into served pages. The beacon sends Cloudflare page-view and browser-performance measurements. I use its aggregate reports to understand site reliability and performance, not for advertising or behavioral profiling. For details, see [Cloudflare's Privacy Policy](https://www.cloudflare.com/privacypolicy/) and [Cloudflare Web Analytics documentation](https://developers.cloudflare.com/web-analytics/about/).

### Fonts, icons, and page features

Some pages load small third-party assets or scripts for presentation and site features:

- [Google Fonts](https://fonts.google.com/) provides the Montserrat and Raleway fonts used by the site.
- [Font Awesome](https://fontawesome.com/) provides some icons.
- [Simple Icons](https://simpleicons.org/) provides several social and service icons.
- [jsDelivr](https://www.jsdelivr.com/) is used on specific pages for JavaScript/CSS libraries such as Chart.js and GLightbox.
- [Creative Commons](https://creativecommons.org/) provides the license badge image shown in the footer.

These services are used for display and site functionality. I do not use them for advertising, behavioral profiling, or selling visitor data.

Posts and archive pages may also contain externally hosted images, avatars, video or audio players, and other embedded media. Examples include YouTube, PeerTube, Micro.blog-hosted images, public social-platform avatars, and movie artwork. Loading that content contacts the named host, which receives ordinary connection information and applies its own privacy policy. Most current Journal images are served from my dedicated `media.mitchelltribe.xyz` media host.

### Listening card

On eligible post pages, the Listening card automatically requests my public playing-now status and five most recent listens from [ListenBrainz](https://listenbrainz.org/user/MLM361/), even if the card remains collapsed. The request contains my public ListenBrainz username, not a visitor account or visitor-supplied profile information. ListenBrainz nevertheless receives ordinary connection information such as your IP address, browser request metadata, the referring site or page allowed by your browser, and the time of the request.

When a track includes the necessary MusicBrainz identifiers, your browser may also request its artwork from the [Cover Art Archive](https://coverartarchive.org/), a joint project of the Internet Archive and MusicBrainz. That service likewise receives the ordinary connection information needed to return the image. These requests display my public listening activity; they do not create a listening profile for you on this site.

### Bubbles.town

Eligible post pages can show an optional vote count from [Bubbles.town](https://bubbles.town/), a community-ranked blog discovery service that reads this site's public Atom feed. The widget is loaded only when its reserved space near the response controls approaches the visible part of your browser; simply opening an article without reaching that area does not load it.

When the widget loads, your browser requests a pinned script from `bubbles.town` and sends that post's exact public permalink to retrieve its vote count. The request does not send cookies, but Bubbles' server necessarily receives ordinary connection information such as your IP address, the requested article URL, and the time of the request. If you follow the resulting link, you leave Michael's Journal and Bubbles' own policies apply.

### Bridgy Fed and Standard.site

The site publishes metadata links that associate public Journal articles with their public Bridgy Fed and Standard.site/AT Protocol records. These links help compatible services recognize the Journal as the canonical source and render richer references to its posts. Ordinary page rendering does not load executable code from either service; a compatible client or a visitor who follows one of those links may contact the corresponding service. This integration uses already-public article and account metadata, not private visitor profiles or advertising identifiers.

---

## 2. Features I Host Myself

The Webmention receiver and TownSquare service run on infrastructure I operate. The disclosures below identify the external services they still contact and the information retained for operation and abuse prevention.

### Webmentions and reactions

New Webmentions are received by an endpoint I operate. Cloudflare provides the public edge and secure route to my receiver; my own receiver verifies the source and target URLs, fetches the public linking page, and forwards the result into my self-hosted personal inbox. Older mentions are still displayed from [webmention.io](https://webmention.io/), the hosted service that received them in earlier years, and a post page requests that historical data from webmention.io when it loads.

Public reactions to the syndicated copies of my posts on Mastodon, Bluesky, Sharkey, and Nostr, such as likes, boosts, and replies, are gathered by my own engagement sync and displayed on the matching post here. This is information those platforms already publish, shown with the public display name, avatar, and link from the original platform. Displaying an avatar may cause your browser to request the image from the original platform or its image host.

### The Town Square

The [Town Square](/townsquare/) is a small live-presence widget I self-host. While you are on a page with the town square, your browser holds an open WebSocket connection to my server so you and other visitors can appear, move around, and chat. It requires no account or sign-in.

- Your browser's local storage keeps a random browser ID, a server-issued browser secret, your optional display name and color, and message-board read state. These values support recognition and reconnection across visits; they are not an account and can be removed using your browser's site-data controls.
- The connection sends those random identity values, your optional profile choices, the current page title and URL, focus and widget visibility, movement and presence state, and any chat text needed to provide the live experience.
- Recent chat is held temporarily in server memory for live and reconnect display and is not written to the TownSquare data directory as a long-term transcript. The current deployment does not send TownSquare chat to Telegram, Gotify, or another third-party notification service.
- For bounded operational analytics, TownSquare retains up to 30 days of random browser IDs grouped by UTC day and hour, plus daily message counts. It does not store chat text in those statistics. Clicks on the configured neighboring-site links are tallied by destination with a count and last-click time; the request IP is used for rate limiting but is not stored with that click tally.
- The server records the most recently observed Journal page path for site operations. Visitor-join logs can contain the optional display name, IP address, a stable per-site fingerprint derived from the random browser ID, site origin, and bot-protection status. These are server logs rather than public site content.
- IP addresses and random browser IDs may be retained when necessary for blocking, rate limiting, and moderation. The site also keeps a capped log of moderation actions.
- Closing the page ends the live connection and presence. If Town Square is offline, the rest of the site remains available and the widget hides itself.

---

## 3. Data I Do Not Collect

- I do not use Google Analytics or advertising-based analytics. The site uses only the Tinylytics, Cloudflare Web Analytics, and TownSquare operational measurements disclosed above.
- I do not run ads.
- I do not operate an account-based comment system.
- Reading the site requires no registration and no email address or real name. Optional TownSquare display names and already-public names attached to Webmentions or social reactions are handled as described above.

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
