# Buyer Pipeline Cleanup — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit and fix all Buyer Pipeline contacts — ensure "buyer" tag, "Buyer" Contact Type, flag missing contact info, migrate old Contact Type field, and normalize hashtag city tags.

**Architecture:** Parallel subagent pipeline — data fetch first, then 4 read-only analyzers run in parallel producing proposed changes, then a merge step applies all fixes in a single PUT per contact. A QA reviewer agent with fresh context verifies everything against this plan.

**Tech Stack:** TypeScript scripts run via `npx tsx`, GHL REST API v2, dotenv for env vars. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-07-buyer-pipeline-cleanup-design.md`

---

## File Structure

```
scripts/cleanup/
├── lib/
│   ├── types.ts              ← Shared type definitions for all scripts
│   └── ghl-api.ts            ← GHL API helpers (fetch, update, pagination)
├── 01-fetch-data.ts          ← Fetches all Buyer Pipeline opps + contacts + old type contacts
├── 02-analyze-buyer-tags.ts  ← Proposes buyer tag + Contact Type fixes
├── 03-analyze-missing-info.ts ← Proposes "need contact info" tag additions
├── 04-analyze-old-type.ts    ← Proposes old Contact Type → new multi-select migration
├── 05-analyze-tags.ts        ← Proposes hashtag tag normalization
├── 06-merge-and-apply.ts     ← Merges all proposals, applies via GHL API (supports --dry-run)
├── 07-qa-review.ts           ← Verifies applied changes against proposals + this plan
└── 08-generate-report.ts     ← Generates final audit report markdown

.tmp/                          ← Created at runtime, gitignored
├── buyer-pipeline-data.json   ← Raw data snapshot (01-fetch-data output)
├── proposed-buyer-tags.json   ← Analyzer 02 output
├── proposed-missing-info.json ← Analyzer 03 output
├── proposed-old-type.json     ← Analyzer 04 output
├── proposed-tag-normalize.json ← Analyzer 05 output
├── changes-applied.json       ← Merge-and-apply output
├── qa-review-report.md        ← QA review output
└── buyer-pipeline-audit-2026-04-07.md ← Final report
```

---

### Task 1: Create shared library — types and GHL API helpers

**Files:**
- Create: `scripts/cleanup/lib/types.ts`
- Create: `scripts/cleanup/lib/ghl-api.ts`

- [ ] **Step 1: Create directory structure**

```bash
mkdir -p scripts/cleanup/lib .tmp
```

- [ ] **Step 2: Write types.ts**

Create `scripts/cleanup/lib/types.ts`:

```typescript
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
```

- [ ] **Step 3: Write ghl-api.ts**

Create `scripts/cleanup/lib/ghl-api.ts`:

```typescript
import "dotenv/config";

const BASE_URL = "https://services.leadconnectorhq.com";

function getHeaders(): Record<string, string> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("Missing GHL_API_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function getLocationId(): string {
  const id = process.env.GHL_LOCATION_ID;
  if (!id) throw new Error("Missing GHL_LOCATION_ID");
  return id;
}

// --- Constants ---
export const BUYER_PIPELINE_ID = "6gtCenYOAl8NwRWyTjhZ";
export const CONTACT_TYPE_MULTI_ID = "1zPxrX6N62CUfSIwxOH0";
export const CONTACT_TYPE_OLD_ID = "4GYXWVRN8x18qWLrdeXX";

export const BUYER_PIPELINE_STAGES: Record<string, string> = {
  "81823ded-2c08-41ea-be76-2cf6ee18a7a2": "New Buyer",
  "f65b9a3b-07c2-4e62-880f-8aa8029411fd": "Buyer In Review",
  "37250c40-7e09-4c51-842a-851b01fd8bfc": "Buyer Unqualified",
  "dc165896-68f2-43c6-a3ea-59417f5fe0d1": "Buyer Qualified",
  "2847e208-ebc6-4135-966c-f71eda51d894": "Property Walkthrough Scheduled",
  "fc130835-2e0b-4b0c-b517-baeb0a4c9890": "Property Walkthrough Completed",
  "4d158ab0-2fd2-4648-8295-550d47960cf8": "Agreement Sent",
  "b8376a10-b217-4bf4-9464-6e01b517266b": "Buyer Signed Contract",
  "fbe8a42a-0483-405c-b851-4ce05c73926f": "Closed Won",
  "fe018e88-120e-450a-8479-ad22358aff6b": "Contract Canceled",
};

export const OLD_TYPE_MIGRATION: Record<string, string> = {
  Seller: "Seller",
  Agent: "Agent",
  Investor: "Buyer",
  "Private Money Lender": "PML",
  "Hard Money Lender": "PML",
  Contractor: "Service Provider",
  "Escrow Officer": "Service Provider",
  Inspector: "Service Provider",
  TC: "Service Provider",
};

// --- Helpers ---
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const wait = Math.pow(2, attempt + 1) * 1000;
      console.log(`  ⏳ Rate limited, waiting ${wait}ms (attempt ${attempt + 1}/${retries})...`);
      await sleep(wait);
      continue;
    }
    return res;
  }
  throw new Error(`Failed after ${retries} retries (429)`);
}

// --- API Functions ---

/**
 * Fetch one page of opportunities from a pipeline.
 * GHL returns max 100 per page. Use startAfterId for cursor pagination.
 */
export async function fetchOpportunitiesPage(
  pipelineId: string,
  startAfterId?: string
): Promise<{
  opportunities: import("./types.js").GHLOpportunity[];
  total: number;
}> {
  const params = new URLSearchParams({
    location_id: getLocationId(),
    pipeline_id: pipelineId,
    limit: "100",
  });
  if (startAfterId) params.set("startAfterId", startAfterId);

  const res = await fetchWithRetry(
    `${BASE_URL}/opportunities/search?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(`GHL opps: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    opportunities: data.opportunities || [],
    total: data.meta?.total || 0,
  };
}

/**
 * Fetch full contact details including custom fields.
 * Includes 600ms delay for rate limiting.
 */
export async function fetchContact(
  contactId: string
): Promise<import("./types.js").GHLContactFull> {
  await sleep(600);
  const res = await fetchWithRetry(
    `${BASE_URL}/contacts/${contactId}`,
    { headers: getHeaders() }
  );
  if (!res.ok)
    throw new Error(`GHL contact ${contactId}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.contact;
}

/**
 * Fetch one page of contacts (list endpoint, no custom fields).
 * Used for scanning all contacts to find old Contact Type values.
 */
export async function fetchContactsPage(
  startAfterId?: string
): Promise<{
  contacts: { id: string; tags: string[]; firstName: string; lastName: string }[];
  startAfterId: string | null;
}> {
  await sleep(600);
  const params = new URLSearchParams({
    locationId: getLocationId(),
    limit: "100",
  });
  if (startAfterId) params.set("startAfterId", startAfterId);

  const res = await fetchWithRetry(`${BASE_URL}/contacts/?${params}`, {
    headers: getHeaders(),
  });
  if (!res.ok)
    throw new Error(`GHL contacts page: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    contacts: data.contacts || [],
    startAfterId: data.meta?.startAfterId ?? null,
  };
}

/**
 * Update a contact's tags and/or custom fields.
 * Tags is a FULL REPLACEMENT — send the complete final array.
 * CustomFields is partial — only updates fields you specify.
 * Includes 600ms delay for rate limiting.
 */
