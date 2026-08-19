"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { fetchJson } from "@/lib/utils/fetch-json";

/**
 * Removes one manually logged post.
 *
 * Confirms first. The entry was typed by hand and there is no external source to
 * re-sync it from, so a stray click is unrecoverable in a way that a cached API
 * value never is.
 */
export function PostRowActions({ postId, label }: { postId: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setPending(true);
    try {
      await fetchJson(`/api/cross-platform?postId=${encodeURIComponent(postId)}`, {
        method: "DELETE",
      });
      toast.success("Post removed");
      router.refresh();
    } catch {
      // fetchJson has already raised the toast.
    } finally {
      setPending(false);
      setConfirming(false);
    }
  }

  if (confirming) {
    return (
      <span className="flex items-center gap-1.5">
        <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button size="sm" variant="destructive" onClick={remove} disabled={pending}>
          {pending ? "Removing..." : "Remove"}
        </Button>
      </span>
    );
  }

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => setConfirming(true)}
      aria-label={`Remove ${label}`}
      className="text-muted-foreground hover:text-foreground"
    >
      <Trash2 className="size-3.5" />
    </Button>
  );
}
