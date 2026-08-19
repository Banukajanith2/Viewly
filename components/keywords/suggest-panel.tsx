"use client";

import { useState } from "react";
import { Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fetchJson } from "@/lib/utils/fetch-json";

interface SuggestResponse {
  titles: Array<{ title: string; reason: string }>;
  tags: string[];
  remainingToday: number;
  usedTrending: boolean;
  usedCompetitors: boolean;
}

/**
 * Title and tag suggestions (Part 8.3).
 *
 * An explicit action, never automatic, which is what the brief asks for to keep LLM
 * call volume down. Results are held in component state rather than written to
 * Firestore: they are a starting point for the creator to edit, not a record worth
 * storing, and persisting them would imply Viewly stands behind the wording.
 */
export function SuggestPanel({ configured }: { configured: boolean }) {
  const [topic, setTopic] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<SuggestResponse | null>(null);

  async function run() {
    setPending(true);
    try {
      const body = await fetchJson<SuggestResponse>("/api/keywords/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      setResult(body);
      toast.success("Suggestions ready", {
        description: `${body.titles.length} titles. ${body.remainingToday} left today.`,
      });
    } catch {
      // fetchJson has already raised the toast, including the 429 and the 503.
    } finally {
      setPending(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied");
    } catch {
      toast.error("Could not copy to the clipboard");
    }
  }

  if (!configured) {
    return (
      <section className="bg-card rounded-xl border p-4 sm:p-6">
        <h2 className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="size-4" style={{ color: "var(--viz-3)" }} />
          Title suggestions
        </h2>
        <p className="text-muted-foreground mt-2 text-sm">
          Not configured on this deployment. Add a{" "}
          <code className="bg-muted rounded px-1 py-0.5 text-xs">GEMINI_API_KEY</code> to
          turn this on. Everything else on this page works without it.
        </p>
      </section>
    );
  }

  return (
    <section className="bg-card rounded-xl border p-4 sm:p-6">
      <h2 className="flex items-center gap-2 text-sm font-medium">
        <Sparkles className="size-4" style={{ color: "var(--viz-3)" }} />
        Title suggestions
      </h2>
      <p className="text-muted-foreground mt-1 mb-4 text-xs">
        Built from your own uploads plus the competitor and trending data already
        cached, so this spends no YouTube quota.
      </p>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor="topic">
            Topic <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="topic"
            value={topic}
            maxLength={200}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="What is the next video about?"
          />
        </div>
        <Button onClick={run} disabled={pending} size="sm" className="gap-1.5">
          <Sparkles className="size-3.5" />
          {pending ? "Thinking..." : "Suggest titles"}
        </Button>
      </div>

      {result && (
        <div className="mt-6 space-y-4">
          <ul className="space-y-2">
            {result.titles.map((t) => (
              <li key={t.title} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-medium">{t.title}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copy(t.title)}
                    aria-label={`Copy "${t.title}"`}
                    className="text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <Copy className="size-3.5" />
                  </Button>
                </div>
                {t.reason && (
                  <p className="text-muted-foreground mt-1 text-xs">{t.reason}</p>
                )}
                <p className="text-muted-foreground mt-1 text-[10px] tabular-nums">
                  {t.title.length} characters
                </p>
              </li>
            ))}
          </ul>

          {result.tags.length > 0 && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="text-xs font-medium">Suggested tags</h3>
                <Button size="sm" variant="ghost" onClick={() => copy(result.tags.join(", "))}>
                  Copy all
                </Button>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {result.tags.map((tag) => (
                  <li key={tag}>
                    <Badge variant="secondary">{tag}</Badge>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Says what the model was actually given. A suggestion is only as good
              as its evidence, and the creator should know which parts were absent. */}
          <p className="text-muted-foreground text-xs">
            Based on your uploads
            {result.usedCompetitors ? ", your cached competitors" : ""}
            {result.usedTrending ? " and your regional trending chart" : ""}.
            {!result.usedTrending && " Load trending above for sharper suggestions."}{" "}
            These are drafts to edit, not finished titles.
          </p>
        </div>
      )}
    </section>
  );
}
