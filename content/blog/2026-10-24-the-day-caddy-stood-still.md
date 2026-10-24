+++
title = "The Day Caddy Stood Still"
date = "2026-10-24T15:19:46-04:00"
draft = false
description = "A couple of weeks ago, I went to update my VPS. Usually, I do this once a week, sometimes more frequently depending on any security news I see. I should probably have the AI agents I use do this, but I do it myself for now. I find..."
slug = "the-day-caddy-stood-still"

[taxonomies]
tags = [ "caddy", "self-hosting", "technology",]

[extra]
stats_word_count = 502
stats_reading_time = 3
image = "https://media.mitchelltribe.xyz/images/2026/10/d2bbb432_e628535478d4.avif"

[extra.posse]
mastodon = "https://mitchelltribe.social/@michael/117497503853551619"
bluesky = "https://bsky.app/profile/mitchelltribe.com/post/3mynfysfozr2f"
sharkey = "https://mitchelltribe.rodeo/notes/asqclktthj0u00vx"
nostr = "https://jumble.social/nevent1qqspgs9uxnn5glp4snjw27k0rch0waexurm50z33qwztm9kc39z2tscpr4mhxue69uhhyetvv9ujumtfw33ksetvd368y6tzv5hxxmmdqyxhwumn8ghj7mn0wvhxcmmvqy28wumn8ghj7un9d3shjtnyv9kh2uewd9hsygp02vfgtvcm7q2ru6ld4mgg6g36d4anva2m6vfu2yncn3ae9tjflctt99rq"
+++

<data class="p-summary" value="A couple of weeks ago, I went to update my VPS. Usually, I do this once a week, sometimes more frequently depending on any security news I see. I should probably have the AI agents I use do this, but I do it myself for now. I find..."></data>



<figure style="max-width: 100% !important; margin: 1.5em auto !important; padding: 0 !important;">
<img src="https://media.mitchelltribe.xyz/images/2026/10/d2bbb432_e628535478d4.avif" alt="A distressed, retro-futurist poster shows a huge white-and-gray robot with glowing blue eyes and the word “caddy” on its chest looming over a city at dusk. At left, large cream and red lettering reads “THE DAY CADDY STOOD STILL,” with the smaller subtitle “A BANDWIDTH LIMIT, A VPS UPDATE, AND ONE ALUMINUM FOIL HAT MOMENT.” At right, a towering red warning display bears a triangular alert icon and the text “402 PAYMENT REQUIRED.” Below it, four status rows—“Packages,” “Updates,” “Repositories,” and “Downloads”—each read “Stalled…” beside a loading spinner. In the foreground, a crowd of men and women in mid-century clothing, including a man in a dark hat saluting or shielding his eyes, stare up at the robot and display. City buildings and an elevated roadway sit beneath a smoky blue-and-gold sky; red warning lights glow on the display. The image has a dramatic, weathered comic-book-poster style." style="display: block !important; max-width: 100% !important; height: auto !important; margin: 0 auto !important;" width="1672" height="941">
</figure>



A couple of weeks ago, I went to update my VPS. Usually, I do this once a week, sometimes more frequently depending on any security news I see. I should probably have the AI agents I use do this, but I do it myself for now. I find infrastructure interesting and "boring" in a good way most of the time.

While updating one of my VPSes, I got a message saying I needed to pay for access to Caddy because the repository had reached its bandwidth limit. This was from a company called Cloudsmith. I wasn't the only one getting this message, either. There was already a large discussion going on over at [Caddy's GitHub](https://github.com/caddyserver/dist/issues/142).
<!--more-->

This led me down a big rabbit hole that lasted quite a few hours, and I'm still thinking about it. My first thought wasn't about the bandwidth limit itself, but whether this could be a new type of attack. Caddy is open source and free, and it's used by a lot of people, organizations, and companies. We've seen several different supply chain attacks over the years. But what if someone deliberately flooded the repositories of open-source projects and used up their free bandwidth allowances? People wouldn't be able to download security updates, leaving older, bug-ridden versions of the software running and potentially vulnerable to exploitation.

Before anyone says not to give people ideas, I'm sure someone has already thought of this. It's kind of a modern-day denial-of-service attack, just from a different angle.

As it turned out, Caddy's repository had exhausted its 4.9 TB monthly bandwidth allowance. Apparently, much of the traffic came from automated systems repeatedly downloading packages. Some IP addresses had reportedly made hundreds of thousands of requests. That's a lot of bandwidth for a free open-source project to deal with.

Luckily, there was no indication this was a deliberate attack, so my aluminum foil hat could come off. By the end of the weekend, someone at Cloudsmith had fixed the bandwidth limit problem, and everyone could update again.

What I found encouraging was that several other providers contacted the maintainer and offered to help. I'm not sure if any of those offers were accepted, but it was good to see people stepping up to help keep a free project running.

And that's something I appreciate about open source. Projects like Caddy and Traefik are useful to a lot of people, including me, and much of the work behind them is done by people who aren't getting rich from it. Meanwhile, we have hardware manufacturers shifting supply toward their most profitable customers while the rest of us deal with higher prices and fewer choices.

It's quite a contrast. On one side, companies making hardware harder and more expensive for ordinary people to get. On the other, people putting their time and effort into making software that anyone can use, often for little or no rewards and riches.

I'm glad there are still people willing to do that for the greater good of the internet.