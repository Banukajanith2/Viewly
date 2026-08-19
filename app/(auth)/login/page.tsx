import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { GoogleSignIn } from "@/components/auth/google-sign-in";
import { SiteFooter } from "@/components/layout/site-footer";
import { getSessionUser } from "@/lib/auth/session";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getSessionUser()) redirect("/overview");

  return (
    <>
      <main className="flex flex-1 items-center justify-center px-6 py-16">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-2xl">Sign in to Viewly</CardTitle>
            <CardDescription>
              Analytics and competitor intelligence for YouTube creators.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <GoogleSignIn />
            <p className="text-xs text-muted-foreground">
              Signing in creates your account only. Connecting your YouTube channel is
              a separate step you can take, or skip, from settings.
            </p>
          </CardContent>
        </Card>
      </main>
      <SiteFooter />
    </>
  );
}
