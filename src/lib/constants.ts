export const TEAM_MEMBERS = ["Bobby", "Karla", "Tammy"] as const;
export type TeamMember = (typeof TEAM_MEMBERS)[number];

export const PRIORITIES = ["high", "medium", "low"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const STATUSES = ["open", "in_progress", "completed", "cancelled"] as const;
export type Status = (typeof STATUSES)[number];

export const SOURCES = ["ai_extracted", "manual"] as const;
export type Source = (typeof SOURCES)[number];

export const CATEGORIES = [
  "crm_feature",
  "crm_bug",
  "idea",
  "growth_learning",
  "deal_update",
  "general",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  crm_feature: "CRM Features",
  crm_bug: "CRM Bugs",
  idea: "Ideas",
  growth_learning: "Growth/Learning",
  deal_update: "Deal Updates",
  general: "General",
};

export const CONFIDENCE_THRESHOLDS = {
  high: 0.8,
  medium: 0.5,
} as const;

export const MAX_REPROCESS_COUNT = 3;
