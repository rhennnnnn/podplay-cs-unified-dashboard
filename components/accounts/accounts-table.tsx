"use client";

import * as React from "react";
import { KeyRound, Pencil, Plus, Trash2, UserPlus } from "lucide-react";

import { formatRelativeTime } from "@/lib/hubspot";
import type { AccountRow } from "@/lib/accounts-server";
import { CreateAccountDialog } from "@/components/accounts/create-account-dialog";
import { ChangePasswordDialog } from "@/components/accounts/change-password-dialog";
import { DeleteAccountDialog } from "@/components/accounts/delete-account-dialog";
import { EditAccountDialog } from "@/components/accounts/edit-account-dialog";

interface AccountsTableProps {
  initialAccounts: AccountRow[];
  currentProfileId: string;
  isAdmin: boolean;
}

// Presentation styling for the Team roster. Scoped under `.pp-team` so it
// stays self-contained. Logic/handlers below are unchanged.
const TEAM_STYLES = `
.pp-team { color: #0f1626; }
.pp-team .pp-topbar { background: #fff; border-bottom: 1px solid #e9edf3; padding: 18px 24px; margin: -16px -16px 0; }
.pp-team .pp-topbar h1 { font-size: 22px; font-weight: 700; letter-spacing: -.02em; margin: 0; color: #0f1626; }
.pp-team .pp-topbar p { font-size: 13.5px; color: #6b7280; margin: 4px 0 0; }
.pp-team .pp-content { padding-top: 0; }
.pp-team .pp-content-head { display: flex; justify-content: flex-end; margin-bottom: 18px; }
.pp-team .pp-create { display: inline-flex; align-items: center; gap: 8px; height: 40px; padding: 0 16px; border: none; border-radius: 10px; cursor: pointer; font-size: 14px; font-weight: 600; color: #fff; background: #2563eb; box-shadow: 0 6px 16px rgba(47,110,240,.28); transition: filter .15s, transform .15s; }
.pp-team .pp-create:hover { filter: brightness(1.05); transform: translateY(-1px); }
.pp-team .pp-card { background: #fff; border-radius: 12px; overflow: hidden; border: 1px solid #e9edf3; box-shadow: 0 1px 2px rgba(15,22,38,.04); }
.pp-team table { width: 100%; border-collapse: collapse; }
.pp-team thead th { text-align: left; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #97a1b0; padding: 14px 16px; background: #fafbfc; border-bottom: 1px solid #eef0f4; }
.pp-team tbody td { padding: 12px 16px; border-bottom: 1px solid #f1f3f7; font-size: 14px; vertical-align: middle; }
.pp-team tbody tr:last-child td { border-bottom: none; }
.pp-team tbody tr:hover { background: #f8fafc; }
.pp-team .pp-name-cell { display: flex; align-items: center; gap: 12px; }
.pp-team .pp-avatar { flex: none; width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.pp-team .pp-name { font-weight: 600; color: #0f1626; }
.pp-team .pp-you { margin-left: 6px; font-size: 12px; font-weight: 400; color: #97a1b0; }
.pp-team .pp-email { color: #2563eb; }
.pp-team .pp-muted { color: #6b7280; }
.pp-team .pp-seen { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12.5px; color: #6b7280; }
.pp-team .pp-badge { display: inline-block; padding: 3px 12px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.pp-team .pp-badge-admin { background: #eef4ff; color: #1d4ed8; }
.pp-team .pp-badge-default { background: #eef2f7; color: #64748b; }
.pp-team .pp-badge-amber { background: #fef3c7; color: #b45309; }
.pp-team .pp-actions { display: flex; justify-content: flex-end; gap: 4px; }
.pp-team .pp-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; border-radius: 8px; background: transparent; color: #97a1b0; cursor: pointer; transition: background .15s, color .15s; }
.pp-team .pp-icon-btn:hover { background: #f1f3f7; color: #0f1626; }
.pp-team .pp-icon-btn.pp-danger:hover { background: #ffe2e6; color: #e0455d; }
.pp-team .pp-orphan { border: 1px solid rgba(180,83,9,.35); background: #fef3c7; color: #b45309; border-radius: 10px; padding: 12px 14px; font-size: 13.5px; margin-bottom: 18px; }
.pp-team .pp-empty { text-align: center; color: #97a1b0; padding: 40px 0; }
@media (min-width: 768px) {
  .pp-team .pp-topbar { margin: -32px -32px 0; padding: 22px 32px; }
}
`;

