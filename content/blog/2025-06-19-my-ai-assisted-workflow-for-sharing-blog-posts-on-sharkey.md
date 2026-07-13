+++
title = "My AI-Assisted Workflow for Sharing Blog Posts on Sharkey"
date = "2025-06-19T12:30:00-04:00"
draft = false

[extra]
stats_word_count = 439
stats_reading_time = 3
exclude_from_feed = true
source_url = "https://mitchelltribe.com/2025/06/19/my-aiassisted-workflow-for-sharing/"
+++

<figure class="attachment attachment--preview flex-col justify-center attachment--png">
      <img class="lightbox__image strip-metadata lightbox__image" srcset="https://scribbles.page/rails/active_storage/representations/proxy/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBMjQzQVE9PSIsImV4cCI6bnVsbCwicHVyIjoiYmxvYl9pZCJ9fQ==--65fc05deb15379e030e4d5098a364e501639ed78/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaDdDRG9MWm05eWJXRjBTU0lJY0c1bkJqb0dSVlE2RkhKbGMybDZaVjkwYjE5c2FXMXBkRnNIYVFJQUVHa0NBQXc2Q25OaGRtVnlld2M2Q25OMGNtbHdWRG9NY1hWaGJHbDBlV2xrIiwiZXhwIjpudWxsLCJwdXIiOiJ2YXJpYXRpb24ifX0=--a18847b6c1cccf2736612f487841b9c550593dc1/Blog%20Image%20Jun%2019,%202025.png 2x" loading="lazy" src="https://media.mitchelltribe.xyz/gallery/imports/blog20image20jun2019202025.avif" alt="Illustration of AI-assisted POSSE automation, featuring a glowing lightbulb with a brain-shaped filament at the center, symbolizing AI. Surrounding it are icons for RSS, blogging, Micro.blog, and Sharkey, arranged on a dark blue background in a modern, tech-inspired style." decoding="async" />
</figure>
<p><br />I’ve written extensively about how AI has changed the way I
interact with computers and brought my ideas to life. Let me restate
something I’ve said before: I’m not a software developer. But I do have
ideas—and I’ve always wished I could bring them to life. Well, thanks to
AI, that’s starting to happen.</p>
<p>I recently started a <a href="https://mitchelltribe.rodeo">Sharkey</a>
instance for myself. Honestly, I like it better than Mastodon. But I’m
not quite ready to give Mastodon up entirely, and I wanted my blog posts
to automatically be shared on Sharkey. When I post to my blog on
Micro.blog, it uses <strong>POSSE</strong> (Publish On your Own Site,
Syndicate Elsewhere)—but Sharkey isn’t included in that.</p>
<p>So AI helped me fix that with <a href="https://n8n.io">n8n</a>. I set up
several workflows so that when I post to my website, the RSS feed is
monitored by n8n using the workflow shown below. It took a bit of
effort—and the help of <strong>two AIs</strong>.<br /></p>
<figure class="attachment attachment--preview flex-col justify-center attachment--png">
  <img class="lightbox__image strip-metadata lightbox__image"
       srcset="https://media.mitchelltribe.xyz/gallery/imports/final-20sharkey-20posting-20workflow.avif 2x"
       loading="lazy"
       src="https://media.mitchelltribe.xyz/gallery/imports/final-20sharkey-20posting-20workflow.avif"
       alt="n8n workflow for posting from Micro.blog to Sharkey, showing a schedule trigger, HTTP request, formatting code, and final post to Sharkey."
       decoding="async" />
  <figcaption class="attachment__caption text-center">
    Micro.blog to Sharkey n8n work flow.
  </figcaption>
</figure>
<p><br />Funny thing: I subscribe to both Claude AI and ChatGPT, and I
often pit them against each other as a sanity check. Since I can’t
verify the code myself with confidence, I compare their answers. And
when they disagree, I paste both responses into
<strong>Perplexity</strong> or <strong>Google’s Gemini</strong> to get a
broader consensus on the best solution.</p>
<p>In this case, Claude got me about 98% of the way there—but I ran into a
formatting issue. So I dropped the whole thing into ChatGPT, and it
immediately identified the problem, fixed it, and now my Sharkey posts
look just like they came from Micro.blog.</p>
<p>Now I have a similar workflow for this Scribbles site:</p>
<ul>
<li>Much simpler only 4 nodes.
</li>
<li>Atom feed instead of JSON.</li>
</ul>
<figure class="attachment attachment--preview flex-col justify-center attachment--png">
      <img class="lightbox__image strip-metadata lightbox__image" srcset="https://scribbles.page/rails/active_storage/representations/proxy/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaHBBMnMzQVE9PSIsImV4cCI6bnVsbCwicHVyIjoiYmxvYl9pZCJ9fQ==--33c10a505c044e4b12828b2e1ad5f9c9a8995fe1/eyJfcmFpbHMiOnsibWVzc2FnZSI6IkJBaDdDRG9MWm05eWJXRjBTU0lJY0c1bkJqb0dSVlE2RkhKbGMybDZaVjkwYjE5c2FXMXBkRnNIYVFJQUVHa0NBQXc2Q25OaGRtVnlld2M2Q25OMGNtbHdWRG9NY1hWaGJHbDBlV2xrIiwiZXhwIjpudWxsLCJwdXIiOiJ2YXJpYXRpb24ifX0=--a18847b6c1cccf2736612f487841b9c550593dc1/scribbles%20to%20sharkey%20n8n%20image.png 2x" loading="lazy" alt="n8n workflow for posting from Scribbles to Sharkey, using an RSS feed trigger with code and formatting steps before sending to Sharkey." src="https://media.mitchelltribe.xyz/gallery/imports/scribbles20to20sharkey20n8n20image.avif" decoding="async" />
    <figcaption class="attachment__caption text-center">
      Scribbles to Sharkey n8n workflow.
    </figcaption>
</figure>
<p><br />Without AI, it would’ve taken me a <strong>year</strong> to figure
this out on my own. Honestly, if it weren’t for AI, I probably never
would’ve discovered Micro.blog, Scribbles, or anything else—I’d still be
stuck on WordPress, struggling to figure it out (which, for some reason,
never clicked with me, even after nearly a decade of trying).</p>
<p>AI has been like a private tutor for me. I had always wanted to
self-host using a Raspberry Pi, but never managed to start—until now. AI
is truly making life better for me.</p>
<p>Sure, I see the gloom-and-doom predictions about jobs being replaced by
AI. But that’s not what this post is about. I just wanted to share how
I’ve <strong>enhanced POSSE for my site</strong> with the help of AI.</p>
<p><br />👉 Follow me on Sharkey: michael@mitchelltribe.rodeo</p>
<p><br />#n8n #POSSE #Sharkey #SelfHosting </p>
<p><br /></p>
