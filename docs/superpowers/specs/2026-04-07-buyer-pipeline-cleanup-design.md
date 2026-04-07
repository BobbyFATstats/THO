# Buyer Pipeline Cleanup — Design Spec

**Date:** 2026-04-07
**Phase:** CRM Hygiene Roadmap — Phase 1 (Approach A)
**Scope:** One-time audit and fix of all Buyer Pipeline contacts

---

## Problem

The Buyer Pipeline has 604 opportunities across 10 stages. Exploration of the first 100 reveals systemic data quality issues:

- Contacts in the Buyer Pipeline missing the "buyer" tag (required for buyer blasts and filtering)
- Contacts missing "Buyer" value in the Contact Type (multi-select) field
- Contacts with no phone AND no email (unreachable, should be flagged)
- Old single-select Contact Type field still in use with values that should be migrated
- Hashtag-prefixed city tags (e.g., "#phoenix", "# buckeye") that break automated matching

These issues directly impact disposition operations: buyer blasts skip contacts without the "buyer" tag, deal-to-buyer matching can't work with dirty data, and ~30% of contacts are unreachable.

---

## Architecture

**Parallel subagent architecture** — work is divided across independent agents coordinated by a main orchestrator, with a dedicated QA agent that verifies results against this plan.

```
Main Orchestrator (this session)
│
├── Subagent 1: Data Fetcher
│   └── Fetch all Buyer Pipeline opps, deduplicate contacts, fetch full details
│   └── Output: JSON data file with all contacts + their current state
│
├── Subagent 2: Buyer Tag + Contact Type Fixer
│   └── Input: contacts missing "buyer" tag or "Buyer" in Contact Type
│   └── Applies fixes via GHL API, logs all changes
│
├── Subagent 3: Contact Info Flagger
│   └── Input: contacts with no phone AND no email
│   └── Adds "need contact info" tag, logs changes
│
├── Subagent 4: Old Contact Type Migrator
│   └── Input: ALL contacts with old single-select Contact Type values
│   └── Migrates to new multi-select using mapping, clears old field
│   └── Service providers (Contractor, Escrow Officer, Inspector, TC) → "Service Provider"
│
├── Subagent 5: Tag Normalizer
│   └── Input: contacts with hashtag-prefixed city tags
│   └── Strips "#", adds clean tag, removes old tag
│
└── QA Reviewer Agent (fresh context window)
    └── Receives: this design spec + audit report + change logs from all subagents
    └── Verifies: every fix matches the plan, no drift, no missed contacts
    └── Reports: discrepancies, plan drift, contacts that were skipped/errored
    └── If issues found: flags them, documents them, triggers corrective fixes
```

### Subagent Coordination

**Phase 1 — Fetch (sequential):** Subagent 1 runs first — fetches all data, writes to `.tmp/buyer-pipeline-data.json`

**Phase 2 — Analyze (parallel, read-only):** Subagents 2-5 run in parallel. Each reads the shared data file and **computes** which contacts need fixes, but does NOT write to GHL. Each writes a proposed change set to `.tmp/`:
- `.tmp/proposed-buyer-tag.json`
- `.tmp/proposed-contact-type.json`
- `.tmp/proposed-need-info.json`
- `.tmp/proposed-old-type-migration.json`
- `.tmp/proposed-tag-normalize.json`

**Why read-only in Phase 2:** Multiple subagents may need to modify the same contact (e.g., Subagent 2 adds "buyer" tag while Subagent 5 removes "#phoenix" tag on the same contact). If they both PUT simultaneously, the second write overwrites the first. By computing in parallel and applying in a single merge step, we avoid race conditions.

**Phase 3 — Merge + Apply (sequential):** A merge step reads all 5 proposed change files and combines them per contact into a single unified update payload. Then applies each contact's combined fix in ONE `PUT /contacts/{contactId}` call. Writes execution results to `.tmp/changes-applied.json`.

**Phase 4 — QA Review (sequential, fresh context):** QA Reviewer Agent gets a fresh context window with:
- This design spec (the plan)
- The proposed change files (what should have been done)
- The applied changes file (what was actually done)
- The original data snapshot (pre-fix state)
- Runs verification checks, produces `.tmp/qa-review-report.md`
- If discrepancies found → flags to orchestrator → corrective fixes applied → QA re-runs

**Phase 5 — Report (sequential):** Final consolidated audit report generated from all change and QA logs.

### Implementation

Each subagent is implemented as a focused TypeScript script in `scripts/cleanup/`:

