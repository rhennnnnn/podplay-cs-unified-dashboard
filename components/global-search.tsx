"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, ClipboardList, Link2, BookOpen } from "lucide-react";

import { cn } from "@/lib/utils";
import type { GlobalSearchResult } from "@/app/api/search/route";

const MODULE_ICON: Record<GlobalSearchResult["module"], React.ComponentType<{ className?: string }>> = {
  tracker: ClipboardList,
  onboarding: Link2,
  "ops-guide": BookOpen,
};

// Global header search. Debounced 300ms (same dual-state pattern as
// onboarding-grid), dropdown of module-tagged results, ⌘K to focus.
export function GlobalSearch() {
  const router = useRouter();
  const [input, setInput] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Debounce input -> query.
  React.useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);

  // Fetch on debounced query.
  React.useEffect(() => {
    if (!query) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data: { results?: GlobalSearchResult[] }) => {
        if (cancelled) return;
        setResults(data.results ?? []);
        setActive(0);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  // ⌘K / Ctrl+K focuses the input.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Close on outside click.
  React.useEffect(() => {
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function go(result: GlobalSearchResult) {
    setOpen(false);
    setInput("");
    setResults([]);
    router.push(result.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = results[active] ?? results[0];
      if (target) go(target);
    }
  }

  const showDropdown = open && query.length > 0;

  return (
    <div ref={containerRef} className="relative w-full max-w-xs">
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 focus-within:ring-1 focus-within:ring-ring">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search clients, guides…"
          className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          aria-label="Global search"
        />
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline">
            ⌘K
          </kbd>
        )}
      </div>

      {showDropdown && (
        <div className="absolute right-0 z-50 mt-1.5 w-[22rem] max-w-[85vw] overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
          <div className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {loading ? "Searching…" : `Results for "${query}"`}
          </div>
          {results.length === 0 && !loading ? (
            <div className="px-3 py-4 text-sm text-muted-foreground">No matches.</div>
          ) : (
            <ul className="max-h-80 overflow-y-auto pb-1">
              {results.map((r, i) => {
                const Icon = MODULE_ICON[r.module];
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={cn(
                        "flex w-full items-center gap-2.5 px-3 py-2 text-left",
                        i === active ? "bg-muted" : "hover:bg-muted/60"
                      )}
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-foreground">{r.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">{r.sublabel}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
