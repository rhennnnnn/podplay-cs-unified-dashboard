"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { ExternalLink, RefreshCw, Search } from "lucide-react";

import { formatRelativeTime, PIPELINE_MAP, type HubspotOwner } from "@/lib/hubspot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OnboardingCard } from "@/components/onboarding/onboarding-card";
import { OnboardingDetailSheet } from "@/components/onboarding/onboarding-detail-sheet";
import { TrackOpeningDialog } from "@/components/onboarding/track-opening-dialog";
import type { DealsResponse, OnboardingListItem, OnboardingSyncRefreshResponse, OwnersResponse } from "@/components/onboarding/onboarding-types";

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
});

// Fallback auto-refresh interval used only until /api/integrations/hubspot/polling
// resolves — after that, the interval (and whether auto-polling runs at all)
// comes from the shared api_integrations settings an admin controls. Focus/
// reconnect revalidation is intentionally OFF: tabbing in and out would
// otherwise trigger a fetch on every switch, and once the server cache TTL
// lapses that fetch hits HubSpot directly — the interval + manual refresh
// below are the only ways this ever re-fetches.
const REFRESH_INTERVAL = 30 * 60_000;

interface PollingSettings {
  autoPollIntervalMinutes: number;
  autoPollPaused: boolean;
  manualRefreshPaused: boolean;
  pausedAll: boolean;
  nextRefreshAllowedAt: string | null;
}

type PipelineKey = "basic" | "pro";
type SortMode = "recent" | "alpha" | "date";

interface OnboardingGridProps {
  userEmail: string;
  trackerName: string;
  trackerRoster: string[];
  trackedDealIds: Set<string>;
}