export async function updateContact(
  contactId: string,
  payload: {
    tags?: string[];
    customFields?: { id: string; value: unknown }[];
  }
): Promise<void> {
  await sleep(600);
  const res = await fetchWithRetry(`${BASE_URL}/contacts/${contactId}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL update ${contactId}: ${res.status} ${body}`);
  }
}
```

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit scripts/cleanup/lib/types.ts 2>&1 || echo "tsc not needed for tsx execution, moving on"`

This isn't blocking — `npx tsx` handles TS directly. Just a sanity check.

- [ ] **Step 5: Commit**

```bash
git add scripts/cleanup/lib/types.ts scripts/cleanup/lib/ghl-api.ts
git commit -m "feat(cleanup): add shared types and GHL API helpers for buyer pipeline cleanup"
```

---

### Task 2: Create data fetcher script

**Files:**
- Create: `scripts/cleanup/01-fetch-data.ts`

**What it does:**
1. Paginates all Buyer Pipeline opportunities (604 expected)
2. Deduplicates by contact ID
3. Fetches full contact details for each unique contact (includes custom fields)
4. Paginates ALL contacts in the system, fetches full details for any that have the old Contact Type field set but aren't already in the Buyer Pipeline set
5. Writes combined data to `.tmp/buyer-pipeline-data.json`

- [ ] **Step 1: Write 01-fetch-data.ts**

Create `scripts/cleanup/01-fetch-data.ts`:

```typescript
import { writeFileSync, mkdirSync } from "fs";
import {
  BUYER_PIPELINE_ID,
  CONTACT_TYPE_OLD_ID,
  fetchOpportunitiesPage,
  fetchContact,
  fetchContactsPage,
} from "./lib/ghl-api.js";
import type {
  GHLOpportunity,
  ContactRecord,
  BuyerPipelineData,
} from "./lib/types.js";

mkdirSync(".tmp", { recursive: true });

async function fetchAllBuyerPipelineOpps(): Promise<GHLOpportunity[]> {
  const all: GHLOpportunity[] = [];
  let startAfterId: string | undefined;
  let page = 0;

  while (true) {
    page++;
    const { opportunities, total } = await fetchOpportunitiesPage(
      BUYER_PIPELINE_ID,
      startAfterId
    );
    all.push(...opportunities);
    console.log(`  Page ${page}: fetched ${opportunities.length} (${all.length}/${total} total)`);

    if (opportunities.length === 0 || all.length >= total) break;
    startAfterId = opportunities[opportunities.length - 1].id;
  }

  return all;
}

async function fetchFullContacts(
  contactIds: string[],
  label: string
): Promise<Map<string, ContactRecord>> {
  const contacts = new Map<string, ContactRecord>();
  let i = 0;

  for (const id of contactIds) {
    i++;
    if (i % 25 === 0) console.log(`  ${label}: ${i}/${contactIds.length}`);

    try {
      const c = await fetchContact(id);
      contacts.set(id, {
        contactId: c.id,
        name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown",
        email: c.email || null,
        phone: c.phone || null,
        tags: c.tags || [],
        customFields: c.customFields || [],
        opportunities: [],
        source: c.source || null,
        fromBuyerPipeline: false,
        fromOldTypeScan: false,
      });
    } catch (err) {
      console.error(`  ❌ Failed to fetch contact ${id}: ${err}`);
    }
  }

  return contacts;
}

async function scanForOldTypeContacts(
  alreadyFetched: Set<string>
): Promise<string[]> {
  const needsFetch: string[] = [];
  let startAfterId: string | undefined;
  let scanned = 0;
  let page = 0;

  console.log("\n📋 Scanning all contacts for old Contact Type field...");

  while (true) {
    page++;
    const result = await fetchContactsPage(startAfterId || undefined);
    scanned += result.contacts.length;

    if (page % 5 === 0) console.log(`  Scanned ${scanned} contacts (page ${page})...`);

    // The list endpoint doesn't return custom fields, so we need to fetch
    // full details for contacts NOT already in our set. We'll check their
    // custom fields after fetching.
    for (const c of result.contacts) {
      if (!alreadyFetched.has(c.id)) {
        needsFetch.push(c.id);
      }
    }

    if (result.contacts.length === 0 || !result.startAfterId) break;
    startAfterId = result.startAfterId;
  }

  console.log(`  Total scanned: ${scanned}. Need to check ${needsFetch.length} non-pipeline contacts.`);
  return needsFetch;
}

async function main() {
  console.log("🚀 Buyer Pipeline Data Fetch\n");

  // Step 1: Fetch all Buyer Pipeline opportunities
  console.log("📦 Fetching Buyer Pipeline opportunities...");
  const opps = await fetchAllBuyerPipelineOpps();
  console.log(`  Total: ${opps.length} opportunities\n`);

  // Step 2: Deduplicate contacts
  const contactOppMap = new Map<string, GHLOpportunity[]>();
  for (const opp of opps) {
    if (!opp.contact?.id) continue;
    const existing = contactOppMap.get(opp.contact.id) || [];
    existing.push(opp);
    contactOppMap.set(opp.contact.id, existing);
  }
  console.log(`👤 Unique contacts in Buyer Pipeline: ${contactOppMap.size}\n`);

  // Step 3: Fetch full details for pipeline contacts
  console.log("📇 Fetching full contact details for pipeline contacts...");
  const pipelineContacts = await fetchFullContacts(
    [...contactOppMap.keys()],
    "Pipeline contacts"
  );

  // Attach opportunity data
  for (const [contactId, oppList] of contactOppMap) {
    const contact = pipelineContacts.get(contactId);
    if (contact) {
      contact.fromBuyerPipeline = true;
      contact.opportunities = oppList.map((o) => ({
        id: o.id,
        name: o.name,
        stageId: o.pipelineStageId,
        status: o.status,
      }));
    }
  }

  // Step 4: Scan all contacts for old Contact Type field
  const alreadyFetched = new Set(pipelineContacts.keys());
  const additionalIds = await scanForOldTypeContacts(alreadyFetched);

  // Fetch full details for additional contacts in batches
  // Only keep those with old Contact Type field set
  let oldTypeCount = 0;
  const additionalContacts = new Map<string, ContactRecord>();

  if (additionalIds.length > 0) {
    console.log(`\n📇 Fetching details for ${additionalIds.length} non-pipeline contacts...`);
    const fetched = await fetchFullContacts(additionalIds, "Old type scan");

    for (const [id, contact] of fetched) {
      const oldTypeField = contact.customFields.find(
        (cf) => cf.id === CONTACT_TYPE_OLD_ID
      );
      if (oldTypeField && oldTypeField.value) {
        contact.fromOldTypeScan = true;
        additionalContacts.set(id, contact);
        oldTypeCount++;
      }
    }
    console.log(`  Found ${oldTypeCount} non-pipeline contacts with old Contact Type set.`);
  }

  // Also check pipeline contacts for old type
  for (const [, contact] of pipelineContacts) {
    const oldTypeField = contact.customFields.find(
      (cf) => cf.id === CONTACT_TYPE_OLD_ID
    );
    if (oldTypeField && oldTypeField.value) {
      oldTypeCount++;
    }
  }

  // Step 5: Combine and write
  const allContacts = [
    ...pipelineContacts.values(),
    ...additionalContacts.values(),
  ];

  const data: BuyerPipelineData = {
    fetchedAt: new Date().toISOString(),
    totalOpportunities: opps.length,
    uniqueContacts: allContacts.length,
    contacts: allContacts,
  };

  writeFileSync(".tmp/buyer-pipeline-data.json", JSON.stringify(data, null, 2));

  console.log(`\n✅ Data fetch complete!`);
  console.log(`   Opportunities: ${data.totalOpportunities}`);
  console.log(`   Unique contacts: ${data.uniqueContacts}`);
  console.log(`   Pipeline contacts: ${pipelineContacts.size}`);
  console.log(`   Additional (old type): ${additionalContacts.size}`);
  console.log(`   Written to: .tmp/buyer-pipeline-data.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Run the data fetcher**

