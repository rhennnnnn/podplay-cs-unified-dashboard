"use client";

import * as React from "react";
import useSWR from "swr";
import { CheckCircle2, CheckSquare, Circle, ExternalLink, Mail, PhoneCall, StickyNote } from "lucide-react";

import {
  FORM_CHECKLIST_ITEMS,
  formatDateWithRelative,
  formatRelativeTime,
  getFormSubmissionUrl,
  getPipelineById,
  isFormChecked,
  TIER_LABEL,
  type HubspotOwner,
} from "@/lib/hubspot";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityResponse, DealDetailResponse, MrpJoinedResponse, OnboardingListItem } from "@/components/onboarding/onboarding-types";

const PORTAL_ID = "44006894";
const ACTIVITY_ICON = { note: StickyNote, email: Mail, call: PhoneCall, task: CheckSquare };

const fetcher = (url: string) => fetch(url).then(async (res) => {
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Request failed");
  return json;
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm">{value || "—"}</p>
    </div>
  );
}

interface OnboardingDetailSheetProps {
  dealId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listItem: OnboardingListItem | null;
  ownerMap: Map<string, HubspotOwner>;
  isTracked: boolean;
  onTrackOpening: (deal: OnboardingListItem) => void;
}

export function OnboardingDetailSheet({
  dealId,
  open,
  onOpenChange,
  listItem,
  ownerMap,
  isTracked,
  onTrackOpening,
}: OnboardingDetailSheetProps) {
  const { data, isLoading } = useSWR<DealDetailResponse>(dealId ? `/api/hubspot/deals/${dealId}` : null, fetcher);
  const { data: activityData } = useSWR<ActivityResponse>(dealId ? `/api/hubspot/activity/${dealId}` : null, fetcher);
  // Prefer the company name already sitting in the board's list item — it's
  // available the instant the sheet opens, unlike data?.companies[0]?.name
  // which has to wait for the deal-detail fetch to resolve. This lets the MRP
  // fetch below start in parallel with deal-detail/activity instead of
  // waiting on deal-detail purely to learn a name we already had.
  // Many onboarding deals have no linked HubSpot company (e.g. "Court 918"),
  // so fall back to the deal name — it carries the same club identity the MRP
  // sheet's "Club" column uses, and matchByCompanyName is token-based.
  const companyName =
    listItem?.company?.name ??
    data?.companies[0]?.name ??
    listItem?.properties?.hs_name ??
    data?.deal.properties.hs_name ??
    null;
  // Reads the cached joined HubSpot+MRP result — not a fresh per-open Sheets
  // API call. One sync run (lib/onboarding-sync.ts) serves every open sheet.
  // Always fires (even with an empty company) once dealId is set, so the
  // route can still report the real mrpStatus (e.g. access_pending) instead
  // of the fetch silently never happening when a company name isn't known.
  const { data: mrpData, error: mrpError, isLoading: mrpLoading } = useSWR<MrpJoinedResponse>(
    dealId ? `/api/mrp?company=${encodeURIComponent(companyName ?? "")}` : null,
    fetcher
  );
  const [trackedLocationId, setTrackedLocationId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isTracked || !dealId) {
      setTrackedLocationId(null);
      return;
    }
    const supabase = createClient();
    supabase
      .from("locations")
      .select("id")
      .eq("hubspot_deal_id", dealId)
      .maybeSingle()
      .then(({ data: loc }) => setTrackedLocationId((loc as { id: string } | null)?.id ?? null));
  }, [isTracked, dealId]);

  if (!dealId) return null;

  const props = data?.deal.properties;
  const pipeline = props?.hs_pipeline ? getPipelineById(props.hs_pipeline) : undefined;
  const owner = props?.hubspot_owner_id ? ownerMap.get(props.hubspot_owner_id) : undefined;
  const projectManager = props?.podplay_project_manager ? ownerMap.get(props.podplay_project_manager) : undefined;
  const closeDate = formatDateWithRelative(props?.grand_opening ?? props?.anticipated_opening ?? null);
  const contact = data?.contacts[0];
  const company = data?.companies[0];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
        {isLoading || !data ? (
          <div className="space-y-4 pr-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <div className="space-y-6 pr-2">
            {/* Section 1 — Header */}
            <div className="pr-8">
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">{props?.hs_name || "(unnamed onboarding)"}</h2>
                <a
                  href={`https://app.hubspot.com/contacts/${PORTAL_ID}/record/0-162/${dealId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant="secondary">{pipeline?.label ?? "Unknown pipeline"}</Badge>
                {props?.podplay_tier && <Badge variant="outline">{TIER_LABEL[props.podplay_tier] ?? props.podplay_tier}</Badge>}
              </div>

              {pipeline && (
                <div className="mt-4 flex items-center gap-1 overflow-x-auto pb-1">
                  {pipeline.stages
                    .filter((s) => s.label !== "MIA/No Response")
                    .map((s) => {
                      const isCurrent = s.id === props?.hs_pipeline_stage;
                      return (
                        <div
                          key={s.id}
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
                            isCurrent ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                          )}
                        >
                          {s.label}
                        </div>
                      );
                    })}
                </div>
              )}

              <div className="mt-4 grid grid-cols-2 gap-4">
                <Field label="Owner" value={owner ? `${owner.firstName} ${owner.lastName}`.trim() : null} />
                <Field
                  label="Opening Date"
                  value={
                    closeDate ? (
                      <span className={closeDate.overdue ? "text-destructive" : ""}>
                        {closeDate.absolute} {closeDate.overdue && "(overdue)"}
                      </span>
                    ) : null
                  }
                />
                {projectManager && (
                  <Field label="Project Manager" value={`${projectManager.firstName} ${projectManager.lastName}`.trim()} />
                )}
              </div>
            </div>

            {/* Section 2 — Track Client's Opening (kept near the top — it's the
                one write action on this otherwise read-only sheet) */}
            <div className="rounded-xl bg-accent/10 p-4">
              <p className="font-medium">Track This Client&apos;s Opening</p>
              <p className="text-sm text-muted-foreground">Add this onboarding to the Client Opening Tracker.</p>
              {isTracked ? (
                <div className="mt-3 flex items-center gap-2">
                  <Badge>Already tracked</Badge>
                  {trackedLocationId && (
                    <a href="/dashboard/clients" className="text-sm text-primary hover:underline">
                      View in tracker
                    </a>
                  )}
                </div>
              ) : (
                <Button
                  className="mt-3 w-full"
                  onClick={() => listItem && onTrackOpening(listItem)}
                  disabled={!listItem}
                >
                  Create Tracker Entry
                </Button>
              )}
            </div>

            <Separator className="bg-sidebar-border" />

            {/* Section 3 — Contact & Company */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Contact & Company</p>
              {contact ? (
                <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                      {[contact.firstname?.[0], contact.lastname?.[0]].filter(Boolean).join("") || "?"}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium">{[contact.firstname, contact.lastname].filter(Boolean).join(" ") || "Unnamed contact"}</p>
                      {contact.jobtitle && <p className="truncate text-xs text-muted-foreground">{contact.jobtitle}</p>}
                    </div>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {contact.email && (
                      <a href={`mailto:${contact.email}`} className="text-primary hover:underline">
                        {contact.email}
                      </a>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-primary hover:underline">
                        {contact.phone}
                      </a>
                    )}
                  </div>
                  <div className="mt-2 border-t pt-2">
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Forms Submitted
                    </p>
                    {contact.formSubmissions && contact.formSubmissions.length > 0 ? (
                      <ul className="space-y-1">
                        {contact.formSubmissions.map((sub, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{sub.title}</span>
                            <a
                              href={getFormSubmissionUrl(PORTAL_ID, sub.formId, sub.submissionId)}
                              target="_blank"
                              rel="noreferrer"
                              className="flex shrink-0 items-center gap-1 text-primary hover:underline"
                            >
                              {new Date(sub.timestamp).toLocaleDateString()} <ExternalLink className="h-3 w-3" />
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-xs text-muted-foreground">No forms submitted yet.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No contact linked.</p>
              )}
              {company && (
                <div className="rounded-xl border bg-muted/30 p-4 text-sm">
                  <p className="font-medium">{company.name}</p>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {company.domain && (
                      <a
                        href={`https://${company.domain}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary hover:underline"
                      >
                        {company.domain}
                      </a>
                    )}
                    {company.phone && <span>{company.phone}</span>}
                  </div>
                </div>
              )}
            </div>

            <Separator className="bg-sidebar-border" />

            {/* Section 4 — Deal Details */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Onboarding Details</p>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Deal Type" value={props?.deal_type} />
                <Field label="Courts" value={props?.courts} />
                <Field label="Migration" value={props?.migration} />
                <Field label="Go Viral" value={props?.go_viral} />
                <Field label="Door Access" value={props?.door_access} />
                <Field label="Send CSAT Survey" value={props?.send_csat_survey} />
                <Field label="Membership Presale" value={props?.membership_presale_date} />
                <Field label="Hardware Delivery" value={props?.hardware_delivery_date} />
                <Field label="Hardware Configuration" value={props?.hardware_configuration_date} />
                <Field label="Installation Start" value={props?.installation_start_date} />
                <Field label="QC / Installation Complete" value={props?.qc_call_installation_complete} />
                <Field label="Camera Adjustment Call" value={props?.camera_adjustment_call} />
                <Field label="Internet Configuration Call" value={props?.internet_configuration_call} />
                <Field label="Kiosk/TV App" value={props?.kiosk_tv_app} />
                <Field label="Anticipated Opening" value={props?.anticipated_opening} />
                <Field label="Grand Opening" value={props?.grand_opening} />
                <Field label="Soft Open" value={props?.soft_open} />
                <Field label="Onboarding Completed" value={props?.onboarding_completed_date} />
                <Field label="iOS App" value={props?.ios_app} />
                <Field label="Android App" value={props?.android_app} />
                <Field label="Web App" value={props?.web_app} />
                <Field label="Stripe ID" value={props?.stripe_id} />
                <Field
                  label="Created"
                  value={data.deal.createdAt ? new Date(data.deal.createdAt).toLocaleDateString() : null}
                />
                <Field
                  label="Last Modified"
                  value={data.deal.updatedAt ? formatRelativeTime(data.deal.updatedAt) : null}
                />
              </div>
            </div>

            <Separator className="bg-sidebar-border" />

            {/* MRP — read-only, matched by company/club name. Reads the
                cached joined result (GET /api/mrp), never a live per-open
                Sheets call. Greenfield/Migration and Quotes come from
                HubSpot's own onboarding properties, not the MRP sheet. */}
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Deployment Status</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {mrpLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                ) : mrpError ? (
                  <p className="text-sm text-muted-foreground">MRP data unavailable.</p>
                ) : mrpData?.mrpStatus === "access_pending" ? (
                  <p className="text-sm text-muted-foreground">
                    MRP access pending — waiting on Google Sheets permission.
                  </p>
                ) : !mrpData?.record?.mrp ? (
                  <p className="text-sm text-muted-foreground">No matching MRP record found.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Customer" value={mrpData.record.mrp.customer} />
                    <Field label="Tier" value={mrpData.record.mrp.tier} />
                    <Field label="Courts" value={mrpData.record.mrp.courts} />
                    <Field
                      label="Status"
                      value={mrpData.record.mrp.status ? <Badge variant="secondary">{mrpData.record.mrp.status}</Badge> : null}
                    />
                    <Field
                      label="App Status"
                      value={mrpData.record.mrp.appStatus ? <Badge variant="secondary">{mrpData.record.mrp.appStatus}</Badge> : null}
                    />
                    <Field
                      label="Billing Status"
                      value={mrpData.record.mrp.billingStatus ? <Badge variant="secondary">{mrpData.record.mrp.billingStatus}</Badge> : null}
                    />
                    <Field label="Customer Email" value={mrpData.record.mrp.customerEmail} />
                    <Field label="Customer Phone" value={mrpData.record.mrp.customerPhone} />
                    <Field label="Installer" value={mrpData.record.mrp.installer} />
                    <Field label="Installer Phone" value={mrpData.record.mrp.installerPhone} />
                    <Field label="Installer Email" value={mrpData.record.mrp.installerEmail} />
                    <Field label="Hardware Delivery Date" value={mrpData.record.mrp.hardwareDeliveryDate} />
                    <Field label="Days Remaining" value={mrpData.record.mrp.daysRemaining} />
                    <Field label="Soft Opening" value={mrpData.record.mrp.softOpening} />
                    <Field label="Grand Opening" value={mrpData.record.mrp.grandOpening} />
                    <Field label="Date Entered" value={mrpData.record.mrp.dateEntered} />
                    <Field label="Orig. Hardware Delivery Request" value={mrpData.record.mrp.origHardwareDeliveryRequest} />
                    <Field label="PP Hardware Box 1 Shipped" value={mrpData.record.mrp.ppHardwareBox1Shipped} />
                    <Field label="PP Hardware Box 1 Delivered" value={mrpData.record.mrp.ppHardwareBox1Delivered} />
                    <Field label="PP Hardware Box 2 Shipped" value={mrpData.record.mrp.ppHardwareBox2Shipped} />
                    <Field label="PP Hardware Box 2 Delivered" value={mrpData.record.mrp.ppHardwareBox2Delivered} />
                    <Field label="PP Hardware Box 3 Shipped" value={mrpData.record.mrp.ppHardwareBox3Shipped} />
                    <Field label="PP Hardware Box 3 Delivered" value={mrpData.record.mrp.ppHardwareBox3Delivered} />
                    <Field label="Dropship 1 Ordered" value={mrpData.record.mrp.dropship1Ordered} />
                    <Field label="Dropship 1 Delivered" value={mrpData.record.mrp.dropship1Delivered} />
                    <Field label="Dropship 2 Ordered" value={mrpData.record.mrp.dropship2Ordered} />
                    <Field label="Dropship 2 Delivered" value={mrpData.record.mrp.dropship2Delivered} />
                    <Field label="Install Start" value={mrpData.record.mrp.installStart} />
                    <Field label="Install End" value={mrpData.record.mrp.installEnd} />
                    <Field label="Inventory Check" value={mrpData.record.mrp.inventoryCheck} />
                    <Field label="Greenfield / Migration" value={props?.migration} />
                    <Field label="Quotes" value={props?.quotes} />
                  </div>
                )}
              </CardContent>
            </Card>

            <Separator className="bg-sidebar-border" />

            {/* Forms & Resources — which onboarding forms/links are already on file */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Forms & Resources</p>
                {props && (
                  <span className="text-xs text-muted-foreground">
                    {FORM_CHECKLIST_ITEMS.filter((item) => isFormChecked(props[item.key])).length} of{" "}
                    {FORM_CHECKLIST_ITEMS.length} received
                  </span>
                )}
              </div>

              {(props?.env_link || props?.onboarding_deck || props?.linear_project) && (
                <div className="flex flex-wrap gap-2">
                  {props?.env_link && (
                    <a
                      href={props.env_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:underline"
                    >
                      Environment <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {props?.onboarding_deck && (
                    <a
                      href={props.onboarding_deck}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:underline"
                    >
                      Onboarding Deck <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {props?.linear_project && (
                    <a
                      href={props.linear_project}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-primary hover:underline"
                    >
                      Linear Project <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              <ul className="grid grid-cols-1 gap-x-4 gap-y-1.5 sm:grid-cols-2">
                {FORM_CHECKLIST_ITEMS.map((item) => {
                  const checked = props ? isFormChecked(props[item.key]) : false;
                  const link = item.linkKey ? props?.[item.linkKey] : null;
                  return (
                    <li key={item.key} className="flex items-center gap-1.5 text-sm">
                      {checked ? (
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-accent" />
                      ) : (
                        <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
                      )}
                      <span className={checked ? "" : "text-muted-foreground"}>{item.label}</span>
                      {checked && link && (
                        <a
                          href={link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                          aria-label={`Open link for ${item.label}`}
                        >
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>

            <Separator className="bg-sidebar-border" />

            {/* Section 5 — Recent Activity */}
            <div>
              <p className="mb-2 text-sm font-medium">Recent Activity</p>
              {!activityData ? (
                <div className="space-y-2">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : activityData.activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No recent activity recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {activityData.activity.map((item, i) => {
                    const Icon = ACTIVITY_ICON[item.type];
                    const itemOwner = item.ownerId ? ownerMap.get(item.ownerId) : undefined;
                    return (
                      <li key={i} className="flex gap-2 text-sm">
                        <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <div>
                          <p className="line-clamp-2">{item.preview || "(no content)"}</p>
                          <p className="text-xs text-muted-foreground">
                            {itemOwner ? `${itemOwner.firstName} ${itemOwner.lastName}`.trim() : "Unknown"} ·{" "}
                            {formatRelativeTime(item.timestamp)}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