export function OnboardingGrid({
  userEmail,
  trackerName,
  trackerRoster,
  trackedDealIds: initialTracked,
}: OnboardingGridProps) {
  const [pipeline, setPipeline] = React.useState<PipelineKey>("basic");
  const [owner, setOwner] = React.useState<string>("all");
  const [sortMode, setSortMode] = React.useState<SortMode>("recent");
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selectedDealId, setSelectedDealId] = React.useState<string | null>(null);
  const [trackDeal, setTrackDeal] = React.useState<OnboardingListItem | null>(null);
  const [trackedIds, setTrackedIds] = React.useState(initialTracked);
  const [, forceTick] = React.useState(0);

  // "Updated Xs ago" and the cooldown countdown would otherwise freeze until
  // the next poll/re-render — tick every second purely to recompute those live.
  React.useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data: polling } = useSWR<PollingSettings>("/api/integrations/hubspot/polling", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  // MRP shares the same auto-poll interval as HubSpot (read above), but has
  // its own independent pause state — read separately so the board can show
  // "MRP sync skipped" without affecting the HubSpot half of a refresh.
  const { data: mrpPolling } = useSWR<PollingSettings>("/api/integrations/mrp_sheets/polling", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const [combinedNextRefreshAllowedAt, setCombinedNextRefreshAllowedAt] = React.useState<string | null>(null);
  const [mrpSkippedNote, setMrpSkippedNote] = React.useState(false);

  const dealsKey = React.useMemo(() => {
    const params = new URLSearchParams({ pipeline });
    if (owner !== "all") params.set("owner", owner);
    if (search) params.set("search", search);
    return `/api/hubspot/deals?${params.toString()}`;
  }, [pipeline, owner, search]);

  // Auto-refresh pauses entirely (refreshInterval 0) when an admin has paused
  // all polling or auto polling specifically; otherwise the interval comes
  // live from the shared api_integrations setting, not a hardcoded constant.
  const autoRefreshInterval = !polling
    ? REFRESH_INTERVAL
    : polling.pausedAll || polling.autoPollPaused
      ? 0
      : polling.autoPollIntervalMinutes * 60_000;

  const { data, error, isLoading, mutate } = useSWR<DealsResponse>(dealsKey, fetcher, {
    refreshInterval: autoRefreshInterval,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    dedupingInterval: 15_000,
    keepPreviousData: true,
  });

  const { data: ownersData } = useSWR<OwnersResponse>("/api/hubspot/owners", fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  const ownerMap = React.useMemo(() => {
    const map = new Map<string, HubspotOwner>();
    ownersData?.owners.forEach((o) => map.set(o.id, o));
    return map;
  }, [ownersData]);

  const deals = React.useMemo(() => {
    const list = data?.deals ?? [];
    const sorted = [...list];
    if (sortMode === "alpha") {
      sorted.sort((a, b) => (a.properties.hs_name ?? "").localeCompare(b.properties.hs_name ?? ""));
    } else if (sortMode === "date") {
      sorted.sort((a, b) => {
        const da = a.properties.grand_opening ?? a.properties.anticipated_opening;
        const db = b.properties.grand_opening ?? b.properties.anticipated_opening;
        if (!da && !db) return 0;
        if (!da) return 1;
        if (!db) return -1;
        return new Date(da).getTime() - new Date(db).getTime();
      });
    }
    // "recent" keeps the API's own hs_lastmodifieddate-desc order.
    return sorted;
  }, [data, sortMode]);
  const pipelineDef = PIPELINE_MAP[pipeline];

  const columns = React.useMemo(() => {
    return pipelineDef.stages.map((stage) => ({
      stage,
      deals: deals.filter((d) => d.properties.hs_pipeline_stage === stage.id),
    }));
  }, [pipelineDef, deals]);

  // Cooldown is derived from the server's shared next_refresh_allowed_at
  // (returned on every deals response, or the combined value from the last
  // onboarding-sync refresh — whichever is later) rather than a local click
  // timestamp, so every open tab's countdown reads identically and doesn't
  // re-enable until BOTH HubSpot and MRP are actually ready again.
  const effectiveNextRefreshAllowedAt = [data?.nextRefreshAllowedAt, combinedNextRefreshAllowedAt]
    .filter((t): t is string => Boolean(t))
    .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  const cooldownSeconds = effectiveNextRefreshAllowedAt
    ? Math.max(0, Math.ceil((new Date(effectiveNextRefreshAllowedAt).getTime() - Date.now()) / 1000))
    : 0;
  const manualRefreshDisabled =
    cooldownSeconds > 0 || Boolean(data?.manualRefreshPaused) || Boolean(data?.pausedAll) || Boolean(polling?.manualRefreshPaused) || Boolean(polling?.pausedAll);
  const manualRefreshReason = data?.pausedAll || polling?.pausedAll
    ? "All polling is paused by an admin."
    : data?.manualRefreshPaused || polling?.manualRefreshPaused
      ? "Manual refresh is paused by an admin."
      : undefined;

  async function handleManualRefresh() {
    if (manualRefreshDisabled) return;
    try {
      const params = new URLSearchParams({ pipeline });
      if (owner !== "all") params.set("owner", owner);
      if (search) params.set("search", search);
      const res = await fetch(`/api/onboarding-sync/refresh?${params.toString()}`, { method: "POST" });
      const json = (await res.json()) as OnboardingSyncRefreshResponse & { error?: string };
      if (!res.ok) {
        toast.error(json.error ?? "Refresh failed.");
        return;
      }
      setCombinedNextRefreshAllowedAt(json.nextRefreshAllowedAt);
      setMrpSkippedNote(json.mrp === "skipped");
      // The sync route already refreshed HubSpot's cache server-side — a
      // plain revalidate here now hits that warm cache instead of HubSpot.
      await mutate();
    } catch {
      toast.error("Refresh failed.");
    }
  }

  function handleTracked(dealId: string) {
    setTrackedIds((prev) => new Set(prev).add(dealId));
  }

  const hasAnyFilter = owner !== "all" || search.length > 0;

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">HubSpot Onboarding</h1>
            <p className="text-sm text-muted-foreground">Read-only board synced from HubSpot.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {data?.fetchedAt ? `Updated ${formatRelativeTime(new Date(data.fetchedAt).toISOString())}` : "Loading…"}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={manualRefreshDisabled}
              onClick={handleManualRefresh}
              className="gap-1.5"
              title={manualRefreshReason ?? (cooldownSeconds > 0 ? "Wait for the shared cooldown to clear." : undefined)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {cooldownSeconds > 0 ? `Refresh (${cooldownSeconds}s)` : "Refresh"}
            </Button>
            {(mrpSkippedNote || mrpPolling?.pausedAll || mrpPolling?.autoPollPaused) && (
              <span className="whitespace-nowrap text-xs text-muted-foreground">MRP sync skipped — paused</span>
            )}
            <Button size="sm" variant="outline" className="gap-1.5" asChild>
              <a href="https://app.hubspot.com/contacts/44006894/objects/0-162" target="_blank" rel="noreferrer">
                Open in HubSpot <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={pipeline} onValueChange={(v) => setPipeline(v as PipelineKey)}>
            <TabsList>
              <TabsTrigger value="basic">Basic (+)</TabsTrigger>
              <TabsTrigger value="pro">Pro/Auto (+)</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex flex-1 items-center justify-end gap-2">
            <div className="relative w-full max-w-[240px]">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search deal or contact…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={owner} onValueChange={setOwner}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="All Owners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {(ownersData?.owners ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.firstName} {o.lastName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortMode} onValueChange={(v) => setSortMode(v as SortMode)}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Sort" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Recently Updated</SelectItem>
                <SelectItem value="alpha">Alphabetical (A–Z)</SelectItem>
                <SelectItem value="date">Opening Date</SelectItem>
              </SelectContent>
            </Select>
            {data && <Badge variant="secondary">{deals.length} total</Badge>}
          </div>
        </div>
      </div>

      {error && !data && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load — try refreshing.
          <Button size="sm" variant="outline" className="ml-3" onClick={() => mutate()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && !data && (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-[60vh] w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      )}

      {data && deals.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">No onboardings match your filters</p>
          <p className="text-sm text-muted-foreground">Try clearing filters or search.</p>
          {hasAnyFilter && (
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => {
                setOwner("all");
                setSearchInput("");
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      {deals.length > 0 && (
        <div className="flex flex-1 gap-4 overflow-x-auto pb-4">
          {columns.map(({ stage, deals: stageDeals }) => (
            <div key={stage.id} className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30">
              <div className="flex items-center justify-between border-b px-3 py-2.5">
                <p className="truncate text-sm font-medium" title={stage.label}>
                  {stage.label}
                </p>
                <Badge variant="secondary" className="shrink-0">
                  {stageDeals.length}
                </Badge>
              </div>
              <div className="max-h-[65vh] min-h-[80px] space-y-2 overflow-y-auto p-2">
                {stageDeals.length === 0 ? (
                  <p className="px-2 py-4 text-center text-xs text-muted-foreground">No onboardings</p>
                ) : (
                  stageDeals.map((deal) => (
                    <OnboardingCard
                      key={deal.id}
                      deal={deal}
                      owner={deal.properties.hubspot_owner_id ? ownerMap.get(deal.properties.hubspot_owner_id) : undefined}
                      isTracked={trackedIds.has(deal.id)}
                      stageIsClosed={stage.isClosed}
                      onOpen={() => setSelectedDealId(deal.id)}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <OnboardingDetailSheet
        dealId={selectedDealId}
        open={selectedDealId !== null}
        onOpenChange={(open) => !open && setSelectedDealId(null)}
        listItem={deals.find((d) => d.id === selectedDealId) ?? null}
        ownerMap={ownerMap}
        isTracked={selectedDealId ? trackedIds.has(selectedDealId) : false}
        onTrackOpening={(deal) => setTrackDeal(deal)}
      />

      <TrackOpeningDialog
        deal={trackDeal}
        open={trackDeal !== null}
        onOpenChange={(open) => !open && setTrackDeal(null)}
        userEmail={userEmail}
        trackerName={trackerName}
        trackerRoster={trackerRoster}
        onTracked={handleTracked}
      />
    </div>
  );
}
