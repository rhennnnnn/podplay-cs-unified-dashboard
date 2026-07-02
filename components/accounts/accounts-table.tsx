"use client";

import * as React from "react";
import { KeyRound, Plus, Trash2, UserRound } from "lucide-react";

import { formatRelativeTime } from "@/lib/hubspot";
import type { Profile } from "@/lib/types";
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

export interface AccountRow extends Profile {
  last_sign_in_at: string | null;
}

interface AccountsTableProps {
  initialAccounts: AccountRow[];
  currentProfileId: string;
  isAdmin: boolean;
}

function initials(first: string, last: string): string {
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}

export function AccountsTable({ initialAccounts, currentProfileId, isAdmin }: AccountsTableProps) {
  const [accounts, setAccounts] = React.useState<AccountRow[]>(initialAccounts);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<AccountRow | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Team</h1>
          <p className="text-sm text-muted-foreground">Manage PodPlay CS teammate accounts and roles.</p>
        </div>
        {isAdmin && (
          <Button className="gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Create Account
          </Button>
        )}
      </div>

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
                return (
                  <TableRow key={account.id}>
                    <TableCell>
                      <Avatar>
                        <AvatarFallback>{initials(account.first_name, account.last_name)}</AvatarFallback>
                      </Avatar>
                    </TableCell>
                    <TableCell className="font-medium">
                      {account.first_name} {account.last_name}
                      {isSelf && <span className="ml-2 text-xs text-muted-foreground">(you)</span>}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{account.email}</TableCell>
                    <TableCell>
                      <Badge variant={account.role === "admin" ? "default" : "secondary"}>
                        {account.role === "admin" ? "Admin" : "Default"}
                      </Badge>
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
                        {!isSelf && !isAdmin && (
                          <UserRound className="h-4 w-4 text-muted-foreground/40" aria-hidden />
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
        onCreated={(account) =>
          setAccounts((prev) => [{ ...account, last_sign_in_at: null }, ...prev])
        }
      />

      <ChangePasswordDialog open={passwordOpen} onOpenChange={setPasswordOpen} />

      <DeleteAccountDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        account={deleteTarget}
        onDeleted={(id) => setAccounts((prev) => prev.filter((a) => a.id !== id))}
      />
    </div>
  );
}
