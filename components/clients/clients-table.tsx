"use client";

import * as React from "react";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  ExternalLink,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Search,
  ShieldAlert,
  Truck,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  computeClientStats,
  formatDate,
  formatRelativeDays,
  isFollowUpOverdue,
  isOpenedThisMonth,
  isOpeningThisWeek,
  openReadinessChecklist,
} from "@/lib/client-hub";
import { getOpeningDateTier, OPENING_TIER_TEXT_CLASS, type OpeningDateTier } from "@/lib/opening-date-status";
import {
  boxShippedLateTier,
  boxSummary,
  getBoxCells,
  isNa,
  parseFlexDate,
  resolveHardwareDeliveryDate,
  shippedLateTier,
  startOfDay,
} from "@/lib/tracker-mrp";
import { computeRecommendedQcDate, qcConflict } from "@/lib/qc-date";
import type { MrpRecord } from "@/lib/mrp";
import type { Location, LocationStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusQuickEdit } from "@/components/clients/status-quick-edit";
import { ClientDetailSheet } from "@/components/clients/client-detail-sheet";
import { ClientFormDialog } from "@/components/clients/client-form-dialog";
import { DeleteClientDialog } from "@/components/clients/delete-client-dialog";

type Tab = "active" | "opened";

interface ClientsTableProps {
  initialLocations: Location[];
  userEmail: string;
  loginRoster: string[];
  rosterMap: Record<string, string>;
  mrpByLocation: Record<string, MrpRecord | null>;
}

const STATUS_SORT_RANK: Record<LocationStatus, number> = {
  "on-track": 0,
  "at-risk": 1,
  delayed: 2,
  opened: 3,
};

// Per-location computed alert flags — drives the conflict stat cards, row-level
// highlight and the red "missing" nudges. Recomputed from locations + MRP map.
interface RowFlags {
  missingOpening: boolean;
  missingHardware: boolean;
  hardwareLate: Exclude<OpeningDateTier, null> | null;
  qc: { tier: Exclude<OpeningDateTier, null>; message: string; daysFromOpening: number } | null;
  openingTier: OpeningDateTier;
  hardware: { value: string | null; source: "mrp" | "manual" | null };
  qcDate: Date | null;
}

function formatFlexDate(value: string | null): string {
  const d = parseFlexDate(value);
  if (!d) return value ?? "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function Missing() {
  return <span className={cn("inline-flex items-center gap-1", OPENING_TIER_TEXT_CLASS.overdue)}>
    <AlertTriangle className="h-3 w-3" />— (missing)
  </span>;
}

