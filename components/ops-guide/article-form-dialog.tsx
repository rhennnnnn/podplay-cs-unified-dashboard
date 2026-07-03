"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import TurndownService from "turndown";
import { ImagePlus } from "lucide-react";
import { toast } from "sonner";

import type { OpsArticle, OpsCategory } from "@/lib/types";
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
import { extractEmbeddedImages, restoreEmbeddedImages, type EmbeddedImageMap } from "@/lib/ops-guide";

const DEFAULT_IMAGE_WIDTH = 400;

// The entire @uiw/react-md-editor surface (component + commands) lives in
// this module and is only ever loaded client-side — the package touches
// browser globals at import time and would break SSR otherwise.
const MarkdownEditor = dynamic(() => import("@/components/ops-guide/markdown-editor"), { ssr: false });

const turndownService = new TurndownService({ headingStyle: "atx" });
// Legacy seed articles mark a step as <p class="step"><label><input
// type="checkbox">...</label>Step text</p> — turndown drops void <input>
// elements by default (no rule), which would silently lose every checklist
// item. Convert the whole step paragraph into a GFM task-list line instead
// so lib/ops-guide.ts's countCheckboxes still finds it after conversion.
turndownService.addRule("legacyStepCheckbox", {
  filter: (node) => node.nodeName === "P" && node.classList?.contains("step"),
  replacement: (content, node) => {
    const checkbox = (node as HTMLElement).querySelector('input[type="checkbox"]');
    const checked = checkbox?.hasAttribute("checked") ?? false;
    return `\n- [${checked ? "x" : " "}] ${content.trim()}\n`;
  },
});

function looksLikeHtml(content: string): boolean {
  return /<\/?(p|div|h[1-6]|ul|ol|li|strong|em|table|span|a)\b/i.test(content);
}

export interface ArticleDraft {
  title?: string;
  content?: string;
}

interface ArticleFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: OpsArticle | null; // null = creating new
  categories: OpsCategory[];
  draft?: ArticleDraft | null; // pre-fill from import, only used when article is null
  onSaved: (article: OpsArticle) => void;
}

const EMPTY_FORM = { title: "", category: "", content: "", tags: "", published: true };

export function ArticleFormDialog({ open, onOpenChange, article, categories, draft, onSaved }: ArticleFormDialogProps) {
  const { resolvedTheme } = useTheme();
  const [form, setForm] = React.useState(EMPTY_FORM);
  const [saving, setSaving] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  // Placeholder token -> real base64 data URI, for the article currently
  // open. Populated when a legacy article with embedded images loads, and
  // spliced back in right before save.
  const embeddedImagesRef = React.useRef<EmbeddedImageMap>({});

  React.useEffect(() => {
    if (!open) return;
    setError(null);
    if (article) {
      const converted = looksLikeHtml(article.content) ? turndownService.turndown(article.content) : article.content;
      const { content, images } = extractEmbeddedImages(converted);
      embeddedImagesRef.current = images;
      setForm({
        title: article.title,
        category: article.category,
        content,
        tags: article.tags.join(", "),
        published: article.published,
      });
    } else {
      embeddedImagesRef.current = {};
      setForm({
        ...EMPTY_FORM,
        title: draft?.title ?? "",
        content: draft?.content ?? "",
      });
    }
  }, [open, article, draft]);

  const isEdit = Boolean(article);

  function resolveImageSrc(src: string): string {
    return embeddedImagesRef.current[src] ?? src;
  }

  async function handleImageUpload(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ops-guide/upload-image", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to upload image.");
      const imageTag = `<img src="${json.url}" alt="${file.name}" width="${DEFAULT_IMAGE_WIDTH}">`;
      setForm((f) => ({ ...f, content: `${f.content}\n\n${imageTag}\n` }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleSave() {
    setError(null);
    if (!form.title.trim() || !form.content.trim() || !form.category) {
      setError("Title, category, and content are required.");
      return;
    }

    setSaving(true);
    try {
      const content = restoreEmbeddedImages(form.content.trim(), embeddedImagesRef.current);
      const body = {
        title: form.title.trim(),
        category: form.category,
        content,
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
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Article" : "New Article"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this OPS Guide article." : "Add a new article to the OPS Guide. Content is Markdown."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
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

          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label>Content (Markdown)</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImageUpload(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus className="h-3.5 w-3.5" />
                {uploading ? "Uploading…" : "Insert Image"}
              </Button>
            </div>
            <div className="flex-1">
              <MarkdownEditor
                value={form.content}
                onChange={(content) => setForm((f) => ({ ...f, content }))}
                colorMode={resolvedTheme === "light" ? "light" : "dark"}
                resolveImageSrc={resolveImageSrc}
              />
            </div>
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
