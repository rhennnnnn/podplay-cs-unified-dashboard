"use client";

import { ExternalLink, Mail, PhoneCall, StickyNote, CheckSquare } from "lucide-react";

import {
  formatDateWithRelative,
  formatLastActivity,
  getPipelineById,
  getStage,
  getStageBadgeColor,
  getStageProgress,
  TIER_LABEL,
  type ActivityItem,
  type HubspotOwner,
} from "@/lib/hubspot";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

const ACTIVITY_ICON = { note: StickyNote, email: Mail, call: PhoneCall, task: CheckSquare };

const PORTAL_ID = "44006894";

interface OnboardingCardProps {
  deal: OnboardingListItem;
  owner: HubspotOwner | undefined;
  lastActivity: ActivityItem[] | undefined;
  isTracked: boolean;
  onOpen: () => void;
  onTrackOpening: () => void;
}

export function OnboardingCard({ deal, owner, lastActivity, isTracked, onOpen, onTrackOpening }: OnboardingCardProps) {
  const { properties } = deal;
  const pipeline = properties.hs_pipeline ? getPipelineById(properties.hs_pipeline) : undefined;
  const stage = pipeline && properties.hs_pipeline_stage ? getStage(pipeline.id, properties.hs_pipeline_stage) : undefined;
  const progress =
    pipeline && properties.hs_pipeline_stage ? getStageProgress(properties.hs_pipeline_stage, pipeline.id) : null;
  const closeDate = formatDateWithRelative(properties.grand_opening ?? properties.anticipated_opening);
  const activity = lastActivity ? formatLastActivity(lastActivity) : null;
  const ActivityIcon = activity ? ACTIVITY_ICON[activity.icon] : null;

  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="text-[11px]">
          {pipeline?.label ?? "Unknown pipeline"}
        </Badge>
        {stage && (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium",
              properties.hs_pipeline_stage && properties.hs_pipeline
                ? getStageBadgeColor(properties.hs_pipeline_stage, properties.hs_pipeline)
                : ""
            )}
          >
            {stage.label}
          </span>
        )}
        {properties.podplay_tier && (
          <Badge variant="outline" className="text-[11px]">
            {TIER_LABEL[properties.podplay_tier] ?? properties.podplay_tier}
          </Badge>
        )}
      </div>

      <div>
        <h3 className="line-clamp-1 font-semibold" title={properties.hs_name ?? ""}>
          {properties.hs_name || "(unnamed onboarding)"}
        </h3>
        <p className="line-clamp-1 text-sm text-muted-foreground">
          {[deal.contact?.name, deal.company?.name].filter(Boolean).join(" · ") || "No contact linked"}
        </p>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-[10px] font-semibold text-accent-foreground dark:text-accent">
            {owner ? `${owner.firstName[0] ?? ""}${owner.lastName[0] ?? ""}` : "—"}
          </span>
          {owner ? `${owner.firstName} ${owner.lastName}`.trim() : "Unassigned"}
        </span>
        {closeDate && (
          <span className={closeDate.overdue ? "font-medium text-destructive" : ""}>
            {closeDate.overdue ? "overdue" : "opens"} {closeDate.absolute}
          </span>
        )}
      </div>

      {progress && (
        <div className="space-y-1">
          <Progress value={(progress.current / progress.total) * 100} className="h-1.5" />
          <p className="text-[11px] text-muted-foreground">
            Step {progress.current} of {progress.total}
          </p>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {ActivityIcon && <ActivityIcon className="h-3 w-3 shrink-0" />}
        {activity?.label ?? "No recent activity"}
      </p>

      <div className="mt-auto flex items-center gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onOpen} className="flex-1">
          View details
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a
            href={`https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-162/${deal.id}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
        <Button
          size="sm"
          variant={isTracked ? "secondary" : "default"}
          disabled={isTracked}
          onClick={(e) => {
            e.stopPropagation();
            onTrackOpening();
          }}
        >
          {isTracked ? "Tracked" : "Track Opening"}
        </Button>
      </div>
    </Card>
  );
}
