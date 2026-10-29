+++
title = "Nostr Without the Bitcoin"
date = "2026-10-29T07:29:41-04:00"
draft = false
description = "I was reading Nostr the other day and saw an interesting post that got me thinking. I can't find it now and wish I had saved it, especially since it relates to some other things I've been wanting to write about. The person said they..."
slug = "nostr-without-the-bitcoin"

[taxonomies]
tags = [ "Nostr", "opinion", "technology",]

[extra]
stats_word_count = 959
stats_reading_time = 5
image = "https://media.mitchelltribe.xyz/images/2026/10/d3781e0f_ai_gen_c1274b9d4e44.avif"

[extra.posse]
mastodon = "https://mitchelltribe.social/@michael/117523967064697545"
bluesky = "https://bsky.app/profile/mitchelltribe.com/post/3myz62twtnj23"
sharkey = "https://mitchelltribe.rodeo/notes/asx10by9bmfn0002"
nostr = "https://jumble.social/nevent1qqsynm6lzas3lj3p8xmrv6wzytndxrrgdcecvj3j2z9prau73f4ynvspr4mhxue69uhhyetvv9ujumtfw33ksetvd368y6tzv5hxxmmdqyxhwumn8ghj7mn0wvhxcmmvqy28wumn8ghj7un9d3shjtnyv9kh2uewd9hsygp02vfgtvcm7q2ru6ld4mgg6g36d4anva2m6vfu2yncn3ae9tjflcdz3grn"
+++

<data class="p-summary" value="I was reading Nostr the other day and saw an interesting post that got me thinking. I can&#x27;t find it now and wish I had saved it, especially since it relates to some other things I&#x27;ve been wanting to write about. The person said they..."></data>



<figure style="max-width: 100% !important; margin: 1.5em auto !important; padding: 0 !important;">
<img src="https://media.mitchelltribe.xyz/images/2026/10/d3781e0f_ai_gen_c1274b9d4e44.avif" alt="Black-and-white line illustration of a man seated at a table in a bright home office. Wearing a collared shirt and dark tie, he leans forward with his chin resting on one hand and studies an open laptop. Its screen shows a central node connected by lines to several surrounding circles, alongside a small sidebar with indistinct markings. Three small electronic network devices sit on the table, including a router with two upright antennas; cables connect them to one another and the laptop. A mug, pen, and papers are nearby. Sunlight streams through a window on the left, where a potted plant sits on the sill. In the background are a framed picture of sailboats, a lamp, a bookshelf, and a chair. No legible text is visible." style="display: block !important; max-width: 100% !important; height: auto !important; margin: 0 auto !important;" width="1024" height="1024">
</figure>



<figcaption>A curious tinkerer explores Nostr’s decentralized network, leaving Bitcoin out of the picture.</figcaption>

<br>

I was reading [Nostr](https://nostr.com/) the other day and saw an interesting post that got me thinking. I can't find it now and wish I had saved it, especially since it relates to some other things I've been wanting to write about. The person said they didn't understand why Nostr isn't more popular, and that it seems like people are leaving and there are fewer people around. Why does it feel so empty, almost like it's dying?

In case you didn't know, Nostr is a different take on a social network. It's probably the closest thing to old Twitter in style, but certainly not in infrastructure. Instead of one company controlling everything, it uses independent servers called relays. You can even run your own. I do and I have two of them.
<!--more-->

There are some smart and talented developers working to make Nostr easier, safer, and better for us "normal" people. But I think one of its biggest problems is how much crypto/Bitcoin is pushed throughout the ecosystem. Zaps are basically small Bitcoin tips, and the [Nostr Design documentation](https://nostrdesign.org/docs/how-to/zaps/) describes them as a gentle introduction to Bitcoin. That description sounds like a gateway drug to cryptocurrency, and I know some people aren't going to like that comparison. But what if people don't want to be introduced to cryptocurrency? I certainly don't. I have no wallet, don't accept Zaps, and would prefer to turn all that stuff off in my Nostr clients. Unfortunately, that isn't always easy or at least I can't find a way.

I'm not opposed to getting a dollar or even 10 cents, especially with the cost of things nowadays! But I want no part of crypto. I distrust cryptocurrency. I tried Dogecoin once with less than $10, and dealing with Robinhood's tax paperwork was enough for me. Then there are the potential fees and hassle of converting little Bitcoin tips into actual dollars. Why go through all that for a dollar? Most people just want to post, share pictures, and talk to friends. They don't want to learn about Bitcoin **to use a social network.** I wonder how many potential Nostr users are turned off by how prominent Bitcoin is.

That brings me to what I think is Nostr's other big problem: awareness. Nostr doesn't connect as easily with other decentralized social networks as I'd like. Bridgy Fed allows people on Bluesky and Mastodon to follow and interact with each other, but it still doesn't support Nostr. There is a bridge called Mostr that connects Nostr with ActivityPub and has some Bluesky functionality too, but it isn't as straightforward or well integrated. I've had pretty good luck with it on Sharkey, but not nearly as much with Mastodon or Bluesky. I think that hurts Nostr's visibility. People already using Bluesky or Mastodon may never encounter it. I hadn't even heard of Nostr until Manton Reece mentioned it on Micro.blog.

Despite all my complaints, there's actually quite a bit I like about Nostr. The community I've encountered seems more politically libertarian than what I've experienced on Bluesky or Mastodon. I also haven't encountered nearly as much hostility toward AI and LLMs. Though lately I have seen some AI hostility, it depends on the client I use.

My worst experiences have been on Bluesky, where I've seen people berated, and been berated myself, simply for mentioning AI or using AI generated images. I've seen some of that on Mastodon too, although my own experiences there have been quite civil. Nostr has been much the same, civil.

There are also some really nice Nostr applications, like [Ditto](https://github.com/soapbox-pub/ditto), [Amethyst](https://github.com/vitorpamplona/amethyst), and a newer one I discovered called [Nostrich](https://nostrich.org/).

For my relays I've been using a relatively new program called [Canoe](https://gitea.coracle.social/coracle/canoe). It's written in Rust, includes a Blossom media server, and automatically synchronizes with other relays. It comes from Jon Staab, who has been developing Nostr software for quite a while. So far, it's been working very well for me, and did I mention it's free? It was built especially for a single user or a small group, like a family.

So, back to that post I read. Is Nostr dying a slow death? Maybe. I know my friends and family have never heard of it and if they even caught a glimpse of the crypto stuff, they'd be out. Between the lack of awareness and the heavy emphasis on cryptocurrency, I wonder how many people ever give it a chance. And if newcomers don't find enough people to interact with, they may not stick around either. That's a hamster wheel problem and I just don't know how or if you can stop the wheel for the hamster to get off of it. Which is a shame, **because I actually like Nostr**. I've had some good conversations, found some interesting people to follow, and enjoyed trying out the different applications. I don't mind that it's a smaller community.

I just wish the cryptocurrency stuff was optional and could be removed. If people want Bitcoin, Lightning, and Zaps, that's fine. Make it a configurable setting. But why make cryptocurrency such a noticeable part of a social network when so many people are just looking for a great alternative to the big corporate platforms?

I think the people making the NIPs (Nostr Implementation Possibilities) and shaping the network need to decide if it is a social network that is open source, free, and basically a whole software ecosystem where you can do almost anything with Nostr and your keys. Or is it a promotional tool for Bitcoin and crypto on top of a social network? If it is a promotional tool, I think Nostr will stay a small, niche community.