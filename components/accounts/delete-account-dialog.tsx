"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import type { AccountRow } from "@/lib/accounts-server";
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

interface DeleteAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountRow | null;
  onDeleted: (id: string) => void;
}

export function DeleteAccountDialog({ open, onOpenChange, account, onDeleted }: DeleteAccountDialogProps) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [confirmText, setConfirmText] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setStep(1);
      setConfirmText("");
    }
  }, [open]);

  if (!account) return null;

  // Orphaned logins (no profile) have no first name to type — confirm by email instead.
  const confirmTarget = account.hasProfile ? account.first_name ?? "" : account.email;
  const matches = confirmText.trim() === confirmTarget;

  async function handleDelete() {
    if (!account || !matches) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/accounts/${account.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to delete account.");
      }
      toast.success(`${account.hasProfile ? account.first_name : account.email}'s account deleted.`);
      onDeleted(account.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete account.");
    } finally {
      setDeleting(false);
    }
  }

  const who = account.hasProfile ? `${account.first_name} ${account.last_name}` : account.email;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Delete Account
          </DialogTitle>
          <DialogDescription>
            {step === 1
              ? `This permanently deletes ${who}'s login — they will no longer be able to sign in. This cannot be undone.`
              : `Type "${confirmTarget}" to confirm deletion.`}
          </DialogDescription>
        </DialogHeader>

        {step === 2 && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-delete-account">{account.hasProfile ? "First name" : "Email"}</Label>
            <Input
              id="confirm-delete-account"
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={confirmTarget}
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
