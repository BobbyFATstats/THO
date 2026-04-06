# Buyer Blast Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an automated buyer SMS blast agent triggered by GHL opportunity stage changes, with drip sending, tier-aware rate limiting, and bilingual template support.

**Architecture:** Vercel webhook receives GHL stage-change event, triggers a Trigger.dev long-running task. The task fetches deal details + buyer list from GHL, sends personalized SMS via GHL Conversations API with drip pacing, and tracks everything in Supabase. A second webhook receives delivery status updates.

**Tech Stack:** Next.js (Vercel), Trigger.dev v3, Supabase (PostgreSQL), GHL REST API, TypeScript

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `trigger.config.ts` | Create | Trigger.dev project config |
| `supabase/migrations/005_buyer_blast.sql` | Create | blast_runs, blast_recipients, sending_tier tables |
| `src/lib/ghl.ts` | Modify | Add getOpportunity, getContactsPaginated, searchConversation, createConversation, sendSMS, createContactTask, getCustomValues functions |
| `src/lib/ghl-fields.ts` | Create | Runtime custom field ID discovery + cache for blast template fields |
| `src/lib/blast-logger.ts` | Create | Write/update markdown blast log files |
| `src/lib/blast-db.ts` | Create | Supabase CRUD for blast_runs, blast_recipients, sending_tier |
| `src/templates/buyer-blast.ts` | Create | Fetch templates from GHL Custom Values, interpolate placeholders |
| `src/trigger/buyer-blast.ts` | Create | Main Trigger.dev task orchestrating the entire blast |
| `src/app/api/webhooks/buyer-blast/route.ts` | Create | GHL stage-change webhook receiver |
| `src/app/api/webhooks/message-status/route.ts` | Create | GHL message delivery status webhook |
| `.gitignore` | Modify | Add logs/blasts/ |
| `package.json` | Modify | Add @trigger.dev/sdk dependency |

---

## Task 1: Initialize Trigger.dev and Supabase Migration

**Files:**
- Create: `trigger.config.ts`
- Create: `supabase/migrations/005_buyer_blast.sql`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Initialize Trigger.dev in the project**

Run:
```bash
npx trigger.dev@latest init -p proj_krnvhjbohzlcfyficusz
```

This creates `trigger.config.ts` and adds `@trigger.dev/sdk` to `package.json`. Accept defaults when prompted. The `src/trigger` directory will be the task directory.

- [ ] **Step 2: Verify trigger.config.ts was created**

Run:
```bash
cat trigger.config.ts
```

Verify it contains `project: "proj_krnvhjbohzlcfyficusz"` and `dirs: ["src/trigger"]` (or similar). If `dirs` points elsewhere, update it to `["src/trigger"]`.

- [ ] **Step 3: Install dependencies**

Run:
```bash
npm install
```

- [ ] **Step 4: Create the Supabase migration**

Write `supabase/migrations/005_buyer_blast.sql`:

```sql
-- Buyer Blast Agent: blast tracking, recipient status, sending tier management

-- Tracks each blast run (one per opportunity)
CREATE TABLE blast_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT NOT NULL,
  trigger_task_id TEXT,
  property_address TEXT,
  total_buyers INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'paused_tier_limit', 'paused_error', 'failed_validation')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  deal_data JSONB,
  CONSTRAINT uq_blast_runs_opportunity UNIQUE (opportunity_id)
);

CREATE INDEX idx_blast_runs_status ON blast_runs(status);
CREATE INDEX idx_blast_runs_opportunity ON blast_runs(opportunity_id);

-- Tracks each recipient within a blast
CREATE TABLE blast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_run_id UUID NOT NULL REFERENCES blast_runs(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped_dnd', 'skipped_no_phone', 'skipped_invalid_phone')),
  ghl_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'undelivered', 'failed')),
  replied BOOLEAN NOT NULL DEFAULT FALSE,
  replied_at TIMESTAMPTZ,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  error_detail TEXT,
  CONSTRAINT uq_blast_recipient UNIQUE (blast_run_id, contact_id)
);

CREATE INDEX idx_blast_recipients_run ON blast_recipients(blast_run_id);
CREATE INDEX idx_blast_recipients_status ON blast_recipients(status);
CREATE INDEX idx_blast_recipients_message ON blast_recipients(ghl_message_id);

-- Singleton table tracking the current sending tier (message ramp)
CREATE TABLE sending_tier (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_limit INTEGER NOT NULL DEFAULT 100,
  sent_today INTEGER NOT NULL DEFAULT 0,
  last_send_date DATE NOT NULL DEFAULT CURRENT_DATE,
  graduated_at TIMESTAMPTZ
);

-- Seed the singleton row
INSERT INTO sending_tier (id, current_limit, sent_today, last_send_date)
VALUES (1, 100, 0, CURRENT_DATE);
```

- [ ] **Step 5: Apply the migration to Supabase**

Run the migration via the Supabase MCP or dashboard. Verify all three tables exist:

```bash
# Use Supabase MCP to run:
# SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'blast%' OR table_name = 'sending_tier';
```

Expected: `blast_runs`, `blast_recipients`, `sending_tier`

- [ ] **Step 6: Add logs/blasts/ to .gitignore**

Append to `.gitignore`:
```
logs/blasts/
```

Create the directory:
```bash
mkdir -p logs/blasts
```

- [ ] **Step 7: Commit**

```bash
git add trigger.config.ts supabase/migrations/005_buyer_blast.sql .gitignore package.json package-lock.json
git commit -m "feat: initialize Trigger.dev and add buyer blast Supabase migration"
```

---

## Task 2: Extend GHL API Client with Messaging + Task Functions

**Files:**
- Modify: `src/lib/ghl.ts` (add new functions after existing code)

This task adds all the GHL API functions the blast agent needs. The existing `ghl.ts` has `getHeaders()`, `getLocationId()`, `BASE_URL`, and functions for pipelines, opportunities, contacts, and users. We add: single opportunity fetch, paginated contacts with query params, conversation search/create, SMS send, contact task creation, and custom values fetch.

