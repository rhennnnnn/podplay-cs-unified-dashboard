"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Clock, Copy, Eye, FileUp, Pencil, Plus, Search, Settings, Star, Trash2, Wrench } from "lucide-react";
import { toast } from "sonner";

import type { OpsArticle, OpsArticleStub, OpsCategory } from "@/lib/types";
import { categoryBadgeClass, countCheckboxes, formatRelativeDate, getCategoryColorPreset } from "@/lib/ops-guide";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import type { ArticleDraft } from "@/components/ops-guide/article-form-dialog";
import { ArticleContent } from "@/components/ops-guide/article-content";
import type { SearchResultItem } from "@/components/ops-guide/ops-guide-types";

// Admin-only dialogs are code-split out of the bundle every non-admin user
// downloads — ArticleFormDialog alone pulls in the Markdown editor, turndown,
// and their transitive deps. Regular CSAs never load any of this.
const ArticleFormDialog = dynamic(() =>
  import("@/components/ops-guide/article-form-dialog").then((m) => m.ArticleFormDialog)
);
const CategoryManageDialog = dynamic(() =>
  import("@/components/ops-guide/category-manage-dialog").then((m) => m.CategoryManageDialog)
);
const DeleteArticleDialog = dynamic(() =>
  import("@/components/ops-guide/delete-article-dialog").then((m) => m.DeleteArticleDialog)
);
const ImportArticleDialog = dynamic(() =>
  import("@/components/ops-guide/import-article-dialog").then((m) => m.ImportArticleDialog)
);
const ManageVisibilityDialog = dynamic(() =>
  import("@/components/ops-guide/manage-visibility-dialog").then((m) => m.ManageVisibilityDialog)
);

const FAVORITES_VIEW = "__favorites__";
const RECENT_VIEW = "__recent__";

interface OpsGuideShellProps {
  initialArticles: OpsArticleStub[];
  initialCategories: OpsCategory[];
  isAdmin: boolean;
}

interface TocEntry {
  id: string;
  text: string;
  level: 2 | 3;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json as T;
}