Run: `npx tsx scripts/cleanup/01-fetch-data.ts`

Expected: Script paginates through all Buyer Pipeline opportunities, fetches contact details, scans for old type contacts, writes `.tmp/buyer-pipeline-data.json`. Runtime ~10-15 minutes depending on contact count.

- [ ] **Step 3: Verify output**

Run: `cat .tmp/buyer-pipeline-data.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Opps: {d[\"totalOpportunities\"]}'); print(f'Contacts: {d[\"uniqueContacts\"]}'); print(f'Pipeline: {sum(1 for c in d[\"contacts\"] if c[\"fromBuyerPipeline\"])}'); print(f'Old type: {sum(1 for c in d[\"contacts\"] if c[\"fromOldTypeScan\"])}')"`

Expected: ~604 opportunities, ~400-500 unique contacts, most from pipeline, possibly some from old type scan.

- [ ] **Step 4: Commit**

```bash
git add scripts/cleanup/01-fetch-data.ts
git commit -m "feat(cleanup): add data fetcher for buyer pipeline contacts"
```

---

### Task 3: Create buyer tag + Contact Type analyzer

**Files:**
- Create: `scripts/cleanup/02-analyze-buyer-tags.ts`

**What it does:** Reads `.tmp/buyer-pipeline-data.json`, identifies Buyer Pipeline contacts missing the "buyer" tag or missing "Buyer" in the Contact Type multi-select field, writes proposals to `.tmp/proposed-buyer-tags.json`.

- [ ] **Step 1: Write 02-analyze-buyer-tags.ts**

Create `scripts/cleanup/02-analyze-buyer-tags.ts`:

```typescript
import { readFileSync, writeFileSync } from "fs";
import { CONTACT_TYPE_MULTI_ID } from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const changes: ProposedChange[] = [];

for (const contact of data.contacts) {
  // Only check Buyer Pipeline contacts for buyer tag + type
  if (!contact.fromBuyerPipeline) continue;

  // Check 1: Missing "buyer" tag (case-insensitive)
  const hasBuyerTag = contact.tags.some(
    (t) => t.toLowerCase() === "buyer"
  );
  if (!hasBuyerTag) {
    changes.push({
      contactId: contact.contactId,
      name: contact.name,
      action: "ADD_BUYER_TAG",
      field: "tags",
      currentValue: contact.tags,
      proposedValue: [...contact.tags, "buyer"],
      reason: "Contact is in Buyer Pipeline but missing 'buyer' tag",
    });
  }

  // Check 2: Missing "Buyer" in Contact Type multi-select
  const multiSelectField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_MULTI_ID
  );
  const currentValues: string[] = Array.isArray(multiSelectField?.value)
    ? (multiSelectField.value as string[])
    : [];
  const hasBuyerType = currentValues.some(
    (v) => v.toLowerCase() === "buyer"
  );

  if (!hasBuyerType) {
    changes.push({
      contactId: contact.contactId,
      name: contact.name,
      action: "ADD_BUYER_TYPE",
      field: `customField:${CONTACT_TYPE_MULTI_ID}`,
      currentValue: currentValues,
      proposedValue: [...currentValues, "Buyer"],
      reason: "Contact is in Buyer Pipeline but missing 'Buyer' in Contact Type multi-select",
    });
  }
}

const output: ProposedChangeFile = {
  analyzer: "02-analyze-buyer-tags",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(".tmp/proposed-buyer-tags.json", JSON.stringify(output, null, 2));

console.log(`✅ Buyer tag analyzer complete`);
console.log(`   Contacts scanned: ${data.contacts.filter((c) => c.fromBuyerPipeline).length}`);
console.log(`   Missing buyer tag: ${changes.filter((c) => c.action === "ADD_BUYER_TAG").length}`);
console.log(`   Missing Buyer type: ${changes.filter((c) => c.action === "ADD_BUYER_TYPE").length}`);
console.log(`   Total proposals: ${changes.length}`);
```

- [ ] **Step 2: Run the analyzer**

Run: `npx tsx scripts/cleanup/02-analyze-buyer-tags.ts`

Expected: Prints counts of contacts missing buyer tag and Buyer type. Writes `.tmp/proposed-buyer-tags.json`.

- [ ] **Step 3: Spot-check proposals**

Run: `cat .tmp/proposed-buyer-tags.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Total proposals: {d[\"totalProposed\"]}'); [print(f'  {c[\"name\"]}: {c[\"action\"]}') for c in d['changes'][:10]]"`

Verify the proposals make sense — contacts should be ones we know are missing the tag.

- [ ] **Step 4: Commit**

```bash
git add scripts/cleanup/02-analyze-buyer-tags.ts
git commit -m "feat(cleanup): add buyer tag + contact type analyzer"
```

---

### Task 4: Create missing contact info analyzer

**Files:**
- Create: `scripts/cleanup/03-analyze-missing-info.ts`

**What it does:** Identifies Buyer Pipeline contacts with no phone AND no email, proposes adding "need contact info" tag.

- [ ] **Step 1: Write 03-analyze-missing-info.ts**

Create `scripts/cleanup/03-analyze-missing-info.ts`:

```typescript
import { readFileSync, writeFileSync } from "fs";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const changes: ProposedChange[] = [];
const TAG = "need contact info";

for (const contact of data.contacts) {
  if (!contact.fromBuyerPipeline) continue;

  const hasPhone = contact.phone && contact.phone.trim().length > 0;
  const hasEmail =
    contact.email &&
    contact.email.trim().length > 0 &&
    contact.email !== "?";

  if (!hasPhone && !hasEmail) {
    const alreadyTagged = contact.tags.some(
      (t) => t.toLowerCase() === TAG
    );
    if (!alreadyTagged) {
      changes.push({
        contactId: contact.contactId,
        name: contact.name,
        action: "ADD_NEED_CONTACT_INFO_TAG",
        field: "tags",
        currentValue: contact.tags,
        proposedValue: [...contact.tags, TAG],
        reason: "Contact has no phone and no email — unreachable for buyer blasts",
      });
    }
  }
}

const output: ProposedChangeFile = {
  analyzer: "03-analyze-missing-info",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(
  ".tmp/proposed-missing-info.json",
  JSON.stringify(output, null, 2)
);

console.log(`✅ Missing info analyzer complete`);
console.log(`   Contacts scanned: ${data.contacts.filter((c) => c.fromBuyerPipeline).length}`);
console.log(`   Missing contact info (newly tagged): ${changes.length}`);
```

- [ ] **Step 2: Run and verify**

Run: `npx tsx scripts/cleanup/03-analyze-missing-info.ts`