- [ ] **Step 1: Add getOpportunity function**

Append to `src/lib/ghl.ts`:

```typescript
export async function getOpportunity(opportunityId: string): Promise<Opportunity> {
  const res = await fetch(`${BASE_URL}/opportunities/${opportunityId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL get opportunity: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.opportunity || data;
}
```

- [ ] **Step 2: Add paginated contacts fetch with tag filter**

Append to `src/lib/ghl.ts`:

```typescript
export async function getContactsPaginated(params: {
  query?: string;
  limit?: number;
  startAfterId?: string;
}): Promise<{ contacts: GHLContact[]; nextPageUrl: string | null }> {
  const searchParams = new URLSearchParams({
    locationId: getLocationId(),
    limit: String(params.limit || 100),
  });
  if (params.query) searchParams.set("query", params.query);
  if (params.startAfterId) searchParams.set("startAfterId", params.startAfterId);

  const res = await fetch(`${BASE_URL}/contacts/?${searchParams}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL contacts paginated: ${res.status} ${body}`);
  }
  const data = await res.json();
  return {
    contacts: data.contacts || [],
    nextPageUrl: data.meta?.nextPageUrl || null,
  };
}
```

- [ ] **Step 3: Add conversation search and create functions**

Append to `src/lib/ghl.ts`:

```typescript
export async function searchConversation(contactId: string): Promise<string | null> {
  const params = new URLSearchParams({
    locationId: getLocationId(),
    contactId,
  });
  const res = await fetch(`${BASE_URL}/conversations/search?${params}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL conversation search: ${res.status} ${body}`);
  }
  const data = await res.json();
  const conversations = data.conversations || [];
  return conversations.length > 0 ? conversations[0].id : null;
}

export async function createConversation(contactId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/conversations/`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ locationId: getLocationId(), contactId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL create conversation: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.conversation?.id || data.id;
}
```

- [ ] **Step 4: Add sendSMS function**

Append to `src/lib/ghl.ts`:

```typescript
export async function sendSMS(params: {
  conversationId: string;
  message: string;
}): Promise<{ messageId: string }> {
  const res = await fetch(
    `${BASE_URL}/conversations/messages`,
    {
      method: "POST",
      headers: { ...getHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "SMS",
        conversationId: params.conversationId,
        message: params.message,
      }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL send SMS: ${res.status} ${body}`);
  }
  const data = await res.json();
  return { messageId: data.messageId || data.id };
}
```

- [ ] **Step 5: Add createContactTask function**

Append to `src/lib/ghl.ts`:

```typescript
export async function createContactTask(params: {
  contactId: string;
  title: string;
  body: string;
  assignedTo: string;
  dueDate?: string;
}): Promise<{ taskId: string }> {
  const res = await fetch(`${BASE_URL}/contacts/${params.contactId}/tasks`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      assignedTo: params.assignedTo,
      dueDate: params.dueDate || new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL create task: ${res.status} ${body}`);
  }
  const data = await res.json();
  return { taskId: data.task?.id || data.id };
}
```

- [ ] **Step 6: Add getCustomValues function**

Append to `src/lib/ghl.ts`:

```typescript
export async function getCustomValues(): Promise<
  { id: string; name: string; value: string; fieldKey: string }[]
> {
  const res = await fetch(
    `${BASE_URL}/locations/${getLocationId()}/customValues`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL custom values: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.customValues || [];
}
```

- [ ] **Step 7: Add getOpportunityCustomFields function (if not already exported)**

The function exists in `src/crm_agent/ghl-write.ts` but not in `src/lib/ghl.ts`. Add it to the shared lib so both the CRM agent and blast agent can use it:

```typescript
export async function getOpportunityCustomFields(): Promise<
  { id: string; name: string; fieldKey: string; dataType: string }[]
> {
  const res = await fetch(
    `${BASE_URL}/locations/${getLocationId()}/customFields?model=opportunity`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL custom fields: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.customFields || [];
}
```

- [ ] **Step 8: Commit**

```bash
git add src/lib/ghl.ts
git commit -m "feat: add GHL messaging, task, and custom value API functions"
```

---

## Task 3: GHL Custom Field Discovery for Blast Templates

**Files:**
- Create: `src/lib/ghl-fields.ts`

This module resolves opportunity custom field IDs by name at runtime, caching the result. The blast agent needs field IDs for: City, State, Bedrooms, Bathrooms, Square Footage, Cross Streets. Some IDs are known from `field-map.ts`, others need discovery.

- [ ] **Step 1: Create ghl-fields.ts**

Write `src/lib/ghl-fields.ts`:

```typescript
import { getOpportunityCustomFields } from "@/lib/ghl";

/**
 * Maps template variable names to GHL custom field keys.
 * These keys are matched against the fieldKey returned by GHL's custom fields API.
 */
const BLAST_FIELD_KEYS: Record<string, string> = {
  city: "opportunity.city",
  state: "opportunity.state_abbrv",
  bedroom_count: "opportunity.bedroom_count",
  bathroom_count: "opportunity.bathroom_count",
  property_square_footage: "opportunity.property_square_footage",
  property_cross_streets: "opportunity.property_cross_streets",
  street_address: "opportunity.street_address",
};

/** Known field IDs from field-map.ts — avoids discovery call for these */
const KNOWN_IDS: Record<string, string> = {
  city: "6gTTgmpuqIMXA8CbZUX8",
  street_address: "bKwe0xJQTKZmgo2WynUK",
  property_cross_streets: "8OiHAAGktWx0iI3sa2W7",
  property_square_footage: "elJBmIBuLLRx7N2TF0nU",
  state: "PoVaeS1yPQ7KoGJcjR6w",
};

export type BlastFieldMap = Record<string, string>;

let cachedFieldMap: BlastFieldMap | null = null;

/**
 * Resolves all blast template field IDs. Uses known IDs where available,
 * discovers the rest via GHL API. Caches result for the process lifetime.
 */
export async function getBlastFieldMap(): Promise<BlastFieldMap> {
  if (cachedFieldMap) return cachedFieldMap;

  const fieldMap: BlastFieldMap = { ...KNOWN_IDS };

  // Find fields that still need discovery
  const needsDiscovery = Object.entries(BLAST_FIELD_KEYS).filter(
    ([name]) => !KNOWN_IDS[name]
  );

  if (needsDiscovery.length > 0) {
    const ghlFields = await getOpportunityCustomFields();
    const keyToId = new Map(ghlFields.map((f) => [f.fieldKey, f.id]));

    for (const [name, fieldKey] of needsDiscovery) {
      const id = keyToId.get(fieldKey);
      if (id) {
        fieldMap[name] = id;
      }
    }
  }

  cachedFieldMap = fieldMap;
  return fieldMap;
}

/**
 * Extract blast-relevant deal data from an opportunity's custom fields.
 * Returns a flat object with template variable names as keys.
 */
export function extractDealData(
  customFields: { id: string; fieldValueString?: string; fieldValue?: string }[],
  fieldMap: BlastFieldMap
): Record<string, string> {
  const idToName = new Map(
    Object.entries(fieldMap).map(([name, id]) => [id, name])
  );

  const dealData: Record<string, string> = {};
  for (const cf of customFields) {
    const name = idToName.get(cf.id);
    if (name) {
      dealData[name] = cf.fieldValueString ?? cf.fieldValue ?? "";
    }
  }
  return dealData;
}

/**
 * Returns list of required template fields that are missing from deal data.
 */
export function getMissingFields(dealData: Record<string, string>): string[] {
  const required = [
    "city",
    "state",
    "bedroom_count",
    "bathroom_count",
    "property_square_footage",
    "property_cross_streets",
  ];
  return required.filter((f) => !dealData[f] || dealData[f].trim() === "");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/ghl-fields.ts
git commit -m "feat: add GHL custom field discovery for blast templates"
```

---

## Task 4: Supabase CRUD for Blast Tracking

**Files:**
- Create: `src/lib/blast-db.ts`

All Supabase reads/writes for the blast agent in one file: create blast run, insert recipients, update recipient status, tier management, and summary queries.

- [ ] **Step 1: Create blast-db.ts**

Write `src/lib/blast-db.ts`:

```typescript
import { createServiceClient } from "@/lib/supabase";

// --- Types ---

export type BlastRun = {
  id: string;
  opportunity_id: string;
  trigger_task_id: string | null;
  property_address: string | null;
  total_buyers: number;
  sent_count: number;
  failed_count: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  deal_data: Record<string, string> | null;
};

export type BlastRecipient = {
  id: string;
  blast_run_id: string;
  contact_id: string;
  contact_name: string | null;
  phone: string | null;
  language: "en" | "es";
  status: string;
  ghl_message_id: string | null;
  delivery_status: string;
  replied: boolean;
  replied_at: string | null;
  opted_out: boolean;
  sent_at: string | null;
  error_detail: string | null;
};

export type SendingTier = {
  current_limit: number;
  sent_today: number;
  last_send_date: string;
  graduated_at: string | null;
};

// --- Blast Runs ---

export async function findExistingBlast(opportunityId: string): Promise<BlastRun | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("blast_runs")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .in("status", ["in_progress", "completed", "paused_tier_limit"])
    .maybeSingle();
  return data;
}

export async function createBlastRun(params: {
  opportunityId: string;
  triggerTaskId: string;
  propertyAddress: string;
  totalBuyers: number;
  dealData: Record<string, string>;
}): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("blast_runs")
    .insert({
      opportunity_id: params.opportunityId,
      trigger_task_id: params.triggerTaskId,
      property_address: params.propertyAddress,
      total_buyers: params.totalBuyers,
      deal_data: params.dealData,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create blast run: ${error.message}`);
  return data.id;
}

