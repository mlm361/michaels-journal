+++
title = "That \"Something Wonderful\" I Was Working On"
date = "2025-09-27T05:17:28+00:00"
draft = false

[extra]
exclude_from_feed = true

+++
<figure style="max-width: 100% !important; margin: 1.5em auto !important; padding: 0 !important;">
<img src="https://media.mitchelltribe.xyz/gallery/imports/vk0zqqvd.avif" alt="A man sits at a desk in a dimly lit room, working on a computer with three monitors displaying various web pages. The room has a warm ambiance with a lamp on the desk and a view of a cityscape through the window at night. The painting style is reminiscent of Edward Hopper, emphasizing solitude and the glow of screens in a dark room." style="display: block !important; max-width: 100% !important; width: auto !important; height: auto !important; margin: 0 auto !important;">
<figcaption style="font-size: 0.95em; color: #666; margin-top: 0.5em; text-align: center;">Late-night coding with multiple blogs open, in a Hopper-inspired scene of focus and isolation.</figcaption>
</figure>



﻿I posted a vague toot recently saying I was working on "something wonderful." Time to explain what that actually means.

I got tired of manually posting the same content to multiple blogs, so I'm building a Python program that does it for me.

<!--more-->

The problem is simple: I have several blogs across different platforms, both free and paid. Each one has its own quirky web editor, and none of them talk to each other well. Micro.blog hosts my main site, but I want to publish everywhere at once without copying and pasting or relying on unreliable RSS feeds.

I already built a Python program for cross-posting to social media that works well enough. Now I'm building something similar for blogs, running on my Raspberry Pi. Eventually I'll connect both programs into a proper POSSE setup (Publish on your Own  Site, Syndicate Elsewhere).

Since I'm not a software developer, I use AI to help write code. I took QBasic and intro Python courses years ago, which is just enough knowledge to get me into trouble. Claude and ChatGPT do most of the heavy lifting, though they each have their own frustrations. Claude starts strong but goes off track. ChatGPT focuses too narrowly on specific modules. It's like  having coding assistants with different personalities and attention spans.

Here's where the project stands:
The Manual Poster handles social media and is nearly complete. You can see the interface for creating posts and selecting which platforms to publish to.﻿


<figure style="max-width: 100% !important; margin: 1.5em auto !important; padding: 0 !important;">
<img src="https://media.mitchelltribe.xyz/gallery/imports/xsauodaw.avif" alt="Screenshot of a &quot;Manual Post Creator&quot; interface for creating and scheduling posts across multiple platforms. The interface includes fields for entering a message, selecting social media platforms, and scheduling the post. It also features AI writing tools for proofreading, adding emojis, and suggesting hashtags. The design is clean with a light color scheme and clearly labeled sections." style="display: block !important; max-width: 100% !important; width: auto !important; height: auto !important; margin: 0 auto !important;">
<figcaption style="font-size: 0.95em; color: #666; margin-top: 0.5em; text-align: center;">Manual Post interface for creating and scheduling posts across platforms.</figcaption>
</figure>



The Blog Poster is still in alpha. The dashboard shows system status and recent posts, while the creation interface handles titles, content, tags, and publishing options across multiple blog platforms.


<figure style="max-width: 100% !important; margin: 1.5em auto !important; padding: 0 !important;">
<img src="https://media.mitchelltribe.xyz/gallery/imports/by6ykwdy.avif" alt="Screenshot of a Blog Poster Dashboard interface showing various sections including Service Status, Platform Status, AI Services, Scheduled Posts, Database Health, and Actions. The dashboard displays status updates, system health, and recent blog posts with options to manage and create new content." style="display: block !important; max-width: 100% !important; width: auto !important; height: auto !important; margin: 0 auto !important;">
<figcaption style="font-size: 0.95em; color: #666; margin-top: 0.5em; text-align: center;">Dashboard view showing service status, database health, and recent posts.</figcaption>
</figure>





<figure style="max-width: 100% !important; margin: 1.5em auto !important; padding: 0 !important;">
<img src="https://media.mitchelltribe.xyz/gallery/imports/mjeauvel.avif" alt="A screenshot of a user interface for creating a new blog post, featuring fields for title, template selection, media upload, markdown file import, content entry in markdown format, tags, status, and publishing options. The interface includes buttons for additional editing features like proofreading and preview." style="display: block !important; max-width: 100% !important; width: auto !important; height: auto !important; margin: 0 auto !important;">
<figcaption style="font-size: 0.95em; color: #666; margin-top: 0.5em; text-align: center;">Create New Post screen with fields for title, content, tags, and publishing options.</figcaption>
</figure>



It's rough around the edges, but it's starting to solve the actual problem I have. No more copying and pasting the same post five times. That's the "something wonderful" I was being vague about.