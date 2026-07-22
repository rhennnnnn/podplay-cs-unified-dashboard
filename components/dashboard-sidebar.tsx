"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home,
  ClipboardList,
  Link2,
  Wrench,
  Users,
  LogOut,
  Menu,
  Activity,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const COLLAPSE_KEY = "podplay-sidebar-collapsed";

const NAV_ITEMS = [
  { href: "/dashboard", label: "Overview", icon: Home },
  { href: "/dashboard/clients", label: "Client Opening Tracker", icon: ClipboardList },
  { href: "/dashboard/onboarding", label: "HubSpot Onboarding", icon: Link2 },
  { href: "/dashboard/ops-guide", label: "OPS Guide", icon: Wrench },
  { href: "/dashboard/settings/accounts", label: "Team", icon: Users },
];

const ADMIN_NAV_ITEM = { href: "/dashboard/settings/api-health", label: "API Health", icon: Activity };

// Turn "john.lester@podplay.app" into "John Lester" + initials "JL".
function displayNameFromEmail(email: string) {
  const local = (email.split("@")[0] ?? "").trim();
  const parts = local.split(/[._-]+/).filter(Boolean);
  const name = parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
  return name || email;
}

function initialsFromName(name: string) {
  const parts = name.trim().split(/\s+/);
  const initials = (parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "");
  return initials.toUpperCase() || "?";
}

function BrandMark({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className={cn("flex items-center gap-3 py-5", collapsed ? "justify-center px-2" : "px-5")}>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#2563eb] to-[#7c3aed] shadow-lg shadow-[#3b82f6]/25">
        <Globe className="h-5 w-5 text-white" />
      </div>
      {!collapsed && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-white">PodPlay CS</div>
          <div className="text-[11px] text-[#93a3c9]">Unified Dashboard</div>
        </div>
      )}
    </div>
  );
}

function NavLinks({
  onNavigate,
  isAdmin,
  collapsed,
}: {
  onNavigate?: () => void;
  isAdmin: boolean;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const items = isAdmin ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;

  return (
    <nav className={cn("flex flex-1 flex-col gap-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
      {items.map((item) => {
        const isActive =
          item.href === "/dashboard" ? pathname === item.href : pathname?.startsWith(item.href);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={collapsed ? item.label : undefined}
            className={cn(
              "flex items-center rounded-lg py-2.5 text-sm font-medium transition-colors",
              collapsed ? "justify-center px-2" : "gap-3 px-3",
              isActive ? "bg-white/10 text-white" : "text-[#93a3c9] hover:bg-white/5 hover:text-white"
            )}
          >
            <Icon className="h-[18px] w-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

function UserCard({
  email,
  loading,
  onSignOut,
  collapsed,
}: {
  email: string;
  loading: boolean;
  onSignOut: () => void;
  collapsed?: boolean;
}) {
  const name = displayNameFromEmail(email);
  const initials = initialsFromName(name);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-white/10 p-3">
        <div
          title={name}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-xs font-semibold text-white"
        >
          {initials}
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={onSignOut}
          aria-label="Sign out"
          title={loading ? "Signing out…" : "Sign out"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#93a3c9] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="border-t border-white/10 p-3">
      <div className="flex items-center gap-3 rounded-lg px-2 py-2">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-xs font-semibold text-white">
          {initials}
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-sm font-medium text-white">{name}</div>
          <div className="truncate text-xs text-[#93a3c9]">{email}</div>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={onSignOut}
          aria-label="Sign out"
          title={loading ? "Signing out…" : "Sign out"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#93a3c9] transition-colors hover:bg-white/10 hover:text-white disabled:opacity-50"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function SidebarBody({
  email,
  isAdmin,
  onNavigate,
  collapsed,
  onToggleCollapse,
}: {
  email: string;
  isAdmin: boolean;
  onNavigate?: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [signingOut, setSigningOut] = React.useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await supabase.auth.signOut();
    setSigningOut(false);
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="flex h-full flex-col bg-[#0F1B3D] dark:bg-[#0b142b] text-[#93a3c9]">
      <BrandMark collapsed={collapsed} />
      {onToggleCollapse && (
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          className={cn(
            "mb-1 flex items-center rounded-lg py-2 text-[#93a3c9] transition-colors hover:bg-white/5 hover:text-white",
            collapsed ? "mx-2 justify-center px-2" : "mx-3 gap-3 px-3"
          )}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-[18px] w-[18px] shrink-0" />
          ) : (
            <>
              <PanelLeftClose className="h-[18px] w-[18px] shrink-0" />
              <span className="text-sm font-medium">Collapse</span>
            </>
          )}
        </button>
      )}
      <NavLinks onNavigate={onNavigate} isAdmin={isAdmin} collapsed={collapsed} />
      <UserCard email={email} loading={signingOut} onSignOut={handleSignOut} collapsed={collapsed} />
    </div>
  );
}

export function DashboardSidebar({ email, isAdmin = false }: { email: string; isAdmin?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState(false);

  // Restore persisted collapsed state (survives full reloads; the layout itself
  // persists across client navigations).
  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === "1");
  }, []);

  function toggleCollapse() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  }

  return (
    <>
      <aside
        className={cn(
          "hidden h-full shrink-0 border-r border-white/10 transition-[width] duration-200 md:block",
          collapsed ? "w-20" : "w-64"
        )}
      >
        <SidebarBody
          email={email}
          isAdmin={isAdmin}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapse}
        />
      </aside>

      <div className="flex items-center gap-3 border-b border-white/10 bg-[#0F1B3D] dark:bg-[#0b142b] px-4 py-3 text-white md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="text-white hover:bg-white/10">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Open menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 border-none p-0">
            <SidebarBody email={email} isAdmin={isAdmin} onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-[#2563eb] to-[#7c3aed]">
            <Globe className="h-4 w-4 text-white" />
          </div>
          <span className="text-sm font-semibold">PodPlay CS</span>
        </div>
      </div>
    </>
  );
}
