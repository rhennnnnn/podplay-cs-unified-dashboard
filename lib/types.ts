export type LocationStatus = "on-track" | "at-risk" | "delayed" | "opened";

export interface Location {
  id: string;
  client_name: string | null;
  name: string;
  tier: string | null;
  opening_date: string;
  tracker: string | null;
  status: LocationStatus;
  notes: string | null;
  pre_open_done: boolean;
  post_open_done: boolean;
  opened_date: string | null;
  open_outcome: string | null;
  csa_owner: string | null;
  hubspot_deal_id: string | null;
}

export type ActivityAction = "created" | "updated" | "deleted" | "opened";

export interface ActivityLogEntry {
  id: number;
  created_at: string;
  user_email: string | null;
  action: ActivityAction;
  entity: string | null;
  details: string | null;
}

export interface Readiness {
  location_id: string;
  token: string;
  pct: number;
  updated_at: string;
  submitted_at: string | null;
}

export type ProfileRole = "default" | "admin";

export interface Profile {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: ProfileRole;
  created_by: string | null;
  created_at: string;
}

export const OPS_ARTICLE_CATEGORIES = [
  "Camera Coefficients",
  "Credit Card Terminal Setup",
  "IT Troubleshooting Manual",
  "Tech Support",
] as const;

export type OpsArticleCategory = (typeof OPS_ARTICLE_CATEGORIES)[number];

export interface OpsArticle {
  id: string;
  title: string;
  category: string;
  content: string;
  tags: string[];
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  published: boolean;
}

export type OpsArticleStub = Omit<OpsArticle, "content">;

export interface Database {
  public: {
    Tables: {
      locations: {
        Row: Location;
        Insert: Partial<Location> & { id: string; name: string; opening_date: string };
        Update: Partial<Location>;
        Relationships: [];
      };
      activity_log: {
        Row: ActivityLogEntry;
        Insert: Partial<ActivityLogEntry>;
        Update: Partial<ActivityLogEntry>;
        Relationships: [];
      };
      readiness: {
        Row: Readiness;
        Insert: Partial<Readiness> & { location_id: string; token: string };
        Update: Partial<Readiness>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string; first_name: string; last_name: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      ops_articles: {
        Row: OpsArticle;
        Insert: Partial<OpsArticle> & { title: string; category: string; content: string };
        Update: Partial<OpsArticle>;
        Relationships: [];
      };
    };
    Views: Record<never, never>;
    Functions: Record<never, never>;
    Enums: Record<never, never>;
    CompositeTypes: Record<never, never>;
  };
}
