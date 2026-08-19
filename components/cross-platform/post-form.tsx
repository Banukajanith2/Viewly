"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/utils/fetch-json";
import { PLATFORMS, PLATFORM_LABELS, validatePost } from "@/lib/insights/cross-platform";

/**
 * Manual entry for a post from another platform (Part 8.5).
 *
 * Validates with the SAME validatePost the API route uses, so the inline error and
 * the server's 400 can never disagree about what is acceptable. The client check is
 * only there to answer faster; the route still validates, because a form is not a
 * security boundary.
 */
export function PostForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    platform: "tiktok",
    postedAt: today,
    title: "",
    url: "",
    views: "",
    likes: "",
    comments: "",
  });

  const set = (key: keyof typeof form) => (value: string) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Empty counts mean zero, which is a real answer for a post nobody saw.
    const payload = {
      platform: form.platform,
      postedAt: form.postedAt,
      title: form.title,
      url: form.url,
      views: Number(form.views || 0),
      likes: Number(form.likes || 0),
      comments: Number(form.comments || 0),
    };

    const check = validatePost(payload);
    if (!check.ok) {
      setError(check.error);
      return;
    }

    setPending(true);
    try {
      await fetchJson("/api/cross-platform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success("Post logged", {
        description: `${PLATFORM_LABELS[form.platform as keyof typeof PLATFORM_LABELS]} post added to your cross-platform view.`,
      });
      setForm({ ...form, title: "", url: "", views: "", likes: "", comments: "" });
      setOpen(false);
      router.refresh();
    } catch {
      // fetchJson has already raised the toast.
    } finally {
      setPending(false);
    }
  }

  if (!open) {
    return (
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" />
        Log a post
      </Button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="bg-card w-full space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="platform">Platform</Label>
          <select
            id="platform"
            value={form.platform}
            onChange={(e) => set("platform")(e.target.value)}
            className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="postedAt">Post date</Label>
          <Input
            id="postedAt"
            type="date"
            max={today}
            value={form.postedAt}
            onChange={(e) => set("postedAt")(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="title">
            Title <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="title"
            value={form.title}
            onChange={(e) => set("title")(e.target.value)}
            placeholder="What was the post about?"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="views">Views</Label>
          <Input
            id="views"
            type="number"
            min={0}
            inputMode="numeric"
            value={form.views}
            onChange={(e) => set("views")(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="likes">Likes</Label>
          <Input
            id="likes"
            type="number"
            min={0}
            inputMode="numeric"
            value={form.likes}
            onChange={(e) => set("likes")(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="comments">Comments</Label>
          <Input
            id="comments"
            type="number"
            min={0}
            inputMode="numeric"
            value={form.comments}
            onChange={(e) => set("comments")(e.target.value)}
            placeholder="0"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="url">
            Link <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="url"
            type="url"
            value={form.url}
            onChange={(e) => set("url")(e.target.value)}
            placeholder="https://"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm" style={{ color: "var(--viz-critical)" }} role="alert">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving..." : "Save post"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
