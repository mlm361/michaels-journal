# michaelponders.com (Blogger) weather: paste-ready pieces

These are pasted into Blogger by hand. They load `/js/weather.js` from michaelreflects.com with
`data-wx-site="ponders"`, which switches the script to read michaelreflects.com data and moon pictures,
link to `/p/weather.html`, and add `/css/ponders-weather.css` (the blog's own look).

1. `1-sidebar-gadget.html`: Layout > Sidebar (Bottom) > Add a Gadget > HTML/JavaScript, Title "Weather"; drag it to the top.
2. `2-footer-gadget.html`: Layout > Footer > HTML/JavaScript, Title "Weather"; drag it above Social Links. Shows only below 1440px.
3. `3-weather-page.html`: Pages > New page, title "Weather", HTML view. Then add it to the Pages gadget before Reading as "🌦️ Weather".
4. `4-privacy-weather-section.html`: Privacy Policy page, HTML view, insert before "6. Children's Privacy"; renumber 6-8 to 7-9 and set Last Updated.

Only after michaelreflects.com serves /weather.json, /js/weather.js and /css/ponders-weather.css.
