<div align="center">

<img src="app/icon.svg" width="72" alt="">

# Viewly

**YouTube analytics and competitor intelligence for creators, running entirely on free tiers.**

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![Firebase](https://img.shields.io/badge/Firebase-Auth%20%2B%20Firestore-FFCA28?logo=firebase&logoColor=black)](https://firebase.google.com)

</div>

---

## What it does

Most creator tools either cost a subscription or hide the useful half behind one. Viewly
does the same job on infrastructure that costs nothing to run: Firebase, Upstash and
Vercel free tiers, with the YouTube API budget treated as the scarce resource it actually
is.

## Features

| | |
|---|---|
| **Overview & Analytics** | Subscribers, views, watch time and engagement from a daily snapshot. Momentum, upload rhythm, subscriber conversion, best publishing day and per-video performance against your own median. |
| **Retention diagnostics** | Finds where viewers actually leave: the opening loss, the steepest drop after it, and how far the median viewer gets. Stated in plain language, not just plotted. |
| **Competitor discovery** | Finds channels in your niche within 0.3x to 3.5x your subscriber count, from the topics of your own uploads. Flags breakout videos and drops abandoned channels. |
| **Keyword inspector** | Your niche terms ranked by frequency, marked against what is trending in *your* region rather than the US default. |
| **AI suggestions** | Title and tag ideas from Gemini, grounded in your own uploads and cached competitor data. Explicit action, never automatic. |
| **Breakout alerts** | Push notifications when a competitor you track has a video taking off. At most one per competitor per day. |
| **Cross-platform** | Log TikTok, Instagram, X and LinkedIn posts by hand and compare them to YouTube on average views per post. |
| **Exports** | Any table or chart to CSV. |

Plus chart range filters (7D/28D/90D/1Y/All), a hover-expanding sidebar, and light/dark
themes.

## The interesting part: staying inside the quota

The YouTube Data API gives roughly **10,000 units per day for the whole app**, not per
user. `search.list` alone costs 100 of them. Most of the engineering here is about that
number.

- **Never `search.list` for uploads.** A channel's uploads playlist ID is derived from
  its channel ID by string substitution (`UCxxx` to `UUxxx`), turning a 100 unit search
  into a 1 unit `playlistItems.list`. Verified against `contentDetails.relatedPlaylists`
  on real channels rather than assumed.
- **Discovery results are shared, not per user.** Results are cached by a hash of the
  niche's keywords, so one creator's search serves everyone competing for the same
  viewers. A 7 day per-user cooldown and a confirmation dialog guard the rest.
- **Dashboards never call the API.** One cron writes a daily snapshot; every page reads
  that, through a KV cache. Opening the app costs nothing.
- **Every call is metered.** A tracker records usage after each successful call and a
  rate limiter checks before it, with a reserve held back so cheap calls still work when
  the budget is nearly spent.

A live discovery run measured **112 units**, exactly as designed, against ~134 unbatched.

## Stack

Next.js 16 (App Router, Turbopack) · TypeScript strict · Tailwind v4 · shadcn/ui ·
Firebase Auth + Firestore · Upstash Redis · Google Gemini · Firebase Cloud Messaging ·
Recharts-free hand-rolled SVG charts

## Running locally

```bash
git clone https://github.com/Banukajanith2/Viewly.git
cd Viewly
npm install
cp .env.local.example .env.local   # then fill it in
npm run dev
```

You will need a Firebase project (Auth + Firestore), a Google Cloud OAuth client with
the YouTube Data and Analytics APIs enabled, and an Upstash Redis database. Every value
is documented in `.env.local.example`; a Gemini key and an FCM web-push certificate are
optional and only gate their own features.

Apply `firestore.rules` before signing in, or every read will be denied.

> **Note:** the OAuth consent screen is in Testing, so connecting a YouTube channel
> works only for accounts on the test-user list, and refresh tokens expire weekly.
> Signing in itself is unaffected. Publishing needs Google verification, because
> `youtube.readonly` is a sensitive scope.

## Design notes

Charts use one y-axis, always: two measures of different scale get two charts, because
whoever picks the two scales of a dual axis can imply any correlation they like. The
accent palette is chosen by constrained search rather than by eye, clearing 3:1 contrast
on both surfaces and staying separable under all three dichromacies, and colour is never
the only carrier of meaning.

## Licence

MIT

---

<div align="center">

Built by **[Banuka Janith](https://banukajanith2.github.io/Portfolio/)** ·
[GitHub](https://github.com/Banukajanith2)

<sub>Not affiliated with YouTube or Google. Uses YouTube API Services, subject to the
[YouTube Terms of Service](https://www.youtube.com/t/terms) and the
[Google Privacy Policy](https://policies.google.com/privacy).</sub>

</div>
