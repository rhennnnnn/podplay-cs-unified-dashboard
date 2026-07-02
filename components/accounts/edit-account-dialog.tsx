"use client";

import * as React from "react";
import { toast } from "sonner";

import type { AccountRow } from "@/lib/accounts-server";
import type { ProfileRole } from "@/lib/types";
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

interface EditAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountRow | null;
  canEditRole: boolean;
  onSaved: (account: AccountRow) => void;
}

export function EditAccountDialog({ open, onOpenChange, account, canEditRole, onSaved }: EditAccountDialogProps) {
  const [firstName, setFirstName] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [role, setRole] = React.useState<ProfileRole>("default");
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && account) {
      setFirstName(account.first_name ?? "");
      setLastName(account.last_name ?? "");
      setRole(account.role ?? "default");
      setError(null);
    }
  }, [open, account]);

  if (!account) return null;
  const isNewProfile = !account.hasProfile;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!firstName.trim() || !lastName.trim()) {
      setError("First and last name are required.");
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { first_name: firstName.trim(), last_name: lastName.trim() };
      if (canEditRole) body.role = role;

      const res = await fetch(`/api/accounts/${account!.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to save changes.");
        return;
      }

      onSaved({ ...account!, ...json.account, hasProfile: true });
      toast.success(isNewProfile ? "Added to Team." : "Account updated.");
      onOpenChange(false);
    } catch {
      setError("Failed to save changes.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNewProfile ? "Add to Team" : "Edit Account"}</DialogTitle>
          <DialogDescription>
            {isNewProfile
              ? `${account.email} can already sign in — give them a name to add them to the Team.`
              : account.email}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="edit_first_name">First Name</Label>
              <Input id="edit_first_name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit_last_name">Last Name</Label>
              <Input id="edit_last_name" required value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
          </div>

          {canEditRole && (
            <div className="space-y-1.5">
              <Label htmlFor="edit_role">Role</Label>
              <Select value={role} onValueChange={(v) => setRole(v as ProfileRole)}>
                <SelectTrigger id="edit_role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">Default</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : isNewProfile ? "Add to Team" : "Save Changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
