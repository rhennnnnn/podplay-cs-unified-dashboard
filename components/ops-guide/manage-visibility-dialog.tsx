"use client";

import * as React from "react";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

import type { OpsArticleStub } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ManageVisibilityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}

export function ManageVisibilityDialog({ open, onOpenChange, onChanged }: ManageVisibilityDialogProps) {
  const [articles, setArticles] = React.useState<OpsArticleStub[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/ops-guide/all")
      .then((r) => r.json())
      .then((json) => setArticles(json.articles ?? []))
      .catch(() => toast.error("Failed to load articles."))
      .finally(() => setLoading(false));
  }, [open]);

  const hiddenCount = articles.filter((a) => !a.published).length;

  async function toggle(article: OpsArticleStub) {
    const next = !article.published;
    setBusyId(article.id);
    // optimistic
    setArticles((prev) => prev.map((a) => (a.id === article.id ? { ...a, published: next } : a)));
    try {
      const res = await fetch(`/api/ops-guide/${article.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: next }),
      });
      if (!res.ok) throw new Error();
      onChanged();
    } catch {
      // revert
      setArticles((prev) => prev.map((a) => (a.id === article.id ? { ...a, published: !next } : a)));
      toast.error("Couldn't update visibility.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(article: OpsArticleStub) {
    setBusyId(article.id);
    try {
      const res = await fetch(`/api/ops-guide/${article.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setArticles((prev) => prev.filter((a) => a.id !== article.id));
      setConfirmId(null);
      onChanged();
      toast.success("Article deleted.");
    } catch {
      toast.error("Couldn't delete the article.");
    } finally {
      setBusyId(null);
    }
  }

  // Group by category, preserving the fetch order (already sorted by category, title).
  const groups: { category: string; items: OpsArticleStub[] }[] = [];
  for (const a of articles) {
    const last = groups[groups.length - 1];
    if (last && last.category === a.category) last.items.push(a);
    else groups.push({ category: a.category, items: [a] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-hidden">
        <DialogHeader>
          <DialogTitle>Manage Article Visibility</DialogTitle>
          <DialogDescription>
            Turn articles off to hide them from the OPS Guide grid. Turn them back on anytime.
            {articles.length > 0 && ` · ${hiddenCount} hidden`}
          </DialogDescription>
        </DialogHeader>

        <div className="-mx-1 max-h-[60vh] space-y-4 overflow-y-auto px-1">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full rounded-md" />
              ))}
            </div>
          ) : articles.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No articles yet.</p>
          ) : (
            groups.map((group) => (
              <div key={group.category}>
                <p className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {group.category}
                </p>
                <ul className="space-y-1">
                  {group.items.map((article) => (
                    <li
                      key={article.id}
                      className="flex items-center gap-3 rounded-md border border-border px-3 py-2"
                    >
                      <Switch
                        checked={article.published}
                        disabled={busyId === article.id}
                        onCheckedChange={() => toggle(article)}
                        aria-label="Toggle visibility"
                      />
                      <span
                        className={
                          article.published
                            ? "min-w-0 flex-1 truncate text-sm"
                            : "min-w-0 flex-1 truncate text-sm text-muted-foreground line-through"
                        }
                        title={article.title}
                      >
                        {article.title}
                      </span>

                      {confirmId === article.id ? (
                        <span className="flex shrink-0 items-center gap-2">
                          <span className="text-xs text-muted-foreground">Delete?</span>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2"
                            disabled={busyId === article.id}
                            onClick={() => remove(article)}
                          >
                            Yes
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2"
                            onClick={() => setConfirmId(null)}
                          >
                            No
                          </Button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          title="Delete article"
                          onClick={() => setConfirmId(article.id)}
                          className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