export async function updateBlastRun(
  blastRunId: string,
  updates: Partial<Pick<BlastRun, "status" | "sent_count" | "failed_count" | "completed_at">>
): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.from("blast_runs").update(updates).eq("id", blastRunId);
  if (error) throw new Error(`Failed to update blast run: ${error.message}`);
}

export async function getBlastRun(blastRunId: string): Promise<BlastRun | null> {
  const sb = createServiceClient();
  const { data } = await sb.from("blast_runs").select("*").eq("id", blastRunId).maybeSingle();
  return data;
}

// --- Blast Recipients ---

export async function insertRecipients(
  blastRunId: string,
  recipients: {
    contactId: string;
    contactName: string | null;
    phone: string | null;
    language: "en" | "es";
    status: string;
  }[]
): Promise<void> {
  const sb = createServiceClient();
  const rows = recipients.map((r) => ({
    blast_run_id: blastRunId,
    contact_id: r.contactId,
    contact_name: r.contactName,
    phone: r.phone,
    language: r.language,
    status: r.status,
  }));

  // Insert in batches of 500 to avoid payload limits
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await sb.from("blast_recipients").insert(batch);
    if (error) throw new Error(`Failed to insert recipients batch: ${error.message}`);
  }
}

export async function getPendingRecipients(blastRunId: string): Promise<BlastRecipient[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("blast_recipients")
    .select("*")
    .eq("blast_run_id", blastRunId)
    .eq("status", "pending")
    .order("id");
  if (error) throw new Error(`Failed to fetch pending recipients: ${error.message}`);
  return data || [];
}

export async function updateRecipient(
  recipientId: string,
  updates: Partial<Pick<BlastRecipient, "status" | "ghl_message_id" | "delivery_status" | "sent_at" | "error_detail">>
): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.from("blast_recipients").update(updates).eq("id", recipientId);
  if (error) throw new Error(`Failed to update recipient: ${error.message}`);
}

