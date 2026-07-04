"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import type { OpsArticleStub } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface DeleteArticleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: OpsArticleStub | null;
  onDeleted: (id: string) => void;
}

export function DeleteArticleDialog({ open, onOpenChange, article, onDeleted }: DeleteArticleDialogProps) {
  const [deleting, setDeleting] = React.useState(false);

  if (!article) return null;

  async function handleDelete() {
    if (!article) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/ops-guide/${article.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete article.");
      }
      toast.success("Article deleted");
      onDeleted(article.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete article.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Article
          </DialogTitle>
          <DialogDescription>Delete &quot;{article.title}&quot;? This cannot be undone.</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
