# CRM Hygiene Roadmap

**Owner:** Bobby Souza / Total House Offer
**Created:** 2026-04-07
**Goal:** Clean, reliable CRM data as the foundation for scaling from 1 deal/month to 10.

---

## Phase 1: Buyer Pipeline Cleanup (Approach A) — NOW

One-time audit and fix script targeting the Buyer Pipeline's 604 opportunities and their linked contacts.

### Task 1.1: Ensure "buyer" tag on all Buyer Pipeline contacts
- Paginate all Buyer Pipeline opportunities
- Deduplicate by contact ID
- For each contact missing the "buyer" tag → add it via GHL API
- Produces audit report with counts: already had tag vs newly added

### Task 1.2: Ensure "Buyer" in Contact Type (multi-select) field
- For each unique contact in Buyer Pipeline, fetch full contact details
- Check `contact.contact_type_multi_select` (ID: `1zPxrX6N62CUfSIwxOH0`) for "Buyer" value
- If missing → append "Buyer" to existing values (preserve other selections like "Agent", "Seller")
- Report: already had value vs newly added

### Task 1.3: Flag contacts missing contact info
- Contacts with no phone AND no email → add "need contact info" tag (if not already present)
- These contacts can never receive buyer blasts or outreach
- Report: count of contacts needing follow-up, broken down by stage

### Task 1.4: Migrate old Contact Type (single-select) → multi-select
- Old field: `contact.contact_type` (ID: `4GYXWVRN8x18qWLrdeXX`)
  - Options: Seller, Agent, Investor, Contractor, Escrow Officer, Inspector, TC, Hard Money Lender, Private Money Lender
- New field: `contact.contact_type_multi_select` (ID: `1zPxrX6N62CUfSIwxOH0`)
  - Options: Buyer, Seller, Agent, PML, JV / Wholesaler, Birddog / Hunters
- Migration mapping:
  - "Seller" → "Seller"
  - "Agent" → "Agent"
  - "Investor" → "Buyer" (investors are buyers in THO's context)
  - "Private Money Lender" / "Hard Money Lender" → "PML"
  - "Contractor", "Escrow Officer", "Inspector", "TC" → "Service Provider" (new option added to multi-select 2026-04-07 via API)
- Process: scan ALL contacts for old field values, migrate to new field, verify, then delete old field
- **Note:** Deletion of the old custom field should be confirmed with Bobby before executing

### Task 1.5: Tag normalization — remove hashtags from city tags
- Find all tags containing "#" prefix (e.g., "#phoenix", "# buckeye")
- For each contact with a hashtag tag:
  - Add the clean version (e.g., "phoenix", "buckeye")
  - Remove the hashtag version
- Report: tags cleaned, contacts affected

### Deliverable
- Audit report in `.tmp/buyer-pipeline-audit-YYYY-MM-DD.md`
- Summary stats: total contacts, fixes applied per task, remaining issues
- All changes logged for review

---

## Phase 2: GHL Workflow Automation (Approach B) — NEXT

Prevent future data drift by configuring GHL workflows that enforce data standards at the point of entry.

### Workflow 2.1: Buyer Pipeline entry → auto-tag + auto-type
- **Trigger:** Contact added to Buyer Pipeline (any stage)
- **Actions:**
  - Add "buyer" tag if not present
  - Set "Buyer" in Contact Type (multi-select) if not present
- Prevents the exact data quality issues we're fixing in Phase 1

### Workflow 2.2: Buyer form submission → auto-tag + auto-type + auto-pipeline
- **Trigger:** Buyer form submitted on website
- **Actions:**
  - Add "buyer" tag
  - Set "Buyer" in Contact Type
  - Create opportunity in Buyer Pipeline (New Buyer stage)
  - Extract buy box criteria from form fields → opportunity custom fields

### Workflow 2.3: Social lead → auto-tag source + flag for review
- **Trigger:** Contact created from Facebook/Instagram
- **Actions:**
  - Add source tag ("facebook" or "instagram")
  - Add "need contact info" if missing phone AND email
  - Create opportunity in Buyer Pipeline (New Buyer stage)
  - Assign task to dispo manager for follow-up

### Workflow 2.4: Contact info validation
- **Trigger:** Contact updated (any field)
- **Actions:**
  - If contact now has phone or email AND has "need contact info" tag → remove the tag
  - Keeps the "need contact info" tag accurate over time

### Deliverable
- GHL workflow configurations documented step-by-step
- Bobby or team configures in GHL dashboard (or we build via API if GHL supports workflow creation)

---

## Phase 3: CRM Hygiene Agent (Approach C) — FUTURE

Full agent system that continuously monitors and maintains CRM data quality.

### Agent 3.1: CRM Hygiene Agent (parent)
- Scheduled monitoring of all pipelines
- Detects data quality drift (missing tags, empty fields, stale opportunities)
- Generates weekly hygiene reports
- Recommends actions, executes approved cleanups

### Subagent 3.2: Acquisitions Hygiene
- Monitors Acquisition + Buy Box Acquisition pipelines
- Flags stale opportunities (no activity in X days)
- Ensures acquisition contacts have proper tags/types
- Validates property data completeness before stage progression

### Subagent 3.3: Disposition Hygiene
- Monitors Disposition & Closing pipeline + Buyer Pipeline
- Buyer list curation: warm/cold segmentation based on engagement
- Deal-to-buyer matching: when a new deal enters disposition, identify buyers whose buy box matches
- Blast readiness checks: ensure contacts have valid phone, no DND, proper tags before any blast
- Buyer engagement tracking: flag buyers who haven't been contacted in X days

### Subagent 3.4: Duplicate Detection
- Cross-pipeline duplicate contact detection
- Duplicate opportunity detection within Buyer Pipeline (same contact, same criteria)
- Merge recommendations with human approval

### Subagent 3.5: Tag Governance
- Enforces tag naming conventions (lowercase, no special characters)
- Detects tag proliferation (too many similar tags)
- Recommends tag consolidation

### Deliverable
- Full agent system design spec
- Trigger.dev tasks for scheduled monitoring
- Dashboard integration for hygiene reports

---

## Open Questions / Future Considerations

1. **Buy box data model**: Is the multi-opportunity model (one opp per buying context) the best approach? Or would structured custom fields on the contact (with repeating groups for multiple buy boxes) be cleaner? Worth revisiting as we build deal-to-buyer matching.

2. **Tag strategy**: Should city/area tags be replaced with a structured custom field (e.g., "Target Markets" multi-select or text list)? Tags work for simple filtering but don't scale well for geographic matching.

3. **Buyer scoring**: As the list grows, how do we prioritize which buyers to contact first? Engagement history, budget, responsiveness, deal close rate — all could factor into a score.

4. **Stale buyer cleanup**: At what point does a buyer become "cold"? 30 days no engagement? 90 days? Should they be moved to a "Re-engage" stage or archived?

5. **Integration with buyer blast**: The current blast system filters by tags `["buyer", "ready to go", "test"]`. After Phase 1 cleanup, how should the blast eligibility criteria evolve? The "test" tag should be removed for production.
