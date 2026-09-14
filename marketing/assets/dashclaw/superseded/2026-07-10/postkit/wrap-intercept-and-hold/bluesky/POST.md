# DashClaw — Bluesky post kit

## Files
- Video: wrap-16x9.mp4
- Silent cut: wrap-16x9-silent.mp4 (muted-autoplay embeds)
- Thumbnail: NOT INCLUDED (segment kits omit the brand launch thumbnail)
- Caption: caption.txt (paste as the post copy)
- Alt text: alt.txt (one-sentence video description)


## Before you publish
1. No mandatory AI toggle on Bluesky today — if the voiceover is synthetic, say so in the copy (see DISCLOSURE.md at the kit root).
2. Destination link: https://dashclaw.io?utm_source=bluesky&utm_medium=video&utm_campaign=dashclaw
3. After publishing, paste the live post URL into out/dashclaw/marketing/posts.json's `url` field for this platform (and set `published` to true).

## Notes
Publish with node scripts/publish-bluesky.mjs <brand> (or the Publish to Bluesky button in Mission Control); it uploads social-16x9.mp4, posts caption.txt with alt.txt, and records the URL in posts.json. Links in the caption become tappable.
