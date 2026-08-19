import "server-only";

/**
 * Breakout push alerts (Part 8.4).
 *
 * Sends through Firebase Cloud Messaging, which is free and already part of the
 * project, so this adds no cost and no new vendor.
 *
 * The debounce is the important part. A breakout stays a breakout for days: the
 * flag is "this channel's latest upload is beating its own average", and that
 * remains true every time the cron runs until they publish again. Without a guard
 * the same video would be pushed every single day, which is how a useful alert
 * becomes something people disable.
 */
import { getMessaging } from "firebase-admin/messaging";
import { getAdminApp } from "@/lib/firebase/admin";
import { deleteFcmTokenByValue, listFcmTokens } from "@/lib/firebase/firestore";
import { increment } from "@/lib/cache/kv";

/** One alert per user per competitor per UTC day, as the brief requires. */
const DEBOUNCE_TTL_SECONDS = 24 * 60 * 60;

const debounceKey = (userId: string, channelId: string, day: string) =>
  `push:breakout:${day}:${userId}:${channelId}`;

export interface BreakoutAlert {
  channelId: string;
  channelTitle: string;
  videoId: string;
  videoTitle: string;
  views: number;
  averageViews: number;
}

/**
 * Whether this alert may be sent, recording the attempt if so.
 *
 * Uses an atomic INCR: two cron invocations overlapping must not both read "not
 * sent yet" and both push. Returns false when the counter is unavailable, so a
 * cache outage means no notification rather than an unbounded number of them. For
 * an alert, silence is the safe failure and a duplicate is the harmful one.
 */
export async function claimAlertSlot(
  userId: string,
  channelId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const day = now.toISOString().slice(0, 10);
  const count = await increment(debounceKey(userId, channelId, day), DEBOUNCE_TTL_SECONDS);
  return count === 1;
}

export interface SendResult {
  sent: number;
  failed: number;
  prunedTokens: number;
}

/**
 * Pushes one breakout alert to every device a user has registered.
 *
 * Tokens FCM reports as unregistered are deleted. A browser that cleared its site
 * data leaves a token behind that can never be delivered to, and keeping it means
 * every future send retries a guaranteed failure.
 */
export async function sendBreakoutAlert(
  userId: string,
  alert: BreakoutAlert,
): Promise<SendResult> {
  const tokens = await listFcmTokens(userId);
  if (tokens.length === 0) return { sent: 0, failed: 0, prunedTokens: 0 };

  const multiple = Math.round((alert.views / Math.max(1, alert.averageViews)) * 10) / 10;

  const messaging = getMessaging(getAdminApp());
  const res = await messaging.sendEachForMulticast({
    tokens: tokens.map((t) => t.token),
    notification: {
      title: `${alert.channelTitle} has a breakout`,
      body: `"${alert.videoTitle}" is running at ${multiple}x their usual views.`,
    },
    // Read by the service worker to route the click. Values must be strings.
    data: {
      channelId: alert.channelId,
      videoId: alert.videoId,
      url: `https://www.youtube.com/watch?v=${alert.videoId}`,
    },
    webpush: {
      fcmOptions: { link: "/competitors" },
      notification: {
        icon: "/icon-192.png",
        // Collapses repeats for the same channel in the notification tray, which
        // is a second line of defence behind the server-side debounce.
        tag: `breakout-${alert.channelId}`,
      },
    },
  });

  let pruned = 0;
  await Promise.all(
    res.responses.map(async (r, i) => {
      if (r.success) return;
      const code = r.error?.code ?? "";
      if (
        code === "messaging/registration-token-not-registered" ||
        code === "messaging/invalid-registration-token" ||
        code === "messaging/invalid-argument"
      ) {
        await deleteFcmTokenByValue(userId, tokens[i].token);
        pruned++;
      } else {
        console.error("[push] send failed for %s: %s", userId, code);
      }
    }),
  );

  return { sent: res.successCount, failed: res.failureCount, prunedTokens: pruned };
}
