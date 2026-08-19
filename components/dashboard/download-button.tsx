"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * Raw data export.
 *
 * Everything on these pages is derived from data the user already owns, so they
 * should be able to take it with them. Generated entirely in the browser from props
 * that were already sent: no export endpoint, no extra request, and nothing new to
 * rate limit.
 */

export type DownloadRow = Record<string, string | number | null | undefined>;

/**
 * RFC 4180 quoting. A video title containing a comma or a quote would otherwise
 * silently shift every following column, which is the classic way a CSV export
 * corrupts data without anyone noticing.
 */
function toCsvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: DownloadRow[]): string {
  if (rows.length === 0) return "";
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => toCsvCell(row[h])).join(","));
  }
  // CRLF, which is what RFC 4180 specifies and what Excel expects.
  return lines.join("\r\n");
}

function save(filename: string, contents: string, mime: string) {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Without this the blob is held for the lifetime of the document.
  URL.revokeObjectURL(url);
}

export function DownloadButton({
  rows,
  filename,
  label = "Export",
}: {
  rows: DownloadRow[];
  /** Without extension; the format adds its own. */
  filename: string;
  label?: string;
}) {
  const [done, setDone] = useState(false);

  function download(format: "csv" | "json") {
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === "csv") {
      save(`${filename}-${stamp}.csv`, toCsv(rows), "text/csv");
    } else {
      save(`${filename}-${stamp}.json`, JSON.stringify(rows, null, 2), "application/json");
    }
    setDone(true);
    setTimeout(() => setDone(false), 2000);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={rows.length === 0} className="gap-1.5">
          <Download className="size-3.5" />
          {done ? "Downloaded" : label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => download("csv")}>
          CSV ({rows.length} rows)
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => download("json")}>JSON</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
