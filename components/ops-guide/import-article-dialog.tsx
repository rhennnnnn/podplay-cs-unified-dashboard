"use client";

import * as React from "react";
import { FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ArticleDraft } from "@/components/ops-guide/article-form-dialog";

interface ImportArticleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: (draft: ArticleDraft) => void;
}

export function ImportArticleDialog({ open, onOpenChange, onImported }: ImportArticleDialogProps) {
  const [dragging, setDragging] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    if (!/\.(docx|pdf)$/i.test(file.name)) {
      toast.error("Only .docx and .pdf files are supported.");
      return;
    }
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/ops-guide/import", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to convert file.");
      onImported({ title: json.suggestedTitle, content: json.markdown });
      onOpenChange(false);
      toast.success("Converted to Markdown — review before saving.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to convert file.");
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Article</DialogTitle>
          <DialogDescription>
            Drop a .docx or .pdf file to convert it to Markdown. You&apos;ll title, categorize, and tag it before
            saving.
          </DialogDescription>
        </DialogHeader>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-10 text-center transition-colors",
            dragging ? "border-accent bg-accent/10" : "border-input hover:border-accent/60"
          )}
        >
          {importing ? (
            <>
              <Loader2 className="h-8 w-8 animate-spin text-accent" />
              <p className="text-sm text-muted-foreground">Converting…</p>
            </>
          ) : (
            <>
              <FileUp className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-medium">Drag & drop a file here, or click to browse</p>
              <p className="text-xs text-muted-foreground">.docx or .pdf</p>
            </>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".docx,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