Expected: Prints count of contacts needing the "need contact info" tag.

- [ ] **Step 3: Commit**

```bash
git add scripts/cleanup/03-analyze-missing-info.ts
git commit -m "feat(cleanup): add missing contact info analyzer"
```

---

### Task 5: Create old Contact Type migration analyzer

**Files:**
- Create: `scripts/cleanup/04-analyze-old-type.ts`

**What it does:** Finds ALL contacts (pipeline + non-pipeline) with the old single-select Contact Type field set, proposes migration to the new multi-select using the mapping in the spec.

- [ ] **Step 1: Write 04-analyze-old-type.ts**

Create `scripts/cleanup/04-analyze-old-type.ts`:

```typescript
import { readFileSync, writeFileSync } from "fs";
import {
  CONTACT_TYPE_MULTI_ID,
  CONTACT_TYPE_OLD_ID,
  OLD_TYPE_MIGRATION,
} from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const changes: ProposedChange[] = [];

for (const contact of data.contacts) {
  const oldField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_OLD_ID
  );
  if (!oldField || !oldField.value) continue;

  const oldValue = String(oldField.value).trim();
  if (!oldValue) continue;

  const newValue = OLD_TYPE_MIGRATION[oldValue];

  // Get current multi-select values
  const multiField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_MULTI_ID
  );
  const currentMulti: string[] = Array.isArray(multiField?.value)
    ? (multiField.value as string[])
    : [];

  if (newValue) {
    // Map old value to new multi-select
    const alreadyHas = currentMulti.some(
      (v) => v.toLowerCase() === newValue.toLowerCase()
    );
    if (!alreadyHas) {
      changes.push({
        contactId: contact.contactId,
        name: contact.name,
        action: "MIGRATE_OLD_TYPE_ADD",
        field: `customField:${CONTACT_TYPE_MULTI_ID}`,
        currentValue: currentMulti,
        proposedValue: [...currentMulti, newValue],
        reason: `Old Contact Type "${oldValue}" maps to "${newValue}" in new multi-select`,
      });
    }
  } else {
    // No mapping exists — this shouldn't happen with current mapping table
    // but handle gracefully
    console.warn(
      `  ⚠️ No mapping for old Contact Type value "${oldValue}" on ${contact.name} (${contact.contactId})`
    );
  }

  // Always clear the old field
  changes.push({
    contactId: contact.contactId,
    name: contact.name,
    action: "CLEAR_OLD_TYPE",
    field: `customField:${CONTACT_TYPE_OLD_ID}`,
    currentValue: oldValue,
    proposedValue: "",
    reason: `Clearing deprecated single-select Contact Type field (value was "${oldValue}")`,
  });
}

const output: ProposedChangeFile = {
  analyzer: "04-analyze-old-type",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(
  ".tmp/proposed-old-type.json",
  JSON.stringify(output, null, 2)
);

const migrations = changes.filter((c) => c.action === "MIGRATE_OLD_TYPE_ADD");
const clears = changes.filter((c) => c.action === "CLEAR_OLD_TYPE");

console.log(`✅ Old Contact Type migration analyzer complete`);
console.log(`   Contacts with old field: ${clears.length}`);
console.log(`   Values to migrate: ${migrations.length}`);
console.log(`   Fields to clear: ${clears.length}`);
```

- [ ] **Step 2: Run and verify**

Run: `npx tsx scripts/cleanup/04-analyze-old-type.ts`

Expected: Prints count of contacts with old Contact Type values and proposed migrations.

- [ ] **Step 3: Commit**

```bash
git add scripts/cleanup/04-analyze-old-type.ts
git commit -m "feat(cleanup): add old Contact Type migration analyzer"
```

---

### Task 6: Create hashtag tag normalizer analyzer

**Files:**
- Create: `scripts/cleanup/05-analyze-tags.ts`

**What it does:** Finds Buyer Pipeline contacts with hashtag-prefixed city tags, proposes removing the hashtag version and adding the clean version.

- [ ] **Step 1: Write 05-analyze-tags.ts**

Create `scripts/cleanup/05-analyze-tags.ts`:

```typescript
import { readFileSync, writeFileSync } from "fs";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const changes: ProposedChange[] = [];

for (const contact of data.contacts) {
  if (!contact.fromBuyerPipeline) continue;

  const hashtagTags = contact.tags.filter((t) => t.includes("#"));
  if (hashtagTags.length === 0) continue;

  // Build the proposed clean tags array:
  // - Remove all hashtag tags
  // - Add clean versions (stripped of # and whitespace)
  // - Deduplicate
  const cleanTagSet = new Set<string>();
  const tagsToRemove: string[] = [];

  for (const tag of contact.tags) {
    if (tag.includes("#")) {
      tagsToRemove.push(tag);
      // Strip # and surrounding whitespace
      const clean = tag.replace(/#/g, "").trim().toLowerCase();
      if (clean) cleanTagSet.add(clean);
    } else {
      cleanTagSet.add(tag);
    }
  }

  // Only add clean versions that aren't already present (case-insensitive)
  const existingLower = new Set(
    contact.tags.filter((t) => !t.includes("#")).map((t) => t.toLowerCase())
  );
  const newCleanTags: string[] = [];
  for (const clean of cleanTagSet) {
    if (!existingLower.has(clean)) {
      newCleanTags.push(clean);
    }
  }

  // Build final tags array: existing (no hashtags) + new clean versions
  const finalTags = [
    ...contact.tags.filter((t) => !t.includes("#")),
    ...newCleanTags,
  ];

  for (const hashTag of tagsToRemove) {
    const clean = hashTag.replace(/#/g, "").trim().toLowerCase();
    changes.push({
      contactId: contact.contactId,
      name: contact.name,
      action: "NORMALIZE_HASHTAG_TAG",
      field: "tags",
      currentValue: hashTag,
      proposedValue: clean || "(removed)",
      reason: `Hashtag tag "${hashTag}" normalized to "${clean || "(empty, removed)"}"`,
    });
  }
}

const output: ProposedChangeFile = {
  analyzer: "05-analyze-tags",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(
  ".tmp/proposed-tag-normalize.json",
  JSON.stringify(output, null, 2)
);

const uniqueContacts = new Set(changes.map((c) => c.contactId)).size;

console.log(`✅ Tag normalizer analyzer complete`);
console.log(`   Contacts with hashtag tags: ${uniqueContacts}`);
console.log(`   Tags to normalize: ${changes.length}`);
```

- [ ] **Step 2: Run and verify**

Run: `npx tsx scripts/cleanup/05-analyze-tags.ts`

Expected: Prints count of hashtag tags found and proposed normalizations.

- [ ] **Step 3: Commit**

```bash
git add scripts/cleanup/05-analyze-tags.ts
git commit -m "feat(cleanup): add hashtag tag normalizer analyzer"
```

---

### Task 7: Create merge-and-apply script

**Files:**
- Create: `scripts/cleanup/06-merge-and-apply.ts`

**What it does:** Reads all 4 proposed change files, merges changes by contact into a single update payload, applies via GHL API. Supports `--dry-run` flag.

This is the most critical script — it ensures all changes for a single contact go in ONE API call to avoid race conditions.

- [ ] **Step 1: Write 06-merge-and-apply.ts**

