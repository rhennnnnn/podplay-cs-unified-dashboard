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
  ClipboardList,
  ExternalLink,
  MoreHorizontal,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import {
  computeClientStats,
  formatDate,
  formatRelativeDays,
  isFollowUpOverdue,
  openReadinessChecklist,
  parseTracker,
} from "@/lib/client-hub";
import type { Location, LocationStatus } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
}

const STATUS_SORT_RANK: Record<LocationStatus, number> = {
  "on-track": 0,
  "at-risk": 1,
  delayed: 2,
  opened: 3,
};

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

interface ReadinessInfo {
  pct: number;
  token: string;
}

export function ClientsTable({ initialLocations, userEmail, loginRoster, rosterMap }: ClientsTableProps) {
  const [locations, setLocations] = React.useState<Location[]>(initialLocations);
  const [readinessByLocation, setReadinessByLocation] = React.useState<Record<string, ReadinessInfo>>({});
  const [tab, setTab] = React.useState<Tab>("active");
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

  const clients = React.useMemo(
    () => Array.from(new Set(locations.map((l) => l.client_name).filter(Boolean))) as string[],
    [locations]
  );

  const tiers = React.useMemo(
    () => Array.from(new Set(locations.map((l) => l.tier).filter(Boolean))) as string[],
    [locations]
  );

  // Roster = people who can log in, plus any name already on a record (legacy data, migrated or not).
  const trackerRoster = React.useMemo(
    () => Array.from(new Set([...loginRoster, ...locations.flatMap((l) => parseTracker(l.tracker))])),
    [locations, loginRoster]
  );

  // Location options are always scoped to the selected client.
  const locationOptions = React.useMemo(() => {
    const scoped = clientFilter === "all" ? locations : locations.filter((l) => l.client_name === clientFilter);
    return Array.from(new Set(scoped.map((l) => l.name)));
  }, [locations, clientFilter]);

  function handleClientFilterChange(value: string) {
    setClientFilter(value);
    setLocationFilter("all");
  }

  const filtered = React.useMemo(() => {
    return locations.filter((l) => {
      const isOpened = l.status === "opened";
      if (tab === "opened" && !isOpened) return false;
      if (tab === "active" && isOpened) return false;
      if (clientFilter !== "all" && l.client_name !== clientFilter) return false;
      if (locationFilter !== "all" && l.name !== locationFilter) return false;
      if (tierFilter !== "all" && l.tier !== tierFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const haystack = `${l.client_name ?? ""} ${l.name} ${l.tracker ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [locations, tab, clientFilter, locationFilter, tierFilter, search]);

  const stats = React.useMemo(() => computeClientStats(locations), [locations]);

  const columns = React.useMemo<ColumnDef<Location>[]>(() => {
    // Client Name / Location both sort by [client_name, name] so locations always stay grouped under their client.
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
          const dateStr = tab === "opened" ? row.original.opened_date : row.original.opening_date;
          const relative = formatRelativeDays(dateStr);
          return (
            <div>
              <div>{formatDate(dateStr)}</div>
              {relative && <div className="text-xs text-muted-foreground">{relative}</div>}
            </div>
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
      // Follow-up stays visible after a club opens too — post-open follow-up
      // (e.g. post-open call/check-in) still needs tracking past the opening date.
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
  }, [tab, readinessByLocation, userEmail]);

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
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Client Opening Tracker</h1>
          <p className="text-sm text-muted-foreground">
            Track client location opening dates, status, and CS tracking.
          </p>
        </div>
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
        <StatCard label="Total Active" value={stats.totalActive} icon={ClipboardList} />
        <StatCard label="At Risk" value={stats.atRisk} icon={AlertTriangle} />
        <StatCard label="Opening This Week" value={stats.openingThisWeek} icon={CalendarClock} />
        <StatCard label="Follow-ups Overdue" value={stats.followUpsOverdue} icon={AlertTriangle} />
        <StatCard label="Opened This Month" value={stats.openedThisMonth} icon={CheckCircle2} />
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

      <Card>
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
                  No clients match your filters.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
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
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <ClientDetailSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        location={(selected && locations.find((l) => l.id === selected.id)) ?? selected}
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
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
