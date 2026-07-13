+++
title = "Colophon"
date = 2026-07-13
template = "page.html"
[extra]
no_kudos = true
skip_feed = true
body_class = "colophon-theme-page"
extra_css = ["/css/colophon.css?v=20260522-dark-2"]
+++

<div class="colophon-page">

This site is my small corner of the web. It is where I write, experiment, and keep a record of things that matter to me.

Michael’s Journal is built from Markdown, generated with Zola, versioned in GitHub, and deployed on Cloudflare Pages. Zola is a static site generator, and Cloudflare Pages supports Git-based deployment workflows for Zola sites, which fits the way this site is published today.

## Why This Site Exists

I have been writing online for 25 years this August, a quarter century that has ebbed and flowed, starting with Microsoft FrontPage and Blogger. When Blogger started to feel limited, I moved to WordPress and stayed there for years, but never really felt comfortable with it and eventually left.

After that I returned to Blogger, then found Write.as and later Micro.blog. Micro.blog changed how I think about publishing on the web, and it eventually led me to platforms like Scribbles that I still enjoy using.

Today I still publish across several platforms, including Blogger, Micro.blog, Scribbles, and Write.as. This is a custom-built system, designed with help from Claude and ChatGPT. My Blog Poster CMS lets me post to any or all of them at the same time, unless I decide otherwise.

This site is where everything comes together. It is built with Zola, managed through GitHub, and deployed on Cloudflare Pages, and it is becoming my primary home on the web.

## How The Site Is Built

The site is made from a few small pieces working together. 

<div class="colophon-grid">

<section class="colophon-card">
  <h3>Generator</h3>
  <p>The site is built with Zola, a fast static site generator written in Rust. Zola generates complete static files, which makes it a good fit for a simple, fast, low-maintenance personal site.</p>
  <p>Content lives as Markdown with TOML frontmatter, all tracked in Git. The design started from the Ergo theme and has been customized over time with things like a rotating avatar, an expanded archive view, custom stats pages, an On This Day page, and a blogroll.</p>
</section>

<section class="colophon-card">
  <h3>Hosting</h3>
  <p>The site is hosted on Cloudflare Pages. Cloudflare Pages connects to Git repositories and automatically deploys changes when new code is pushed, which matches the way this site is built and published.</p>
  <p>Cloudflare also handles DNS, CDN delivery, HTTPS, and related edge infrastructure. At this scale, it remains a remarkably practical setup for a personal site.</p>
</section>

<section class="colophon-card">
  <h3>Writing and Publishing</h3>
  <p>Posts begin in Blog Poster, a publishing tool I built for myself. It handles drafts, scheduling, image cleanup, AI-assisted feature image creation, alt text, and deciding where a post should go.</p>
  <p>Most of the time, Blog Poster can publish to all of my platforms at once. That means this site is part of a broader publishing flow, not a separate manual process.</p>
  <p>When a post is ready for this site, Blog Poster exports it to the repository as Markdown and commits it. From there, GitHub and Cloudflare Pages handle the rest of the build and deployment flow.</p>
</section>

<section class="colophon-card">
  <h3>POSSE and Syndication</h3>
  <p>Blog Poster, my custom-built personal publishing app, also handles POSSE, Publish (on your) Own Site, Syndicate Elsewhere, for Mastodon, Bluesky, Sharkey, Pixelfed, and Nostr. It records the syndicated URLs so posts on this site can point back to their copies elsewhere, while this site remains the canonical version.</p>
</section>

<section class="colophon-card">
  <h3>Town Square</h3>
  <p>At the bottom of every post, and on its own <a href="/townsquare/">Town Square</a> page, there is a small live park where anyone visiting at the same time shows up as a little figure. You can wander around, sit on a bench, and chat. It is a playful bit of real-time presence on an otherwise quiet static site.</p>
  <p>It runs on TownSquare, an open-source presence widget that I self-host, so the realtime part stays under my own control. If it ever goes offline, the rest of the site is unaffected and the element simply hides itself.</p>
</section>

<section class="colophon-card">
  <h3>Built With</h3>
  <p class="colophon-card-signoff">Built with ❤️ using <a href="https://www.getzola.org/">Zola</a></p>
</section>

</div>

## IndieWeb

The site leans into IndieWeb ideas. Posts include h-entry style markup, the Atom feed lives at /atom.xml, and the JSON Feed lives at /feed.json.

Webmentions are now received by an endpoint I host myself. When someone links to a post and sends a webmention, it lands on my own server and flows into my personal inbox app, so replies and likes reach me without a third-party service in the middle. webmention.io, the hosted service that handled this job for years, still serves the older mentions that live there, and both sources appear together under each post.