Create `scripts/cleanup/06-merge-and-apply.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  CONTACT_TYPE_MULTI_ID,
  CONTACT_TYPE_OLD_ID,
  updateContact,
} from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
  AppliedResult,
  AppliedChangesFile,
} from "./lib/types.js";

const DRY_RUN = process.argv.includes("--dry-run");

// --- Load all inputs ---
const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const proposalFiles = [
  ".tmp/proposed-buyer-tags.json",
  ".tmp/proposed-missing-info.json",
  ".tmp/proposed-old-type.json",
  ".tmp/proposed-tag-normalize.json",
];

const allChanges: ProposedChange[] = [];
for (const file of proposalFiles) {
  if (!existsSync(file)) {
    console.warn(`⚠️  Missing proposal file: ${file} — skipping`);
    continue;
  }
  const proposal: ProposedChangeFile = JSON.parse(readFileSync(file, "utf-8"));
  allChanges.push(...proposal.changes);
  console.log(`📄 ${proposal.analyzer}: ${proposal.totalProposed} proposals`);
}

console.log(`\n📊 Total proposed changes: ${allChanges.length}`);

// --- Group changes by contact ---
const byContact = new Map<string, ProposedChange[]>();
for (const change of allChanges) {
  const existing = byContact.get(change.contactId) || [];
  existing.push(change);
  byContact.set(change.contactId, existing);
}

console.log(`👤 Contacts to update: ${byContact.size}`);
console.log(`🔧 Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE — applying changes"}\n`);

// --- Build contact lookup for current state ---
const contactMap = new Map(data.contacts.map((c) => [c.contactId, c]));

// --- Merge and apply ---
const results: AppliedResult[] = [];
let successCount = 0;
let failCount = 0;
let skipCount = 0;
let i = 0;

for (const [contactId, changes] of byContact) {
  i++;
  const contact = contactMap.get(contactId);
  if (!contact) {
    console.warn(`  ⚠️ Contact ${contactId} not in data snapshot — skipping`);
    skipCount++;
    continue;
  }

  // Start with current state
  let finalTags = [...contact.tags];
  const customFieldUpdates = new Map<string, unknown>();

  // Get current multi-select value
  const multiField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_MULTI_ID
  );
  let multiValues: string[] = Array.isArray(multiField?.value)
    ? [...(multiField.value as string[])]
    : [];

  for (const change of changes) {
    switch (change.action) {
      case "ADD_BUYER_TAG": {
        if (!finalTags.some((t) => t.toLowerCase() === "buyer")) {
          finalTags.push("buyer");
        }
        break;
      }
      case "ADD_NEED_CONTACT_INFO_TAG": {
        const tag = "need contact info";
        if (!finalTags.some((t) => t.toLowerCase() === tag)) {
          finalTags.push(tag);
        }
        break;
      }
      case "NORMALIZE_HASHTAG_TAG": {
        // Remove all hashtag tags and add clean versions
        const hashTags = finalTags.filter((t) => t.includes("#"));
        const cleanSet = new Set(
          finalTags.filter((t) => !t.includes("#")).map((t) => t.toLowerCase())
        );
        const newClean: string[] = [];
        for (const ht of hashTags) {
          const clean = ht.replace(/#/g, "").trim().toLowerCase();
          if (clean && !cleanSet.has(clean)) {
            newClean.push(clean);
            cleanSet.add(clean);
          }
        }
        finalTags = [
          ...finalTags.filter((t) => !t.includes("#")),
          ...newClean,
        ];
        break;
      }
      case "ADD_BUYER_TYPE": {
        if (!multiValues.some((v) => v.toLowerCase() === "buyer")) {
          multiValues.push("Buyer");
        }
        break;
      }
      case "MIGRATE_OLD_TYPE_ADD": {
        const newVal = change.proposedValue as string[];
        // The proposed value is the full new array — extract the added value
        const added = (newVal as string[]).find(
          (v) => !(change.currentValue as string[]).includes(v)
        );
        if (added && !multiValues.some((v) => v.toLowerCase() === added.toLowerCase())) {
          multiValues.push(added);
        }
        break;
      }
      case "CLEAR_OLD_TYPE": {
        customFieldUpdates.set(CONTACT_TYPE_OLD_ID, "");
        break;
      }
    }
  }

  // Build the API payload
  const payload: { tags?: string[]; customFields?: { id: string; value: unknown }[] } = {};

  // Only include tags if they changed
  const tagsChanged =
    finalTags.length !== contact.tags.length ||
    finalTags.some((t, idx) => t !== contact.tags[idx]) ||
    contact.tags.some((t) => !finalTags.includes(t));
  if (tagsChanged) {
    payload.tags = finalTags;
  }

  // Build custom fields array
  const cfUpdates: { id: string; value: unknown }[] = [];

  // Multi-select Contact Type
  const origMulti = Array.isArray(multiField?.value)
    ? (multiField.value as string[])
    : [];
  const multiChanged =
    multiValues.length !== origMulti.length ||
    multiValues.some((v) => !origMulti.includes(v));
  if (multiChanged) {
    cfUpdates.push({ id: CONTACT_TYPE_MULTI_ID, value: multiValues });
  }

  // Old type clear
  if (customFieldUpdates.has(CONTACT_TYPE_OLD_ID)) {
    cfUpdates.push({ id: CONTACT_TYPE_OLD_ID, value: "" });
  }

  if (cfUpdates.length > 0) {
    payload.customFields = cfUpdates;
  }

  // Skip if no actual changes
  if (!payload.tags && !payload.customFields) {
    skipCount++;
    continue;
  }

  const result: AppliedResult = {
    contactId,
    name: contact.name,
    success: false,
    changes,
    payload,
  };

  if (DRY_RUN) {
    result.success = true;
    if (i <= 5) {
      console.log(`  [DRY RUN] ${contact.name}: ${changes.length} changes`);
      if (payload.tags) console.log(`    Tags: ${contact.tags.length} → ${payload.tags.length}`);
      if (payload.customFields) console.log(`    Custom fields: ${payload.customFields.length} updates`);
    }
    successCount++;
  } else {
    try {
      await updateContact(contactId, payload);
      result.success = true;
      successCount++;
      if (i % 25 === 0) console.log(`  Applied ${i}/${byContact.size}...`);
    } catch (err) {
      result.success = false;
      result.error = String(err);
      failCount++;
      console.error(`  ❌ Failed ${contact.name} (${contactId}): ${err}`);
    }
  }

  results.push(result);
}

// --- Write output ---
const output: AppliedChangesFile = {
  appliedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  totalContacts: byContact.size,
  totalSuccess: successCount,
  totalFailed: failCount,
  totalSkipped: skipCount,
  results,
};

writeFileSync(".tmp/changes-applied.json", JSON.stringify(output, null, 2));

