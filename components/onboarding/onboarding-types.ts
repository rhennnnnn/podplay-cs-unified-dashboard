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
    membership_presale_date: string | null;
    hs_createdate: string;
    hs_lastmodifieddate: string;
  };
  contact: { id: string; name: string; email: string | null } | null;
  company: { id: string; name: string | null; domain: string | null } | null;
  lastEmail: { timestamp: string; direction: string } | null;
}

export interface DealsResponse {
  pipeline: string;
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

// Full per-row MRP record (every mapped column except "Progress Bar").
export interface MrpRecordDto {
  club: string;
  customer: string | null;
  tier: string | null;
  courts: string | null;
  status: string | null;
  progress: string | null;
  appStatus: string | null;
  billingStatus: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  installer: string | null;
  installerPhone: string | null;
  installerEmail: string | null;
  hardwareDeliveryDate: string | null;
  daysRemaining: string | null;
  softOpening: string | null;
  grandOpening: string | null;
  dateEntered: string | null;
  origHardwareDeliveryRequest: string | null;
  ppHardwareBox1Shipped: string | null;
  ppHardwareBox1Delivered: string | null;
  ppHardwareBox2Shipped: string | null;
  ppHardwareBox2Delivered: string | null;
  ppHardwareBox3Shipped: string | null;
  ppHardwareBox3Delivered: string | null;
  dropship1Ordered: string | null;
  dropship1Delivered: string | null;
  dropship2Ordered: string | null;
  dropship2Delivered: string | null;
  installStart: string | null;
  installEnd: string | null;
  inventoryCheck: string | null;
}

export interface MrpJoinedResponse {
  record: { companyName: string; mrp: MrpRecordDto | null } | null;
  mrpStatus: "active" | "unresponsive" | "broken" | "down" | "not_configured" | "access_pending" | null;
}

export interface OnboardingSyncRefreshResponse {
  hubspot: "ran" | "skipped" | "error";
  mrp: "ran" | "skipped" | "error";
  // Auto-import sweep run as part of the refresh (17B). null if it errored.
  importSync: {
    imported: number;
    importScanned: number;
    importCapped: boolean;
    importSkippedPaused: boolean;
  } | null;
  // Field-level LWW sync run as part of the refresh (17A). null if it errored.
  fieldSync: { overwritten: number; fieldsChanged: number } | null;
  nextRefreshAllowedAt: string | null;
  // Per-stage wall-clock (17E) — surfaced for diagnosing timeout risk against
  // Vercel Hobby's 10s cap. Present on a successful response.
  timingMs?: { snapshot: number; import: number; field: number; total: number };
}

export interface ActivityResponse {
  activity: {
    type: "note" | "email" | "call" | "task";
    timestamp: string;
    ownerId: string | null;
    preview: string;
  }[];
}
