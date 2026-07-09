"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { Location } from "@/lib/types";
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

interface DeleteClientDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  location: Location | null;
  userEmail: string;
  onDeleted: () => void;
}

export function DeleteClientDialog({
  open,
  onOpenChange,
  location,
  userEmail,
  onDeleted,
}: DeleteClientDialogProps) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setConfirmText("");
    }
  }, [open]);

  if (!location) return null;

  // Trim BOTH sides: some rows (e.g. HubSpot-tracked or the legacy " TEST" row)
  // have leading/trailing whitespace in name, which the user can't see or type,
  // leaving "Delete Permanently" permanently disabled.
  const matches = confirmText.trim() === location.name.trim();

  async function handleDelete() {
    if (!location || !matches) return;
    setDeleting(true);
    const supabase = createClient();
    try {
      const { error } = await supabase.from("locations").delete().eq("id", location.id);
      if (error) throw error;

      await supabase.from("activity_log").insert({
        user_email: userEmail,
        action: "deleted",
        entity: `location:${location.id}`,
        details: `Deleted ${location.name}`,
      } as never);

      toast.success(`${location.name} deleted.`);
      onDeleted();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete client.");
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
            Delete Client
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? `This permanently deletes "${location.name}" and its activity history. This cannot be undone.`
              : `Type "${location.name}" to confirm deletion.`}
          </DialogDescription>
        </DialogHeader>

        {step === 2 && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete">Location name</Label>
            <Input
              id="confirm-delete"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={location.name}
            />
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          {step === 1 ? (
            <Button type="button" variant="destructive" onClick={() => setStep(2)}>
              Continue
            </Button>
          ) : (
            <Button type="button" variant="destructive" disabled={!matches || deleting} onClick={handleDelete}>
              {deleting ? "Deleting…" : "Delete Permanently"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
