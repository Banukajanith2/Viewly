# Claude Code Build Prompt — YouTube Creator Analytics & Competitor Intelligence SaaS

> **How to use this:** Paste this whole document into Claude Code as your project brief, or feed it in part by part (Part 1 first, then Part 2, etc.) as you move through the build. Each part is self-contained enough to work from, but later parts assume earlier parts exist.

---

# Claude Code Build Prompt — YouTube Creator Analytics & Competitor Intelligence SaaS - Viewly

## PART 0 — Project Context (read first, don't build yet)

You are building a $0-infrastructure, vidIQ/TubeBuddy-style YouTube creator analytics and competitor-intelligence web app. The stack is Next.js 14+ (App Router) on Vercel, Firebase (Auth + Firestore) for state, and Google's YouTube Data API v3 + YouTube Analytics API for data.

This is **not a clone** — it must include specific quota-safety and abuse-prevention mechanisms from the start (Part 4 and Part 7 are not optional extras, they are core architecture), plus differentiation features that vidIQ's free tier doesn't offer (Part 8).

Hard constraints to respect throughout the build:
- **Zero monthly cost.** Every service used must have a free tier that covers the MVP. Flag anywhere a choice risks exceeding a free tier.
- **YouTube API quota is shared across the whole app, not per user.** `search.list` costs 100 units against a ~100-calls/day (10,000-unit) default budget. This is the single most important constraint in the entire system — treat it as a scarce, shared resource everywhere you touch it.
- **Vercel Hobby cron jobs run once per day, at some point within the scheduled hour, not to the minute.** Don't design any logic that assumes minute-level precision.
- **Vercel Hobby is non-commercial only** per its fair use policy. Build as if this is a personal/portfolio-stage project; don't add payment/billing code unless asked.
- **Firestore free tier is ~50k reads/day.** Every dashboard load is a read — cache aggressively rather than reading Firestore directly on every request.

Confirm you've understood these constraints before starting Part 1.

---

## PART 1 — Project Scaffolding & Directory Structure

Set up a new Next.js 14+ App Router project named `yt-creator-saas` with TypeScript, Tailwind CSS, and Shadcn UI.

Create this directory structure exactly:

```
yt-creator-saas/
├── app/
│   ├── (auth)/login/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx
│   │   ├── overview/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── retention/page.tsx              # NEW — retention diagnostics (Part 8.1)
│   │   ├── competitors/page.tsx
│   │   ├── keyword-inspector/page.tsx
│   │   └── cross-platform/page.tsx         # NEW — manual multi-platform tracker (Part 8.5)
│   ├── api/
│   │   ├── auth/youtube-callback/route.ts
│   │   ├── channel/stats/route.ts
│   │   ├── channel/analytics/route.ts
│   │   ├── channel/retention/route.ts      # NEW
│   │   ├── competitors/discover/route.ts
│   │   ├── competitors/benchmark/route.ts
│   │   ├── cron/daily-sync/route.ts
│   │   └── cron/quota-report/route.ts      # NEW — internal quota dashboard data
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── firebase/{client.ts, admin.ts, firestore.ts}
│   ├── youtube/{oauth.ts, data-api.ts, analytics-api.ts, competitor-engine.ts}
│   ├── quota/
│   │   ├── tracker.ts                       # NEW — per-user + global quota counters
│   │   └── rate-limiter.ts                  # NEW
│   ├── cache/
│   │   └── kv.ts                            # NEW — Redis/Vercel KV cache wrapper
│   └── utils/formatters.ts
├── types/youtube.d.ts
├── firestore.rules
├── next.config.mjs
└── package.json
```

Do not implement any route logic yet in this part — just scaffold files with placeholder exports so the project builds cleanly.

---

## PART 2 — Firestore Schema & Security Rules

Implement the following Firestore collections. Note the additions to the original schema (marked NEW) that support quota safety and caching.