Reactions to the syndicated copies of my posts on Mastodon, Bluesky, Sharkey, and Nostr are gathered by my own engagement sync and mirrored back onto each post here, so the conversation around a post stays visible on the canonical page.

There is also a Gemini capsule at gemini://gemini.michaelreflects.com for readers who prefer the quietest corner of the small web.

In the future, I might implement a webring. 

## Design Choices

The design is intentionally quiet. I want the writing and images to do most of the work, not motion, popups, or interruption.

The layout stays simple: a readable column, light and dark themes, and semantic HTML. The goal is not to impress anyone with tricks. It is to make the site comfortable to read and easy to maintain, and it takes inspiration from Jim Mitchell's mnml for Micro.blog.

A few pages differ from the rest of the site, including my Twitter Archive page, my Tweets On This Day page, and my Privacy page. All are intentionally designed.

Body text is set in Montserrat, and the post metadata line uses Raleway. I picked them because they work well together and, after a while, stopped seeing any reason to keep fussing with it.

Two details I am especially fond of are the rotating avatar in the corner and the footer counter showing how long the site has been online. Neither is necessary, which is probably why I like them so much.

## Privacy

There are no ads, and no tracking pixels. I prefer a site that feels like a place to read, not a place to be measured. But there are plenty of interaction points, like a water cooler for civil, polite dialogue. 

The only analytics I use are lightweight ones through Tinylytics. Cloudflare still sees request logs because it serves the site through its network, which is a normal part of using a CDN-backed hosting platform.

The contact link is obfuscated through Cloudflare’s email protection. It works well enough for normal use and makes scraping a little more annoying.

## Standards

I would rather the validators be bored than have the site break in small, avoidable ways.

A recent cleanup fixed a number of long-standing HTML and CSS issues, including missing attributes, duplicate values, outdated embed markup, and other small errors that are easy to live with until you finally stop ignoring them.

The validation links below point to live checks for HTML, CSS, feed output, security observations, and the standard.site records that connect posts here to the AT Protocol. They are there partly for transparency and partly because I like being standardized and conforming to established standards.

<div class="badge-wall" aria-label="Site validation and standards badges">
  <a class="status-badge status-w3c" href="https://jigsaw.w3.org/css-validator/validator?uri=https%3A%2F%2Fmichaelreflects.com%2F&profile=css3svg&usermedium=all&warning=1&vextwarning=&lang=en">
    <span>W3C</span><strong>Valid CSS</strong>
  </a>
  <a class="status-badge status-w3c" href="https://validator.w3.org/feed/check.cgi?url=https%3A%2F%2Fmichaelreflects.com%2Fatom.xml">
    <span>W3C</span><strong>Valid Atom</strong>
  </a>
  <a class="status-badge status-check" href="https://validator.w3.org/nu/?doc=https%3A%2F%2Fmichaelreflects.com%2F">
    <span>Nu HTML</span><strong>Checked</strong>
  </a>
  <a class="status-badge status-check" href="https://developer.mozilla.org/en-US/observatory/analyze?host=michaelreflects.com">
    <span>MDN</span><strong>Observed</strong>
  </a>
  <a class="status-badge status-check" href="https://indiewebify.me/">
    <span>IndieWeb</span><strong>Ready</strong>
  </a>
  <a class="status-badge status-check" href="https://site-validator.fly.dev/">
    <span>Standard.site</span><strong>Validated</strong>
  </a>
</div>


## Credits

This site exists because of the work of other people whose tools made it possible.

* Zola by Vincent Prouillet.
* The Ergo theme by Andrew Plaza, which I have heavily customized.
* webmention.io by Aaron Parecki, which received this site's webmentions for years and still serves the older ones.
* Bridgy Fed by Ryan Barrett and Anuj Ahooja.
* TownSquare by Cauê Napier, the open-source live-presence widget that powers the town square.
* Tinylytics by Vincent Ritter, which powers the lightweight analytics, the kudos hearts, and the footer counters.
* Simple Icons, whose logo set appears on the share buttons under each post.
* Cloudflare Pages for hosting and deployment.
* The wider IndieWeb community for continuing to keep the small web alive. Special mention goes to Manton Reece of Micro.blog and Vincent Ritter of Scribbles.page, whose IndieWeb principles helped guide the structure of this website.
* AI, including ChatGPT, Claude, Codex, and other cloud or local AI models, helps me maintain this site for full transparency, but it does not publish any content that is not made by me. These tools help with theming, maintenance, editing, proofreading, alt text, and feature image creation. But I cannot stress this enough: they make no posts of their own. All posts are mine and mine alone.

</div>
