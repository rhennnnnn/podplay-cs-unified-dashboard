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
  const { data, mutate } = useSWR<{ integrations: ApiIntegration[] }>("/api/admin/api-health", fetcher, {
    fallbackData: { integrations: initialIntegrations },
    refreshInterval: 30_000,
    revalidateOnFocus: false,
  });

  const integrations = data?.integrations ?? initialIntegrations;

  const issues = integrations.filter((i) => NEEDS_ATTENTION.includes(i.status) || (usagePct(i) ?? 0) >= 90);

  async function patch(id: string, body: Record<string, unknown>) {
    // Optimistic update — reflect the change immediately, then reconcile
    // with the server's response (or roll back on error).
    const optimistic = {
      integrations: integrations.map((i) => (i.id === id ? { ...i, ...body } : i)),
    };
    await mutate(optimistic, { revalidate: false });

    try {
      const res = await fetch(`/api/admin/api-health/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Update failed");
      toast.success("Settings updated.");
      await mutate();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update settings.");
      await mutate();
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Health</h1>
        <p className="text-sm text-muted-foreground">
          Live status, usage, and polling controls for every external API this dashboard depends on.
        </p>
      </div>

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

      <div className="grid gap-4 lg:grid-cols-2">
        {integrations.map((integration) => (
          <IntegrationCard key={integration.id} integration={integration} onPatch={(body) => patch(integration.id, body)} />
        ))}
      </div>
    </div>
  );
}

function IntegrationCard({
  integration,
  onPatch,
}: {
  integration: ApiIntegration;
  onPatch: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [interval, setInterval] = React.useState(String(integration.auto_poll_interval_minutes));
  const [savingInterval, setSavingInterval] = React.useState(false);
  const statusMeta = STATUS_META[integration.status];
  const pct = usagePct(integration);

  React.useEffect(() => {
    setInterval(String(integration.auto_poll_interval_minutes));
  }, [integration.auto_poll_interval_minutes]);

  async function handleSaveInterval() {
    const parsed = Number(interval);
    if (!Number.isInteger(parsed) || parsed < 1) {
      toast.error("Interval must be a whole number of minutes, at least 1.");
      return;
    }
    setSavingInterval(true);
    await onPatch({ auto_poll_interval_minutes: parsed });
    setSavingInterval(false);
  }

  const barColor = pct === null ? "" : pct >= 95 ? "bg-destructive" : pct >= 80 ? "bg-amber-500" : "bg-accent";

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
            {pct !== null && <span>{Math.round(pct)}%</span>}
          </div>
          {pct !== null && (
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
            </div>
          )}
        </div>

        {integration.last_error_message && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <p className="font-medium text-destructive">
              {integration.last_error_at ? formatRelativeTime(integration.last_error_at) : "Last error"}
            </p>
            <p className="mt-0.5 line-clamp-3 text-muted-foreground">{integration.last_error_message}</p>
          </div>
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

        <div className="space-y-1.5 border-t pt-4">
          <Label htmlFor={`interval-${integration.id}`} className="text-xs text-muted-foreground">
            Auto-poll interval (minutes)
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`interval-${integration.id}`}
              type="number"
              min={1}
              value={interval}
              onChange={(e) => setInterval(e.target.value)}
              className="w-24"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={savingInterval || interval === String(integration.auto_poll_interval_minutes)}
              onClick={handleSaveInterval}
            >
              {savingInterval ? "Saving…" : "Save"}
            </Button>
          </div>
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
