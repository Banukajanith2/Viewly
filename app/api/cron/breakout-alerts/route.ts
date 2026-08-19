import { NextResponse } from "next/server";
import { runBreakoutAlerts } from "@/lib/notifications/breakout-run";
import { cronRoute } from "@/lib/utils/api";

export const runtime = "nodejs";

/**
 * GET /api/cron/breakout-alerts
 *
 * Breakout push alerts (Part 8.4).
 *
 * NOT registered in vercel.json. Vercel Hobby allows only two cron entries and
 * both are taken, so the pass runs at the end of daily-sync instead. This route
 * exists so the job can be triggered on its own for testing, and so it can be given
 * its own schedule if the project ever moves off Hobby.
 */
export const GET = cronRoute("cron/breakout-alerts", async () => {
  return NextResponse.json(await runBreakoutAlerts());
});
