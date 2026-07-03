import Link from "next/link";
import { ArrowRight, ClipboardList, AlertTriangle, CalendarClock, CheckCircle2, Link2, UserX, Clock3, BookOpen, Flame } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { computeClientStats } from "@/lib/client-hub";
import { getOnboardingOverviewStats } from "@/lib/hubspot";
import { getOpsGuideOverviewStats } from "@/lib/ops-guide-server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const supabase = createClient();
  const [{ data: locations, error }, onboardingStats, opsGuideStats] = await Promise.all([
    supabase.from("locations").select("*"),
    getOnboardingOverviewStats().catch(() => null),
    getOpsGuideOverviewStats().catch(() => null),
  ]);

  const stats = computeClientStats(locations ?? []);

  const STATS = [
    { label: "Active clients", value: stats.totalActive, icon: ClipboardList },
    { label: "At-risk openings", value: stats.atRisk, icon: AlertTriangle },
    { label: "Follow-ups due", value: stats.followUpsOverdue, icon: CalendarClock },
    { label: "Opened this month", value: stats.openedThisMonth, icon: CheckCircle2 },
  ];

  const ONBOARDING_STATS = onboardingStats
    ? [
        { label: "Total onboardings", value: onboardingStats.total, icon: Link2 },
        { label: "Opening this week", value: onboardingStats.openingThisWeek, icon: Clock3 },
        { label: "Overdue openings", value: onboardingStats.overdueOpenings, icon: AlertTriangle },
        { label: "Stuck / MIA", value: onboardingStats.stuck, icon: UserX },
      ]
    : [];


  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Client Opening Tracker summary at a glance.</p>
      </div>

      {error ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load stats: {error.message}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">HubSpot Onboarding</h2>
          <p className="text-sm text-muted-foreground">Live snapshot across Basic(+) and Pro/Auto(+) pipelines.</p>
        </div>
        <Link href="/dashboard/onboarding" className="flex items-center gap-1 text-sm text-primary hover:underline">
          View Board <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {onboardingStats === null ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load HubSpot stats — try refreshing.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ONBOARDING_STATS.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.label}
                  </CardTitle>
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">OPS Guide</h2>
          <p className="text-sm text-muted-foreground">Troubleshooting knowledge base at a glance.</p>
        </div>
        <Link href="/dashboard/ops-guide" className="flex items-center gap-1 text-sm text-primary hover:underline">
          Open Guide <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {opsGuideStats === null ? (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          Failed to load OPS Guide stats — try refreshing.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Articles</CardTitle>
              <BookOpen className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{opsGuideStats.totalArticles}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Most viewed (30d)</CardTitle>
              <Flame className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {opsGuideStats.mostViewedTitle ? (
                <>
                  <div className="truncate text-lg font-bold">{opsGuideStats.mostViewedTitle}</div>
                  <p className="text-xs text-muted-foreground">{opsGuideStats.mostViewedCount} views</p>
                </>
              ) : (
                <div className="text-2xl font-bold text-muted-foreground">—</div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
