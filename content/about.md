+++
title = "About"
date = 2025-01-01
template = "page.html"
+++

<div class="about-wrap">

<figure class="about-avatar">
  <img src="/img/avatar.png" alt="Michael Mitchell" />
</figure>

## 

I'm Michael Mitchell, a <strong id="age-display">...</strong>-year-old Christian who loves technology, living in Florida with proud Polish heritage.

I spent 18 years in government work before retiring, and now work as a Pharmacy Technician and Purchasing Agent. I studied for two years of college while pursuing an IT degree, a path I had to pause but never lost interest in. My love for technology has stayed with me, and I still enjoy learning, exploring, and finding practical ways to use it in everyday life.

I played trombone through school and college, and I still enjoy classical, gospel, and Christian music.

 

### 📖 My Current Interests

At this stage in my life, many of my interests revolve around my faith, reading, and technology. I love the Lord, and my faith shapes the way I see life. I enjoy spending time in God's Word, learning more about Scripture, and continuing to grow as a Christian.

I also love to read. Whether it is the Bible, Christian writing, nonfiction, or something else that catches my interest, reading is one of the ways I keep learning and reflecting.

I have also really gotten into homelabbing. I enjoy setting up and experimenting with home servers, self-hosted services, and different kinds of technology. It has become a fun and meaningful hobby for me, and it gives me a way to keep learning while building things that are actually useful in daily life.

When I'm not working on my homelab, tinkering with my Plex server, or exploring new technology, I enjoy unwinding with some of my favorite shows. I'm a longtime Star Trek fan, and I also enjoy older television, including All in the Family and other classic TV series.



</div>

<script>
(function() {
  var birthYear  = 1969;
  var birthMonth = 4; // April = 4

  var now   = new Date();
  var age   = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth) age--;

  var el = document.getElementById('age-display');
  if (el) el.textContent = age;
})();
</script>

<style>
.about-wrap { max-width: 600px; }
.about-avatar {
  width: 110px;
  height: 110px;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid currentColor;
  margin: 0 0 1.5rem;
}
.about-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
</style>