console.log(`\n${DRY_RUN ? "🏃 DRY RUN" : "✅"} Merge and apply complete!`);
console.log(`   Contacts processed: ${byContact.size}`);
console.log(`   Successful: ${successCount}`);
console.log(`   Failed: ${failCount}`);
console.log(`   Skipped (no changes needed): ${skipCount}`);
console.log(`   Written to: .tmp/changes-applied.json`);
```

- [ ] **Step 2: Run dry-run**

Run: `npx tsx scripts/cleanup/06-merge-and-apply.ts --dry-run`

Expected: Processes all proposals, prints what WOULD be changed, writes `.tmp/changes-applied.json` with `dryRun: true`. No GHL API writes.

- [ ] **Step 3: Spot-check dry-run results**

Run: `cat .tmp/changes-applied.json | python3 -c "import json,sys; d=json.load(sys.stdin); print(f'Dry run: {d[\"dryRun\"]}'); print(f'Total: {d[\"totalContacts\"]}'); print(f'Success: {d[\"totalSuccess\"]}'); print(f'Skipped: {d[\"totalSkipped\"]}'); r=d['results'][0] if d['results'] else {}; print(f'Sample: {r.get(\"name\",\"?\")} — {len(r.get(\"changes\",[]))} changes')"`

Verify counts look reasonable and no errors.

- [ ] **Step 4: Commit**

```bash
git add scripts/cleanup/06-merge-and-apply.ts
git commit -m "feat(cleanup): add merge-and-apply script with dry-run support"
```

---

### Task 8: Create QA review script

**Files:**
- Create: `scripts/cleanup/07-qa-review.ts`

**What it does:** Reads the data snapshot, all proposal files, and the applied changes file. Verifies completeness, correctness, no collateral damage, and no plan drift. Outputs `.tmp/qa-review-report.md`.

- [ ] **Step 1: Write 07-qa-review.ts**

Create `scripts/cleanup/07-qa-review.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  CONTACT_TYPE_MULTI_ID,
  CONTACT_TYPE_OLD_ID,
  OLD_TYPE_MIGRATION,
} from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChangeFile,
  AppliedChangesFile,
} from "./lib/types.js";

// --- Load all data ---
const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);
const applied: AppliedChangesFile = JSON.parse(
  readFileSync(".tmp/changes-applied.json", "utf-8")
);

const proposalFiles: Record<string, string> = {
  "02-analyze-buyer-tags": ".tmp/proposed-buyer-tags.json",
  "03-analyze-missing-info": ".tmp/proposed-missing-info.json",
  "04-analyze-old-type": ".tmp/proposed-old-type.json",
  "05-analyze-tags": ".tmp/proposed-tag-normalize.json",
};

const proposals = new Map<string, ProposedChangeFile>();
for (const [name, file] of Object.entries(proposalFiles)) {
  if (existsSync(file)) {
    proposals.set(name, JSON.parse(readFileSync(file, "utf-8")));
  }
}

// --- QA Checks ---
interface QACheck {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  details: string;
  issues: string[];
}

const checks: QACheck[] = [];

// Check 1: Completeness — every proposed contact got processed
{
  const proposedContactIds = new Set<string>();
  for (const [, p] of proposals) {
    for (const c of p.changes) proposedContactIds.add(c.contactId);
  }
  const appliedContactIds = new Set(applied.results.map((r) => r.contactId));
  const missed = [...proposedContactIds].filter((id) => !appliedContactIds.has(id));

  // Some contacts may have been "skipped" if no net changes needed
  const skippedIds = new Set<string>();
  // Contacts that were in proposals but had no actual changes (already clean) are OK
  const issues = missed.filter((id) => {
    // Check if all proposals for this contact were no-ops
    return true; // For now, flag all missed
  });

  checks.push({
    name: "Completeness",
    status: missed.length === 0 ? "PASS" : "WARN",
    details: `${appliedContactIds.size} of ${proposedContactIds.size} proposed contacts were processed`,
    issues: missed.map((id) => {
      const contact = data.contacts.find((c) => c.contactId === id);
      return `Contact ${contact?.name || id} was proposed but not in applied results`;
    }),
  });
}

// Check 2: Correctness — buyer tag proposals match spec rules
{
  const issues: string[] = [];
  const buyerProposals = proposals.get("02-analyze-buyer-tags");

  if (buyerProposals) {
    for (const change of buyerProposals.changes) {
      if (change.action === "ADD_BUYER_TAG") {
        const contact = data.contacts.find((c) => c.contactId === change.contactId);
        if (contact?.tags.some((t) => t.toLowerCase() === "buyer")) {
          issues.push(`${change.name}: proposed ADD_BUYER_TAG but already has "buyer" tag`);
        }
      }
      if (change.action === "ADD_BUYER_TYPE") {
        const contact = data.contacts.find((c) => c.contactId === change.contactId);
        const field = contact?.customFields.find((cf) => cf.id === CONTACT_TYPE_MULTI_ID);
        const values = Array.isArray(field?.value) ? (field.value as string[]) : [];
        if (values.some((v) => v.toLowerCase() === "buyer")) {
          issues.push(`${change.name}: proposed ADD_BUYER_TYPE but already has "Buyer"`);
        }
      }
    }
  }

  checks.push({
    name: "Correctness — Buyer Tag + Type",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `Checked ${buyerProposals?.changes.length || 0} buyer tag/type proposals`,
    issues,
  });
}

// Check 3: Correctness — old type migration mapping
{
  const issues: string[] = [];
  const oldTypeProposals = proposals.get("04-analyze-old-type");

  if (oldTypeProposals) {
    for (const change of oldTypeProposals.changes) {
      if (change.action === "MIGRATE_OLD_TYPE_ADD") {
        // Verify the proposed new value matches our mapping
        const oldVal = change.reason.match(/Old Contact Type "(.+?)"/)?.[1];
        const newVal = change.reason.match(/maps to "(.+?)"/)?.[1];
        if (oldVal && newVal && OLD_TYPE_MIGRATION[oldVal] !== newVal) {
          issues.push(
            `${change.name}: mapped "${oldVal}" to "${newVal}" but spec says "${OLD_TYPE_MIGRATION[oldVal]}"`
          );
        }
      }
    }
  }

  checks.push({
    name: "Correctness — Old Type Migration",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `Checked ${oldTypeProposals?.changes.length || 0} migration proposals`,
    issues,
  });
}

// Check 4: No collateral damage — applied payloads don't remove existing tags
{
  const issues: string[] = [];

  for (const result of applied.results) {
    if (!result.payload.tags) continue;

    const contact = data.contacts.find((c) => c.contactId === result.contactId);
    if (!contact) continue;

    // Check that no existing non-hashtag tags were removed
    for (const existingTag of contact.tags) {
      if (existingTag.includes("#")) continue; // Hashtag removal is intentional
      if (!result.payload.tags.some((t) => t.toLowerCase() === existingTag.toLowerCase())) {
        issues.push(
          `${result.name}: existing tag "${existingTag}" would be removed`
        );
      }
    }
  }

  checks.push({
    name: "No Collateral Damage — Tags",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `Checked ${applied.results.filter((r) => r.payload.tags).length} tag updates for accidental removals`,
    issues,
  });
}

// Check 5: Error accounting
{
  const failedResults = applied.results.filter((r) => !r.success);

  checks.push({
    name: "Error Accounting",
    status: failedResults.length === 0 ? "PASS" : "WARN",
    details: `${applied.totalSuccess} succeeded, ${applied.totalFailed} failed, ${applied.totalSkipped} skipped`,
    issues: failedResults.map(
      (r) => `${r.name} (${r.contactId}): ${r.error || "unknown error"}`
    ),
  });
}

