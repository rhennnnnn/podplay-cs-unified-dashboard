"use client";

import * as React from "react";
import useSWR from "swr";
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
import type { DealsResponse, OnboardingListItem, OwnersResponse } from "@/components/onboarding/onboarding-types";

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
});

// Auto-refresh every 30 minutes — HubSpot data here doesn't change fast enough
// to warrant tighter polling, and the manual refresh button covers "I need
// this now." The API routes also cache each query server-side (see
// lib/hubspot.ts withCache) so this and focus-revalidation hit that cache —
// not HubSpot directly — when more than one CSA is on the same pipeline/filter.
const REFRESH_INTERVAL = 30 * 60_000;
const COOLDOWN_SECONDS = 60;

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
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [cooldown, setCooldown] = React.useState(0);
  const [, forceTick] = React.useState(0);

  // "Updated Xs ago" would otherwise freeze until the next poll/re-render —
  // tick every second purely to recompute that label live.
  React.useEffect(() => {
    const t = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const dealsKey = React.useMemo(() => {
    const params = new URLSearchParams({ pipeline });
    if (owner !== "all") params.set("owner", owner);
    if (search) params.set("search", search);
    return `/api/hubspot/deals?${params.toString()}`;
  }, [pipeline, owner, search]);

  const { data, error, isLoading, mutate } = useSWR<DealsResponse>(dealsKey, fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    dedupingInterval: 15_000,
    keepPreviousData: true,
    onSuccess: () => setLastRefreshed(new Date()),
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

  async function handleManualRefresh() {
    if (cooldown > 0) return;
    await mutate();
    setCooldown(COOLDOWN_SECONDS);
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
              {lastRefreshed ? `Updated ${formatRelativeTime(lastRefreshed.toISOString())}` : "Loading…"}
            </span>
            <Button size="sm" variant="outline" disabled={cooldown > 0} onClick={handleManualRefresh} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {cooldown > 0 ? `Refresh (${cooldown}s)` : "Refresh"}
            </Button>
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
