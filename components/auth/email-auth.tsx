"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { Eye, EyeOff, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getFirebaseAuth, isFirebaseConfigured } from "@/lib/firebase/client";

/**
 * Email and password sign-in, and account creation.
 *
 * Identity only, exactly like the Google button beside it: no YouTube scopes are
 * requested here, and linking a channel stays a separate, explicit consent step.
 * The ID token is traded for the httpOnly session cookie through the same route,
 * so the server does not care which provider a user arrived through.
 */

/** Firebase's own minimum. Stated up front rather than discovered on submit. */
const MIN_PASSWORD = 6;

/**
 * Firebase auth codes, translated.
 *
 * The raw messages are written for developers ("auth/invalid-credential") and say
 * either too little or too much. Note that a wrong password and an unknown email
 * both map to the same sentence: Firebase deliberately returns one code for both so
 * that the form cannot be used to discover which addresses have accounts, and
 * splitting them here would undo that.
 */
function readableError(code: string): string {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "That email and password do not match an account.";
    case "auth/email-already-in-use":
      return "An account already exists for that email. Try signing in instead.";
    case "auth/invalid-email":
      return "That does not look like an email address.";
    case "auth/weak-password":
      return `Use at least ${MIN_PASSWORD} characters.`;
    case "auth/too-many-requests":
      return "Too many attempts. Wait a few minutes and try again.";
    case "auth/network-request-failed":
      return "Could not reach the network. Check your connection.";
    case "auth/operation-not-allowed":
      return "Email sign-in is not enabled for this project yet.";
    default:
      return "Something went wrong. Please try again.";
  }
}

const errorCode = (err: unknown): string =>
  typeof err === "object" && err !== null && "code" in err
    ? String((err as { code: unknown }).code)
    : "";

export function EmailAuth({ redirectTo = "/overview" }: { redirectTo?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signingUp = mode === "signup";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!isFirebaseConfigured) {
      setError("Firebase is not configured on this deployment.");
      return;
    }
    if (!email.trim()) return setError("Enter your email address.");
    if (password.length < MIN_PASSWORD) {
      return setError(`Your password must be at least ${MIN_PASSWORD} characters.`);
    }

    setPending(true);
    try {
      const auth = getFirebaseAuth();
      const credential = signingUp
        ? await createUserWithEmailAndPassword(auth, email.trim(), password)
        : await signInWithEmailAndPassword(auth, email.trim(), password);

      const idToken = await credential.user.getIdToken();
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Sign-in failed.");
      }

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      const code = errorCode(err);
      setError(
        code
          ? readableError(code)
          : err instanceof Error
            ? err.message
            : "Sign-in failed.",
      );
    } finally {
      setPending(false);
    }
  }

  /**
   * Password reset.
   *
   * Reports success even when no account exists for the address. Saying "no such
   * account" would turn this into a way to test which emails are registered, which
   * is the same reason Firebase collapses those error codes above.
   */
  async function resetPassword() {
    if (!email.trim()) {
      setError("Enter your email address first, then choose Forgot password.");
      return;
    }
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
    } catch (err) {
      const code = errorCode(err);
      // A genuinely broken request still deserves a real message.
      if (code === "auth/invalid-email" || code === "auth/too-many-requests") {
        setError(readableError(code));
        return;
      }
      console.error("[auth] password reset failed:", err);
    }
    toast.success("Check your inbox", {
      description: `If an account exists for ${email.trim()}, a reset link is on its way.`,
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11 pl-9"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">Password</Label>
          {!signingUp && (
            <button
              type="button"
              onClick={resetPassword}
              className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline"
            >
              Forgot password?
            </button>
          )}
        </div>
        <div className="relative">
          <Lock
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            // Tells the browser's password manager whether to offer a saved
            // password or to generate a new one. The wrong value here is why
            // managers so often fill the wrong thing on a combined form.
            autoComplete={signingUp ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={signingUp ? `At least ${MIN_PASSWORD} characters` : "Your password"}
            className="h-11 px-9"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border px-3 py-2 text-sm"
          style={{
            color: "var(--viz-critical)",
            borderColor: "color-mix(in oklab, var(--viz-critical) 35%, transparent)",
            background: "color-mix(in oklab, var(--viz-critical) 8%, transparent)",
          }}
        >
          {error}
        </p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="h-11 w-full">
        {pending
          ? signingUp
            ? "Creating account..."
            : "Signing in..."
          : signingUp
            ? "Create account"
            : "Sign in"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        {signingUp ? "Already have an account?" : "Don't have an account?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(signingUp ? "signin" : "signup");
            setError(null);
          }}
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          {signingUp ? "Sign in" : "Sign up now"}
        </button>
      </p>
    </form>
  );
}