// Check 6: All pipeline contacts covered — no one left behind
{
  const issues: string[] = [];
  const pipelineContacts = data.contacts.filter((c) => c.fromBuyerPipeline);
  const processedIds = new Set(applied.results.map((r) => r.contactId));

  let needingFixCount = 0;
  for (const contact of pipelineContacts) {
    const hasBuyerTag = contact.tags.some((t) => t.toLowerCase() === "buyer");
    const multiField = contact.customFields.find((cf) => cf.id === CONTACT_TYPE_MULTI_ID);
    const multiValues = Array.isArray(multiField?.value) ? (multiField.value as string[]) : [];
    const hasBuyerType = multiValues.some((v) => v.toLowerCase() === "buyer");

    if (!hasBuyerTag || !hasBuyerType) {
      needingFixCount++;
      if (!processedIds.has(contact.contactId)) {
        issues.push(
          `${contact.name} (${contact.contactId}): needs fix but wasn't processed`
        );
      }
    }
  }

  checks.push({
    name: "Pipeline Coverage",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `${needingFixCount} pipeline contacts needed fixes, ${processedIds.size} were processed`,
    issues,
  });
}

// --- Generate report ---
const passed = checks.filter((c) => c.status === "PASS").length;
const failed = checks.filter((c) => c.status === "FAIL").length;
const warned = checks.filter((c) => c.status === "WARN").length;

let report = `# QA Review Report — ${new Date().toISOString().split("T")[0]}\n\n`;
report += `**Mode:** ${applied.dryRun ? "DRY RUN" : "LIVE"}\n`;
report += `**Result:** ${failed === 0 ? "✅ ALL CHECKS PASSED" : "❌ ISSUES FOUND"}\n`;
report += `**Summary:** ${passed} PASS, ${warned} WARN, ${failed} FAIL\n\n`;
report += `---\n\n`;

for (const check of checks) {
  const icon = check.status === "PASS" ? "✅" : check.status === "WARN" ? "⚠️" : "❌";
  report += `## ${icon} ${check.name}: ${check.status}\n\n`;
  report += `${check.details}\n\n`;
  if (check.issues.length > 0) {
    report += `**Issues:**\n`;
    for (const issue of check.issues.slice(0, 20)) {
      report += `- ${issue}\n`;
    }
    if (check.issues.length > 20) {
      report += `- ... and ${check.issues.length - 20} more\n`;
    }
    report += `\n`;
  }
}

writeFileSync(".tmp/qa-review-report.md", report);

console.log(`\n📋 QA Review Complete`);
console.log(`   ${passed} PASS | ${warned} WARN | ${failed} FAIL`);
console.log(`   Report: .tmp/qa-review-report.md`);

if (failed > 0) {
  console.error(`\n❌ QA FAILED — review .tmp/qa-review-report.md before proceeding`);
  process.exit(1);
}
```

- [ ] **Step 2: Run QA on dry-run results**

Run: `npx tsx scripts/cleanup/07-qa-review.ts`

Expected: All checks PASS or WARN (no FAIL). Report written to `.tmp/qa-review-report.md`.

- [ ] **Step 3: Review the QA report**

Run: `cat .tmp/qa-review-report.md`

Verify all checks make sense. If any FAIL, investigate and fix before proceeding to live run.

- [ ] **Step 4: Commit**

```bash
git add scripts/cleanup/07-qa-review.ts
git commit -m "feat(cleanup): add QA review script"
```

---

### Task 9: Create report generator

**Files:**
- Create: `scripts/cleanup/08-generate-report.ts`

**What it does:** Reads all data files and produces a human-readable markdown audit report.

- [ ] **Step 1: Write 08-generate-report.ts**

Create `scripts/cleanup/08-generate-report.ts`:

```typescript
import { readFileSync, writeFileSync, existsSync } from "fs";
import { BUYER_PIPELINE_STAGES } from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChangeFile,
  AppliedChangesFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);
const applied: AppliedChangesFile = JSON.parse(
  readFileSync(".tmp/changes-applied.json", "utf-8")
);

// Load proposals
function loadProposal(file: string): ProposedChangeFile | null {
  return existsSync(file)
    ? JSON.parse(readFileSync(file, "utf-8"))
    : null;
}
const buyerTags = loadProposal(".tmp/proposed-buyer-tags.json");
const missingInfo = loadProposal(".tmp/proposed-missing-info.json");
const oldType = loadProposal(".tmp/proposed-old-type.json");
const tagNorm = loadProposal(".tmp/proposed-tag-normalize.json");

const date = new Date().toISOString().split("T")[0];
let md = `# Buyer Pipeline Audit Report — ${date}\n\n`;

// Summary
const pipelineContacts = data.contacts.filter((c) => c.fromBuyerPipeline);
md += `## Summary\n\n`;
md += `| Metric | Count |\n|--------|-------|\n`;
md += `| Total opportunities | ${data.totalOpportunities} |\n`;
md += `| Unique contacts (pipeline) | ${pipelineContacts.length} |\n`;
md += `| Additional contacts (old type scan) | ${data.contacts.filter((c) => c.fromOldTypeScan).length} |\n`;
md += `| Contacts updated | ${applied.totalSuccess} |\n`;
md += `| Contacts failed | ${applied.totalFailed} |\n`;
md += `| Contacts skipped (already clean) | ${applied.totalSkipped} |\n`;
md += `| Mode | ${applied.dryRun ? "DRY RUN" : "LIVE"} |\n\n`;

// Stage breakdown
md += `## Buyer Pipeline Stage Breakdown\n\n`;
md += `| Stage | Contacts |\n|-------|----------|\n`;
const stageCounts = new Map<string, number>();
for (const contact of pipelineContacts) {
  for (const opp of contact.opportunities) {
    const stage = BUYER_PIPELINE_STAGES[opp.stageId] || opp.stageId;
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }
}
for (const [stage, count] of [...stageCounts.entries()].sort((a, b) => b[1] - a[1])) {
  md += `| ${stage} | ${count} |\n`;
}
md += `\n`;

// Buyer Tag Added
if (buyerTags) {
  const tagAdds = buyerTags.changes.filter((c) => c.action === "ADD_BUYER_TAG");
  md += `## Buyer Tag Added (${tagAdds.length} contacts)\n\n`;
  if (tagAdds.length > 0) {
    md += `| Name | Contact ID | Previous Tags (sample) |\n|------|-----------|------------------------|\n`;
    for (const c of tagAdds.slice(0, 50)) {
      const tags = (c.currentValue as string[]).slice(0, 5).join(", ");
      md += `| ${c.name} | ${c.contactId} | ${tags} |\n`;
    }
    if (tagAdds.length > 50) md += `| ... | ${tagAdds.length - 50} more | |\n`;
    md += `\n`;
  }

  const typeAdds = buyerTags.changes.filter((c) => c.action === "ADD_BUYER_TYPE");
  md += `## Buyer Type Added to Multi-Select (${typeAdds.length} contacts)\n\n`;
  if (typeAdds.length > 0) {
    md += `| Name | Contact ID | Previous Values | New Values |\n|------|-----------|-----------------|------------|\n`;
    for (const c of typeAdds.slice(0, 50)) {
      md += `| ${c.name} | ${c.contactId} | ${JSON.stringify(c.currentValue)} | ${JSON.stringify(c.proposedValue)} |\n`;
    }
    if (typeAdds.length > 50) md += `| ... | ${typeAdds.length - 50} more | | |\n`;
    md += `\n`;
  }
}

