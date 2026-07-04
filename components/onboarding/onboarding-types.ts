export interface OnboardingListItem {
  id: string;
  properties: {
    hs_name: string | null;
    hs_pipeline: string | null;
    hs_pipeline_stage: string | null;
    hubspot_owner_id: string | null;
    podplay_tier: string | null;
    deal_type: string | null;
    anticipated_opening: string | null;
    grand_opening: string | null;
    hs_createdate: string;
    hs_lastmodifieddate: string;
  };
  contact: { id: string; name: string; email: string | null } | null;
  company: { id: string; name: string | null; domain: string | null } | null;
  lastEmail: { timestamp: string; direction: string } | null;
}

export interface DealsResponse {
  deals: OnboardingListItem[];
  after: string | null;
  total: number;
  fetchedAt: number | null;
  nextRefreshAllowedAt: string | null;
  manualRefreshPaused: boolean;
  pausedAll: boolean;
}

export interface OwnersResponse {
  owners: { id: string; firstName: string; lastName: string; email: string }[];
}

export interface DealDetailResponse {
  deal: { id: string; properties: Record<string, string | null>; createdAt: string; updatedAt: string };
  contacts: {
    id: string;
    firstname?: string | null;
    lastname?: string | null;
    email?: string | null;
    phone?: string | null;
    jobtitle?: string | null;
    num_conversion_events?: string | null;
    recent_conversion_event_name?: string | null;
    recent_conversion_date?: string | null;
    formSubmissions?: { title: string; timestamp: number; formId: string; submissionId: string }[];
  }[];
  companies: { id: string; name?: string | null; domain?: string | null; phone?: string | null }[];
  notes: { id: string; hs_note_body?: string | null; hs_timestamp?: string | null; hubspot_owner_id?: string | null }[];
}

export interface MrpJoinedResponse {
  record: { companyName: string; mrp: { clubName: string; hardwareDeliveryDate: string | null; deliveredStatus: string | null; installStartedStatus: string | null } | null } | null;
  mrpStatus: "active" | "unresponsive" | "broken" | "down" | "not_configured" | "access_pending" | null;
}

export interface OnboardingSyncRefreshResponse {
  hubspot: "ran" | "skipped" | "error";
  mrp: "ran" | "skipped" | "error";
  nextRefreshAllowedAt: string | null;
}

export interface ActivityResponse {
  activity: {
    type: "note" | "email" | "call" | "task";
    timestamp: string;
    ownerId: string | null;
    preview: string;
  }[];
}
