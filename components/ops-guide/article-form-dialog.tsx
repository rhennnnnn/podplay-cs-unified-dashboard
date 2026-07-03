"use client";

import * as React from "react";
import { toast } from "sonner";

import { OPS_ARTICLE_CATEGORIES, type OpsArticle } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

interface ArticleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: OpsArticle | null; // null = creating new
  onSaved: (article: OpsArticle) => void;
}

const EMPTY_FORM = { title: "", category: "", content: "", tags: "", published: true };

export function ArticleFormDialog({ open, onOpenChange, article, onSaved }: ArticleFormDialogProps) {
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (article) {
      setForm({
        title: article.title,
        category: article.category,
        content: article.content,
        tags: article.tags.join(", "),
        published: article.published,
      });
    } else {
      setForm(EMPTY_FORM);
    }
  }, [open, article]);

  const isEdit = Boolean(article);

  async function handleSave() {
    setError(null);
    if (!form.title.trim() || !form.content.trim() || !form.category) {
      setError("Title, category, and content are required.");
      return;
    }

    setSaving(true);
    try {
      const body = {
        title: form.title.trim(),
        category: form.category,
        content: form.content.trim(),
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        published: form.published,
      };

      const res = await fetch(isEdit ? `/api/ops-guide/${article!.id}` : "/api/ops-guide", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save article.");

      toast.success(isEdit ? "Article updated" : "Article created");
      onSaved(json.article as OpsArticle);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save article.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Article" : "New Article"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this OPS Guide article." : "Add a new article to the OPS Guide."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="article-title">Title</Label>
            <Input
              id="article-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Camera Won't Power On"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="article-category">Category</Label>
            <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
              <SelectTrigger id="article-category">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {OPS_ARTICLE_CATEGORIES.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="article-tags">Tags (comma-separated, optional)</Label>
            <Input
              id="article-tags"
              value={form.tags}
              onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))}
              placeholder="e.g. camera, hardware, setup"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="article-content">Content (HTML)</Label>
            <Textarea
              id="article-content"
              value={form.content}
              onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
              className="min-h-[300px] font-mono text-sm"
              placeholder="<h2>Section title</h2><p>Steps...</p>"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              id="article-published"
              type="checkbox"
              checked={form.published}
              onChange={(e) => setForm((f) => ({ ...f, published: e.target.checked }))}
              className="h-4 w-4 rounded border-input accent-accent"
            />
            <Label htmlFor="article-published" className="cursor-pointer font-normal">
              Published (visible to the team)
            </Label>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Create Article"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
