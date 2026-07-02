"use client";

import * as React from "react";
import { KeyRound, Pencil, Plus, Trash2, UserPlus } from "lucide-react";

import { formatRelativeTime } from "@/lib/hubspot";
import type { AccountRow } from "@/lib/accounts-server";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CreateAccountDialog } from "@/components/accounts/create-account-dialog";
import { ChangePasswordDialog } from "@/components/accounts/change-password-dialog";
import { DeleteAccountDialog } from "@/components/accounts/delete-account-dialog";
import { EditAccountDialog } from "@/components/accounts/edit-account-dialog";

interface AccountsTableProps {
  initialAccounts: AccountRow[];
  currentProfileId: string;
  isAdmin: boolean;
}

function initials(account: AccountRow): string {
  if (account.first_name && account.last_name) {
    return `${account.first_name.charAt(0)}${account.last_name.charAt(0)}`.toUpperCase();
  }
  return account.email.slice(0, 2).toUpperCase();
}

export function AccountsTable({ initialAccounts, currentProfileId, isAdmin }: AccountsTableProps) {
  const [accounts, setAccounts] = React.useState<AccountRow[]>(initialAccounts);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<AccountRow | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<AccountRow | null>(null);

  function upsert(account: AccountRow) {
    setAccounts((prev) => {
      const exists = prev.some((a) => a.id === account.id);
      return exists ? prev.map((a) => (a.id === account.id ? account : a)) : [account, ...prev];
    });
  }

  const orphanCount = accounts.filter((a) => !a.hasProfile).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">
            {isAdmin
              ? "Every login that can sign in shows here — add or remove access as needed."
              : "Manage PodPlay CS teammate accounts and roles."}
          </p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Account
          </Button>
        )}
      </div>

      {isAdmin && orphanCount > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-600 dark:text-amber-400">
          {orphanCount} login{orphanCount > 1 ? "s" : ""} can sign in but {orphanCount > 1 ? "aren't" : "isn't"} on
          the Team yet — marked &ldquo;No profile&rdquo; below. Add them or delete the login.
        </div>
      )}

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead>Name</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Created by</TableHead>
              <TableHead>Last seen</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No accounts yet.
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((account) => {
                const isSelf = account.id === currentProfileId;
                const canEdit = isSelf || isAdmin;
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarFallback>{initials(account)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      {account.hasProfile ? (
                        <>
                          {account.first_name} {account.last_name}
                          {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{account.email}</TableCell>
                    <TableCell>
                      {account.hasProfile ? (
                        <Badge variant={account.role === "admin" ? "default" : "secondary"}>
                          {account.role === "admin" ? "Admin" : "Default"}
                        </Badge>
                      ) : (
                        <Badge variant="amber">No profile</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{account.created_by ?? "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {account.last_sign_in_at ? formatRelativeTime(account.last_sign_in_at) : "never"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {isSelf && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Change Password"
                            onClick={() => setPasswordOpen(true)}
                          >
                            <KeyRound className="h-4 w-4" />
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title={account.hasProfile ? "Edit" : "Add to Team"}
                            onClick={() => setEditTarget(account)}
                          >
                            {account.hasProfile ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                          </Button>
                        )}
                        {isAdmin && !isSelf && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive hover:text-destructive"
                            title="Delete"
                            onClick={() => setDeleteTarget(account)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <CreateAccountDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        isAdmin={isAdmin}
        onCreated={(account) => upsert({ ...account, last_sign_in_at: null, hasProfile: true })}
      />

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />

      <EditAccountDialog
        open={Boolean(editTarget)}
        onOpenChange={(v) => !v && setEditTarget(null)}
        account={editTarget}
        canEditRole={isAdmin}
        onSaved={(account) => upsert({ ...account, last_sign_in_at: editTarget?.last_sign_in_at ?? null })}
      />

      <DeleteAccountDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        account={deleteTarget}
        onDeleted={(id) => setAccounts((prev) => prev.filter((a) => a.id !== id))}
      />
    </div>
  );
}