// Need Contact Info
if (missingInfo) {
  md += `## Need Contact Info Tagged (${missingInfo.totalProposed} contacts)\n\n`;
  if (missingInfo.totalProposed > 0) {
    md += `| Name | Contact ID | Opportunities |\n|------|-----------|---------------|\n`;
    for (const c of missingInfo.changes.slice(0, 50)) {
      const contact = data.contacts.find((ct) => ct.contactId === c.contactId);
      const oppCount = contact?.opportunities.length || 0;
      md += `| ${c.name} | ${c.contactId} | ${oppCount} |\n`;
    }
    if (missingInfo.changes.length > 50)
      md += `| ... | ${missingInfo.changes.length - 50} more | |\n`;
    md += `\n`;
  }
}

// Old Type Migration
if (oldType) {
  const migrations = oldType.changes.filter((c) => c.action === "MIGRATE_OLD_TYPE_ADD");
  md += `## Old Contact Type Migrated (${migrations.length} contacts)\n\n`;
  if (migrations.length > 0) {
    md += `| Name | Contact ID | Old Value | New Value |\n|------|-----------|-----------|----------|\n`;
    for (const c of migrations) {
      const oldVal = c.reason.match(/Old Contact Type "(.+?)"/)?.[1] || "?";
      const newVal = c.reason.match(/maps to "(.+?)"/)?.[1] || "?";
      md += `| ${c.name} | ${c.contactId} | ${oldVal} | ${newVal} |\n`;
    }
    md += `\n`;
  }
}

// Tag Normalization
if (tagNorm) {
  md += `## Hashtag Tags Normalized (${tagNorm.totalProposed} tags)\n\n`;
  if (tagNorm.totalProposed > 0) {
    md += `| Name | Old Tag | New Tag |\n|------|---------|--------|\n`;
    for (const c of tagNorm.changes.slice(0, 50)) {
      md += `| ${c.name} | ${c.currentValue} | ${c.proposedValue} |\n`;
    }
    if (tagNorm.changes.length > 50)
      md += `| ... | ${tagNorm.changes.length - 50} more | |\n`;
    md += `\n`;
  }
}

// Remaining Issues
md += `## Remaining Issues\n\n`;

const unqualified = pipelineContacts.filter((c) =>
  c.opportunities.some((o) => o.stageId === "37250c40-7e09-4c51-842a-851b01fd8bfc")
);
md += `- **Contacts in "Buyer Unqualified" stage:** ${unqualified.length} (review if they should remain)\n`;

const needInfo = pipelineContacts.filter(
  (c) => !c.phone && !c.email
);
md += `- **Contacts with no contact info:** ${needInfo.length} (dispo manager follow-up needed)\n`;

// Duplicate detection: same contact with 2+ opportunities
const multiOppContacts = pipelineContacts.filter(
  (c) => c.opportunities.length > 1
);
md += `- **Contacts with multiple opportunities:** ${multiOppContacts.length} (review for true duplicates vs different buy boxes)\n`;

if (applied.totalFailed > 0) {
  md += `- **Failed updates:** ${applied.totalFailed} (review errors in changes-applied.json)\n`;
}

md += `\n---\n\n*Generated at ${new Date().toISOString()}*\n`;

const filename = `.tmp/buyer-pipeline-audit-${date}.md`;
writeFileSync(filename, md);

console.log(`✅ Report generated: ${filename}`);
console.log(`   Pipeline contacts: ${pipelineContacts.length}`);
console.log(`   Updates applied: ${applied.totalSuccess}`);
console.log(`   Remaining issues flagged: ${unqualified.length + needInfo.length + multiOppContacts.length}`);
```

- [ ] **Step 2: Run report generator**

Run: `npx tsx scripts/cleanup/08-generate-report.ts`

Expected: Generates `.tmp/buyer-pipeline-audit-2026-04-07.md` with full audit breakdown.

- [ ] **Step 3: Review the report**

Run: `cat .tmp/buyer-pipeline-audit-2026-04-07.md`

Verify report looks correct and complete.

- [ ] **Step 4: Commit**

```bash
git add scripts/cleanup/08-generate-report.ts
git commit -m "feat(cleanup): add audit report generator"
```

---

### Task 10: Execute the full pipeline

**Files:**
- No new files — runs existing scripts in sequence

This task orchestrates the full pipeline: data fetch → analyze → dry-run → QA → live apply → QA → report.

- [ ] **Step 1: Run data fetcher (if not already run)**

Run: `npx tsx scripts/cleanup/01-fetch-data.ts`

Wait for completion (~10-15 min). Verify `.tmp/buyer-pipeline-data.json` exists.

- [ ] **Step 2: Run all 4 analyzers in parallel**

Run all four in parallel (separate terminals or background):

```bash
npx tsx scripts/cleanup/02-analyze-buyer-tags.ts &
npx tsx scripts/cleanup/03-analyze-missing-info.ts &
npx tsx scripts/cleanup/04-analyze-old-type.ts &
npx tsx scripts/cleanup/05-analyze-tags.ts &
wait
```

Verify all 4 proposal files exist in `.tmp/`.

- [ ] **Step 3: Dry-run merge and apply**

Run: `npx tsx scripts/cleanup/06-merge-and-apply.ts --dry-run`

Review output. Verify counts look reasonable.

- [ ] **Step 4: QA review on dry-run**

Run: `npx tsx scripts/cleanup/07-qa-review.ts`

Expected: All checks PASS. If any FAIL, fix the issue before proceeding.

- [ ] **Step 5: Generate dry-run report for Bobby's review**

Run: `npx tsx scripts/cleanup/08-generate-report.ts`

Run: `cat .tmp/buyer-pipeline-audit-2026-04-07.md`

**STOP HERE** — Present the dry-run report to Bobby for review before applying live changes.

- [ ] **Step 6: Apply live changes (after Bobby approves dry-run)**

Run: `npx tsx scripts/cleanup/06-merge-and-apply.ts`

This is the real run — it will update contacts in GHL. Runtime depends on number of contacts needing updates (~5-10 min with 600ms delay per contact).

- [ ] **Step 7: QA review on live results**

Run: `npx tsx scripts/cleanup/07-qa-review.ts`

Expected: All checks PASS. If any FAIL, review `.tmp/qa-review-report.md` for details.

- [ ] **Step 8: Generate final report**

Run: `npx tsx scripts/cleanup/08-generate-report.ts`

This overwrites the dry-run report with the live results.

- [ ] **Step 9: Review and present final report**

Run: `cat .tmp/buyer-pipeline-audit-2026-04-07.md`

Present to Bobby with summary of all changes applied.

- [ ] **Step 10: Commit all scripts**

```bash
git add scripts/cleanup/
git commit -m "feat: complete buyer pipeline cleanup — Phase 1 CRM hygiene"
```

---

## Execution Notes

- **Rate limiting:** All GHL API calls include 600ms delays. If you see 429 errors, the retry logic handles them with exponential backoff.
- **Idempotent:** All scripts are safe to re-run. Analyzers check current state before proposing changes. The merge step only sends updates for contacts that actually need changes.
- **Dry-run gate:** Task 10 Step 5 is a mandatory review point. Do not proceed to Step 6 without Bobby's approval of the dry-run report.
- **Old field deletion:** After verifying the migration is complete, Bobby can approve deletion of the old Contact Type field via: `DELETE /locations/{locationId}/customFields/4GYXWVRN8x18qWLrdeXX`. This is NOT automated — it requires explicit confirmation.
