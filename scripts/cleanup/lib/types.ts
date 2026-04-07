/** Contact as returned by GET /contacts/{id} */
export interface GHLContactFull {
  id: string;
  firstName: string;
  lastName: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  customFields: { id: string; value: unknown }[];
  dateAdded: string;
  source: string | null;
}

/** Opportunity from GET /opportunities/search */
export interface GHLOpportunity {
  id: string;
  name: string;
  status: string;
  pipelineStageId: string;
  contact: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
    tags?: string[];
  };
}

/** Enriched contact with linked opportunities */
export interface ContactRecord {
  contactId: string;
  name: string;
  email: string | null;
  phone: string | null;
  tags: string[];
  customFields: { id: string; value: unknown }[];
  opportunities: { id: string; name: string; stageId: string; status: string }[];
  source: string | null;
  /** true if this contact came from the Buyer Pipeline scan */
  fromBuyerPipeline: boolean;
  /** true if this contact was found via old Contact Type scan */
  fromOldTypeScan: boolean;
}

/** Output of 01-fetch-data.ts */
export interface BuyerPipelineData {
  fetchedAt: string;
  totalOpportunities: number;
  uniqueContacts: number;
  contacts: ContactRecord[];
}

/** A single proposed change from an analyzer */
export interface ProposedChange {
  contactId: string;
  name: string;
  action: string;
  field: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
}

/** Output of each analyzer script */
export interface ProposedChangeFile {
  analyzer: string;
  analyzedAt: string;
  totalProposed: number;
  changes: ProposedChange[];
}

/** Result of applying changes to one contact */
export interface AppliedResult {
  contactId: string;
  name: string;
  success: boolean;
  error?: string;
  changes: ProposedChange[];
  payload: { tags?: string[]; customFields?: { id: string; value: unknown }[] };
}

/** Output of 06-merge-and-apply.ts */
export interface AppliedChangesFile {
  appliedAt: string;
  dryRun: boolean;
  totalContacts: number;
  totalSuccess: number;
  totalFailed: number;
  totalSkipped: number;
  results: AppliedResult[];
}
