import "server-only";

/**
 * Quota tracking (Part 4) - the load-bearing piece of the whole system.
 *
 * The YouTube Data API budget is ~10,000 units/day for the ENTIRE APP, not per user.
 * search.list alone costs 100 units, so the app gets roughly 100 searches per day
 * across every creator using it. Nothing may call the YouTube API without recording
 * it here, or the budget becomes unobservable and the first busy day takes the app
 * down for everyone.
 */
import { FieldValue } from "firebase-admin/firestore";
import { db, paths, todayKey } from "@/lib/firebase/firestore";
import type { QuotaEndpoint, QuotaUsageDoc, UserQuotaUsageDoc } from "@/types/youtube";

/** Documented YouTube Data API v3 costs. Keep in lockstep with QuotaEndpoint. */
export const QUOTA_UNIT_COST: Record<QuotaEndpoint, number> = {
  "search.list": 100,
  "channels.list": 1,
  "videos.list": 1,
  "playlistItems.list": 1,
  // reports.query bills against the YouTube Analytics API's own quota, not the
  // Data API's 10,000 units. Counted at 0 here so it can't distort the Data API
  // budget, but its call count is still tracked below for the per-user cap.
  "reports.query": 0,
};

const COUNTER_FIELD: Record<QuotaEndpoint, keyof UserQuotaUsageDoc> = {
  "search.list": "searchListCalls",
  "channels.list": "channelsListCalls",
  "videos.list": "videosListCalls",
  "playlistItems.list": "playlistItemsListCalls",
  "reports.query": "reportsQueryCalls",
};

/** Default daily Data API budget. Override via env if Google grants an increase. */
export const DAILY_QUOTA_UNITS = Number(process.env.YOUTUBE_DAILY_QUOTA_UNITS ?? 10_000);

/** Stop spending search.list at 80% of budget so ordinary 1-unit calls still work. */
export const SEARCH_SAFETY_MARGIN = Number(process.env.QUOTA_SAFETY_MARGIN ?? 0.8);

export const EMPTY_USAGE: UserQuotaUsageDoc = {
  searchListCalls: 0,
  channelsListCalls: 0,
  videosListCalls: 0,
  playlistItemsListCalls: 0,
  reportsQueryCalls: 0,
  totalUnits: 0,
};

/**
 * Records one successful YouTube API call against both the global daily ledger and
 * the caller's per-user subcollection.
 *
 * Uses a transaction so the two counters can never disagree, but writes only
 * FieldValue.increment sentinels rather than read-modify-write. Blind increments
 * inside a transaction don't take read locks, so concurrent requests don't contend
 * or retry - which matters because this runs on the hot path of every API route.
 *
 * Call this AFTER the API call succeeds. Recording a failed call would burn budget
 * we never actually spent.
 */
export async function recordCall(
  endpoint: QuotaEndpoint,
  userId: string,
  callCount = 1,
): Promise<void> {
  const date = todayKey();
  const field = COUNTER_FIELD[endpoint];
  const units = QUOTA_UNIT_COST[endpoint] * callCount;

  const globalRef = db().doc(paths.quotaUsage(date));
  const userRef = db().doc(paths.quotaUsageUser(date, userId));

  await db().runTransaction(async (tx) => {
    tx.set(
      globalRef,
      {
        date,
        [field]: FieldValue.increment(callCount),
        totalUnits: FieldValue.increment(units),
      },
      { merge: true },
    );
    tx.set(
      userRef,
      {
        [field]: FieldValue.increment(callCount),
        totalUnits: FieldValue.increment(units),
      },
      { merge: true },
    );
  });
}

export async function getGlobalUsageToday(date = todayKey()): Promise<QuotaUsageDoc> {
  const snap = await db().doc(paths.quotaUsage(date)).get();
  return { date, ...EMPTY_USAGE, ...(snap.data() as Partial<QuotaUsageDoc> | undefined) };
}

export async function getUserUsageToday(
  userId: string,
  date = todayKey(),
): Promise<UserQuotaUsageDoc> {
  const snap = await db().doc(paths.quotaUsageUser(date, userId)).get();
  return { ...EMPTY_USAGE, ...(snap.data() as Partial<UserQuotaUsageDoc> | undefined) };
}

/** Units left in today's Data API budget, floored at 0. */
export function remainingUnits(usage: QuotaUsageDoc): number {
  return Math.max(0, DAILY_QUOTA_UNITS - usage.totalUnits);
}

/**
 * Whether one more search.list (100 units) fits inside the safety margin.
 * Checked before discovery runs, never after.
 */
export function hasSearchBudget(usage: QuotaUsageDoc): boolean {
  const ceiling = DAILY_QUOTA_UNITS * SEARCH_SAFETY_MARGIN;
  return usage.totalUnits + QUOTA_UNIT_COST["search.list"] <= ceiling;
}

/** Seconds until the next UTC midnight, when Google resets the daily budget. */
export function secondsUntilQuotaReset(now: Date = new Date()): number {
  const reset = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0,
  );
  return Math.max(1, Math.ceil((reset - now.getTime()) / 1000));
}