function SortableHeader({
  label,
  sorted,
  onClick,
}: {
  label: string;
  sorted: false | "asc" | "desc";
  onClick: () => void;
}) {
  const Icon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ArrowUpDown;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 hover:text-foreground"
    >
      {label}
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

function FollowUpTag({ label, done, overdue }: { label: string; done: boolean; overdue: boolean }) {
  const variant = done ? "default" : overdue ? "amber" : "secondary";
  return (
    <Badge variant={variant} className="gap-1 text-[10px]">
      {done && <Check className="h-2.5 w-2.5" />}
      {label}
    </Badge>
  );
}

// Compact + inline-expandable box group cell (Shipped or Delivered).
function BoxGroupCell({
  record,
  kind,
  expanded,
  onToggle,
}: {
  record: MrpRecord | null;
  kind: "shipped" | "delivered";
  expanded: boolean;
  onToggle: () => void;
}) {
  const cells = getBoxCells(record).filter((b) => b.applicable);
  if (!record || cells.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  const summary = boxSummary(record, kind);
  // Shipped-late coloring applies to the Shipped group only.
  const summaryTier = kind === "shipped" ? shippedLateTier(record) : null;
  const label = kind === "shipped" ? "Shipped" : "Delivered";

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-sm hover:text-foreground"
      >
        {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <span className={summaryTier ? OPENING_TIER_TEXT_CLASS[summaryTier] : ""}>
          {summary.done}/{summary.total} {label}
        </span>
      </button>
      {expanded && (
        <div className="mt-1.5 space-y-1 pl-4 text-xs">
          {cells.map((b) => {
            const raw = kind === "shipped" ? b.shipped : b.delivered;
            const boxTier = kind === "shipped" ? boxShippedLateTier(record, b.index) : null;
            const display = isNa(raw) ? (kind === "shipped" ? "not shipped" : "not delivered") : formatFlexDate(raw);
            return (
              <div key={b.index} className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Box {b.index}</span>
                <span className={boxTier ? OPENING_TIER_TEXT_CLASS[boxTier] : ""}>{display}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

interface ReadinessInfo {
  pct: number;
  token: string;
}

// Stat-card filter definitions. `tab` is the tab a card's rows live on — clicking
// a card auto-switches to that tab so the user never lands on a silent empty table.
type StatKey =
  | "total-active"
  | "at-risk"
  | "opening-week"
  | "followups"
  | "opened-month"
  | "conflicting"
  | "qc-conflict"
  | "hardware-late"
  | "missing-dates";

export function ClientsTable({
  initialLocations,
  userEmail,
  loginRoster,
  rosterMap,
  mrpByLocation,
}: ClientsTableProps) {
  const [locations, setLocations] = React.useState<Location[]>(initialLocations);
  const [readinessByLocation, setReadinessByLocation] = React.useState<Record<string, ReadinessInfo>>({});
  const [tab, setTab] = React.useState<Tab>("active");
  const [statFilter, setStatFilter] = React.useState<StatKey | null>(null);
  const [expanded, setExpanded] = React.useState<Record<string, boolean>>({});
  const [search, setSearch] = React.useState("");
  const [clientFilter, setClientFilter] = React.useState<string>("all");
  const [locationFilter, setLocationFilter] = React.useState<string>("all");
  const [tierFilter, setTierFilter] = React.useState<string>("all");
  const [sorting, setSorting] = React.useState<SortingState>([{ id: "date", desc: false }]);

  const [selected, setSelected] = React.useState<Location | null>(null);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Location | undefined>(undefined);
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Location | null>(null);

  React.useEffect(() => {
    refreshReadiness();
    const supabase = createClient();
    const channel = supabase
      .channel("locations-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "locations" }, () => {
        refresh();
      })
      .subscribe();
    const readinessChannel = supabase
      .channel("readiness-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "readiness" }, () => {
        refreshReadiness();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      supabase.removeChannel(readinessChannel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    const supabase = createClient();
    const { data, error } = await supabase.from("locations").select("*").order("opening_date");
    if (!error && data) setLocations(data);
  }

  async function refreshReadiness() {
    const supabase = createClient();
    const { data, error } = await supabase.from("readiness").select("*");
    if (error || !data) return;
    const rows = data as unknown as { location_id: string; pct: number; token: string }[];
    const map: Record<string, ReadinessInfo> = {};
    for (const r of rows) {
      map[r.location_id] = { pct: r.pct, token: r.token };
    }
    setReadinessByLocation(map);
  }

  async function handleOpenReadiness(locationId: string) {
    try {
      await openReadinessChecklist(locationId);
      refreshReadiness();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open readiness checklist.");
    }
  }

  // Compute alert flags per location once (MRP-aware). Guards on "opened" so
  // completed rows never light up conflict/missing styling.
  const flagsByLocation = React.useMemo(() => {
    const today = startOfDay(new Date());
    const map: Record<string, RowFlags> = {};
    for (const l of locations) {
      const mrp = mrpByLocation[l.id] ?? null;
      const completed = l.status === "opened";
      const hardware = resolveHardwareDeliveryDate(mrp, l.delivery_date);
      const qcDate = computeRecommendedQcDate(mrp);
      const conflict = completed ? null : qcConflict(qcDate, l.opening_date);
      map[l.id] = {
        missingOpening: !completed && !l.opening_date,
        missingHardware: !completed && hardware.value === null,
        hardwareLate: completed ? null : shippedLateTier(mrp, today),
        qc: conflict,
        openingTier: completed ? null : getOpeningDateTier(l.opening_date, completed),
        hardware,
        qcDate,
      };
    }
    return map;
  }, [locations, mrpByLocation]);

  // A row "needs attention" (row-level highlight, Part F) when any amber/red
  // signal is present — deliberately excludes the blue "upcoming" / green
  // "today" opening tiers, which are informational, not problems.
  const rowNeedsAttention = React.useCallback(
    (id: string) => {
      const f = flagsByLocation[id];
      if (!f) return false;
      return (
        f.missingOpening ||
        f.missingHardware ||
        f.hardwareLate !== null ||
        f.qc !== null ||
        f.openingTier === "late" ||
        f.openingTier === "overdue"
      );
    },
    [flagsByLocation]
  );

  const clients = React.useMemo(
    () => Array.from(new Set(locations.map((l) => l.client_name).filter(Boolean))) as string[],
    [locations]
  );

  const tiers = React.useMemo(
    () => Array.from(new Set(locations.map((l) => l.tier).filter(Boolean))) as string[],
    [locations]
  );

  const trackerRoster = loginRoster;

  const locationOptions = React.useMemo(() => {
    const scoped = clientFilter === "all" ? locations : locations.filter((l) => l.client_name === clientFilter);
    return Array.from(new Set(scoped.map((l) => l.name)));
  }, [locations, clientFilter]);

  function handleClientFilterChange(value: string) {
    setClientFilter(value);
    setLocationFilter("all");
  }

  // Predicate for each stat card (Total Active is the "clear" card, no predicate).
  const statMatches = React.useCallback(
    (key: StatKey, l: Location): boolean => {
      const f = flagsByLocation[l.id];
      switch (key) {
        case "at-risk":
          return l.status === "at-risk";
        case "opening-week":
          return isOpeningThisWeek(l);
        case "followups":
          return isFollowUpOverdue(l);
        case "opened-month":
          return isOpenedThisMonth(l);
        case "qc-conflict":
          return l.status !== "opened" && !!f?.qc;
        case "hardware-late":
          return l.status !== "opened" && f?.hardwareLate !== null;
        case "missing-dates":
          return l.status !== "opened" && (!!f?.missingOpening || !!f?.missingHardware);
        case "conflicting":
          return (
            l.status !== "opened" &&
            (!!f?.qc ||
              f?.hardwareLate !== null ||
              !!f?.missingOpening ||
              !!f?.missingHardware ||
              f?.openingTier === "late" ||
              f?.openingTier === "overdue")
          );
        default:
          return true;
      }
    },
    [flagsByLocation]
  );

  const filtered = React.useMemo(() => {
    return locations.filter((l) => {
      const isOpened = l.status === "opened";
      if (tab === "opened" && !isOpened) return false;
      if (tab === "active" && isOpened) return false;
      if (clientFilter !== "all" && l.client_name !== clientFilter) return false;
      if (locationFilter !== "all" && l.name !== locationFilter) return false;
      if (tierFilter !== "all" && l.tier !== tierFilter) return false;
      if (statFilter && statFilter !== "total-active" && !statMatches(statFilter, l)) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${l.client_name ?? ""} ${l.name} ${l.tracker ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [locations, tab, clientFilter, locationFilter, tierFilter, statFilter, statMatches, search]);

  const stats = React.useMemo(() => computeClientStats(locations), [locations]);

  const conflictCounts = React.useMemo(() => {
    return {
      conflicting: locations.filter((l) => statMatches("conflicting", l)).length,
      qcConflict: locations.filter((l) => statMatches("qc-conflict", l)).length,
      hardwareLate: locations.filter((l) => statMatches("hardware-late", l)).length,
      missingDates: locations.filter((l) => statMatches("missing-dates", l)).length,
    };
  }, [locations, statMatches]);

  // Card tab ownership — Opened This Month lives on the Opened tab; everything
  // else is an Active-tab concept.
  const cardTab: Record<StatKey, Tab> = {
    "total-active": "active",
    "at-risk": "active",
    "opening-week": "active",
    followups: "active",
    "opened-month": "opened",
    conflicting: "active",
    "qc-conflict": "active",
    "hardware-late": "active",
    "missing-dates": "active",
  };

  function handleStatCard(key: StatKey) {
    if (key === "total-active") {
      setStatFilter(null);
      setTab("active");
      return;
    }
    const nextTab = cardTab[key];
    setTab(nextTab);
    setStatFilter((prev) => (prev === key ? null : key));
  }

  function toggleExpand(id: string, kind: "shipped" | "delivered") {
    const k = `${id}:${kind}`;
    setExpanded((prev) => ({ ...prev, [k]: !prev[k] }));
  }

  const columns = React.useMemo<ColumnDef<Location>[]>(() => {
    const groupedSort = (a: { original: Location }, b: { original: Location }) => {
      const client = (a.original.client_name ?? "").localeCompare(b.original.client_name ?? "");
      if (client !== 0) return client;
      return a.original.name.localeCompare(b.original.name);
    };

    const base: ColumnDef<Location>[] = [
      {
        header: ({ column }) => (
          <SortableHeader
            label="Client Name"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorKey: "client_name",
        sortingFn: groupedSort,
        cell: ({ row }) => row.original.client_name || "—",
      },
      {
        header: ({ column }) => (
          <SortableHeader
            label="Location"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorKey: "name",
        sortingFn: groupedSort,
      },
      {
        header: ({ column }) => (
          <SortableHeader
            label="Tier"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorKey: "tier",
        cell: ({ row }) => row.original.tier || "—",
      },
      {
        id: "date",
        header: ({ column }) => (
          <SortableHeader
            label={tab === "opened" ? "Opened Date" : "Opening Date"}
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorFn: (l) => (tab === "opened" ? l.opened_date : l.opening_date),
        cell: ({ row }) => {
          const l = row.original;
          const dateStr = tab === "opened" ? l.opened_date : l.opening_date;
          if (tab === "active" && !dateStr) {
            return <Missing />;
          }
          const relative = formatRelativeDays(dateStr);
          const tier = tab === "opened" ? null : getOpeningDateTier(l.opening_date, l.status === "opened");
          return (
            <div>
              <div className={tier ? OPENING_TIER_TEXT_CLASS[tier] : ""}>
                {formatDate(dateStr)}
                {tier === "overdue" && " (overdue)"}
              </div>
              {relative && <div className="text-xs text-muted-foreground">{relative}</div>}
            </div>
          );
        },
      },
      {
        id: "presale_date",
        header: ({ column }) => (
          <SortableHeader
            label="Pre-sale Date"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorFn: (l) => l.presale_date,
        cell: ({ row }) => (row.original.presale_date ? formatDate(row.original.presale_date) : "—"),
      },
      // Hardware Delivery Date — MRP-sourced, manual delivery_date fallback.
      {
        id: "hardware_delivery",
        header: ({ column }) => (
          <SortableHeader
            label="Hardware Delivery Date"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorFn: (l) => {
          const d = parseFlexDate(flagsByLocation[l.id]?.hardware.value ?? null);
          return d ? d.getTime() : 0;
        },
        cell: ({ row }) => {
          const f = flagsByLocation[row.original.id];
          const hw = f?.hardware ?? { value: null, source: null };
          if (!hw.value) {
            return row.original.status === "opened" ? <span className="text-muted-foreground">—</span> : <Missing />;
          }
          return (
            <div>
              <div>{formatFlexDate(hw.value)}</div>
              {hw.source === "manual" && <div className="text-xs text-muted-foreground">manual</div>}
            </div>
          );
        },
      },
      {
        id: "box_shipped",
        header: "PP Hardware Box Shipped",
        enableSorting: false,
        cell: ({ row }) => (
          <BoxGroupCell
            record={mrpByLocation[row.original.id] ?? null}
            kind="shipped"
            expanded={!!expanded[`${row.original.id}:shipped`]}
            onToggle={() => toggleExpand(row.original.id, "shipped")}
          />
        ),
      },
      {
        id: "box_delivered",
        header: "PP Hardware Box Delivered",
        enableSorting: false,
        cell: ({ row }) => (
          <BoxGroupCell
            record={mrpByLocation[row.original.id] ?? null}
            kind="delivered"
            expanded={!!expanded[`${row.original.id}:delivered`]}
            onToggle={() => toggleExpand(row.original.id, "delivered")}
          />
        ),
      },
      // Recommended QC Date — computed (Part E), with conflict tier + tooltip.
      {
        id: "qc_date",
        header: "Recommended QC Date",
        enableSorting: false,
        cell: ({ row }) => {
          const f = flagsByLocation[row.original.id];
          if (!f?.qcDate) return <span className="text-muted-foreground">—</span>;
          const label = f.qcDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
          return (
            <span
              className={f.qc ? OPENING_TIER_TEXT_CLASS[f.qc.tier] : ""}
              title={f.qc?.message}
            >
              {label}
            </span>
          );
        },
      },
      {
        header: ({ column }) => (
          <SortableHeader
            label="Tracking"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorKey: "tracker",
        cell: ({ row }) => row.original.tracker || "—",
      },
      {
        header: "Notes",
        accessorKey: "notes",
        enableSorting: false,
        cell: ({ row }) => (
          <span className="line-clamp-2 max-w-xs text-sm text-muted-foreground">
            {row.original.notes || "—"}
          </span>
        ),
      },
      {
        id: "readiness",
        header: "Readiness",
        enableSorting: false,
        cell: ({ row }) => {
          const info = readinessByLocation[row.original.id];
          return (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <Progress value={info?.pct ?? 0} className="h-1.5 w-16" />
              <span className="w-8 text-xs text-muted-foreground">{info?.pct ?? 0}%</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handleOpenReadiness(row.original.id)}
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          );
        },
      },
      {
        header: ({ column }) => (
          <SortableHeader
            label="Status"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorFn: (l) => STATUS_SORT_RANK[l.status],
        id: "status",
        cell: ({ row }) => (
          <StatusQuickEdit location={row.original} userEmail={userEmail} onChanged={refresh} />
        ),
      },
      {
        id: "followUp",
        header: ({ column }) => (
          <SortableHeader
            label="Follow-up"
            sorted={column.getIsSorted()}
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          />
        ),
        accessorFn: (l) => (isFollowUpOverdue(l) ? 1 : 0),
        cell: ({ row }) => {
          const l = row.original;
          const overdue = isFollowUpOverdue(l);
          return (
            <div className="flex gap-1">
              <FollowUpTag label="Pre" done={l.pre_open_done} overdue={overdue && !l.pre_open_done} />
              <FollowUpTag label="Post" done={l.post_open_done} overdue={overdue && !l.post_open_done} />
            </div>
          );
        },
      },
    ];

    base.push({
      id: "actions",
      header: "",
      enableSorting: false,
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={(e) => e.stopPropagation()}
              className="h-8 w-8"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setSelected(row.original);
                setSheetOpen(true);
              }}
            >
              View details
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setEditing(row.original);
                setFormOpen(true);
              }}
            >
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                setDeleting(row.original);
                setDeleteOpen(true);
              }}
            >
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });

    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, readinessByLocation, userEmail, mrpByLocation, flagsByLocation, expanded]);

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Button
          className="gap-2"
          onClick={() => {
            setEditing(undefined);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4" />
          Add Client
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          label="Total Active"
          value={stats.totalActive}
          icon={ClipboardList}
          active={statFilter === null}
          onClick={() => handleStatCard("total-active")}
        />
        <StatCard
          label="At Risk"
          value={stats.atRisk}
          icon={AlertTriangle}
          active={statFilter === "at-risk"}
          onClick={() => handleStatCard("at-risk")}
        />
        <StatCard
          label="Opening This Week"
          value={stats.openingThisWeek}
          icon={CalendarClock}
          active={statFilter === "opening-week"}
          onClick={() => handleStatCard("opening-week")}
        />
        <StatCard
          label="Follow-ups Overdue"
          value={stats.followUpsOverdue}
          icon={AlertTriangle}
          active={statFilter === "followups"}
          onClick={() => handleStatCard("followups")}
        />
        <StatCard
          label="Opened This Month"
          value={stats.openedThisMonth}
          icon={CheckCircle2}
          active={statFilter === "opened-month"}
          onClick={() => handleStatCard("opened-month")}
        />
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Data Health</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Conflicting Dates"
            value={conflictCounts.conflicting}
            icon={ShieldAlert}
            tone="alert"
            active={statFilter === "conflicting"}
            onClick={() => handleStatCard("conflicting")}
          />
          <StatCard
            label="QC-to-Opening Conflict"
            value={conflictCounts.qcConflict}
            icon={CalendarClock}
            tone="alert"
            active={statFilter === "qc-conflict"}
            onClick={() => handleStatCard("qc-conflict")}
          />
          <StatCard
            label="Hardware Not Shipped Past Delivery"
            value={conflictCounts.hardwareLate}
            icon={Truck}
            tone="alert"
            active={statFilter === "hardware-late"}
            onClick={() => handleStatCard("hardware-late")}
          />
          <StatCard
            label="Missing Required Dates"
            value={conflictCounts.missingDates}
            icon={PackageCheck}
            tone="alert"
            active={statFilter === "missing-dates"}
            onClick={() => handleStatCard("missing-dates")}
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="active">Active</TabsTrigger>
          <TabsTrigger value="opened">Opened</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:flex-wrap">
          <div className="relative flex-1 sm:min-w-[200px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by client, location, or tracking..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={clientFilter} onValueChange={handleClientFilterChange}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All clients</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={locationFilter} onValueChange={setLocationFilter}>
            <SelectTrigger className="sm:w-44">
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All locations</SelectItem>
              {locationOptions.map((l) => (
                <SelectItem key={l} value={l}>
                  {l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tierFilter} onValueChange={setTierFilter}>
            <SelectTrigger className="sm:w-40">
              <SelectValue placeholder="All tiers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tiers</SelectItem>
              {tiers.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {statFilter && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>Filtered by stat card.</span>
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setStatFilter(null)}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
                    {statFilter
                      ? "No rows match this stat card on this tab. Try clearing the filter or switching tabs."
                      : "No clients match your filters."}
                  </TableCell>
                </TableRow>
              ) : (
                table.getRowModel().rows.map((row) => {
                  const attention = tab === "active" && rowNeedsAttention(row.original.id);
                  return (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "cursor-pointer",
                        attention && "border-l-2 border-l-destructive/60 bg-destructive/[0.04]"
                      )}
                      onClick={() => {
                        setSelected(row.original);
                        setSheetOpen(true);
                      }}
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <ClientDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        location={(selected && locations.find((l) => l.id === selected.id)) ?? selected}
        mrpRecord={selected ? mrpByLocation[selected.id] ?? null : null}
        userEmail={userEmail}
        rosterMap={rosterMap}
        onEdit={(location) => {
          setSheetOpen(false);
          setEditing(location);
          setFormOpen(true);
        }}
        onChanged={refresh}
      />

      <ClientFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        location={editing}
        userEmail={userEmail}
        trackerRoster={trackerRoster}
        onSaved={refresh}
      />

      <DeleteClientDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        location={deleting}
        userEmail={userEmail}
        onDeleted={refresh}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
  active,
  onClick,
  tone = "default",
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  active?: boolean;
  onClick?: () => void;
  tone?: "default" | "alert";
}) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "cursor-pointer transition-colors hover:border-accent/60",
        active && "border-accent ring-1 ring-accent",
        tone === "alert" && value > 0 && "border-destructive/40"
      )}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className={cn("h-4 w-4 text-muted-foreground", tone === "alert" && value > 0 && "text-destructive")} />
      </CardHeader>
      <CardContent>
        <div className={cn("text-2xl font-bold", tone === "alert" && value > 0 && "text-destructive")}>{value}</div>
      </CardContent>
    </Card>
  );
}
