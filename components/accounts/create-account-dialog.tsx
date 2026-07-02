"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

import type { Profile, ProfileRole } from "@/lib/types";
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
import { AccountCreatedModal } from "@/components/accounts/account-created-modal";

interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isAdmin: boolean;
  onCreated: (account: Profile) => void;
}

interface FormState {
  first_name: string;
  last_name: string;
  email: string;
  password: string;
  role: ProfileRole;
}

const INITIAL_FORM: FormState = {
  first_name: "",
  last_name: "",
  email: "",
  password: "",
  role: "default",
};

export function CreateAccountDialog({ open, onOpenChange, isAdmin, onCreated }: CreateAccountDialogProps) {
  const [form, setForm] = React.useState<FormState>(INITIAL_FORM);
  const [showPassword, setShowPassword] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [createdModal, setCreatedModal] = React.useState<{ email: string; password: string } | null>(null);

  React.useEffect(() => {
    if (open) {
      setForm(INITIAL_FORM);
      setError(null);
      setShowPassword(false);
    }
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.password) {
      setError("All fields are required.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "Failed to create account.");
        return;
      }

      onCreated(json.account as Profile);
      setCreatedModal({ email: form.email, password: form.password });
      onOpenChange(false);
    } catch {
      setError("Failed to create account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Account</DialogTitle>
            <DialogDescription>
              {isAdmin
                ? "Create a teammate account. You can set any email domain and role."
                : "Create a teammate account. Must use a @podplay.app address."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  required
                  value={form.first_name}
                  onChange={(e) => update("first_name", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  required
                  value={form.last_name}
                  onChange={(e) => update("last_name", e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                required
                placeholder={isAdmin ? "name@example.com" : "name@podplay.app"}
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {isAdmin && (
              <div className="space-y-1.5">
                <Label htmlFor="role">Role</Label>
                <Select value={form.role} onValueChange={(v) => update("role", v as ProfileRole)}>
                  <SelectTrigger id="role">
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
                {saving ? "Creating…" : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AccountCreatedModal
        open={Boolean(createdModal)}
        onOpenChange={(v) => {
          if (!v) {
            setCreatedModal(null);
            toast.success("Account created.");
          }
        }}
        email={createdModal?.email ?? ""}
        password={createdModal?.password ?? ""}
      />
    </>
  );
}
