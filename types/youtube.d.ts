/**
 * Shared domain types for Viewly.
 *
 * Quota-relevant note: `QuotaEndpoint` is the closed set of YouTube endpoints we
 * are allowed to call. Adding a member here means adding its unit cost to
 * QUOTA_UNIT_COST in lib/quota/tracker.ts - the two must stay in lockstep.
 */

export type QuotaEndpoint =
  | "search.list"
  | "channels.list"
  | "videos.list"
  | "playlistItems.list"
  | "reports.query";

/* ------------------------------------------------------------------ users */

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string | null;
  photoURL?: string | null;
  /** The creator's own YouTube channel, set once OAuth completes. */
  channelId: string | null;
  channelTitle: string | null;
  createdAt: string;
  trackedCompetitorIds: string[];
  /** Enforces the 7-day competitor-discovery cooldown (Part 4). */
  lastDiscoveryRunAt: string | null;
  /** Part 8.2 - applied to trending and keyword-suggestion queries. */
  homeRegion?: string;
}

/** users/{userId}/tokens/youtube - server-only, never client-readable. */
export interface YouTubeTokenDoc {
  refreshToken: string;
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
  scope: string;
  updatedAt: string;
}

/* --------------------------------------------------------------- channels */

export interface ChannelStats {
  channelId: string;
  title: string;
  description?: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  /** Hidden subscriber counts are common; callers must handle it. */
  subscriberCountHidden: boolean;
  uploadsPlaylistId: string;
  country?: string;
  lastUpdated: string;
}

export interface VideoSummary {
  videoId: string;
  title: string;
  publishedAt: string;
  thumbnailUrl?: string;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
  tags?: string[];
  durationSeconds?: number;
}

/* -------------------------------------------------------------- analytics */

export interface DateRange {
  /** YYYY-MM-DD */
  startDate: string;
  /** YYYY-MM-DD */
  endDate: string;
}

export interface AnalyticsSummary {
  dateRange: DateRange;
  views: number;
  estimatedMinutesWatched: number;
  averageViewDuration: number;
  averageViewPercentage: number;
  subscribersGained: number;
  subscribersLost: number;
  /** Per-day rows for charting. */
  daily: Array<{ date: string; views: number; watchTimeMinutes: number }>;
}

export interface RetentionPoint {
  /** 0..1 through the video. */
  elapsedVideoTimeRatio: number;
  /** 1.0 == typical for videos of similar length. */
  relativeRetentionPerformance: number;
  audienceWatchRatio: number;
}

export interface RetentionCurve {
  videoId: string;
  durationSeconds: number;
  points: RetentionPoint[];
}

/**
 * users/{userId}/snapshots/{date} - written once a day by the sync cron, read by
 * every dashboard page. This is the document that keeps page loads at zero quota.
 */
export interface DailySnapshot {
  /** YYYY-MM-DD, UTC. Doubles as the document ID. */
  date: string;
  channelId: string;
  channel: ChannelStats;
  recentVideos: VideoSummary[];
  /** Null when the user's OAuth token is missing or the Analytics call failed. */
  analytics: AnalyticsSummary | null;
  syncedAt: string;
  /** Non-fatal problems worth surfacing in the UI rather than silently dropping. */
  warnings?: string[];
}

/* ------------------------------------------------------------ competitors */

export interface CompetitorCandidate {
  channelId: string;
  title: string;
  thumbnailUrl?: string;
  subscriberCount: number;
  viewCount: number;
  videoCount: number;
  /** Mean views across the sampled recent uploads. */
  averageViews: number;
  /** Latest video views / hours since published. */
  viewVelocity: number;
  /** True when the latest video is >2.5x this channel's own average. */
  isBreakout: boolean;
  /** Days since the candidate last published. Lets the UI sort by who is active. */
  daysSinceLastUpload: number;
  latestVideo?: VideoSummary;
}

export interface DiscoveryResult {
  keywords: string[];
  keywordHash: string;
  candidates: CompetitorCandidate[];
  /** Drives the "shared with other creators in your niche" UI copy. */
  source: "cache" | "fresh";
  cachedAt: string;
  expiresAt: string;
}

/** niche_cache/{keywordHash} - shared across users, never per-user. */
export interface NicheCacheDoc {
  keywords: string[];
  results: CompetitorCandidate[];
  cachedAt: string;
  expiresAt: string;
}

/* ----------------------------------------------------------------- quota */

/** quota_usage/{date} */
export interface QuotaUsageDoc {
  date: string;
  searchListCalls: number;
  channelsListCalls: number;
  videosListCalls: number;
  playlistItemsListCalls: number;
  reportsQueryCalls: number;
  totalUnits: number;
}

/** quota_usage/{date}/users/{userId} */
export interface UserQuotaUsageDoc {
  searchListCalls: number;
  channelsListCalls: number;
  videosListCalls: number;
  playlistItemsListCalls: number;
  reportsQueryCalls: number;
  totalUnits: number;
}

/* --------------------------------------------------------- cross-platform */

/** users/{userId}/cross_platform_posts/{postId} - Part 8.5 */
export interface CrossPlatformPost {
  postId: string;
  platform: "tiktok" | "instagram" | "x" | "linkedin" | "other";
  postedAt: string;
  title?: string;
  url?: string;
  views: number;
  likes: number;
  comments: number;
  createdAt: string;
}
