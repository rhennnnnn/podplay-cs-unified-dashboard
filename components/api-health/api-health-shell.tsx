"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatRelativeTime } from "@/lib/hubspot";
import type { ApiIntegration, ApiIntegrationStatus } from "@/lib/types";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

const fetcher = (url: string) =>
  fetch(url).then(async (res) => {
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  });

const STATUS_META: Record<ApiIntegrationStatus, { label: string; variant: BadgeProps["variant"] }> = {
  active: { label: "Active", variant: "accent" },
  unresponsive: { label: "Unresponsive", variant: "amber" },
  broken: { label: "Broken", variant: "orange" },
  down: { label: "Down", variant: "destructive" },
  not_configured: { label: "Not configured", variant: "secondary" },
  // Informational, not an outage — a real permission gap (Sheets Viewer share
  // hasn't gone through yet), distinct from broken/down.
  access_pending: { label: "Waiting on Access", variant: "blue" },
};

const NEEDS_ATTENTION: ApiIntegrationStatus[] = ["broken", "down", "unresponsive"];

function usagePct(integration: ApiIntegration): number | null {
  if (!integration.requests_limit_per_day) return null;
  return Math.min(100, (integration.requests_used_today / integration.requests_limit_per_day) * 100);
}

interface ApiHealthShellProps {
  initialIntegrations: ApiIntegration[];
}

