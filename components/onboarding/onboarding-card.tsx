"use client";

import { CheckCircle2, ExternalLink, Mail } from "lucide-react";

import {
  EMAIL_DIRECTION_LABEL,
  formatDateWithRelative,
  formatRelativeTime,
  getLastEmailUrgency,
  TIER_LABEL,
  type HubspotOwner,
} from "@/lib/hubspot";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

const PORTAL_ID = "44006894";

const URGENCY_BORDER: Record<string, string> = {
  warning: "border-amber-500/60",
  critical: "border-destructive/70",
};

interface OnboardingCardProps {
  deal: OnboardingListItem;
  owner: HubspotOwner | undefined;
  isTracked: boolean;
  stageIsClosed: boolean;
  onOpen: () => void;
}

// Compact card for a single kanban column — click anywhere to open the detail
// Sheet, where the full properties and the Track Opening action live. Keeping
// this face minimal (no action buttons, no per-card HubSpot activity fetch)
// is what makes a full board of ~90 cards render without hammering rate limits.
export function OnboardingCard({ deal, owner, isTracked, stageIsClosed, onOpen }: OnboardingCardProps) {
  const { properties } = deal;
  // Card shows ONLY the confirmed Grand Opening Date — no anticipated-opening
  // fallback (that stays scoped to getEffectiveOpeningDate for the tracker sync,
  // overview stats, and alert logic). A blank grand opening renders as a neutral
  // "Missing" note, never an overdue/urgency flag.
  const grandOpening = formatDateWithRelative(properties.grand_opening ?? null);
  const urgency = getLastEmailUrgency(deal.lastEmail, stageIsClosed);

  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className={cn(
        "flex cursor-pointer flex-col gap-2 p-3 transition-colors hover:border-accent/50",
        URGENCY_BORDER[urgency]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug" title={properties.hs_name ?? ""}>
          {properties.hs_name || "(unnamed onboarding)"}
        </h3>
        <a
          href={`https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-162/${deal.id}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-muted-foreground hover:text-foreground"
          aria-label="View in HubSpot"
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>

      <p className="line-clamp-1 text-xs text-muted-foreground">
        {[deal.contact?.name, deal.company?.name].filter(Boolean).join(" · ") || "No contact linked"}
      </p>

      <div className="flex flex-wrap items-center gap-1.5">
        {properties.podplay_tier && (
          <Badge variant="outline" className="text-[10px]">
            {TIER_LABEL[properties.podplay_tier] ?? properties.podplay_tier}
          </Badge>
        )}
        {isTracked && (
          <Badge className="gap-1 text-[10px]">
            <CheckCircle2 className="h-3 w-3" />
            Tracked
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5 truncate">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[9px] font-semibold text-accent-foreground">
            {owner ? `${owner.firstName[0] ?? ""}${owner.lastName[0] ?? ""}` : "—"}
          </span>
          <span className="truncate">{owner ? `${owner.firstName} ${owner.lastName}`.trim() : "Unassigned"}</span>
        </span>
        {grandOpening ? (
          <span className={grandOpening.overdue && !stageIsClosed ? "shrink-0 font-medium text-destructive" : "shrink-0"}>
            {grandOpening.absolute}
          </span>
        ) : (
          <span className="shrink-0 text-muted-foreground">Missing Grand Opening Date</span>
        )}
      </div>

      {deal.lastEmail && (
        <a
          href={`https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-162/${deal.id}`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex items-center gap-1.5 text-[11px] hover:underline",
            urgency === "critical" ? "text-destructive" : urgency === "warning" ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
          )}
        >
          <Mail className="h-3 w-3 shrink-0" />
          {[
            EMAIL_DIRECTION_LABEL[deal.lastEmail.direction] ?? "Email",
            deal.lastEmail.senderName,
            formatRelativeTime(deal.lastEmail.timestamp),
          ]
            .filter(Boolean)
            .join(" - ")}
        </a>
      )}
    </Card>
  );
}
