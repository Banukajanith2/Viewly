import type { Metadata } from "next";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { RevokeAccessButton } from "@/components/settings/youtube-connection";
import { RegionSelector } from "@/components/settings/region-selector";
import { requireUser } from "@/lib/auth/session";
import { getLatestSnapshot, getUserProfile, getYouTubeToken } from "@/lib/firebase/firestore";
import { isSupportedRegion, resolveRegion } from "@/lib/youtube/regions";

export const metadata: Metadata = { title: "Settings" };

/** Status flags set by the OAuth callback redirect. */
const CALLBACK_MESSAGES: Record<string, { title: string; body: string; ok: boolean }> = {
  connected: {
    title: "YouTube connected",
    body: "Your channel is linked. The first data sync runs with tomorrow's daily job.",
    ok: true,
  },
  denied: {
    title: "Consent declined",
    body: "You cancelled at Google's consent screen, so nothing was linked.",
    ok: false,
  },
  invalid: {
    title: "Incomplete callback",
    body: "Google's redirect was missing required values. Please try connecting again.",
    ok: false,
  },
  state_mismatch: {
    title: "Security check failed",
    body: "The request could not be verified as yours. Start the connection again from this page.",
    ok: false,
  },
  no_channel: {
    title: "No channel found",
    body: "That Google account has no YouTube channel. Sign in with the account that owns your channel.",
    ok: false,
  },
};

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const user = await requireUser();
  const [profile, token, snapshot, params] = await Promise.all([
    getUserProfile(user.uid),
    getYouTubeToken(user.uid),
    getLatestSnapshot(user.uid),
    searchParams,
  ]);

  // The channel's own country is the fallback when no region has been chosen.
  const channelCountry = snapshot?.channel.country ?? null;

  const flag = typeof params.youtube === "string" ? params.youtube : undefined;
  const callback = flag ? CALLBACK_MESSAGES[flag] : undefined;
  const connected = Boolean(token?.refreshToken);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Manage your account and YouTube connection.
        </p>
      </div>

      {callback && (
        <Alert variant={callback.ok ? "default" : "destructive"}>
          <AlertTitle>{callback.title}</AlertTitle>
          <AlertDescription>{callback.body}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Signed in with Google.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            <span className="text-muted-foreground">Email: </span>
            {user.email ?? "unknown"}
          </p>
          <p>
            <span className="text-muted-foreground">Home region: </span>
            {profile?.homeRegion ?? "US"}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            YouTube channel
            <Badge variant={connected ? "default" : "outline"}>
              {connected ? "Connected" : "Not connected"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Viewly requests read-only access to your channel and analytics. Nothing is
            ever posted, edited, or deleted on your behalf.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {connected ? (
            <>
              <p className="text-sm">
                <span className="text-muted-foreground">Channel: </span>
                {profile?.channelTitle ?? "Linked"}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild variant="outline" size="sm">
                  <Link href="/api/auth/youtube-connect">Reconnect</Link>
                </Button>
                <RevokeAccessButton />
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                Connect your channel to unlock analytics, retention diagnostics, and
                competitor benchmarking.
              </p>
              <Button asChild size="sm">
                <Link href="/api/auth/youtube-connect">Connect YouTube</Link>
              </Button>
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Scopes requested: <code>youtube.readonly</code> and{" "}
            <code>yt-analytics.readonly</code>. You can also revoke Viewly at{" "}
            <Link
              href="https://myaccount.google.com/permissions"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              Google account permissions
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {/* Part 8.2. Sits in settings rather than on the trending view because it
          changes what several pages query, not just the one you happen to be on. */}
      <Card>
        <CardHeader>
          <CardTitle>Region</CardTitle>
          <CardDescription>
            Which country&rsquo;s trending chart and keyword suggestions Viewly shows
            you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RegionSelector
            current={resolveRegion(profile?.homeRegion, channelCountry)}
            isExplicit={isSupportedRegion(profile?.homeRegion)}
            channelCountry={channelCountry}
          />
        </CardContent>
      </Card>
    </div>
  );
}
