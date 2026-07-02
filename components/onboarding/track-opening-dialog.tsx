"use client";

import * as React from "react";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { tierToTrackerTier } from "@/lib/hubspot";
import type { Location, LocationStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { OnboardingListItem } from "@/components/onboarding/onboarding-types";

const TIER_OPTIONS = ["Basic (+)", "Pro/Auto (+)"];

function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "location"
  );
}

function toIsoDate(value: string | null | undefined): string {
  if (!value) return "";
  return value.slice(0, 10);
}

interface TrackOpeningDialogProps {
  deal: OnboardingListItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userEmail: string;
  trackerName: string;
  onTracked: (dealId: string) => void;
}

export function TrackOpeningDialog({ deal, open, onOpenChange, userEmail, trackerName, onTracked }: TrackOpeningDialogProps) {
  const [clientName, setClientName] = React.useState("");
  const [name, setName] = React.useState("");
  const [tier, setTier] = React.useState("");
  const [openingDate, setOpeningDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open && deal) {
      setClientName(deal.company?.name ?? "");
      setName(deal.properties.hs_name ?? "");
      setTier(tierToTrackerTier(deal.properties.podplay_tier));
      setOpeningDate(toIsoDate(deal.properties.grand_opening ?? deal.properties.anticipated_opening));
      setNotes("");
    }
  }, [open, deal]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!deal || !name.trim() || !openingDate) {
      toast.error("Location name and opening date are required.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    try {
      const id = slugify(name);

      const payload: Partial<Location> & { pre_open_done: boolean; post_open_done: boolean } = {
        id,
        client_name: clientName || null,
        name,
        tier: tier || null,
        opening_date: openingDate,
        tracker: trackerName || null,
        status: "on-track" as LocationStatus,
        notes: notes || null,
        hubspot_deal_id: deal.id,
        pre_open_done: false,
        post_open_done: false,
      };

      // Same @supabase/ssr `.insert()` typing defect worked around in Session 2's
      // client-form-dialog.tsx — payload itself is fully typed above.
      const { error } = await supabase.from("locations").insert(payload as never);
      if (error) throw error;

      await supabase.from("activity_log").insert({
        user_email: userEmail,
        action: "created",
        entity: `location:${id}`,
        details: `Created ${name} from HubSpot onboarding`,
      } as never);

      toast.success("Tracker entry created.");
      onTracked(deal.id);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create tracker entry.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Track This Client&apos;s Opening</DialogTitle>
          <DialogDescription>Pre-filled from HubSpot — all fields are editable before saving.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="client_name">Client Name</Label>
              <Input id="client_name" value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="name">Location</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="tier">Tier</Label>
              <Select value={tier} onValueChange={setTier}>
                <SelectTrigger id="tier">
                  <SelectValue placeholder="Select tier..." />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="opening_date">Opening Date</Label>
              <Input
                id="opening_date"
                type="date"
                required
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tracker">Tracking</Label>
            <Input id="tracker" value={trackerName} disabled />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Create Tracker Entry"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
