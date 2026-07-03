"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";

import type { OpsCategory } from "@/lib/types";
import { CATEGORY_COLOR_PRESETS, getCategoryColorPreset } from "@/lib/ops-guide";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

interface CategoryManageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: OpsCategory[];
  onCategoriesChanged: (categories: OpsCategory[]) => void;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed.");
  return json as T;
}

export function CategoryManageDialog({ open, onOpenChange, categories, onCategoriesChanged }: CategoryManageDialogProps) {
  const [newName, setNewName] = React.useState("");
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editingName, setEditingName] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [colorPickerId, setColorPickerId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setNewName("");
      setEditingId(null);
      setColorPickerId(null);
    }
  }, [open]);

  async function handleColorChange(category: OpsCategory, colorKey: string) {
    setBusyId(category.id);
    setColorPickerId(null);
    try {
      const json = await fetchJson<{ category: OpsCategory }>(`/api/ops-guide/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: colorKey }),
      });
      onCategoriesChanged(categories.map((c) => (c.id === category.id ? json.category : c)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update color.");
    } finally {
      setBusyId(null);
    }
  }

  const sorted = [...categories].sort((a, b) => a.display_order - b.display_order);

  async function handleAdd() {
    const name = newName.trim();
    if (!name) return;
    try {
      const json = await fetchJson<{ category: OpsCategory }>("/api/ops-guide/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onCategoriesChanged([...categories, json.category]);
      setNewName("");
      toast.success("Category added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add category.");
    }
  }

  async function handleRename(category: OpsCategory) {
    const name = editingName.trim();
    if (!name || name === category.name) {
      setEditingId(null);
      return;
    }
    setBusyId(category.id);
    try {
      const json = await fetchJson<{ category: OpsCategory }>(`/api/ops-guide/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      onCategoriesChanged(categories.map((c) => (c.id === category.id ? json.category : c)));
      toast.success("Category renamed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to rename category.");
    } finally {
      setBusyId(null);
      setEditingId(null);
    }
  }

  async function handleMove(category: OpsCategory, direction: -1 | 1) {
    const idx = sorted.findIndex((c) => c.id === category.id);
    const swapWith = sorted[idx + direction];
    if (!swapWith) return;

    setBusyId(category.id);
    try {
      const [a, b] = await Promise.all([
        fetchJson<{ category: OpsCategory }>(`/api/ops-guide/categories/${category.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_order: swapWith.display_order }),
        }),
        fetchJson<{ category: OpsCategory }>(`/api/ops-guide/categories/${swapWith.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_order: category.display_order }),
        }),
      ]);
      onCategoriesChanged(
        categories.map((c) => (c.id === a.category.id ? a.category : c.id === b.category.id ? b.category : c))
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to reorder categories.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(category: OpsCategory) {
    setBusyId(category.id);
    try {
      const res = await fetch(`/api/ops-guide/categories/${category.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete category.");
      }
      onCategoriesChanged(categories.filter((c) => c.id !== category.id));
      toast.success("Category deleted");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Rename, reorder, or delete OPS Guide categories. A category with articles still assigned to it can&apos;t
            be deleted — move those articles first.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {sorted.map((category, idx) => (
            <div key={category.id} className="rounded-md border p-2">
            <div className="flex items-center gap-2">
              <div className="flex flex-col">
                <button
                  disabled={idx === 0 || busyId === category.id}
                  onClick={() => handleMove(category, -1)}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                >
                  <ArrowUp className="h-3 w-3" />
                </button>
                <button
                  disabled={idx === sorted.length - 1 || busyId === category.id}
                  onClick={() => handleMove(category, 1)}
                  className="rounded p-0.5 hover:bg-muted disabled:opacity-30"
                >
                  <ArrowDown className="h-3 w-3" />
                </button>
              </div>

              <button
                title="Change color"
                onClick={() => setColorPickerId(colorPickerId === category.id ? null : category.id)}
                className={cn("h-4 w-4 shrink-0 rounded-full ring-2 ring-offset-1 ring-offset-card", getCategoryColorPreset(category.color).dot, colorPickerId === category.id ? "ring-foreground/40" : "ring-transparent")}
              />

              {editingId === category.id ? (
                <Input
                  autoFocus
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRename(category);
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-8 flex-1"
                />
              ) : (
                <span className="flex-1 text-sm">{category.name}</span>
              )}

              {editingId === category.id ? (
                <>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleRename(category)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => {
                    setEditingId(category.id);
                    setEditingName(category.name);
                  }}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              )}

              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive hover:text-destructive"
                disabled={busyId === category.id}
                onClick={() => handleDelete(category)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {colorPickerId === category.id && (
              <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                {CATEGORY_COLOR_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    title={preset.label}
                    onClick={() => handleColorChange(category, preset.key)}
                    className={cn(
                      "h-5 w-5 rounded-full",
                      preset.dot,
                      category.color === preset.key && "ring-2 ring-foreground/50 ring-offset-1 ring-offset-card"
                    )}
                  />
                ))}
              </div>
            )}
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t pt-3">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder="New category name"
          />
          <Button type="button" onClick={handleAdd} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Add
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
