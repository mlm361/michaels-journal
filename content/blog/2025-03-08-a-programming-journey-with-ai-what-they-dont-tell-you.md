+++
date = "2025-03-08T05:43:56+00:00"
draft = false
title = "A Programming Journey with AI: What They Don't Tell You"

[extra]
stats_word_count = 948
stats_reading_time = 5
exclude_from_feed = true
source_url = "https://mitchelltribe.com/2025/03/08/a-programming-journey-with-ai/"
+++



<figure style="max-width: 100% !important; margin: 1.5em auto !important; padding: 0 !important;">
<img src="https://media.mitchelltribe.xyz/gallery/imports/w07xpvd0.avif" alt="A determined programmer sitting at a cluttered desk with multiple screens showing lines of code and AI chatbot responses. Floating digital assistants" style="display: block !important; max-width: 100% !important; width: auto !important; height: auto !important; margin: 0 auto !important;">
</figure>



It all started with a simple question: _Can I take an RSS feed from one blog and feed it to another?_

I knew that my Write.as blog automatically generated an RSS feed and that I used to import posts directly into Micro.blog. However, I was running into issues with duplicate posts. So, I had an idea—why not see if ChatGPT could help me or if there was already a program that could parse an RSS feed and pull it into Micro.blog?

ChatGPT confirmed that it was possible. It suggested that I use my Raspberry Pi to run a script that would fetch the feed, filter out what I didn't need, and then push the cleaned-up version to Micro.blog.

<!--more-->

### **Diving Into the World of AI-Assisted Coding**

My coding experience was minimal. I had learned QBasic in college over 30 years ago and had taken an introductory Python course about a decade ago. In other words, I had just enough knowledge to get myself into trouble. So, I knew I’d have to rely almost entirely on AI to guide me through this project.

To ensure quality, I decided to use Gemini as a kind of QA checker. I told ChatGPT what I wanted to do, and as it generated lines of code, I would copy and paste them into Gemini for review. Gemini would provide assessments and suggestions, which I then fed back into ChatGPT for refinement.

I assumed this process would take just a few hours. Instead, it turned into a multi-day battle.

### **The Struggle Begins**

ChatGPT walked me through setting up everything I needed on my Raspberry Pi 5. Once everything was in place, I ran the script—and immediately encountered error after error.

For the rest of the day, I went back and forth between ChatGPT and Gemini, tweaking the code, troubleshooting issues, and starting new chats when things got too messy. Thirteen hours later, I was exhausted and felt like I was getting nowhere.

I decided to sleep on it.

The next morning, the code was working, but not quite the way I wanted. Then I had another idea—what if I made it capable of parsing multiple feeds? That way, I could also include my Pixelfed RSS feed in the future.

So, I told ChatGPT what I wanted. It dutifully generated updates, which I then checked with Gemini. But this time, I started getting frustrated. Both AI models were telling me that the code was “finished,” yet it wasn't working correctly.

### **The AI Character Limit Problem**

I had ChatGPT regenerate the full script after multiple iterations, thinking it would be easier to copy and paste the entire thing rather than piecing together small edits. However, as the script grew longer, I noticed that I was running into more and more errors.

By Sunday, I was completely burnt out. I decided to step away for the rest of the weekend and revisit it after work on Monday.

Monday and Tuesday evenings were spent refining the script. I finally had something that worked—but not quite how I needed it to.

I also noticed something strange: ChatGPT and Gemini were no longer giving me the full code back after updates. Instead, they were only returning partial sections. I switched to Perplexity AI to see if it handled things better.

At this point, I was also running into another problem—the script was struggling to properly isolate the post signature that I use on Write.as. I wanted this signature automatically removed, since it wasn't needed for Micro.blog.

To troubleshoot, I enlisted **four different AI models**:

* **ChatGPT**
* **Gemini**
* **Claude**
* **Perplexity AI**

Still, I kept noticing that my script was getting shorter instead of longer. Even though each AI claimed to be providing the full code, something was missing.

That’s when I finally asked ChatGPT why this was happening.

### **AI’s Hidden Limitation**

It turns out that most AI models struggle with long outputs. They can ingest large amounts of text, but when it comes to outputting a complete response, they often lose track of their place or hit character limits.

Even though I was using the paid version of ChatGPT, it still couldn't return my full script. This was true for Gemini, Claude, and Perplexity as well.

That’s when ChatGPT suggested I try Cursor AI—an AI coding assistant that supposedly didn’t have these limitations.

### **The Breakthrough**

Sure enough, Cursor AI was able to output my entire script in one go. With that, I finally finished my project. The script worked exactly as I wanted—it pulled only new Write.as posts and formatted them cleanly for Micro.blog.

The final step was testing, and it worked perfectly.

After nearly five days of trial and error, I had my working script. I immediately canceled my ChatGPT Plus subscription and switched to Cursor AI's paid plan instead. The free versions of AI assistants are fine for everyday needs, but for coding, Cursor AI is my new go-to (unless something better comes along).

### **Lessons Learned**

For a while, I thought these AI models were intentionally stringing me along by making minor errors in the code or withholding parts of it. But in reality, they just weren’t capable of outputting long responses in a single attempt.

Because Cursor AI runs locally on my machine (while still leveraging cloud capabilities), it doesn’t have the same output limitations.

In the end, my final script ended up being around 360 lines of code—but all the other AI models could only output about 123 lines at best before getting cut off.

Despite the struggle, I learned a lot—not just about coding, but about how AI tools work.