export function ApiHealthShell({ initialIntegrations }: ApiHealthShellProps) {
  // revalidateOnFocus keeps every open admin session/browser in sync: returning
  // to this tab picks up another admin's pause change immediately instead of
  // waiting out the 30s interval.
  const { data, mutate } = useSWR<{ integrations: ApiIntegration[] }>("/api/admin/api-health", fetcher, {
    fallbackData: { integrations: initialIntegrations },
    refreshInterval: 30_000,
    revalidateOnFocus: true,
  });

  const integrations = data?.integrations ?? initialIntegrations;

  const issues = integrations.filter((i) => NEEDS_ATTENTION.includes(i.status) || (usagePct(i) ?? 0) >= 90);

  async function patch(id: string, body: Record<string, unknown>) {
    // Run the PATCH *through* SWR's mutation so the toggle can't desync: the
    // 30s background revalidation (and any other tab's poll) is suspended for
    // the duration of this mutation, and the cache is populated from the
    // server's authoritative row — not blindly re-fetched afterward, where a
    // concurrent in-flight GET that started pre-write could clobber the new
    // value and snap the switch back (the "toggle twice to fix it" bug).
    try {
      await mutate(
        async (current) => {
          const res = await fetch(`/api/admin/api-health/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
          const json = await res.json();
          if (!res.ok) throw new Error(json.error || "Update failed");
          const base = current?.integrations ?? integrations;
          return { integrations: base.map((i) => (i.id === id ? (json.integration as ApiIntegration) : i)) };
        },
        {
          optimisticData: (current) => ({
            integrations: (current?.integrations ?? integrations).map((i) =>
              i.id === id ? { ...i, ...body } : i
            ),
          }),
          rollbackOnError: true,
          revalidate: false,
          populateCache: true,
        }
      );
      toast.success("Settings updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings.");
    }
  }

  return (
    <div className="space-y-6">
      {issues.length > 0 && (
        <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">
              {issues.length} integration{issues.length > 1 ? "s need" : " needs"} attention
            </p>
            <p className="text-destructive/80">
              {issues.map((i) => i.label).join(", ")} — check status, errors, or daily usage below.
            </p>
          </div>
        </div>
      )}

      {integrations.some((i) => i.id === "hubspot" || i.id === "mrp_sheets") && (
        <SyncIntervalControl
          integrations={integrations}
          onSaved={() => mutate()}
        />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} onPatch={(body) => patch(integration.id, body)} />
        ))}
      </div>
    </div>
  );
}

// HubSpot and MRP poll together — MRP is meaningless without a fresh HubSpot
// list to match against. One control sets auto_poll_interval_minutes on both
// rows at once; each card below keeps its own independent status/usage/error/
// pause toggles.
function SyncIntervalControl({
  integrations,
  onSaved,
}: {
  integrations: ApiIntegration[];
  onSaved: () => void;
}) {
  const hubspot = integrations.find((i) => i.id === "hubspot");
  const mrp = integrations.find((i) => i.id === "mrp_sheets");
  const current = hubspot?.auto_poll_interval_minutes ?? mrp?.auto_poll_interval_minutes ?? 30;
  const [minutes, setMinutes] = React.useState(String(current));
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setMinutes(String(current));
  }, [current]);

  async function handleSave() {
    const parsed = Number(minutes);
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast.error("Interval must be a whole number of minutes, at least 1.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/api-health/sync-interval", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes: parsed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      toast.success("Sync interval updated.");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update sync interval.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Onboarding Sync Interval</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          HubSpot and MRP poll together on this schedule — MRP always runs after HubSpot, never at the same instant.
        </p>
        <div className="flex items-center gap-2">
          <Label htmlFor="sync-interval" className="sr-only">
            Sync interval (minutes)
          </Label>
          <Input
            id="sync-interval"
            type="number"
            min={1}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="w-24"
          />
          <span className="text-sm text-muted-foreground">minutes</span>
          <Button size="sm" variant="outline" disabled={saving || minutes === String(current)} onClick={handleSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function IntegrationCard({
  integration,
  onPatch,
}: {
  integration: ApiIntegration;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const statusMeta = STATUS_META[integration.status];
  const pct = usagePct(integration);

  // blue = good, yellow = warning (80%+), red = critical (95%+). No limit
  // configured yet still gets a full blue bar — "no cap set" reads as good,
  // not as an empty/broken meter.
  const barColor = pct === null || pct < 80 ? "bg-blue-500" : pct >= 95 ? "bg-destructive" : "bg-amber-500";

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div>
          <CardTitle className="text-base">{integration.label}</CardTitle>
          {integration.updated_by && (
            <p className="mt-1 text-xs text-muted-foreground">Last changed by {integration.updated_by}</p>
          )}
        </div>
        <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {integration.requests_used_today} {integration.requests_used_today === 1 ? "request" : "requests"} today
              {integration.requests_limit_per_day !== null && ` / ${integration.requests_limit_per_day} limit`}
            </span>
            <span>{pct !== null ? `${Math.round(pct)}%` : "No daily limit set"}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: pct !== null ? `${pct}%` : "100%" }} />
          </div>
        </div>

        {integration.status === "access_pending" ? (
          <div className="rounded-md border border-blue-500/30 bg-blue-500/5 p-3 text-xs">
            <p className="font-medium text-blue-600 dark:text-blue-400">Waiting on Google Sheets Viewer access.</p>
            <p className="mt-0.5 text-muted-foreground">
              Code is wired up and calling the sheet — the share invite just hasn&apos;t been accepted yet. Nothing else
              in the app is affected.
            </p>
          </div>
        ) : (
          integration.last_error_message && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
              <p className="font-medium text-destructive">
                {integration.last_error_at ? formatRelativeTime(integration.last_error_at) : "Last error"}
              </p>
              <p className="mt-0.5 line-clamp-3 text-muted-foreground">{integration.last_error_message}</p>
            </div>
          )
        )}

        <div className="space-y-4">
          <ToggleRow
            label="Pause All Polling"
            description={
              integration.paused_all
                ? "Everything paused: no automatic or manual calls to this API will run."
                : "Kill switch — stops every automatic and manual call to this API immediately."
            }
            checked={integration.paused_all}
            onCheckedChange={(checked) => onPatch({ paused_all: checked })}
          />
          <ToggleRow
            label="Pause Auto Polling"
            description={
              integration.auto_poll_paused
                ? "Auto polling paused: the board only updates on manual refresh."
                : "Board refreshes automatically on its normal interval."
            }
            checked={integration.auto_poll_paused}
            onCheckedChange={(checked) => onPatch({ auto_poll_paused: checked })}
            disabled={integration.paused_all}
          />
          <ToggleRow
            label="Pause Manual Refresh"
            description={
              integration.manual_refresh_paused
                ? "Manual refresh paused: the Refresh button is disabled for everyone."
                : "CSAs can force a refresh anytime (60s shared cooldown)."
            }
            checked={integration.manual_refresh_paused}
            onCheckedChange={(checked) => onPatch({ manual_refresh_paused: checked })}
            disabled={integration.paused_all}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-0.5">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}
