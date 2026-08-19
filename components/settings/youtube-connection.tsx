"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetch-json";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * Revoke Access control (Part 3, required by Part 9.4's compliance checklist).
 *
 * Confirmation is deliberate: revoking deletes the refresh token, so the user has to
 * walk through Google consent again to restore analytics.
 */
export function RevokeAccessButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function handleRevoke() {
    setPending(true);
    try {
      // fetchJson raises the toast for any failure, so only the success path
      // needs handling here.
      const body = await fetchJson<{ message: string }>("/api/auth/youtube-revoke", {
        method: "POST",
      });
      toast.success("Access revoked", { description: body.message });
      router.refresh();
    } catch {
      // Already surfaced by fetchJson.
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="destructive" size="sm">
          Revoke access
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke YouTube access?</DialogTitle>
          <DialogDescription>
            Viewly will delete your stored YouTube tokens and ask Google to drop the
            permission. Your analytics stop updating until you connect again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" size="sm">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleRevoke}
            disabled={pending}
          >
            {pending ? "Revoking..." : "Revoke access"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
