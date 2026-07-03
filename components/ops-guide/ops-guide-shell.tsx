"use client";

import * as React from "react";
import { BookOpen, Copy, Pencil, Plus, Search, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import { OPS_ARTICLE_CATEGORIES, type OpsArticle, type OpsArticleStub } from "@/lib/types";
import { categoryBadgeClass, extractTocAndAnnotate, formatRelativeDate } from "@/lib/ops-guide";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ArticleFormDialog } from "@/components/ops-guide/article-form-dialog";
import { DeleteArticleDialog } from "@/components/ops-guide/delete-article-dialog";
import type { SearchResultItem } from "@/components/ops-guide/ops-guide-types";

interface OpsGuideShellProps {
  initialArticles: OpsArticleStub[];
  isAdmin: boolean;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json as T;
}

export function OpsGuideShell({ initialArticles, isAdmin }: OpsGuideShellProps) {
  const [articles, setArticles] = React.useState<OpsArticleStub[]>(initialArticles);
  const [activeCategory, setActiveCategory] = React.useState<string>("All");
  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = React.useState<OpsArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = React.useState(false);
  const [checkedSteps, setCheckedSteps] = React.useState<Record<number, boolean>>({});

  const [formOpen, setFormOpen] = React.useState(false);
  const [formArticle, setFormArticle] = React.useState<OpsArticle | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<OpsArticleStub | null>(null);

  // Debounce search input 300ms.
  React.useEffect(() => {
    const handle = setTimeout(() => setSearchQuery(searchInput.trim()), 300);
    return () => clearTimeout(handle);
  }, [searchInput]);

  React.useEffect(() => {
    if (!searchQuery) {
      setSearchResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const params = new URLSearchParams({ q: searchQuery });
    if (activeCategory !== "All") params.set("category", activeCategory);
    fetchJson<{ articles: SearchResultItem[] }>(`/api/ops-guide/search?${params}`)
      .then((json) => {
        if (!cancelled) setSearchResults(json.articles);
      })
      .catch(() => {
        if (!cancelled) toast.error("Search failed.");
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [searchQuery, activeCategory]);

  React.useEffect(() => {
    if (!selectedId) {
      setSelectedArticle(null);
      return;
    }
    let cancelled = false;
    setLoadingArticle(true);
    setCheckedSteps({});
    fetchJson<{ article: OpsArticle }>(`/api/ops-guide/${selectedId}`)
      .then((json) => {
        if (!cancelled) setSelectedArticle(json.article);
      })
      .catch(() => {
        if (!cancelled) toast.error("Failed to load article.");
      })
      .finally(() => {
        if (!cancelled) setLoadingArticle(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const article of articles) {
      counts[article.category] = (counts[article.category] ?? 0) + 1;
    }
    return counts;
  }, [articles]);

  const isSearching = searchQuery.length > 0;
  const visibleArticles: (OpsArticleStub | SearchResultItem)[] = isSearching
    ? (searchResults ?? [])
    : articles.filter((a) => activeCategory === "All" || a.category === activeCategory);

  const { html: annotatedHtml, toc } = React.useMemo(
    () => (selectedArticle ? extractTocAndAnnotate(selectedArticle.content) : { html: "", toc: [] }),
    [selectedArticle]
  );

  const checkboxCount = React.useMemo(() => {
    if (!selectedArticle) return 0;
    return (selectedArticle.content.match(/<input[^>]*type=["']checkbox["'][^>]*>/gi) ?? []).length;
  }, [selectedArticle]);
  const completedSteps = Object.values(checkedSteps).filter(Boolean).length;

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  function handleArticleSaved(article: OpsArticle) {
    setArticles((prev) => {
      const stub: OpsArticleStub = {
        id: article.id,
        title: article.title,
        category: article.category,
        tags: article.tags,
        created_by: article.created_by,
        updated_by: article.updated_by,
        created_at: article.created_at,
        updated_at: article.updated_at,
        published: article.published,
      };
      const exists = prev.some((a) => a.id === article.id);
      return exists ? prev.map((a) => (a.id === article.id ? stub : a)) : [stub, ...prev];
    });
    setSelectedId(article.id);
    setSelectedArticle(article);
  }

  function handleArticleDeleted(id: string) {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    if (selectedId === id) {
      setSelectedId(null);
      setSelectedArticle(null);
    }
  }

  function copyLink() {
    if (!selectedArticle) return;
    const url = `${window.location.origin}${window.location.pathname}?article=${selectedArticle.id}`;
    navigator.clipboard.writeText(url);
    toast.success("Link copied");
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Left sidebar */}
      <aside className="flex w-60 shrink-0 flex-col gap-4 overflow-y-auto rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-base font-semibold">
            <Wrench className="h-4 w-4 text-accent" />
            OPS Guide
          </h1>
          <Badge variant="secondary">{articles.length}</Badge>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search articles…"
            className="pl-8"
          />
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <button
            onClick={() => setActiveCategory("All")}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              activeCategory === "All" ? "bg-accent text-white" : "hover:bg-muted"
            )}
          >
            All Articles
            <span className="text-xs opacity-80">{articles.length}</span>
          </button>
          {OPS_ARTICLE_CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={cn(
                "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                activeCategory === cat ? "bg-accent text-white" : "hover:bg-muted"
              )}
            >
              {cat}
              <span className="text-xs opacity-80">{categoryCounts[cat] ?? 0}</span>
            </button>
          ))}
        </nav>

        {isAdmin && (
          <Button
            className="w-full gap-2"
            onClick={() => {
              setFormArticle(null);
              setFormOpen(true);
            }}
          >
            <Plus className="h-4 w-4" />
            New Article
          </Button>
        )}
      </aside>

      {/* Center article list */}
      <section className="w-96 shrink-0 overflow-y-auto rounded-xl border bg-card p-3">
        {isSearching && searching && (
          <div className="space-y-3 p-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full rounded-lg" />
            ))}
          </div>
        )}

        {isSearching && !searching && visibleArticles.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">No articles match &quot;{searchQuery}&quot;.</p>
        )}

        {!isSearching && visibleArticles.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">
            No articles in this category yet.
            {isAdmin && (
              <button
                className="ml-1 text-accent underline"
                onClick={() => {
                  setFormArticle(null);
                  setFormOpen(true);
                }}
              >
                + Add Article
              </button>
            )}
          </div>
        )}

        <div className="space-y-2">
          {visibleArticles.map((article) => {
            const isSelected = article.id === selectedId;
            const excerptText = "excerpt" in article ? article.excerpt : "";
            return (
              <Card
                key={article.id}
                onClick={() => handleSelect(article.id)}
                className={cn(
                  "group cursor-pointer p-3 transition-colors hover:border-accent",
                  isSelected && "border-accent bg-accent/10"
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <Badge className={cn("text-xs", categoryBadgeClass(article.category))} variant="secondary">
                    {article.category}
                  </Badge>
                  {isAdmin && (
                    <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          fetchJson<{ article: OpsArticle }>(`/api/ops-guide/${article.id}`).then((json) => {
                            setFormArticle(json.article);
                            setFormOpen(true);
                          });
                        }}
                        className="rounded p-1 hover:bg-muted"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(article);
                          setDeleteOpen(true);
                        }}
                        className="rounded p-1 hover:bg-muted hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <p className="mt-1.5 line-clamp-1 text-sm font-semibold">{article.title}</p>
                {excerptText && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{excerptText}</p>}
                <p className="mt-1.5 text-xs text-muted-foreground">{formatRelativeDate(article.updated_at)}</p>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Right reader */}
      <section className="flex-1 overflow-y-auto rounded-xl border bg-card p-6">
        {!selectedId && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <BookOpen className="h-10 w-10" />
            <p className="text-sm">Select an article to read</p>
          </div>
        )}

        {selectedId && loadingArticle && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {selectedId && !loadingArticle && selectedArticle && (
          <div>
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <span>{selectedArticle.category}</span>
              <span>/</span>
              <span className="truncate">{selectedArticle.title}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold">{selectedArticle.title}</h1>
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" className="gap-1.5" onClick={copyLink}>
                  <Copy className="h-3.5 w-3.5" />
                  Copy Link
                </Button>
                {isAdmin && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => {
                        setFormArticle(selectedArticle);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => {
                        setDeleteTarget(selectedArticle);
                        setDeleteOpen(true);
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </Button>
                  </>
                )}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge className={cn(categoryBadgeClass(selectedArticle.category))} variant="secondary">
                {selectedArticle.category}
              </Badge>
              <span>Updated {formatRelativeDate(selectedArticle.updated_at)}</span>
              {selectedArticle.created_by && <span>· Created by {selectedArticle.created_by}</span>}
            </div>

            {checkboxCount > 0 && (
              <div className="mt-4 rounded-lg border bg-muted/30 p-3">
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {completedSteps} of {checkboxCount} steps completed
                </p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-accent transition-all"
                    style={{ width: `${checkboxCount ? (completedSteps / checkboxCount) * 100 : 0}%` }}
                  />
                </div>
              </div>
            )}

            {toc.length > 0 && (
              <div className="mt-4 rounded-lg border p-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  On this page
                </p>
                <ul className="space-y-1">
                  {toc.map((entry) => (
                    <li key={entry.id} className={entry.level === 3 ? "ml-3" : ""}>
                      <a
                        href={`#${entry.id}`}
                        onClick={(e) => {
                          e.preventDefault();
                          document.getElementById(entry.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        }}
                        className="text-sm text-accent hover:underline"
                      >
                        {entry.text}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div
              className="ops-article-content mt-6"
              onClick={(e) => {
                const target = e.target as HTMLElement;
                if (target.tagName === "INPUT" && target.getAttribute("type") === "checkbox") {
                  const inputs = Array.from(
                    (e.currentTarget as HTMLElement).querySelectorAll('input[type="checkbox"]')
                  );
                  const index = inputs.indexOf(target);
                  if (index >= 0) {
                    setCheckedSteps((prev) => ({ ...prev, [index]: !prev[index] }));
                  }
                }
              }}
              dangerouslySetInnerHTML={{ __html: annotatedHtml }}
            />
          </div>
        )}
      </section>

      <ArticleFormDialog open={formOpen} onOpenChange={setFormOpen} article={formArticle} onSaved={handleArticleSaved} />
      <DeleteArticleDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        article={deleteTarget}
        onDeleted={handleArticleDeleted}
      />
    </div>
  );
}
