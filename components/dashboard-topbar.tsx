"use client";

import { usePathname } from "next/navigation";

import { GlobalSearch } from "@/components/global-search";
import { ThemeToggle } from "@/components/theme-toggle";

// Route -> page title/subtitle for the top app bar. Most specific paths first.
const PAGES: { prefix: string; title: string; subtitle: string }[] = [
  {
    prefix: "/dashboard/clients",
    title: "Client Opening Tracker",
    subtitle: "Track location opening dates, status, and CS follow-ups.",
  },
  {
    prefix: "/dashboard/onboarding",
    title: "HubSpot Onboarding",
    subtitle: "Read-only board synced from HubSpot.",
  },
  {
    prefix: "/dashboard/ops-guide",
    title: "OPS Guide",
    subtitle: "Internal troubleshooting knowledge base.",
  },
  {
    prefix: "/dashboard/settings/accounts",
    title: "Team",
    subtitle: "Every login that can sign in shows here — add or remove access as needed.",
  },
  {
    prefix: "/dashboard/settings/api-health",
    title: "API Health",
    subtitle: "Live status, usage, and polling controls for external APIs.",
  },
  {
    prefix: "/dashboard",
    title: "Overview",
    subtitle: "Everything across Client Hub, HubSpot, and OPS at a glance.",
  },
];

export function DashboardTopbar() {
  const pathname = usePathname() ?? "";
  const page = PAGES.find((p) => pathname === p.prefix || pathname.startsWith(`${p.prefix}/`));

  if (!page) return null;

  return (
    <header className="flex shrink-0 flex-col gap-3 border-b border-border bg-card px-4 py-4 md:flex-row md:items-center md:gap-4 md:px-8">
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">{page.title}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{page.subtitle}</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 md:w-72 md:flex-none md:shrink-0">
          <GlobalSearch />
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}
