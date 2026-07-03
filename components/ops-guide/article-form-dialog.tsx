"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
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
import { Textarea } from "@/components/ui/textarea";
import { safeUrlTransform } from "@/components/ops-guide/article-content";
import { ResizableImage } from "@/components/ops-guide/resizable-image";
import { getImageWidth, setImageWidth } from "@/lib/ops-guide";

const DEFAULT_IMAGE_WIDTH = 400;

const MDEditor = dynamic(() => import("@uiw/react-md-editor"), { ssr: false });

// CodeMirror (which MDEditor wraps) freezes the tab on a single very long
// line — legacy articles can embed a base64 image inline as one huge line.
// Fall back to a plain textarea for those instead of hanging the browser.
const MAX_SAFE_LINE_LENGTH = 5000;
function hasUnsafeLongLine(content: string): boolean {
  return content.split("\n").some((line) => line.length > MAX_SAFE_LINE_LENGTH);
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
      setForm({
        ...EMPTY_FORM,
        title: draft?.title ?? "",
        content: draft?.content ?? "",
      });
    }
  }, [open, article, draft]);

  const isEdit = Boolean(article);
  const useSimpleEditor = React.useMemo(() => hasUnsafeLongLine(form.content), [form.content]);

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
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Article" : "New Article"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update this OPS Guide article." : "Add a new article to the OPS Guide. Content is Markdown."}
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
                {categories.map((cat) => (
                  <SelectItem key={cat.id} value={cat.name}>
                    {cat.name}
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
            <Label>Content (Markdown)</Label>
            {useSimpleEditor ? (
              <>
                <p className="text-xs text-muted-foreground">
                  This article has a large embedded image — using the plain text editor to avoid slowing down the
                  browser.
                </p>
                <Textarea
                  value={form.content}
                  onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                  className="min-h-[300px] font-mono text-sm"
                  placeholder="## Section title&#10;&#10;Steps...&#10;&#10;- [ ] Step one"
                />
              </>
            ) : (
              <div data-color-mode={resolvedTheme === "light" ? "light" : "dark"}>
                <MDEditor
                  value={form.content}
                  onChange={(value) => setForm((f) => ({ ...f, content: value ?? "" }))}
                  height={360}
                  textareaProps={{ placeholder: "## Section title\n\nSteps...\n\n- [ ] Step one" }}
                  previewOptions={{
                    urlTransform: safeUrlTransform,
                    components: {
                      img: ({ src, alt }) =>
                        src ? (
                          <ResizableImage
                            src={src}
                            alt={alt}
                            initialWidth={getImageWidth(form.content, src) ?? DEFAULT_IMAGE_WIDTH}
                            onResizeEnd={(width) =>
                              setForm((f) => ({ ...f, content: setImageWidth(f.content, src, width) }))
                            }
                          />
                        ) : null,
                    },
                  }}
                />
              </div>
            )}
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
