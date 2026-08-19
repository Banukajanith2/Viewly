"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithPopup } from "firebase/auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, googleAuthProvider, isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * Firebase Auth sign-in. This grants identity only: no YouTube scopes are requested
 * here. Linking a channel is a separate, explicit consent step in settings.
 *
 * After sign-in the ID token is traded for an httpOnly session cookie so that server
 * components and route handlers can authenticate the user without the client
 * re-sending a token on every request.
 */
/**
 * Google's G, inline.
 *
 * Google's branding guidelines require their own mark on a sign-in button rather
 * than a generic icon, and lucide dropped brand icons, so it is inlined here. The
 * four brand colours are fixed values on purpose: this is someone else's logo, so
 * it must not be re-tinted by our theme tokens.
 */
function GoogleMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className={className}>
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

export function GoogleSignIn({ redirectTo = "/overview" }: { redirectTo?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleSignIn() {
    if (!isFirebaseConfigured) {
      toast.error("Firebase is not configured", {
        description: "Add the NEXT_PUBLIC_FIREBASE_* values to .env.local.",
      });
      return;
    }

    setPending(true);
    try {
      const credential = await signInWithPopup(getFirebaseAuth(), googleAuthProvider());
      const idToken = await credential.user.getIdToken();

      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({ message: "Sign-in failed." }));
        throw new Error(body.message ?? "Sign-in failed.");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sign-in failed.";
      // A user closing the popup is not an error worth shouting about.
      if (!message.includes("auth/popup-closed-by-user")) {
        toast.error("Could not sign in", { description: message });
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Button
      onClick={handleSignIn}
      disabled={pending}
      size="lg"
      variant="outline"
      // Outline rather than the filled primary. A provider button carries someone
      // else's logo, and a saturated fill behind it both fights the four brand
      // colours and misrepresents whose button it is.
      className="h-12 w-full gap-3 text-[15px] font-medium"
    >
      <GoogleMark className="size-5 shrink-0" />
      {pending ? "Signing in..." : "Continue with Google"}
    </Button>
  );
}
