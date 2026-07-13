+++
date = "2025-02-20T22:17:00-05:00"
draft = false
title = "A Journey to and Review of Micro.blog"

[extra]
stats_word_count = 1397
stats_reading_time = 7
exclude_from_feed = true
source_url = "https://mitchelltribe.com/2025/02/20/a-journey-to-and-review/"
+++

<p align="center"><img src="https://media.mitchelltribe.xyz/gallery/imports/dalle-2025-02-20-20.39.03a-modern-clean-representation-of-micro.blog-featur.avif" alt="Illustration of Micro.blog integrating with Mastodon, Bluesky, and Pixelfed" style="width: 50%; max-width: 600px; height: auto;" /></p>
<p><strong>A Little History</strong></p>
<p>I started blogging back in 2001, beginning with Blogger—probably like many others at the time. I remained on Blogger even after Google acquired the platform in 2003. However, I wasn’t a prolific blogger back then. Instead, I focused on maintaining a personal website where I frequently updated content, mainly pictures. At the time, I used my ISP’s residential web hosting service, which was included in my package, and built my site with Microsoft FrontPage. I became very proficient with FrontPage and really miss it—but I digress.</p>
<p>When Microsoft FrontPage was discontinued and ISP-provided web hosting started disappearing, Blogger remained. So, I began using it more and more. I also started using Microsoft Live Writer—another great tool that unfortunately disappeared.</p>
<p>For many years, I stuck with Blogger. Later, I experimented with WordPress, but I found it difficult to use and wasn’t impressed. Then came all the hullabaloo surrounding one of WordPress’s creators/owners. After dealing with the chaos at Twitter under Elon Musk, I was eager to find alternatives.</p>
<p>I considered sticking with my Blogger account and began posting there again, alongside using my self-hosted Mastodon instance, which I had set up to replace Twitter. But it just wasn’t the same.</p>
<p>After researching Write.as and Micro.blog, I debated whether to just stay with Blogger. In the end, I decided to do all of them.</p>
<p>First, I signed up for Write.as. Then, a few days later, I joined Micro.blog. I subscribed to the paid plans on both platforms to explore their full features. <em>(Write.as will be the subject of a separate post soon.)</em></p>
<p><strong>Discovering Micro.blog</strong></p>
<p>As I started digging into Micro.blog and figuring out all its features, I was really impressed. I like how it seamlessly combines blogging, social media, and web hosting.</p>
<p>That said, the platform leans heavily towards the Apple ecosystem (macOS and iOS). There’s a web editor, a macOS app, mobile apps for iOS and Android, and even a Firefox extension for bookmarking sites—but no Windows app.</p>
<p>I’ve structured my Micro.blog site to resemble the layout I once had on my FrontPage-built site (with one key exception, the photo gallery ). At its core, I now have a fully integrated blog. Federation handles the social media aspect.</p>
<p>Micro.blog not only federates with Mastodon, Pixelfed, and Bluesky, but it also connects with Meta properties (like Threads) and Automattic services (like Tumblr). Additionally, you can import content into your blog via RSS feeds, turning various sources into blog posts automatically.</p>
<p>Since I use a custom domain with Cloudflare, I was happy to see that Micro.blog works well with Cloudflare DNS. Setting up a custom domain with Micro.blog was seamless, and Cloudflare’s security features provide an extra layer of protection.</p>
<p><strong>User Experience &amp; Mobile Apps</strong></p>
<p>Micro.blog is built on Hugo, users who are comfortable with Hugo’s templating system can deeply customize their sites. While the default theming is simple, those familiar with Hugo can modify templates, tweak layouts, and enhance functionality. For those who aren’t as comfortable with coding, Micro.blog’s built-in themes and plugins offer plenty of flexibility.</p>
<p>Micro.blog has a vibrant plugin community. There are a lot of third-party themes from <a href="mattlangford.com">Matt Langford</a> and <a href="jimmitchell.org">Jim Mitchell</a> (not related, as far as I know). You can host podcasts with Micro.blog and send newsletters.</p>
<p>For mobile users, there are apps for both iOS and Android. Since I primarily use Android, I can’t speak much about the iOS apps, but the Micro.blog Android app feels feature-rich.</p>
<p>Micro.blog also offers companion apps, such as:</p>
<ul>
<li><strong>Epilogue</strong> (for book tracking)</li>
<li><strong>Strata</strong> (for notes)</li>
</ul>
<p>There’s also <strong>Sunlit</strong>, a photo-sharing app for iOS, and an Android version is expected in the future.</p>
<blockquote>
<p>We aren’t planning to develop a Windows app for Micro.blog, but I would like to have an Android app for Sunlit one day. Ideally, all of our mobile apps would be available for both iOS and Android.</p>
<p>If you find a good standards-based app for Windows that works with Micro.blog, let us know! We can link to it from Micro.blog so more people know about it.</p>
</blockquote>
<p>Micro.blog’s federation features have made me reconsider whether I really need to maintain my own Mastodon instance. While I still appreciate some of Mastodon’s features, like boosting or favoriting posts, the managed hosting I have through Masto.host has been fantastic.</p>
<p>I have already imported my Mastodon following list to Micro.blog, which would make a transition smoother in the future if I decide to shut down my Mastodon instance. One of Micro.blog’s biggest advantages is POSSE (Publish Own Site, Syndicate Elsewhere), allowing me to post on my own platform while automatically syndicating content to other networks. This makes my decision about whether to keep my Mastodon instance an interesting one for the future.</p>
<p><strong>The Downsides</strong></p>
<p>While I’ve found plenty of positives, there are a few negatives—though I really had to dig for them.</p>
<p>The writer/editor is not What You See Is What You Get (WYSIWYG). From what I can tell, it’s a mix of HTML and Markdown. Since I’m not well-versed in either, there has been a bit of a learning curve. The editor is especially difficult to navigate when adding pictures. You can’t place them inline, which makes it challenging (at least for me) to determine where the images will end up in the final post.</p>
<p>To work around this, I’ve started composing longer posts in Obsidian (a Markdown editor) and using the online writer/editor for shorter posts. Currently, I am using Typora (I recently bought it). I think, as far as writer/editors go, Scribbles has the best I have ever seen—it is extremely user-friendly.</p>
<p>The Android apps seem to be full-featured, and the only negative I’ve noticed is with Strata. I can edit notes created on the web and create notebooks, but I can’t create new notes from the Android app. I’ve reported this, as I believe it’s a bug.</p>
<p><strong>Improvements</strong></p>
<p>What could make this platform better, or what features would I like to see? Honestly, not much. But a few things come to mind:</p>
<ul>
<li>A better web writer</li>
<li>A Windows app on par with the macOS app (my dream)</li>
<li>A way to sort people I follow by platform (i.e., Micro.blog, Mastodon, Bluesky, or others)</li>
<li>An easy way to create a photo gallery that isn’t tied to a blog post and can be added to navigation</li>
<li>A way to hide the default photo page (this might just be something I need to learn how to do)</li>
<li>A Mastodon-style share extension plugin for Firefox</li>
<li>Easier category management (editing, renaming, and reorganizing)</li>
<li>Support for tags to better organize posts</li>
<li>Hashtag support for social media cross-posting (so hashtags in a Micro.blog post properly transfer to Mastodon, Bluesky, etc.)</li>
<li>Ensure images display consistently across different post layouts, avoiding issues where images appear off to the side in two-line view but display correctly in three-line view (similar to what I experienced with Scribbles, which was reported).</li>
</ul>
<p>Some of these features may already be supported, and I just need to learn where they are and how to use them. If so, I welcome any pointers from the community!</p>
<p><strong>Verdict</strong></p>
<p>For my needs and wants, Micro.blog is an 8 out of 10. Like Masto.host, this is an independently owned service with a beautiful array of features, constant development, and refinement. One of the things I appreciate about Micro.blog is its strong integration with IndieWeb principles, including support for Webmentions and POSSE. This keeps my content under my control while still allowing me to engage across the web.</p>
<p>Manton Reece, the owner and creator, seems committed to fostering a positive community. The pricing is reasonable:</p>
<ul>
<li>$1/month (Micro.one)</li>
<li>$5/month (Micro.blog)</li>
<li>$10/month (Micro.blog Premium) (With yearly plans available.)</li>
</ul>
<p>The community is very engaged, and Manton isn’t just involved in the product but also the community.</p>
<p>It amazes me how one person can manage improvements, upgrades, support (though he now has help), community engagement, and keep up with the ever-evolving IndieWeb and social media landscape.</p>
<p>Unless Manton lets this platform wither—or worse, turns into another entitled owner (like Matt Mullenweg, Elon Musk, or Mark Zuckerberg)—and as long as I have the income, I can see this being my permanent home.</p>

