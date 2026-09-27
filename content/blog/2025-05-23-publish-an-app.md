+++
title = "Publish an App?"
date = "2025-05-23T20:00:00-04:00"
draft = false

[extra]
stats_word_count = 344
stats_reading_time = 2
exclude_from_feed = true
source_url = "https://mitchelltribe.com/2025/05/23/publish-an-app/"
+++

<figure class="attachment attachment--preview flex-col justify-center attachment--png">
      <img class="lightbox__image strip-metadata lightbox__image" loading="lazy" src="https://media.mitchelltribe.xyz/gallery/imports/cartoonish20making20an20app20feature20image.avif" alt="Retro cartoon-style illustration of a cheerful young man with rounded features and thick outlines, holding a clipboard labeled &quot;App Approval.&quot; He stands outdoors against a soft, painterly background with muted warm colors and subtle gradients, evoking a nostalgic 1950s animation feel" decoding="async" />
</figure>
<p><br />I use Google’s Blogger as a backup for my main blog. I’ve had that
Blogger account for over 20 years, and since it’s free and supports
custom domains, I figured — why not use it for archival purposes?</p>
<p>I used to rely on IFTTT to automate this. When I posted something on my
main blog, it would trigger a webhook that sent the post to Blogger via
IFTTT. It worked — most of the time. But lately, IFTTT has become
unreliable. Since they use a shared API for Blogger across all users,
even my modest 3 or 4 posts a day would sometimes fail to go through due
to quota limits.</p>
<p>So, I decided to take control.</p>
<p>I set up a self-hosted automation workflow on my Raspberry Pi to do
exactly what IFTTT used to do — but using my own system. It works like a
charm.</p>
<p>Here’s the twist: in Google’s eyes, to make this work, I had to create
an “app” — just to post to my own blog. That was fine, except that in
&quot;testing&quot; mode, Google only issues OAuth tokens that last 7 days. After
that, you have to manually reconnect. And of course, this always seemed
to expire at the worst possible time.</p>
<p>With the help of my AI assistant ChatGPT, I figured out how to take the
final step: officially publish my private app to Google’s OAuth system.
That removed the 7-day token limit and made my automation stable and
reliable — just like it should have been in the first place.</p>
<p>Honestly, this whole process made me realize just how neglected Blogger
has become. It’s still a solid platform at its core — fast, stable, and
with Google-grade infrastructure behind it — but it hasn’t kept up with
the times. OAuth token lifespans, API limitations, lack of automation
features — all of it could be improved with just a little attention.
Blogger doesn’t need a full redesign. It just needs a few thoughtful
updates to keep it usable in the modern era. Google, if you’re
listening: please give Blogger some love.</p>
<p>#Blogger #Automation #SelfHosting #GoogleAPI</p>