const AVATAR_COLORS = [
  { bg: "#e2ecff", fg: "#2563eb" },
  { bg: "#ece2ff", fg: "#7c3aed" },
  { bg: "#dcfae8", fg: "#12a150" },
  { bg: "#ffeede", fg: "#e07b1a" },
  { bg: "#ffe2e6", fg: "#e0455d" },
  { bg: "#d9f5f3", fg: "#0d9488" },
];

function initials(account: AccountRow): string {
  if (account.first_name && account.last_name) {
    return `${account.first_name.charAt(0)}${account.last_name.charAt(0)}`.toUpperCase();
  }
  return account.email.slice(0, 2).toUpperCase();
}

function avatarColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash + seed.charCodeAt(i)) % AVATAR_COLORS.length;
  return AVATAR_COLORS[hash];
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
    <div className="pp-team">
      <style dangerouslySetInnerHTML={{ __html: TEAM_STYLES }} />

      <div className="pp-content">
        {isAdmin && (
          <div className="pp-content-head">
            <button type="button" className="pp-create" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Create Account
            </button>
          </div>
        )}

        {isAdmin && orphanCount > 0 && (
          <div className="pp-orphan">
            {orphanCount} login{orphanCount > 1 ? "s" : ""} can sign in but {orphanCount > 1 ? "aren't" : "isn't"} on
            the Team yet — marked &ldquo;No profile&rdquo; below. Add them or delete the login.
          </div>
        )}

        <div className="pp-card">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created by</th>
                <th>Last seen</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {accounts.length === 0 ? (
                <tr>
                  <td colSpan={6} className="pp-empty">
                    No accounts yet.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => {
                  const isSelf = account.id === currentProfileId;
                  const canEdit = isSelf || isAdmin;
                  const color = avatarColor(account.email);
                  return (
                    <tr key={account.id}>
                      <td>
                        <div className="pp-name-cell">
                          <span className="pp-avatar" style={{ background: color.bg, color: color.fg }}>
                            {initials(account)}
                          </span>
                          <span>
                            {account.hasProfile ? (
                              <>
                                <span className="pp-name">
                                  {account.first_name} {account.last_name}
                                </span>
                                {isSelf && <span className="pp-you">(you)</span>}
                              </>
                            ) : (
                              <span className="pp-muted">—</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td className="pp-email">{account.email}</td>
                      <td>
                        {account.hasProfile ? (
                          <span className={`pp-badge ${account.role === "admin" ? "pp-badge-admin" : "pp-badge-default"}`}>
                            {account.role === "admin" ? "Admin" : "Default"}
                          </span>
                        ) : (
                          <span className="pp-badge pp-badge-amber">No profile</span>
                        )}
                      </td>
                      <td className="pp-muted">{account.created_by ?? "—"}</td>
                      <td className="pp-seen">
                        {account.last_sign_in_at ? formatRelativeTime(account.last_sign_in_at) : "never"}
                      </td>
                      <td>
                        <div className="pp-actions">
                          {isSelf && (
                            <button
                              type="button"
                              className="pp-icon-btn"
                              title="Change Password"
                              onClick={() => setPasswordOpen(true)}
                            >
                              <KeyRound className="h-4 w-4" />
                            </button>
                          )}
                          {canEdit && (
                            <button
                              type="button"
                              className="pp-icon-btn"
                              title={account.hasProfile ? "Edit" : "Add to Team"}
                              onClick={() => setEditTarget(account)}
                            >
                              {account.hasProfile ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                            </button>
                          )}
                          {isAdmin && !isSelf && (
                            <button
                              type="button"
                              className="pp-icon-btn pp-danger"
                              title="Delete"
                              onClick={() => setDeleteTarget(account)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

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