```
scripts/cleanup/
├── 01-fetch-data.ts              ← Phase 1: data fetcher
├── 02-analyze-buyer-tags.ts      ← Phase 2: compute buyer tag + Contact Type fixes
├── 03-analyze-missing-info.ts    ← Phase 2: compute need contact info fixes
├── 04-analyze-old-type.ts        ← Phase 2: compute old field migration fixes
├── 05-analyze-tags.ts            ← Phase 2: compute hashtag tag cleanup fixes
├── 06-merge-and-apply.ts         ← Phase 3: merge all proposals, apply in single PUT per contact
├── 07-qa-review.ts               ← Phase 4: verify changes against plan (fresh context)
├── 08-generate-report.ts         ← Phase 5: final audit report
└── lib/
    ├── ghl-api.ts                ← Shared GHL API helpers (from src/lib/ghl.ts patterns)
    └── types.ts                  ← Shared types for data file + change proposals
```

**Dependencies:** Only the existing GHL API patterns from `src/lib/ghl.ts`. No new packages needed.

**Rate limiting:** GHL API allows ~100 requests/minute. Each subagent will:
- Use 600ms delay between API calls
- Handle 429s with exponential backoff (3 retries)
- Since subagents 2-5 run in parallel and all hit the GHL API, they share a rate limiter via a simple token bucket written to `.tmp/rate-limit.lock`

**Estimated runtime:** ~15-20 minutes total (data fetch ~8-10 min, parallel fixes ~5-8 min, QA ~2 min)

### QA Reviewer Agent — Verification Protocol

The QA agent operates with a **fresh context window** (no prior conversation history) to avoid confirmation bias. It receives only:

1. **The plan** — this design spec
2. **The data snapshot** — `.tmp/buyer-pipeline-data.json` (pre-fix state)
3. **The change logs** — all 5 change log files (what was actually done)

It performs these checks:

| Check | What It Verifies |
|-------|-----------------|
| **Completeness** | Every contact that needed a fix (per the plan's audit criteria) got one |
| **Correctness** | Every fix matches the mapping/rules in this spec (e.g., "Investor" → "Buyer", not something else) |
| **No collateral damage** | No tags were accidentally removed, no custom field values were overwritten |
| **No plan drift** | Subagents didn't skip steps, add extra logic, or deviate from the spec |
| **Error accounting** | All errors are logged, none were silently swallowed |
| **Idempotency** | Running the same subagent again would produce zero changes (everything already fixed) |

**Output:** `.tmp/qa-review-report.md` with:
- PASS/FAIL per check
- List of discrepancies (if any)
- Recommended corrective actions
- Summary: "X of Y contacts verified clean"

**If QA fails:** The orchestrator reads the QA report, applies corrective fixes, then re-runs QA until clean.

---

## Task Breakdown

### Task 1: Fetch & Deduplicate

1. Paginate all opportunities from Buyer Pipeline (`6gtCenYOAl8NwRWyTjhZ`)
2. Extract unique contact IDs (many buyers have multiple opportunities)
3. For each unique contact, fetch full details via `GET /contacts/{contactId}`
4. Store in memory: `Map<contactId, { contact, opportunities[], issues[] }>`

**Expected volume:** ~604 opportunities → estimated 400-500 unique contacts

### Task 2: Audit — Identify Issues

For each unique contact, check:

| Check | Field | Condition | Issue Code |
|-------|-------|-----------|------------|
| Missing "buyer" tag | `contact.tags` | "buyer" not in tags array | `MISSING_BUYER_TAG` |
| Missing "Buyer" in Contact Type | custom field `1zPxrX6N62CUfSIwxOH0` | "Buyer" not in value array | `MISSING_BUYER_TYPE` |
| No contact info | `contact.phone` + `contact.email` | both null/empty | `NO_CONTACT_INFO` |
| Old Contact Type has value | custom field `4GYXWVRN8x18qWLrdeXX` | any value set | `OLD_TYPE_NEEDS_MIGRATION` |
| Hashtag city tags | `contact.tags` | any tag matching `#` prefix | `HASHTAG_TAG` |

### Task 3: Fix — Apply Changes

**3a. Add "buyer" tag**
- Endpoint: `PUT /contacts/{contactId}`
- Body: `{ tags: [...existingTags, "buyer"] }`
- Only if "buyer" not already present (case-insensitive check)

**3b. Add "Buyer" to Contact Type (multi-select)**
- Endpoint: `PUT /contacts/{contactId}`
- Body: `{ customFields: [{ id: "1zPxrX6N62CUfSIwxOH0", value: [...existingValues, "Buyer"] }] }`
- Preserve existing values (e.g., if contact already has "Agent", result should be ["Agent", "Buyer"])

**3c. Add "need contact info" tag**
- Only for contacts with no phone AND no email
- Endpoint: `PUT /contacts/{contactId}`
- Body: `{ tags: [...existingTags, "need contact info"] }`
- Skip if tag already present

**3d. Migrate old Contact Type → new Contact Type**
- Read old field value from custom field `4GYXWVRN8x18qWLrdeXX`
- Apply mapping:

| Old Value | New Multi-Select Value | Rationale |
|-----------|----------------------|-----------|
| Seller | Seller | Direct match |
| Agent | Agent | Direct match |
| Investor | Buyer | Investors are buyers in THO context |
| Private Money Lender | PML | Consolidated lender category |
| Hard Money Lender | PML | Consolidated lender category |
| Contractor | Service Provider | New option added to multi-select 2026-04-07 |
| Escrow Officer | Service Provider | New option added to multi-select 2026-04-07 |
| Inspector | Service Provider | New option added to multi-select 2026-04-07 |
| TC | Service Provider | New option added to multi-select 2026-04-07 |

- After migration: clear the old field value (set to empty)
- **Note:** This migration applies to ALL contacts with the old field set, not just Buyer Pipeline contacts. We scan all contacts for this.
- **Note:** Actual deletion of the old custom field itself requires Bobby's confirmation and is done separately via `DELETE /locations/{locationId}/customFields/{fieldId}`

**3e. Normalize hashtag tags**
- Find tags matching pattern: starts with "#" or "# " (e.g., "#phoenix", "# buckeye")
- For each:
  - Extract clean city name (strip "#" and leading/trailing whitespace)
  - Add clean tag if not already present
  - Remove hashtag tag
- Endpoint: `PUT /contacts/{contactId}` with updated tags array

### Task 4: Report

Generate `.tmp/buyer-pipeline-audit-2026-04-07.md` with:

```markdown
# Buyer Pipeline Audit Report — 2026-04-07

## Summary
- Total opportunities: X
- Unique contacts: X
- Contacts already clean: X
- Contacts fixed: X

## Fixes Applied

### Buyer Tag Added (X contacts)
| Contact | Name | Previous Tags |
|---------|------|---------------|

### Buyer Type Added to Multi-Select (X contacts)
| Contact | Name | Previous Values | New Values |

### Need Contact Info Tagged (X contacts)
| Contact | Name | Stage | Has Phone | Has Email |

### Old Contact Type Migrated (X contacts)
| Contact | Name | Old Value | New Value |

### Hashtag Tags Normalized (X contacts)
| Contact | Name | Old Tag | New Tag |

## Remaining Issues
- Contacts in "Buyer Unqualified" stage: X (review if they should stay in pipeline)
- Contacts with "need contact info": X (dispo manager follow-up needed)
- Potential duplicate opportunities: X (same contact, possibly same criteria)
```

---

## Batching Strategy

To minimize API calls, batch all fixes for a single contact into ONE `PUT /contacts/{contactId}` call:

```typescript
// Single API call per contact with all fixes
PUT /contacts/{contactId}
{
  tags: [...cleanedTags],           // buyer tag + need contact info + normalized city tags
  customFields: [
    { id: "1zPxrX6N62CUfSIwxOH0", value: [...updatedMultiSelect] },  // new Contact Type
    { id: "4GYXWVRN8x18qWLrdeXX", value: "" }                        // clear old Contact Type
  ]
}
```

This means each contact requires at most 2 API calls: 1 GET (fetch details) + 1 PUT (apply all fixes).

---

## Dry Run Mode

The script will support a `--dry-run` flag that:
- Performs the full audit
- Generates the report
- Does NOT make any write calls to GHL
- Prints what WOULD be changed

This lets Bobby review the audit before any changes are applied.

---

## Error Handling

- If a contact update fails → log the error, skip to next contact, include in report
- If rate limited (429) → exponential backoff with 3 retries
- All errors collected and reported at the end
- Script is idempotent — safe to re-run (checks current state before applying fixes)

---

## Scope Boundary

**In scope:**
- All contacts linked to Buyer Pipeline opportunities
- Old Contact Type migration for ALL contacts (not just Buyer Pipeline)
- Hashtag tag normalization for Buyer Pipeline contacts only

**Out of scope (deferred to Phase 2/3):**
- GHL workflow automation (Phase 2)
- Ongoing monitoring (Phase 3)
- Duplicate opportunity detection (Phase 3)
- Buyer scoring or segmentation
- Tag strategy redesign (city tags → structured fields)
