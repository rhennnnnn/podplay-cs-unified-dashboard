"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Flame, Loader2, Search } from "lucide-react";

import { cn } from "@/lib/utils";

interface MostViewed {
  id: string;
  title: string;
  count: number;
}

interface ArticleHit {
  id: string;
  title: string;
}

// OPS Guide card for the Overview page. Holds its own OPS-scoped inline search
// (separate state from the global header search) plus the existing most-viewed
// list. Quick-tag pills (category names) prime the search box.
export function OpsGuideCard({
  mostViewed,
  quickTags,
}: {
  mostViewed: MostViewed[];
  quickTags: string[];
}) {
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<ArticleHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  React.useEffect(() => {
    if (!query) {
      setHits([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/ops-guide/search?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : { articles: [] }))
      .then((data: { articles?: ArticleHit[] }) => {
        if (!cancelled) setHits((data.articles ?? []).slice(0, 6));
      })
      .catch(() => {
        if (!cancelled) setHits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function openArticle(id: string) {
    setOpen(false);
    setInput("");
    router.push(`/dashboard/ops-guide?article=${id}`);
  }

  const showDropdown = open && query.length > 0;

  return (
    <div className="flex min-h-0 flex-col gap-4">
      {/* Search + quick tags */}
      <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">OPS Guide</span>
          <Link
            href="/dashboard/ops-guide"
            className="ml-auto text-xs font-medium text-primary hover:underline"
          >
            Open Guide
          </Link>
        </div>

        <div ref={containerRef} className="relative">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder="Search troubleshooting…"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label="Search OPS Guide articles"
            />
            {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>

          {showDropdown && (
            <div className="absolute left-0 right-0 z-40 mt-1.5 overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
              <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                {loading ? "Searching…" : `Results for "${query}"`}
              </div>
              {hits.length === 0 && !loading ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">No articles found.</div>
              ) : (
                <ul className="max-h-72 overflow-y-auto pb-1">
                  {hits.map((h) => (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => openArticle(h.id)}
                        className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-muted/60"
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                          <BookOpen className="h-3.5 w-3.5" />
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{h.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {quickTags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {quickTags.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setInput(tag);
                  setOpen(true);
                }}
                className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted/70"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Most viewed */}
      <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-border bg-card p-4 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <Flame className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold text-foreground">Most viewed · 30d</span>
        </div>
        {mostViewed.length > 0 ? (
          <ul className="flex flex-col">
            {mostViewed.map((a, i) => (
              <li key={a.id}>
                <Link
                  href={`/dashboard/ops-guide?article=${a.id}`}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2 py-2 hover:bg-muted/60"
                  )}
                >
                  <span className="w-4 shrink-0 text-xs font-bold text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">{a.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{a.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-4 text-sm text-muted-foreground">No views recorded yet.</p>
        )}
      </div>
    </div>
  );
}
