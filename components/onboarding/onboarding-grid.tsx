"use client";

import * as React from "react";
import useSWR from "swr";
import { RefreshCw, Search, SlidersHorizontal } from "lucide-react";

import { formatRelativeTime, PIPELINE_MAP, type ActivityItem, type HubspotOwner } from "@/lib/hubspot";
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

const REFRESH_INTERVAL = 30_000;
const COOLDOWN_SECONDS = 60;

interface OnboardingGridProps {
  userEmail: string;
  trackerName: string;
  trackedDealIds: Set<string>;
}

export function OnboardingGrid({ userEmail, trackerName, trackedDealIds: initialTracked }: OnboardingGridProps) {
  const [pipeline, setPipeline] = React.useState<"all" | "basic" | "pro">("all");
  const [stage, setStage] = React.useState<string>("all");
  const [owner, setOwner] = React.useState<string>("all");
  const [searchInput, setSearchInput] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [selectedDealId, setSelectedDealId] = React.useState<string | null>(null);
  const [trackDeal, setTrackDeal] = React.useState<OnboardingListItem | null>(null);
  const [trackedIds, setTrackedIds] = React.useState(initialTracked);
  const [lastRefreshed, setLastRefreshed] = React.useState<Date | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

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
    if (stage !== "all") params.set("stage", stage);
    if (owner !== "all") params.set("owner", owner);
    if (search) params.set("search", search);
    return `/api/hubspot/deals?${params.toString()}`;
  }, [pipeline, stage, owner, search]);

  const { data, error, isLoading, mutate } = useSWR<DealsResponse>(dealsKey, fetcher, {
    refreshInterval: REFRESH_INTERVAL,
    revalidateOnFocus: true,
    dedupingInterval: 10_000,
    onSuccess: () => setLastRefreshed(new Date()),
  });

  const { data: ownersData } = useSWR<OwnersResponse>("/api/hubspot/owners", fetcher, {
    revalidateOnFocus: false,
  });
  const ownerMap = React.useMemo(() => {
    const map = new Map<string, HubspotOwner>();
    ownersData?.owners.forEach((o) => map.set(o.id, o));
    return map;
  }, [ownersData]);

  const deals = React.useMemo(() => data?.deals ?? [], [data]);
  const { data: activityMap } = useSWR(
    deals.length > 0 ? ["activity-batch", ...deals.map((d) => d.id)] : null,
    async () => {
      // Each activity fetch fans out to several HubSpot associations/batch-read calls —
      // firing one per card at once (up to 50) blows through HubSpot's rate limit and
      // comes back as 502s. Cap concurrency so a full grid page stays well under it.
      const CONCURRENCY = 5;
      const entries: (readonly [string, ActivityItem[]])[] = [];
      for (let i = 0; i < deals.length; i += CONCURRENCY) {
        const batch = deals.slice(i, i + CONCURRENCY);
        const results = await Promise.all(
          batch.map(async (d) => {
            try {
              const res = await fetch(`/api/hubspot/activity/${d.id}`);
              const json = await res.json();
              return [d.id, (json.activity as ActivityItem[]) ?? []] as const;
            } catch {
              return [d.id, [] as ActivityItem[]] as const;
            }
          })
        );
        entries.push(...results);
      }
      return new Map(entries);
    }
  );

  const availableStages = pipeline === "all" ? [] : PIPELINE_MAP[pipeline].stages;

  async function handleManualRefresh() {
    if (cooldown > 0) return;
    await mutate();
    setCooldown(COOLDOWN_SECONDS);
  }

  function handleTracked(dealId: string) {
    setTrackedIds((prev) => new Set(prev).add(dealId));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">HubSpot Onboarding</h1>
            <p className="text-sm text-muted-foreground">
              Live view of every onboarding across Basic(+) and Pro/Auto(+) — read-only from HubSpot.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {lastRefreshed ? `Last updated ${formatRelativeTime(lastRefreshed.toISOString())}` : "Loading…"}
            </span>
            <Button size="sm" variant="outline" disabled={cooldown > 0} onClick={handleManualRefresh} className="gap-1.5">
              <RefreshCw className="h-3.5 w-3.5" />
              {cooldown > 0 ? `Refresh (${cooldown}s)` : "Refresh"}
            </Button>
          </div>
        </div>

        <Tabs value={pipeline} onValueChange={(v) => { setPipeline(v as typeof pipeline); setStage("all"); }}>
          <TabsList>
            <TabsTrigger value="all">All Pipelines</TabsTrigger>
            <TabsTrigger value="basic">Basic (+)</TabsTrigger>
            <TabsTrigger value="pro">Pro/Auto (+)</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search deal or contact name…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={stage} onValueChange={setStage} disabled={pipeline === "all"}>
            <SelectTrigger className="w-[180px]">
              <SlidersHorizontal className="mr-1.5 h-3.5 w-3.5" />
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {availableStages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={owner} onValueChange={setOwner}>
            <SelectTrigger className="w-[180px]">
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
          {data && <Badge variant="secondary">{data.total} total</Badge>}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load — try refreshing.
          <Button size="sm" variant="outline" className="ml-3" onClick={() => mutate()}>
            Retry
          </Button>
        </div>
      )}

      {isLoading && !data && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 w-full rounded-xl" />
          ))}
        </div>
      )}

      {data && deals.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed p-12 text-center">
          <p className="font-medium">No onboardings match your filters</p>
          <p className="text-sm text-muted-foreground">Try clearing filters or search.</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-2"
            onClick={() => {
              setPipeline("all");
              setStage("all");
              setOwner("all");
              setSearchInput("");
            }}
          >
            Clear filters
          </Button>
        </div>
      )}

      {deals.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {deals.map((deal) => (
            <OnboardingCard
              key={deal.id}
              deal={deal}
              owner={deal.properties.hubspot_owner_id ? ownerMap.get(deal.properties.hubspot_owner_id) : undefined}
              lastActivity={activityMap?.get(deal.id)}
              isTracked={trackedIds.has(deal.id)}
              onOpen={() => setSelectedDealId(deal.id)}
              onTrackOpening={() => setTrackDeal(deal)}
            />
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
        onTracked={handleTracked}
      />
    </div>
  );
}
