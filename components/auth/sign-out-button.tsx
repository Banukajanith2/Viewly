"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

export function SignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    // Clear the server cookie first. If the client-side sign-out fails, the
    // session that actually gates the API is already gone.
    await fetch("/api/auth/session", { method: "DELETE" });
    if (isFirebaseConfigured) {
      await signOut(getFirebaseAuth()).catch(() => undefined);
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
