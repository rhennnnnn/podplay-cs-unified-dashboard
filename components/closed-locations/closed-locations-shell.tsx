"use client";

import * as React from "react";
import { Archive, Bell, BellRing, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { CLOSE_REASON_LABELS, type ClosedLocation } from "@/lib/types";
import { formatEastern } from "@/lib/tz";
import { Button } from "@/components/ui/button";
import { CloseLocationDialog } from "@/components/closed-locations/close-location-dialog";

function formatDate(d: string | null): string {
  if (!d) return "—";
  const date = new Date(`${d}T00:00:00`);
  if (Number.isNaN(date.getTime())) return d;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// A reminder is "due" once its time has arrived and it hasn't been dismissed.
function isReminderDue(c: ClosedLocation): boolean {
  return Boolean(c.remind_at && !c.reminder_done && new Date(c.remind_at) <= new Date());
}

export function ClosedLocationsShell({
  initialClosures,
  userEmail,
}: {
  initialClosures: ClosedLocation[];
  userEmail: string;
}) {
  const [closures, setClosures] = React.useState<ClosedLocation[]>(initialClosures);
  const [addOpen, setAddOpen] = React.useState(false);
  const [editTarget, setEditTarget] = React.useState<ClosedLocation | null>(null);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const dueCount = React.useMemo(() => closures.filter(isReminderDue).length, [closures]);

  const groups = React.useMemo(() => {
    const sorted = [...closures].sort((a, b) => (b.close_date ?? "").localeCompare(a.close_date ?? ""));
    const map = new Map<string, ClosedLocation[]>();
    for (const c of sorted) {
      const key = c.client_name || "Unassigned";
      const arr = map.get(key) ?? [];
      arr.push(c);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [closures]);

  async function refresh() {
    const supabase = createClient();
    const { data } = await supabase
      .from("closed_locations")
      .select("*")
      .order("close_date", { ascending: false });
    if (data) setClosures(data as unknown as ClosedLocation[]);
  }

  async function dismissReminder(closure: ClosedLocation) {
    setBusyId(closure.id);
    const supabase = createClient();
    try {
      const { error } = await supabase
        .from("closed_locations")
        .update({ reminder_done: true } as never)
        .eq("id", closure.id);
      if (error) throw error;
      setClosures((prev) => prev.map((c) => (c.id === closure.id ? { ...c, reminder_done: true } : c)));
      toast.success("Reminder dismissed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to dismiss.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(closure: ClosedLocation) {
    if (!window.confirm(`Delete the closure entry for "${closure.location_name}"? This can't be undone.`)) {
      return;
    }
    setBusyId(closure.id);
    const supabase = createClient();
    try {
      const { error } = await supabase.from("closed_locations").delete().eq("id", closure.id);
      if (error) throw error;
      toast.success("Closure deleted.");
      setClosures((prev) => prev.filter((c) => c.id !== closure.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {closures.length} closed location{closures.length === 1 ? "" : "s"} across {groups.length} client
          {groups.length === 1 ? "" : "s"}.
        </p>
        <Button onClick={() => setAddOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" /> Add closure
        </Button>
      </div>

      {dueCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-400">
          <BellRing className="h-4 w-4 shrink-0" />
          {dueCount} reminder{dueCount === 1 ? "" : "s"} due — a location is scheduled to close.
        </div>
      )}

      {closures.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border py-16 text-center">
          <Archive className="mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No closed locations yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Use &ldquo;Add closure&rdquo; to record a location that shut down.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([client, items]) => (
            <div key={client} className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold text-foreground">{client}</h2>
                <p className="text-xs text-muted-foreground">
                  {items.length} closed location{items.length === 1 ? "" : "s"}
                </p>
              </div>
              <ul className="divide-y divide-border">
                {items.map((c) => {
                  const due = isReminderDue(c);
                  return (
                    <li key={c.id} className="flex flex-wrap items-start gap-3 px-4 py-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-foreground">{c.location_name}</span>
                          {c.close_reason && (
                            <span className="rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground">
                              {CLOSE_REASON_LABELS[c.close_reason]}
                            </span>
                          )}
                          {due && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400">
                              <BellRing className="h-3 w-3" /> Reminder due
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">Closed {formatDate(c.close_date)}</p>
                        {c.remind_at && !c.reminder_done && (
                          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                            <Bell className="h-3 w-3" /> Reminder: {formatEastern(c.remind_at)}
                          </p>
                        )}
                        {c.close_note && (
                          <p className="mt-1 whitespace-pre-wrap text-sm text-foreground/80">{c.close_note}</p>
                        )}
                      </div>
                      <div className="flex gap-1">
                        {due && (
                          <Button
                            size="sm"
                            variant="secondary"
                            className="gap-1.5"
                            disabled={busyId === c.id}
                            onClick={() => dismissReminder(c)}
                          >
                            <Bell className="h-3.5 w-3.5" /> Dismiss
                          </Button>
                        )}
                        <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setEditTarget(c)}>
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={busyId === c.id}
                          onClick={() => remove(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}

      <CloseLocationDialog open={addOpen} onOpenChange={setAddOpen} userEmail={userEmail} onSaved={refresh} />
      <CloseLocationDialog
        open={Boolean(editTarget)}
        onOpenChange={(v) => !v && setEditTarget(null)}
        closure={editTarget}
        userEmail={userEmail}
        onSaved={refresh}
      />
    </div>
  );
}