export async function updateRecipientByMessageId(
  messageId: string,
  updates: Partial<Pick<BlastRecipient, "delivery_status" | "replied" | "replied_at" | "opted_out">>
): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from("blast_recipients")
    .update(updates)
    .eq("ghl_message_id", messageId);
  if (error) throw new Error(`Failed to update recipient by message ID: ${error.message}`);
}

// --- Sending Tier ---

export async function getSendingTier(): Promise<SendingTier> {
  const sb = createServiceClient();
  const { data, error } = await sb.from("sending_tier").select("*").eq("id", 1).single();
  if (error) throw new Error(`Failed to fetch sending tier: ${error.message}`);
  return data;
}

export async function incrementSentToday(): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.rpc("increment_sent_today");
  if (error) {
    // Fallback: manual increment if RPC doesn't exist
    const tier = await getSendingTier();
    await sb
      .from("sending_tier")
      .update({ sent_today: tier.sent_today + 1 })
      .eq("id", 1);
  }
}

export async function resetAndGraduateTier(): Promise<number> {
  const sb = createServiceClient();
  const tier = await getSendingTier();

  const TIER_LADDER = [100, 250, 500, 750, 1500, 3000, 5000];
  const currentIdx = TIER_LADDER.indexOf(tier.current_limit);
  const nextLimit =
    currentIdx >= 0 && currentIdx < TIER_LADDER.length - 1
      ? TIER_LADDER[currentIdx + 1]
      : Math.min(tier.current_limit * 2, 10000);

  const { error } = await sb
    .from("sending_tier")
    .update({
      current_limit: nextLimit,
      sent_today: 0,
      last_send_date: new Date().toISOString().split("T")[0],
      graduated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(`Failed to graduate tier: ${error.message}`);
  return nextLimit;
}

export async function resetDailyCount(): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from("sending_tier")
    .update({
      sent_today: 0,
      last_send_date: new Date().toISOString().split("T")[0],
    })
    .eq("id", 1);
  if (error) throw new Error(`Failed to reset daily count: ${error.message}`);
}

// --- Summary Queries ---

export async function getBlastSummary(blastRunId: string): Promise<{
  totalEn: number;
  totalEs: number;
  delivered: number;
  undelivered: number;
  failed: number;
  replies: number;
  optOuts: number;
  skipped: number;
}> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("blast_recipients")
    .select("language, status, delivery_status, replied, opted_out")
    .eq("blast_run_id", blastRunId);
  if (error) throw new Error(`Failed to get blast summary: ${error.message}`);

  const rows = data || [];
  return {
    totalEn: rows.filter((r) => r.language === "en").length,
    totalEs: rows.filter((r) => r.language === "es").length,
    delivered: rows.filter((r) => r.delivery_status === "delivered").length,
    undelivered: rows.filter((r) => r.delivery_status === "undelivered").length,
    failed: rows.filter((r) => r.status === "failed").length,
    replies: rows.filter((r) => r.replied).length,
    optOuts: rows.filter((r) => r.opted_out).length,
    skipped: rows.filter((r) => r.status.startsWith("skipped_")).length,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/blast-db.ts
git commit -m "feat: add Supabase CRUD for blast runs, recipients, and sending tier"
```

---

## Task 5: Template Fetch and Interpolation

**Files:**
- Create: `src/templates/buyer-blast.ts`

Fetches English/Spanish templates from GHL Custom Values, replaces `\n` with real newlines, and interpolates `{{opportunity.*}}` and `{{contact.*}}` placeholders with actual data.

- [ ] **Step 1: Create buyer-blast.ts**

Write `src/templates/buyer-blast.ts`:

```typescript
import { getCustomValues } from "@/lib/ghl";

const TEMPLATE_IDS = {
  en: "bA7zsDQqgm4zhuv6ts5g",
  es: "73ObSJKCwvgSPxNIRNA7",
} as const;

type TemplateData = {
  contact: { first_name: string };
  opportunity: Record<string, string>;
};

let cachedTemplates: { en: string; es: string } | null = null;

/**
 * Fetches both SMS templates from GHL Custom Values.
 * Caches for the lifetime of the process (one Trigger.dev task run).
 */
export async function fetchTemplates(): Promise<{ en: string; es: string }> {
  if (cachedTemplates) return cachedTemplates;

  const customValues = await getCustomValues();

  const enValue = customValues.find((v) => v.id === TEMPLATE_IDS.en);
  const esValue = customValues.find((v) => v.id === TEMPLATE_IDS.es);

  if (!enValue?.value) throw new Error("English buyer blast template not found in GHL Custom Values");
  if (!esValue?.value) throw new Error("Spanish buyer blast template not found in GHL Custom Values");

  cachedTemplates = {
    en: enValue.value.replace(/\\n/g, "\n"),
    es: esValue.value.replace(/\\n/g, "\n"),
  };
  return cachedTemplates;
}

/**
 * Interpolates a template with deal and contact data.
 * Replaces {{contact.first_name}}, {{opportunity.city}}, etc.
 */
export function interpolateTemplate(
  template: string,
  data: TemplateData
): string {
  return template.replace(/\{\{(\w+)\.(\w+)\}\}/g, (match, namespace, field) => {
    if (namespace === "contact") {
      const value = data.contact[field as keyof typeof data.contact];
      return value ?? match;
    }
    if (namespace === "opportunity") {
      const value = data.opportunity[field];
      return value ?? match;
    }
    return match;
  });
}

/**
 * Builds the final SMS message for a buyer.
 */
export async function buildMessage(
  language: "en" | "es",
  contactFirstName: string,
  dealData: Record<string, string>
): Promise<string> {
  const templates = await fetchTemplates();
  const template = language === "es" ? templates.es : templates.en;

  return interpolateTemplate(template, {
    contact: { first_name: contactFirstName || "there" },
    opportunity: dealData,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/templates/buyer-blast.ts
git commit -m "feat: add buyer blast template fetch and interpolation"
```

---

## Task 6: Blast Markdown Logger

**Files:**
- Create: `src/lib/blast-logger.ts`

Writes/updates markdown log files in `logs/blasts/`. Each blast gets one file that's appended to across multi-day drip campaigns.

- [ ] **Step 1: Create blast-logger.ts**

Write `src/lib/blast-logger.ts`:

```typescript
import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { BlastRun } from "@/lib/blast-db";

const LOGS_DIR = join(process.cwd(), "logs", "blasts");

function slugify(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

function getLogPath(address: string, startDate: string): string {
  const datePrefix = startDate.split("T")[0];
  const slug = slugify(address);
  return join(LOGS_DIR, `${datePrefix}-${slug}.md`);
}

export function writeBlastLog(params: {
  run: BlastRun;
  daySummaries: { date: string; sent: number; failed: number; skipped: number; tierLimit: number }[];
  summary: {
    totalEn: number;
    totalEs: number;
    delivered: number;
    undelivered: number;
    replies: number;
    optOuts: number;
  };
  errors: { date: string; phone: string; detail: string }[];
}): string {
  mkdirSync(LOGS_DIR, { recursive: true });

  const { run, daySummaries, summary, errors } = params;
  const deal = run.deal_data || {};
  const logPath = getLogPath(run.property_address || "unknown", run.started_at);

  const totalSent = daySummaries.reduce((sum, d) => sum + d.sent, 0);
  const totalFailed = daySummaries.reduce((sum, d) => sum + d.failed, 0);
  const totalSkipped = daySummaries.reduce((sum, d) => sum + d.skipped, 0);

  const dayRows = daySummaries
    .map((d) => `| ${d.date} | ${d.sent} | ${d.failed} | ${d.skipped} | ${d.tierLimit} |`)
    .join("\n");

  const errorLines =
    errors.length > 0
      ? errors.map((e) => `- ${e.date}: ${e.phone} — ${e.detail}`).join("\n")
      : "None";

  const content = `# Buyer Blast — ${run.property_address || "Unknown"}

**Opportunity ID:** ${run.opportunity_id}
**Triggered:** ${run.started_at}
**Status:** ${run.status}

## Deal Details
- City: ${deal.city || "N/A"} | State: ${deal.state || "N/A"}
- ${deal.bedroom_count || "?"}bd / ${deal.bathroom_count || "?"}ba | ${deal.property_square_footage || "?"} sq ft
- Cross Streets: ${deal.property_cross_streets || "N/A"}

## Send Summary
| Date | Sent | Failed | Skipped | Tier Limit |
|------|------|--------|---------|------------|
${dayRows}
| **Total** | **${totalSent}** | **${totalFailed}** | **${totalSkipped}** | |

## Recipient Breakdown
- English: ${summary.totalEn} | Spanish: ${summary.totalEs}
- Delivered: ${summary.delivered} | Undelivered: ${summary.undelivered}
- Replies: ${summary.replies} | Opt-outs: ${summary.optOuts}

## Errors
${errorLines}
`;

  writeFileSync(logPath, content, "utf-8");
  return logPath;
}

/**
 * Appends a day summary line to an existing log file.
 * Used for multi-day blasts that resume after tier limits.
 */
export function appendDaySummary(
  logPath: string,
  day: { date: string; sent: number; failed: number; skipped: number; tierLimit: number }
): void {
  if (!existsSync(logPath)) return;
  const content = readFileSync(logPath, "utf-8");
  const newRow = `| ${day.date} | ${day.sent} | ${day.failed} | ${day.skipped} | ${day.tierLimit} |`;

  // Insert before the **Total** row
  const updated = content.replace(
    /(\| \*\*Total\*\*)/,
    `${newRow}\n$1`
  );
  writeFileSync(logPath, updated, "utf-8");
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/blast-logger.ts
git commit -m "feat: add blast markdown logger for tracking send history"
```

---

## Task 7: Main Trigger.dev Buyer Blast Task

**Files:**
- Create: `src/trigger/buyer-blast.ts`

This is the main orchestrator. It fetches the opportunity, validates fields, assembles the buyer list, and runs the drip loop with tier-aware sending.

- [ ] **Step 1: Create the Trigger.dev task**

Write `src/trigger/buyer-blast.ts`:

```typescript
import { task, wait } from "@trigger.dev/sdk/v3";
import {
  getOpportunity,
  getContactsPaginated,
  searchConversation,
  createConversation,
  sendSMS,
  createContactTask,
  getUsers,
} from "@/lib/ghl";
import { getBlastFieldMap, extractDealData, getMissingFields } from "@/lib/ghl-fields";
import {
  findExistingBlast,
  createBlastRun,
  updateBlastRun,
  insertRecipients,
  getPendingRecipients,
  updateRecipient,
  getSendingTier,
  incrementSentToday,
  resetAndGraduateTier,
  resetDailyCount,
  getBlastSummary,
} from "@/lib/blast-db";
import { buildMessage } from "@/templates/buyer-blast";
import { writeBlastLog } from "@/lib/blast-logger";

type BuyerBlastPayload = {
  opportunityId: string;
};

// Karla's name for user lookup
const KARLA_NAME = "Karla";

// Drip delay between messages in seconds
const DRIP_DELAY_SECONDS = 4;

export const buyerBlastTask = task({
  id: "buyer-blast",
  run: async (payload: BuyerBlastPayload, { ctx }) => {
    const { opportunityId } = payload;

    // --- 1. Duplicate check ---
    const existing = await findExistingBlast(opportunityId);
    if (existing) {
      if (existing.status === "completed") {
        return { skipped: true, reason: "Blast already completed for this opportunity" };
      }
      if (existing.status === "in_progress" || existing.status === "paused_tier_limit") {
        // Resume existing blast
        return await resumeBlast(existing.id);
      }
    }

    // --- 2. Fetch opportunity ---
    const opportunity = await getOpportunity(opportunityId);

    // --- 3. Resolve field map and extract deal data ---
    const fieldMap = await getBlastFieldMap();
    const dealData = extractDealData(opportunity.customFields || [], fieldMap);
    const address = dealData.street_address || opportunity.name || "Unknown Address";

    // --- 4. Validate required fields ---
    const missingFields = getMissingFields(dealData);
    if (missingFields.length > 0) {
      // Find contact to assign task to
      const contactId = opportunity.contact?.id;
      const followers = (opportunity as Record<string, unknown>).followers as string[] | undefined;
      const taskContactId = contactId || (followers && followers[0]);

      if (taskContactId) {
        // Find Karla's user ID
        const users = await getUsers();
        const karla = users.find((u) =>
          u.firstName.toLowerCase() === KARLA_NAME.toLowerCase()
        );

        if (karla) {
          await createContactTask({
            contactId: taskContactId,
            title: `Missing blast fields for ${address}`,
            body: `The following fields are missing and must be filled before the buyer blast can run:\n\n${missingFields.map((f) => `- ${f}`).join("\n")}`,
            assignedTo: karla.id,
          });
        }
      }

      return { skipped: true, reason: "Missing required fields", missingFields, address };
    }

    // --- 5. Fetch eligible buyers ---
    const buyers = await fetchEligibleBuyers();

    if (buyers.length === 0) {
      return { skipped: true, reason: "No eligible buyers found" };
    }

    // --- 6. Create blast run + insert recipients ---
    const blastRunId = await createBlastRun({
      opportunityId,
      triggerTaskId: ctx.run.id,
      propertyAddress: address,
      totalBuyers: buyers.length,
      dealData,
    });

    const recipientRows = buyers.map((b) => ({
      contactId: b.contactId,
      contactName: b.firstName ? `${b.firstName}` : null,
      phone: b.phone,
      language: b.language,
      status: b.phone ? "pending" : "skipped_no_phone",
    }));

    await insertRecipients(blastRunId, recipientRows);

    // --- 7. Run the drip loop ---
    return await runDripLoop(blastRunId, dealData);
  },
});

// --- Helper: Fetch eligible buyers ---

type EligibleBuyer = {
  contactId: string;
  firstName: string;
  phone: string | null;
  language: "en" | "es";
};

async function fetchEligibleBuyers(): Promise<EligibleBuyer[]> {
  const buyers: EligibleBuyer[] = [];
  let startAfterId: string | undefined;

  while (true) {
    const page = await getContactsPaginated({
      limit: 100,
      startAfterId,
    });

    for (const contact of page.contacts) {
      const tags = (contact.tags || []).map((t) => t.toLowerCase());
      if (!tags.includes("buyer")) continue;
      if (!tags.includes("ready to go")) continue;

      // Check DND — GHL contacts may have a dnd field
      const dnd = (contact as Record<string, unknown>).dnd as boolean | undefined;
      const dndArray = (contact as Record<string, unknown>).dndSettings as
        | { status: string; message: string; code: string }[]
        | undefined;

      // Skip if global DND or SMS-specific DND
      if (dnd === true) continue;
      if (dndArray?.some((d) => d.code === "SMS" && d.status === "active")) continue;

      // Determine language
      const customFields = (contact as Record<string, unknown>).customFields as
        | { id: string; value: unknown }[]
        | undefined;
      let language: "en" | "es" = "en";

      if (customFields) {
        for (const cf of customFields) {
          const val = String(cf.value || "").toLowerCase();
          if (val.includes("spanish")) {
            language = "es";
            break;
          }
        }
      }

      // Also check the customField in the standard fields
      const preferredLang = String(
        (contact as Record<string, unknown>).preferredLanguage || ""
      ).toLowerCase();
      if (preferredLang.includes("spanish")) {
        language = "es";
      }

      buyers.push({
        contactId: contact.id,
        firstName: contact.firstName || "there",
        phone: contact.phone,
        language,
      });
    }

    if (!page.nextPageUrl || page.contacts.length === 0) break;

    // Extract startAfterId from the last contact
    startAfterId = page.contacts[page.contacts.length - 1].id;
  }

  return buyers;
}

// --- Helper: Run the drip send loop ---

async function runDripLoop(
  blastRunId: string,
  dealData: Record<string, string>
): Promise<{ completed: boolean; sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;
  const daySummaries: { date: string; sent: number; failed: number; skipped: number; tierLimit: number }[] = [];
  const errors: { date: string; phone: string; detail: string }[] = [];

  while (true) {
    const pending = await getPendingRecipients(blastRunId);
    if (pending.length === 0) break;

    // Check tier and date rollover
    let tier = await getSendingTier();
    const today = new Date().toISOString().split("T")[0];

    if (tier.last_send_date !== today) {
      // New day — check if we should graduate
      if (tier.sent_today >= tier.current_limit) {
        const newLimit = await resetAndGraduateTier();
        tier = { ...tier, current_limit: newLimit, sent_today: 0, last_send_date: today };
      } else {
        await resetDailyCount();
        tier = { ...tier, sent_today: 0, last_send_date: today };
      }
    }

    let daySent = 0;
    let dayFailed = 0;
    let daySkipped = 0;

    for (const recipient of pending) {
      // Re-check tier limit before each send
      const currentTier = await getSendingTier();
      if (currentTier.sent_today >= currentTier.current_limit) {
        // Hit daily limit — save progress and wait until tomorrow
        daySummaries.push({
          date: today,
          sent: daySent,
          failed: dayFailed,
          skipped: daySkipped,
          tierLimit: currentTier.current_limit,
        });

        await updateBlastRun(blastRunId, {
          status: "paused_tier_limit",
          sent_count: totalSent,
          failed_count: totalFailed,
        });

        // Wait until midnight + 1 minute buffer
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 1, 0, 0);
        await wait.until({ date: tomorrow });

        // After waking up, the outer while loop will re-check tier and continue
        break;
      }

      // Skip if no phone
      if (!recipient.phone) {
        await updateRecipient(recipient.id, { status: "skipped_no_phone" });
        daySkipped++;
        continue;
      }

      try {
        // Find or create conversation
        let conversationId = await searchConversation(recipient.contact_id);
        if (!conversationId) {
          conversationId = await createConversation(recipient.contact_id);
        }

        // Build the personalized message
        const message = await buildMessage(
          recipient.language as "en" | "es",
          recipient.contact_name || "there",
          dealData
        );

        // Send SMS
        const { messageId } = await sendSMS({ conversationId, message });

        // Update recipient
        await updateRecipient(recipient.id, {
          status: "sent",
          ghl_message_id: messageId,
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
        });

        await incrementSentToday();
        daySent++;
        totalSent++;

        // Drip delay
        await wait.for({ seconds: DRIP_DELAY_SECONDS });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const isRateLimit = errorMsg.includes("429");
        const isAuthError = errorMsg.includes("401");

        if (isAuthError) {
          // Fatal — halt the blast
          await updateBlastRun(blastRunId, {
            status: "paused_error",
            sent_count: totalSent,
            failed_count: totalFailed,
          });
          throw new Error(`GHL auth failure — blast halted: ${errorMsg}`);
        }

        if (isRateLimit) {
          // Back off and retry this recipient
          await wait.for({ seconds: 30 });
          // Don't mark as failed — will be retried next loop iteration
          continue;
        }

        // Other error — mark recipient as failed, continue
        await updateRecipient(recipient.id, {
          status: "failed",
          error_detail: errorMsg,
        });
        errors.push({
          date: today,
          phone: recipient.phone || "unknown",
          detail: errorMsg,
        });
        dayFailed++;
        totalFailed++;
      }
    }

    // If we completed all pending (didn't break due to tier limit), add day summary
    const remainingPending = await getPendingRecipients(blastRunId);
    if (remainingPending.length === 0) {
      daySummaries.push({
        date: today,
        sent: daySent,
        failed: dayFailed,
        skipped: daySkipped,
        tierLimit: (await getSendingTier()).current_limit,
      });
    }
  }

  // --- Blast complete ---
  await updateBlastRun(blastRunId, {
    status: "completed",
    sent_count: totalSent,
    failed_count: totalFailed,
    completed_at: new Date().toISOString(),
  });

  // Write markdown log
  const run = await (await import("@/lib/blast-db")).getBlastRun(blastRunId);
  if (run) {
    const summary = await getBlastSummary(blastRunId);
    writeBlastLog({ run, daySummaries, summary, errors });
  }

  return { completed: true, sent: totalSent, failed: totalFailed };
}

// --- Helper: Resume an existing paused blast ---

async function resumeBlast(
  blastRunId: string
): Promise<{ completed: boolean; sent: number; failed: number }> {
  const run = await (await import("@/lib/blast-db")).getBlastRun(blastRunId);
  if (!run) throw new Error(`Blast run ${blastRunId} not found`);

  await updateBlastRun(blastRunId, { status: "in_progress" });
  return await runDripLoop(blastRunId, run.deal_data || {});
}
```

- [ ] **Step 2: Commit**

```bash
git add src/trigger/buyer-blast.ts
git commit -m "feat: add main buyer-blast Trigger.dev task with drip loop and tier management"
```

---

## Task 8: Vercel Webhook — Buyer Blast Trigger

**Files:**
- Create: `src/app/api/webhooks/buyer-blast/route.ts`

Lightweight Vercel endpoint that receives GHL's stage-change webhook, validates, and fires the Trigger.dev task.

- [ ] **Step 1: Create the webhook route**

Write `src/app/api/webhooks/buyer-blast/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(request: Request) {
  // Validate webhook secret
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "GHL_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  // GHL may send the secret as a query param or header — check both
  const url = new URL(request.url);
  const headerSecret = request.headers.get("x-webhook-secret");
  const querySecret = url.searchParams.get("secret");

  if (headerSecret !== secret && querySecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract opportunity ID from GHL webhook payload
  // GHL sends opportunity data in various shapes depending on the trigger
  const opportunityId =
    (body.opportunityId as string) ||
    (body.opportunity_id as string) ||
    ((body.opportunity as Record<string, unknown>)?.id as string) ||
    (body.id as string);

  if (!opportunityId) {
    return NextResponse.json({ error: "Missing opportunity ID" }, { status: 400 });
  }

  try {
    // Trigger the buyer-blast task with idempotency key
    const handle = await tasks.trigger(
      "buyer-blast",
      { opportunityId },
      { idempotencyKey: `buyer-blast-${opportunityId}` }
    );

    return NextResponse.json({
      success: true,
      taskId: handle.id,
      opportunityId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to trigger blast task", details: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/buyer-blast/route.ts
git commit -m "feat: add GHL buyer-blast webhook endpoint"
```

---

## Task 9: Vercel Webhook — Message Status Updates

**Files:**
- Create: `src/app/api/webhooks/message-status/route.ts`

Receives GHL message status updates and updates the blast_recipients table.

- [ ] **Step 1: Create the message status webhook**

Write `src/app/api/webhooks/message-status/route.ts`:

```typescript
import { NextResponse } from "next/server";
import { updateRecipientByMessageId } from "@/lib/blast-db";

export async function POST(request: Request) {
  // Validate webhook secret
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "GHL_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  const url = new URL(request.url);
  const headerSecret = request.headers.get("x-webhook-secret");
  const querySecret = url.searchParams.get("secret");

  if (headerSecret !== secret && querySecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const messageId =
    (body.messageId as string) ||
    (body.message_id as string) ||
    ((body.message as Record<string, unknown>)?.id as string);

  if (!messageId) {
    // Not a message event we care about — acknowledge anyway
    return NextResponse.json({ success: true, ignored: true });
  }

  const status = (body.status as string) || (body.messageStatus as string) || "";
  const type = (body.type as string) || (body.eventType as string) || "";

  try {
    const updates: Record<string, unknown> = {};

    // Map GHL status to our delivery_status
    const normalizedStatus = status.toLowerCase();
    if (["delivered", "sent", "undelivered", "failed"].includes(normalizedStatus)) {
      updates.delivery_status = normalizedStatus;
    }

    // Check for reply
    if (type.toLowerCase().includes("reply") || type.toLowerCase().includes("inbound")) {
      updates.replied = true;
      updates.replied_at = new Date().toISOString();
    }

    // Check for opt-out / DND
    if (
      normalizedStatus.includes("opt") ||
      normalizedStatus.includes("dnd") ||
      type.toLowerCase().includes("opt")
    ) {
      updates.opted_out = true;
    }

    if (Object.keys(updates).length > 0) {
      await updateRecipientByMessageId(messageId, updates);
    }

    return NextResponse.json({ success: true, messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update message status", details: message },
      { status: 500 }
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/webhooks/message-status/route.ts
git commit -m "feat: add GHL message status webhook for delivery tracking"
```

---

## Task 10: Environment Variables and Middleware Update

**Files:**
- Modify: `src/middleware.ts` (already excludes `/api` routes — verify)
- Modify: `.env` (add GHL_WEBHOOK_SECRET)

- [ ] **Step 1: Verify middleware allows webhook routes**

Read `src/middleware.ts` and confirm that the matcher pattern already excludes `api` routes. The current pattern is:
```
"/((?!login|api|_next/static|_next/image|favicon.ico).*)"
```

This already excludes all `/api/*` routes including our new webhooks. No changes needed.

- [ ] **Step 2: Add GHL_WEBHOOK_SECRET to .env**

Generate a secure random secret and add to `.env`:

```bash
echo "GHL_WEBHOOK_SECRET=$(openssl rand -hex 32)" >> .env
```

- [ ] **Step 3: Add TRIGGER_SECRET_KEY to .env if not present**

Check if `TRIGGER_SECRET_KEY` exists in `.env`. If not, add the key from the Trigger.dev dashboard (Project Settings → API Keys):

```bash
grep -q "TRIGGER_SECRET_KEY" .env || echo "TRIGGER_SECRET_KEY=tr_dev_XXXXXXX" >> .env
```

The actual value must come from the Trigger.dev dashboard.

- [ ] **Step 4: Add env vars to Vercel**

```bash
# Add to Vercel (the printf pattern avoids trailing newline issues)
printf '%s' "$(grep GHL_WEBHOOK_SECRET .env | cut -d= -f2)" | vercel env add GHL_WEBHOOK_SECRET production
printf '%s' "$(grep TRIGGER_SECRET_KEY .env | cut -d= -f2)" | vercel env add TRIGGER_SECRET_KEY production
```

- [ ] **Step 5: Commit (no .env — already gitignored)**

No commit needed for env var changes. The `.env` file is gitignored.

---

## Task 11: Integration Test — End-to-End Dry Run

**Files:** No new files — this task validates the full flow.

- [ ] **Step 1: Start Trigger.dev dev mode**

```bash
npx trigger.dev@latest dev
```

Leave this running in a terminal.

- [ ] **Step 2: Apply the Supabase migration**

Run the migration from `supabase/migrations/005_buyer_blast.sql` against the Supabase database. Verify tables exist.

- [ ] **Step 3: Verify the Trigger.dev task registers**

In the Trigger.dev dev console, confirm that `buyer-blast` appears in the task list.

- [ ] **Step 4: Test webhook endpoint locally**

```bash
curl -X POST http://localhost:3000/api/webhooks/buyer-blast?secret=YOUR_SECRET \
  -H "Content-Type: application/json" \
  -d '{"opportunityId": "TEST_OPP_ID_FROM_DISPOSITION_PIPELINE"}'
```

Replace `TEST_OPP_ID_FROM_DISPOSITION_PIPELINE` with a real opportunity ID from the Disposition pipeline in "Marketing Active" stage.

Expected: 200 response with `{ success: true, taskId: "...", opportunityId: "..." }`

- [ ] **Step 5: Monitor the blast task in Trigger.dev dashboard**

Watch the task run in the Trigger.dev dev dashboard. Verify:
1. Opportunity is fetched successfully
2. Deal data is extracted
3. Buyers are found (or the task correctly reports zero/missing fields)
4. If buyers exist, first few messages are sent with correct content
5. Drip delay is observed between sends
6. Tier limit is respected

- [ ] **Step 6: Check Supabase tables**

Verify data in `blast_runs`, `blast_recipients`, and `sending_tier` tables reflects the test run.

- [ ] **Step 7: Check GHL for sent messages**

In GHL, open one of the buyer contacts that should have received a message. Verify the SMS appears in their conversation thread with correct formatting and content.

- [ ] **Step 8: Verify markdown log was written**

```bash
ls -la logs/blasts/
cat logs/blasts/*.md
```

Confirm the log file exists and contains correct data.

---

## Task Dependency Map

```
Task 1 (Trigger.dev init + DB migration)
  └─► Task 2 (GHL API extensions)
  └─► Task 3 (Field discovery)      ── can run parallel with 2
  └─► Task 4 (Blast DB CRUD)        ── can run parallel with 2, 3
  └─► Task 5 (Template logic)       ── can run parallel with 2, 3, 4
  └─► Task 6 (Blast logger)         ── can run parallel with 2-5

Task 7 (Main Trigger.dev task)       ── depends on 2, 3, 4, 5, 6
Task 8 (Buyer blast webhook)         ── depends on 7
Task 9 (Message status webhook)      ── depends on 4
Task 10 (Env vars + middleware)      ── depends on 8, 9
Task 11 (Integration test)           ── depends on all above
```

**Parallelizable groups:**
- **Group A (infra):** Task 1 — must go first
- **Group B (modules):** Tasks 2, 3, 4, 5, 6 — all can run in parallel after Task 1
- **Group C (orchestration):** Task 7 — after Group B completes
- **Group D (webhooks):** Tasks 8, 9 — can run in parallel after Task 7 (8) and Task 4 (9)
- **Group E (config):** Task 10 — after Group D
- **Group F (validation):** Task 11 — after all above
