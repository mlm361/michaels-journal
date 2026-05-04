+++
title = "Notes"
description = "Short, untitled posts — micro-thoughts and status updates."
sort_by = "date"
template = "notes.html"
page_template = "note.html"
generate_feeds = false
transparent = false

[extra]
skip_feed = true
+++

<!--
  paginate_by intentionally not set. The theme's notes.html iterates
  section.pages, which Zola leaves empty when pagination is active
  (the templates would need to use paginator.pages instead). With
  ~tens of notes this is a non-issue; revisit if the section grows
  past a few hundred.
-->


A timeline of short, untitled posts.