**`users/{userId}`**
```json
{
  "uid": "usr_...",
  "email": "creator@channel.com",
  "displayName": "...",
  "channelId": "UC...",
  "channelTitle": "...",
  "createdAt": "ISO timestamp",
  "trackedCompetitorIds": ["UC...", "UC..."],
  "lastDiscoveryRunAt": "ISO timestamp"      // NEW — enforces the 7-day discovery cooldown
}
```

**`users/{userId}/tokens/youtube`** — unchanged from original spec, server-only access.

**`channels/{channelId}`** — unchanged (cached public metadata).

**`niche_cache/{keywordHash}`** — **NEW.** Shared, cross-user cache of competitor discovery results keyed by a normalized hash of the search keywords, not by user. This is the core fix for the shared quota bottleneck.
```json
{
  "keywords": ["nextjs", "react saas"],
  "results": [ /* array of CompetitorCandidate */ ],
  "cachedAt": "ISO timestamp",
  "expiresAt": "ISO timestamp"   // 7-day TTL
}
```

**`quota_usage/{date}`** — **NEW.** Daily global quota ledger.
```json
{
  "date": "2026-08-19",
  "searchListCalls": 42,
  "channelsListCalls": 310,
  "playlistItemsListCalls": 890,
  "reportsQueryCalls": 120
}
```

**`quota_usage/{date}/users/{userId}`** — **NEW.** Per-user subcollection for daily per-user caps.
```json
{ "searchListCalls": 1, "totalUnits": 100 }
```

Write `firestore.rules` so that:
- `users/{userId}` is readable/writable only by that user.
- `users/{userId}/tokens/*` is never client-accessible (server Admin SDK only).
- `channels/*` and `niche_cache/*` are readable by any authenticated user, writable only by server routes.
- `quota_usage/*` is entirely server-only (no client read or write).

---

## PART 3 — Authentication & OAuth Token Lifecycle