export function OpsGuideShell({ initialArticles, initialCategories, isAdmin }: OpsGuideShellProps) {
  const searchParams = useSearchParams();
  const [articles, setArticles] = React.useState<OpsArticleStub[]>(initialArticles);
  const [categories, setCategories] = React.useState<OpsCategory[]>(initialCategories);
  const [activeCategory, setActiveCategory] = React.useState<string>("All");
  const [searchInput, setSearchInput] = React.useState("");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<SearchResultItem[] | null>(null);
  const [searching, setSearching] = React.useState(false);
  const [searchDropdownOpen, setSearchDropdownOpen] = React.useState(false);

  const [favoriteIds, setFavoriteIds] = React.useState<Set<string>>(new Set());
  const [favoriteArticles, setFavoriteArticles] = React.useState<OpsArticleStub[] | null>(null);
  const [recentArticles, setRecentArticles] = React.useState<OpsArticleStub[] | null>(null);
  const [loadingSpecialList, setLoadingSpecialList] = React.useState(false);

  const [selectedId, setSelectedId] = React.useState<string | null>(() => searchParams.get("article"));
  const [selectedArticle, setSelectedArticle] = React.useState<OpsArticle | null>(null);
  const [loadingArticle, setLoadingArticle] = React.useState(false);
  const [checkedSteps, setCheckedSteps] = React.useState<Record<number, boolean>>({});
  const checkedStepsRef = React.useRef<Record<number, boolean>>({});
  const contentRef = React.useRef<HTMLDivElement>(null);
  const [toc, setToc] = React.useState<TocEntry[]>([]);

  const [formOpen, setFormOpen] = React.useState(false);
  const [formArticle, setFormArticle] = React.useState<OpsArticle | null>(null);
  const [formDraft, setFormDraft] = React.useState<ArticleDraft | null>(null);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<OpsArticleStub | null>(null);
  const [categoryDialogOpen, setCategoryDialogOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [manageOpen, setManageOpen] = React.useState(false);

  // Re-sync the visible grid (published articles only) after visibility toggles
  // or deletes from the Manage dialog.
  const refreshArticles = React.useCallback(() => {
    fetchJson<{ articles: OpsArticleStub[] }>("/api/ops-guide")
      .then((json) => setArticles(json.articles))
      .catch(() => {});
  }, []);

  // Load the caller's favorite ids once on mount (star state applies across every view).
  React.useEffect(() => {
    fetchJson<{ articles: OpsArticleStub[] }>("/api/ops-guide/favorites")
      .then((json) => setFavoriteIds(new Set(json.articles.map((a) => a.id))))
      .catch(() => {});
  }, []);

  const loadFavorites = React.useCallback(() => {
    setLoadingSpecialList(true);
    fetchJson<{ articles: OpsArticleStub[] }>("/api/ops-guide/favorites")
      .then((json) => {
        setFavoriteArticles(json.articles);
        setFavoriteIds(new Set(json.articles.map((a) => a.id)));
      })
      .catch(() => toast.error("Failed to load favorites."))
      .finally(() => setLoadingSpecialList(false));
  }, []);

  React.useEffect(() => {
    if (activeCategory === FAVORITES_VIEW) {
      loadFavorites();
    } else if (activeCategory === RECENT_VIEW) {
      setLoadingSpecialList(true);
      fetchJson<{ articles: OpsArticleStub[] }>("/api/ops-guide/recent")
        .then((json) => setRecentArticles(json.articles))
        .catch(() => toast.error("Failed to load recent articles."))
        .finally(() => setLoadingSpecialList(false));
    }
  }, [activeCategory, loadFavorites]);

  async function toggleFavorite(articleId: string) {
    const isFav = favoriteIds.has(articleId);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(articleId);
      else next.add(articleId);
      return next;
    });
    try {
      await fetch(`/api/ops-guide/${articleId}/favorite`, { method: isFav ? "DELETE" : "POST" });
      if (activeCategory === FAVORITES_VIEW) loadFavorites();
    } catch {
      toast.error("Failed to update favorite.");
      setFavoriteIds((prev) => {
        const next = new Set(prev);
        if (isFav) next.add(articleId);
        else next.delete(articleId);
        return next;
      });
    }
  }

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
    if (activeCategory !== "All" && activeCategory !== FAVORITES_VIEW && activeCategory !== RECENT_VIEW) {
      params.set("category", activeCategory);
    }
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

  // Load the selected article.
  React.useEffect(() => {
    if (!selectedId) {
      setSelectedArticle(null);
      return;
    }
    let cancelled = false;
    setLoadingArticle(true);
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

  // Reset checklist state immediately on switch, then hydrate from the
  // caller's own saved progress — never shared across users.
  React.useEffect(() => {
    setCheckedSteps({});
    if (!selectedId) return;
    let cancelled = false;
    fetchJson<{ checked_indexes: number[] }>(`/api/ops-guide/${selectedId}/checklist`)
      .then((json) => {
        if (cancelled) return;
        const map: Record<number, boolean> = {};
        for (const idx of json.checked_indexes) map[idx] = true;
        setCheckedSteps(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  React.useEffect(() => {
    checkedStepsRef.current = checkedSteps;
  }, [checkedSteps]);

  function flushChecklist(articleId: string, steps: Record<number, boolean>) {
    const checked_indexes = Object.entries(steps)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
    fetch(`/api/ops-guide/${articleId}/checklist`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checked_indexes }),
    }).catch(() => {});
  }

  // Flush on switching away from an article or unmounting — the API route
  // decides whether to store the progress or reset it (all steps done).
  React.useEffect(() => {
    if (!selectedId) return;
    const articleId = selectedId;
    return () => {
      flushChecklist(articleId, checkedStepsRef.current);
    };
  }, [selectedId]);

  // Debounced save while actively checking steps on the current article.
  React.useEffect(() => {
    if (!selectedId) return;
    const handle = setTimeout(() => flushChecklist(selectedId, checkedSteps), 800);
    return () => clearTimeout(handle);
  }, [checkedSteps, selectedId]);

  // TOC — derived from the real rendered DOM so both legacy-HTML and new
  // Markdown articles (which both end up as real h2/h3 elements) work the
  // same way, with ids supplied by rehype-slug in ArticleContent.
  React.useEffect(() => {
    if (!contentRef.current) {
      setToc([]);
      return;
    }
    const headings = Array.from(contentRef.current.querySelectorAll("h2, h3"));
    setToc(
      headings.map((h, i) => {
        if (!h.id) h.id = `ops-section-${i}`;
        return { id: h.id, text: h.textContent?.trim() ?? "", level: h.tagName === "H2" ? 2 : 3 };
      })
    );
  }, [selectedArticle?.id, selectedArticle?.content]);

  const categoryCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const article of articles) {
      counts[article.category] = (counts[article.category] ?? 0) + 1;
    }
    return counts;
  }, [articles]);

  const categoryColorByName = React.useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.color])),
    [categories]
  );

  const isSearching = searchQuery.length > 0;
  const visibleArticles: (OpsArticleStub | SearchResultItem)[] = isSearching
    ? (searchResults ?? [])
    : activeCategory === FAVORITES_VIEW
      ? (favoriteArticles ?? [])
      : activeCategory === RECENT_VIEW
        ? (recentArticles ?? [])
        : articles.filter((a) => activeCategory === "All" || a.category === activeCategory);

  const checkboxCount = selectedArticle ? countCheckboxes(selectedArticle.content) : 0;
  const completedSteps = Object.values(checkedSteps).filter(Boolean).length;

  function handleSelect(id: string) {
    setSelectedId(id);
  }

  // Clicking any sidebar nav entry while an article is open acts as "back
  // to the list" and switches straight to the clicked view/category.
  function selectCategory(name: string) {
    setSelectedId(null);
    setActiveCategory(name);
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
    setFormDraft(null);
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
            onFocus={() => setSearchDropdownOpen(true)}
            onBlur={() => setSearchDropdownOpen(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchResults && searchResults.length > 0) {
                handleSelect(searchResults[0].id);
                setSearchDropdownOpen(false);
                (e.target as HTMLInputElement).blur();
              }
              if (e.key === "Escape") setSearchDropdownOpen(false);
            }}
            placeholder="Search articles…"
            className="pl-8"
          />
          {searchDropdownOpen && searchQuery && (searchResults?.length ?? 0) > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-lg">
              {searchResults!.slice(0, 6).map((result) => (
                <button
                  key={result.id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleSelect(result.id);
                    setSearchDropdownOpen(false);
                    setSearchInput("");
                  }}
                  className="flex w-full flex-col items-start gap-0.5 border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                >
                  <span className="line-clamp-1 font-medium">{result.title}</span>
                  <span className="text-xs text-muted-foreground">{result.category}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          <button
            onClick={() => selectCategory(FAVORITES_VIEW)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              activeCategory === FAVORITES_VIEW ? "bg-accent text-white" : "hover:bg-muted"
            )}
          >
            <Star className="h-3.5 w-3.5" />
            Favorites
            <span className="ml-auto text-xs opacity-80">{favoriteIds.size}</span>
          </button>
          <button
            onClick={() => selectCategory(RECENT_VIEW)}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              activeCategory === RECENT_VIEW ? "bg-accent text-white" : "hover:bg-muted"
            )}
          >
            <Clock className="h-3.5 w-3.5" />
            Recent
          </button>

          <div className="my-1 border-t" />

          <button
            onClick={() => selectCategory("All")}
            className={cn(
              "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
              activeCategory === "All" ? "bg-accent text-white" : "hover:bg-muted"
            )}
          >
            All Articles
            <span className="text-xs opacity-80">{articles.length}</span>
          </button>
          {categories
            .slice()
            .sort((a, b) => a.display_order - b.display_order)
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => selectCategory(cat.name)}
                className={cn(
                  "flex items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors",
                  activeCategory === cat.name ? "bg-accent text-white" : "hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-2">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", getCategoryColorPreset(cat.color).dot)} />
                  {cat.name}
                </span>
                <span className="text-xs opacity-80">{categoryCounts[cat.name] ?? 0}</span>
              </button>
            ))}
        </nav>

        {isAdmin && (
          <div className="space-y-2">
            <Button
              className="w-full gap-2"
              onClick={() => {
                setFormArticle(null);
                setFormDraft(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Article
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setImportOpen(true)}>
                <FileUp className="h-3.5 w-3.5" />
                Import
              </Button>
              <Button variant="outline" size="sm" className="flex-1 gap-1.5" onClick={() => setCategoryDialogOpen(true)}>
                <Settings className="h-3.5 w-3.5" />
                Categories
              </Button>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => setManageOpen(true)}>
              <Eye className="h-3.5 w-3.5" />
              Manage visibility
            </Button>
          </div>
        )}
      </aside>

      {/* Main panel — article list, or the opened article full-width with a Back button */}
      <section className="flex-1 overflow-y-auto rounded-xl border bg-card p-3">
        {!selectedId && (
          <>
            {(isSearching ? searching : loadingSpecialList && (activeCategory === FAVORITES_VIEW || activeCategory === RECENT_VIEW)) && (
              <div className="grid grid-cols-1 gap-3 p-1 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-28 w-full rounded-lg" />
                ))}
              </div>
            )}

            {isSearching && !searching && visibleArticles.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No articles match &quot;{searchQuery}&quot;.</p>
            )}

            {!isSearching && !loadingSpecialList && activeCategory === FAVORITES_VIEW && visibleArticles.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                No favorites yet — star an article to pin it here.
              </p>
            )}

            {!isSearching && !loadingSpecialList && activeCategory === RECENT_VIEW && visibleArticles.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">No recently viewed articles yet.</p>
            )}

            {!isSearching && activeCategory !== FAVORITES_VIEW && activeCategory !== RECENT_VIEW && visibleArticles.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">
                No articles in this category yet.
                {isAdmin && (
                  <button
                    className="ml-1 text-accent underline"
                    onClick={() => {
                      setFormArticle(null);
                      setFormDraft(null);
                      setFormOpen(true);
                    }}
                  >
                    + Add Article
                  </button>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleArticles.map((article) => {
                const isFavorited = favoriteIds.has(article.id);
                const excerptText = "excerpt" in article ? article.excerpt : "";
                return (
                  <Card
                    key={article.id}
                    onClick={() => handleSelect(article.id)}
                    className="group flex min-h-[7rem] cursor-pointer flex-col rounded-xl p-4 transition-all duration-150 hover:-translate-y-0.5 hover:border-accent hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <Badge className={cn("text-xs", categoryBadgeClass(categoryColorByName[article.category]))} variant="secondary">
                        {article.category}
                      </Badge>
                      <div className="flex gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFavorite(article.id);
                          }}
                          className={cn(
                            "rounded p-1 hover:bg-muted",
                            isFavorited ? "text-amber-500" : "opacity-0 group-hover:opacity-100"
                          )}
                        >
                          <Star className="h-3.5 w-3.5" fill={isFavorited ? "currentColor" : "none"} />
                        </button>
                        {isAdmin && (
                          <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                fetchJson<{ article: OpsArticle }>(`/api/ops-guide/${article.id}`).then((json) => {
                                  setFormArticle(json.article);
                                  setFormDraft(null);
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
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm font-semibold leading-snug">{article.title}</p>
                    {excerptText && <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{excerptText}</p>}
                    <p className="mt-auto pt-2 text-xs text-muted-foreground">{formatRelativeDate(article.updated_at)}</p>
                  </Card>
                );
              })}
            </div>
          </>
        )}

        {selectedId && loadingArticle && (
          <div className="space-y-3">
            <Skeleton className="h-6 w-1/3" />
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}

        {selectedId && !loadingArticle && selectedArticle && (
          <div className="mx-auto max-w-3xl p-3">
            <button
              onClick={() => setSelectedId(null)}
              className="mb-3 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Articles
            </button>
            <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <span>{selectedArticle.category}</span>
              <span>/</span>
              <span className="truncate">{selectedArticle.title}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold">{selectedArticle.title}</h1>
              <div className="flex shrink-0 gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className={cn("gap-1.5", favoriteIds.has(selectedArticle.id) && "text-amber-500")}
                  onClick={() => toggleFavorite(selectedArticle.id)}
                >
                  <Star className="h-3.5 w-3.5" fill={favoriteIds.has(selectedArticle.id) ? "currentColor" : "none"} />
                  {favoriteIds.has(selectedArticle.id) ? "Favorited" : "Favorite"}
                </Button>
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
                        setFormDraft(null);
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
              <Badge className={cn(categoryBadgeClass(categoryColorByName[selectedArticle.category]))} variant="secondary">
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

            <div className="mt-6">
              <ArticleContent
                content={selectedArticle.content}
                checkedSteps={checkedSteps}
                onToggleStep={(index) => setCheckedSteps((prev) => ({ ...prev, [index]: !prev[index] }))}
                containerRef={contentRef}
              />
            </div>
          </div>
        )}
      </section>

      {isAdmin && (
        <>
          <ArticleFormDialog
            open={formOpen}
            onOpenChange={setFormOpen}
            article={formArticle}
            categories={categories}
            draft={formDraft}
            onSaved={handleArticleSaved}
          />
          <DeleteArticleDialog
            open={deleteOpen}
            onOpenChange={setDeleteOpen}
            article={deleteTarget}
            onDeleted={handleArticleDeleted}
          />
          <CategoryManageDialog
            open={categoryDialogOpen}
            onOpenChange={setCategoryDialogOpen}
            categories={categories}
            onCategoriesChanged={setCategories}
          />
          <ImportArticleDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            onImported={(draft) => {
              setFormArticle(null);
              setFormDraft(draft);
              setFormOpen(true);
            }}
          />
          <ManageVisibilityDialog
            open={manageOpen}
            onOpenChange={setManageOpen}
            onChanged={refreshArticles}
          />
        </>
      )}
    </div>
  );
}
