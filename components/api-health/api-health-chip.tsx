"use client";

import useSWR from "swr";
import Link from "next/link";

import type { ApiIntegration, ApiIntegrationStatus } from "@/lib/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

const NEEDS_ATTENTION: ApiIntegrationStatus[] = ["broken", "down", "unresponsive"];

// Admin-only — only ever mounted when the caller is an admin, since
// /api/admin/api-health itself is admin-gated.
export function ApiHealthChip() {
  const { data } = useSWR<{ integrations: ApiIntegration[] }>("/api/admin/api-health", fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });

  if (!data?.integrations) return null;

  const issues = data.integrations.filter(
    (i) =>
      NEEDS_ATTENTION.includes(i.status) ||
      (i.requests_limit_per_day && i.requests_used_today / i.requests_limit_per_day >= 0.9)
  );

  const dotColor = issues.length === 0 ? "bg-accent" : "bg-destructive";
  const label = issues.length === 0 ? "All APIs healthy" : `${issues.length} issue${issues.length > 1 ? "s" : ""}`;

  return (
    <Link
      href="/dashboard/settings/api-health"
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
    >
      <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      API Health — {label}
    </Link>
  );
}