Implement Firebase Auth with the Google provider for login, and a separate Google OAuth 2.0 flow for YouTube data access (these are two different consent flows — don't conflate them).

Build `lib/youtube/oauth.ts`:
- `oauth2Client` configured from `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_REDIRECT_URI`.
- `getValidAccessToken(userId)`: reads the token doc from `users/{userId}/tokens/youtube`, returns the cached access token if it has more than 5 minutes left on its TTL, otherwise calls `refreshAccessToken()` and writes the new token + expiry back to Firestore.

Build `app/api/auth/youtube-callback/route.ts`:
- Exchanges the OAuth `code` for tokens.
- Persists `refreshToken`, `accessToken`, `expiresAt`, `scope`, `updatedAt` to Firestore.
- Requested scopes: `youtube.readonly` and `yt-analytics.readonly` only — do not request broader scopes than needed.

Add a visible **"Revoke Access"** button in account settings that deletes the stored refresh token and calls Google's token revocation endpoint. This is required for Google's API compliance audit later (see Part 10).

---

## PART 4 — Quota Tracking & Rate Limiting Layer (build before any API integration)

This is the most important part of the whole system. Build it before wiring up any actual YouTube API calls, and make every subsequent API-calling route go through it.

Build `lib/quota/tracker.ts`:
- `recordCall(endpoint: 'search.list' | 'channels.list' | 'videos.list' | 'playlistItems.list' | 'reports.query', userId: string)` — increments both the global daily counter (`quota_usage/{date}`) and the per-user counter (`quota_usage/{date}/users/{userId}`) atomically using a Firestore transaction.
- `getGlobalUsageToday()` — returns today's global counts, for the internal quota dashboard.
- `getUserUsageToday(userId)` — returns today's per-user counts.

Build `lib/quota/rate-limiter.ts`:
- `canUserSearch(userId)` — returns `false` if the user has run competitor discovery within the last 7 days (`users/{userId}.lastDiscoveryRunAt`), or if today's global `searchListCalls` count is within a safety margin (e.g. 80%) of the daily cap.
- `canUserCallAnalytics(userId)` — a generic per-user per-day cap (configurable, default 50 calls) on Analytics API routes to prevent runaway client-side polling.
- Both functions should throw a typed error (`QuotaExceededError`) with a clear message, which route handlers catch and turn into a `429` response with a `retryAfter` hint.

Build `app/api/cron/quota-report/route.ts`: a protected route (checked against `CRON_SECRET`, matching Vercel's cron auth header) that reads today's global usage and stores a rolling 30-day history document for later inspection — this becomes the internal quota dashboard's data source.

Every route in Part 5, 6, and 7 must call `tracker.recordCall(...)` immediately after a successful YouTube API call, and must check the relevant rate-limiter function before making the call.

---

## PART 5 — Core YouTube Data Integration

Build `lib/youtube/data-api.ts` with these functions, each going through the quota tracker from Part 4:

- `getChannelStats(channelId)` — calls `channels.list` (1 unit). Cache result in `channels/{channelId}` with a `lastUpdated` field; only re-fetch if older than 24 hours.
- `getUploadsPlaylistId(channelId)` — derives `UUxxxx` from `UCxxxx` without an API call (string substitution), per the original spec's quota-saving trick.
- `getRecentUploads(channelId, count)` — calls `playlistItems.list` (1 unit) against the derived uploads playlist. **Never use `search.list` for this** — this is the single highest-value optimization from the original spec and must not regress.

Build `lib/youtube/analytics-api.ts`:
- `getChannelAnalytics(userId, dateRange)` — calls `reports.query` (1 unit) using the user's own OAuth token via `getValidAccessToken`. Used for the Overview and Analytics dashboard pages.
- `getAudienceRetention(userId, videoId)` — calls the Analytics API's audience retention report. This underpins the retention diagnostics feature in Part 8.1, so return the raw retention curve (not just a summary) so the diagnostics layer can process it.

Build the daily cron sync: `app/api/cron/daily-sync/route.ts` — for each user with a linked YouTube account, snapshot channel stats and recent-video analytics into Firestore once per day (respecting the once-daily, fires-within-the-hour behavior of Vercel Hobby cron). All dashboard pages should read from this cached snapshot, not call the live API on page load.

---

## PART 6 — Competitor Discovery Engine (with the shared-cache fix)

Build `lib/youtube/competitor-engine.ts`, implementing the original 4-step pipeline with the niche-cache fix layered in:

**Step 1 — Extract keywords.** From the user's top 10 most-viewed recent uploads (via `playlistItems.list` + `videos.list`), extract tags and title keywords, then normalize into a sorted, deduplicated keyword array and hash it (e.g. SHA-256 of the joined, lowercased keywords) to produce a `keywordHash`.

**Step 2 — Check the shared niche cache first.** Before calling `search.list`, query `niche_cache/{keywordHash}`. If a non-expired entry exists, return it directly — no API call, no quota spent. This is the core fix: two creators in the same niche share one cached discovery run instead of each burning 100 units.

**Step 3 — On cache miss, run discovery.** Call `search.list` (100 units, tracked via `tracker.recordCall`), then `channels.list` for candidate stats (1 unit each), apply the subscriber-range filter (0.3x–3.5x the user's subscriber count), and write the result to `niche_cache/{keywordHash}` with a 7-day TTL.

**Step 4 — View velocity & breakout scoring.** For each filtered candidate, fetch their last 5 videos via `playlistItems.list`, compute average views and view velocity (latest video views ÷ hours since published), and flag candidates at >2.5x their own channel average as "Breakout Competitors."

Build `app/api/competitors/discover/route.ts`:
- Checks `rateLimiter.canUserSearch(userId)` first (Part 4) — reject with 429 if the user is inside their 7-day cooldown or the global daily search budget is nearly exhausted.
- On success, updates `users/{userId}.lastDiscoveryRunAt`.
- Returns cached-vs-fresh status in the response so the UI can show "Last updated 3 days ago (shared with other creators in your niche)" rather than implying a live per-user search.

---

## PART 7 — Caching Layer & Abuse Protection

Build `lib/cache/kv.ts` — a thin wrapper around a free-tier key-value store (Upstash Redis free tier or Vercel KV) with `get`, `set` (with TTL), and `del`. Use this in front of Firestore for:
- Dashboard snapshot reads (Part 5's daily sync output) — cache for a few hours so repeated dashboard loads don't hit Firestore each time.
- Niche cache reads (Part 6) — cache the hot path so repeated discovery-cache-hits don't even need a Firestore read.

Add middleware or route-level checks so that every route under `app/api/**` that touches the YouTube API:
1. Requires a valid Firebase Auth session.
2. Calls the relevant rate-limiter check from Part 4 before doing any external API work.
3. Returns a typed `429` with a clear message when limits are hit, rather than a generic 500.

Do not expose `YOUTUBE_API_KEY` or any Firebase Admin credentials to the client under any circumstance — all YouTube API calls happen server-side in route handlers only.

---

## PART 8 — Differentiation Features

These are the features that make this different from a vidIQ clone. Build after Parts 1–7 are stable.

### 8.1 Retention Bottleneck Diagnostics
Using `getAudienceRetention` (Part 5), build a diagnostic layer that:
- Identifies the timestamp (or timestamp range) with the steepest drop in relative retention across a user's last 5 uploads.
- Surfaces a plain-language finding, e.g. "You lose ~40% of viewers in the first 15 seconds across your last 5 uploads" rather than just plotting the raw curve.
- Renders on `app/(dashboard)/retention/page.tsx` as both a chart and a short list of flagged findings.

### 8.2 Regional Focus
- Use the YouTube Data API's `regionCode` parameter on relevant list calls to surface region-specific trending content rather than defaulting to US/global results.
- Add a user-settable "home region" field on the user profile that's applied to trending and keyword-suggestion queries.

### 8.3 AI-Assisted Title/Description/Tag Suggestions
- Build a suggestion function that takes the already-cached top-performing videos from the competitor engine (Part 6) — no new YouTube API calls — and generates title/tag suggestions via a free-tier or low-cost LLM call.
- Surface this on the keyword-inspector page as an optional "Suggest titles" action, not an automatic background job (to control LLM call volume).

### 8.4 Breakout Push Alerts
- When the competitor engine (Part 6, Step 4) flags a new Breakout Competitor video, send a Firebase Cloud Messaging push notification to users tracking that competitor, instead of requiring them to check the dashboard.
- Debounce so a user gets at most one breakout notification per competitor per day.

### 8.5 Cross-Platform Performance View
- Build `app/(dashboard)/cross-platform/page.tsx` with a simple manual-entry form (platform, post date, views, likes, comments) so creators can log TikTok/Instagram performance alongside their YouTube stats in one view.
- Store entries in a new `users/{userId}/cross_platform_posts/{postId}` collection. No external API integration required for v1.

---

## PART 9 — Deployment Checklist

Once Parts 1–8 are complete, verify and document the following before deploying:

1. **Google Cloud Console:** YouTube Data API v3 and YouTube Analytics API enabled; OAuth consent screen configured with only the two required scopes; redirect URI matches the deployed domain exactly.
2. **Firebase Console:** Firestore in production mode with `firestore.rules` from Part 2 applied; Authentication configured with the Google provider.
3. **Vercel:** all environment variables set (`YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET`, `YOUTUBE_API_KEY`, `YOUTUBE_REDIRECT_URI`, Firebase Admin credentials, KV/Redis connection string, `CRON_SECRET`); confirm the daily-sync cron entry in `vercel.json` uses a valid once-daily schedule.
4. **Compliance, for the future quota-increase application:** "Powered by YouTube" attribution visible in the UI; YouTube Terms of Service and Google Privacy Policy linked in the footer; the Revoke Access button (Part 3) is reachable from account settings.
5. **Quota safety smoke test:** manually trigger competitor discovery twice in a row for the same user and confirm the second call is rejected by the 7-day cooldown; confirm two different test accounts searching similar keywords hit the shared niche cache on the second search rather than re-calling `search.list`.
6. **Commercial-use flag:** confirm no billing/payment code has been added while still on the Vercel Hobby plan, per its non-commercial fair use policy.

---

*End of prompt. Work through the parts in order — do not skip Part 4 (quota tracking) before building Part 5 or Part 6, since both depend on it.*
