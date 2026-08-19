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
    <Button onClick={handleSignIn} disabled={pending} className="w-full" size="lg">
      {pending ? "Signing in..." : "Continue with Google"}
    </Button>
  );
}
