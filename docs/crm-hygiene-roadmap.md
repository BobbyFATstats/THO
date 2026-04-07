# THO Operations Roadmap

**Owner:** Bobby Souza (COO) / Total House Offer
**Created:** 2026-04-07 | **Last Updated:** 2026-04-07
**North Star:** Consistently close 10 wholesale deals per month.

Everything on this roadmap exists to move THO from 1 deal/month to 10. The foundation is clean CRM data, smart automation, and leadership visibility into pipeline health.

---

## How This Roadmap Is Organized

| Track | Focus | Key Systems |
|-------|-------|-------------|
| **CRM & Data Hygiene** | Clean data, enforced standards | GHL workflows, hygiene agents |
| **Acquisitions** | Find deals, get contracts signed | Acquisition pipeline, underwriting, contracts |
| **Dispositions** | Market deals, close buyers | Buyer Pipeline, buyer blasts, deal matching |
| **Leadership & Visibility** | Know what's working, what's not | Weekly email, journey map, command center |
| **Technology & Tools** | Build the advantages | AI agents, calculators, website, SEO |

---

## Phase 1: CRM Hygiene — Buyer Pipeline Cleanup --- COMPLETED 2026-04-07

One-time audit and fix of all Buyer Pipeline contacts. **Done.**

### Results

| Fix Applied | Contacts |
|-------------|----------|
| Added "buyer" tag | 24 |
| Added "Buyer" to Contact Type (multi-select) | 75 |
| Added "need contact info" tag | 1 |
| Normalized hashtag city tags | 7 |
| Old Contact Type migration | 0 (none needed) |

**Total: 75 of 98 contacts updated. 0 failures. QA: 6/6 PASS.**

### Remaining Items
- [ ] Delete old single-select Contact Type field (0 contacts had data — safe, needs Bobby's go-ahead)
- [ ] 43 contacts with no phone/email — dispo manager follow-up
- [ ] 11 contacts in "Buyer Unqualified" — review if they should remain

---

## Phase 2: GHL Workflow Automation — NEXT

Prevent future data drift by enforcing standards at the point of entry.

### 2.1 Buyer Pipeline entry → auto-tag + auto-type
- **Trigger:** Contact added to Buyer Pipeline (any stage)
- **Actions:** Add "buyer" tag, set "Buyer" in Contact Type multi-select
- **Value:** Never repeat the Phase 1 cleanup — every new buyer is automatically tagged correctly

### 2.2 Buyer form submission → full pipeline setup
- **Trigger:** Buyer form submitted on website
- **Actions:** Add "buyer" tag, set Contact Type, create opportunity in Buyer Pipeline (New Buyer stage), extract buy box criteria
- **Value:** Website buyers flow directly into the pipeline with complete data

### 2.3 Social lead → auto-tag source + flag for review
- **Trigger:** Contact created from Facebook/Instagram
- **Actions:** Add source tag, flag "need contact info" if missing phone/email, create pipeline opportunity, assign task to dispo manager
- **Value:** Social leads don't fall through the cracks

### 2.4 Contact info validation
- **Trigger:** Contact updated
- **Actions:** If contact now has phone/email AND has "need contact info" tag → remove tag
- **Value:** Tags stay accurate automatically

---

## Phase 3: Weekly Executive Summary Email

**Cadence:** Every Friday, sent to the full team via Gmail.

### Acquisition Metrics
- New opportunities created (this week vs last week)
- Calls completed
- Contracts sent
- Avg days from lead to contract sent
- Properties currently under contract (open — not closed or canceled), ranked by close of escrow date

### Disposition Metrics
- New buyers added (this week vs last week)
- Deals in "Marketing Active" stage
- Buyer negotiations in progress
- Contracts closed this month (running total)
- Assignment fee revenue this month

### Pipeline Health Snapshot
- Open contracts ranked by close of escrow date (countdown to each closing)
- Deals at risk (inspection deadline approaching, EMD due, etc.)
- Buyer Pipeline stage breakdown (how many buyers at each stage)

### CRM & Tool Updates
- Data hygiene work completed this week
- New agents/workflows deployed — what they do, business value
- Updates from Supabase task list (THO Dashboard action items)

### Implementation
- Scheduled Trigger.dev task runs every Friday morning
- Pulls data from GHL API (pipelines, opportunities, contacts) + Supabase (tasks, blast history)
- Formats as clean HTML email
- Sends via Gmail API (gws CLI or googleapis)
- Template is consistent week-to-week — only data changes

---

## Phase 4: Journey Map — Pathway to 10 Deals per Month

A visual, milestone-based pathway showing what monthly volume is required at each funnel stage to hit deal targets.

### Milestones

| Milestone | Deals/Month | Target Date |
|-----------|-------------|-------------|
| Current | 1 | Now |
| Milestone 1 | 3 | TBD |
| Milestone 2 | 5 | TBD |
| Milestone 3 | 7 | TBD |
| Milestone 4 | 10 | TBD |

### Funnel Metrics Per Milestone

For each milestone, calculate the required monthly volume based on industry conversion rates + THO's actual rates:

| Metric | 1 Deal | 3 Deals | 5 Deals | 7 Deals | 10 Deals |
|--------|--------|---------|---------|---------|----------|
| Marketing leads generated | TBD | TBD | TBD | TBD | TBD |
| Calls completed | TBD | TBD | TBD | TBD | TBD |
| Opportunities created | TBD | TBD | TBD | TBD | TBD |
| Contracts sent | TBD | TBD | TBD | TBD | TBD |
| Avg days: lead → contract | TBD | TBD | TBD | TBD | TBD |
| Properties under contract | TBD | TBD | TBD | TBD | TBD |
| Buyers added | TBD | TBD | TBD | TBD | TBD |
| Buyer blasts sent | TBD | TBD | TBD | TBD | TBD |
| Deals closed | 1 | 3 | 5 | 7 | 10 |

### Diagnostic Use
- **Actual volume matches expected but deals are low?** → Closing efficiency problem (vetting, negotiation, buyer quality)
- **Volume is low across the board?** → Lead gen / marketing problem
- **Volume is high but drops off at a specific stage?** → Bottleneck at that stage (e.g., slow underwriting, weak buyer list)

### Implementation
- Dashboard page in THO showing the journey map visually (think progress bar with milestones)
- Monthly actual vs required comparison
- Auto-populated from GHL pipeline data

---

## Phase 5: CRM Hygiene Agent System

Full agent system that continuously monitors and maintains CRM data quality.

### 5.1 CRM Hygiene Agent (parent)
- Scheduled monitoring of all pipelines
- Detects data quality drift (missing tags, empty fields, stale opportunities)
- Generates weekly hygiene reports (feeds into executive summary email)
- Recommends actions, executes approved cleanups

### 5.2 Acquisitions Hygiene Subagent
- Monitors Acquisition + Buy Box Acquisition pipelines
- Flags stale opportunities (no activity in X days)
- Ensures acquisition contacts have proper tags/types
- Validates property data completeness before stage progression

### 5.3 Disposition Hygiene Subagent
- Monitors Disposition & Closing pipeline + Buyer Pipeline
- Buyer list curation: warm/cold segmentation based on engagement
- Deal-to-buyer matching: when a deal enters disposition, identify buyers whose buy box matches
- Blast readiness checks: valid phone, no DND, proper tags
- Buyer engagement tracking: flag buyers not contacted in X days

### 5.4 Duplicate Detection Subagent
- Cross-pipeline duplicate contact detection
- Duplicate opportunity detection within Buyer Pipeline (same contact, same criteria)
- Merge recommendations with human approval

### 5.5 Tag Governance Subagent
- Enforces tag naming conventions (lowercase, no special characters)
- Detects tag proliferation
- Recommends tag consolidation

---

## Phase 6: COO Command Center

Beyond sales metrics — operational health of the entire business.

### Sales Pipeline View (already partially built in THO Dashboard)
- Acquisition funnel with stage counts and velocity
- Disposition funnel with active deals and buyer status
- Revenue tracking: assignment fees, closed deals, pipeline value

### Tool & System Adoption
- Is the team using the calculator? (usage tracking)
- Are automation/AI agents being utilized? (Trigger.dev run counts, blast counts)
- CRM activity: conversations volume, response times, tasks completed
- How often is the team logging into and using the CRM?

### Digital Presence
- Website ranking and traffic trends
- Local SEO health (Google Business Profile, local search rankings)
- Social media lead flow (Facebook/Instagram → GHL conversion rate)

### Team Performance
- Activity per team member: calls, tasks completed, conversations
- Response time metrics: how fast are we following up on leads?
- Stage progression velocity: how long do deals sit at each stage?

### Implementation
- New dashboard section or standalone page in THO app
- Pulls from: GHL API, Supabase, Google Analytics/Search Console, Trigger.dev API
- Designed for Bobby as COO — one screen to understand operational health

---

## Agent & Workflow Registry

Overview of all agents and automated workflows, built or planned.

| Agent/Workflow | Status | Track | Purpose |
|----------------|--------|-------|---------|
| **CRM Sync** (Google Sheets → GHL) | Built | CRM | Syncs property data from master sheet to Acquisition pipeline |
| **Buyer Blast** (Trigger.dev) | Built | Disposition | Drip-sends SMS to eligible buyers when deal hits marketing stage |
| **Message Status Webhook** | Built | Disposition | Tracks delivery, replies, opt-outs from buyer blasts |
| **GHL Cache Refresh** (Cron) | Built | CRM | Refreshes pipeline/opportunity/contact cache 3x daily |
| **Buyer Pipeline Cleanup Scripts** | Built | CRM | One-time audit + fix (Phase 1 — completed) |
| **GHL Auto-Tag Workflows** | Planned | CRM | Phase 2 — prevent data drift at entry points |
| **CRM Hygiene Agent** | Planned | CRM | Phase 5 — continuous monitoring + automated cleanup |
| **Acquisitions Hygiene Subagent** | Planned | Acquisitions | Phase 5.2 — acquisition pipeline health |
| **Disposition Hygiene Subagent** | Planned | Disposition | Phase 5.3 — buyer list curation + deal matching |
| **Executive Summary Email** | Planned | Leadership | Phase 3 — weekly Friday KPI email |
| **Journey Map Dashboard** | Planned | Leadership | Phase 4 — milestone pathway to 10 deals/month |
| **COO Command Center** | Planned | Leadership | Phase 6 — operational health dashboard |
| **Contracts Agent** | Planned | Acquisitions | Automate contract generation, tracking, reminders |

---

## Open Questions / Future Considerations

1. **Buy box data model**: Is the multi-opportunity model (one opp per buying context) the best approach? Or would structured custom fields with repeating groups be cleaner for deal matching?

2. **Tag strategy**: Should city/area tags be replaced with a structured custom field (e.g., "Target Markets" multi-select)? Tags work for simple filtering but don't scale for geographic matching.

3. **Buyer scoring**: As the list grows, how do we prioritize which buyers to contact first? Engagement history, budget, responsiveness, deal close rate — all could factor into a score.

4. **Stale buyer cleanup**: At what point does a buyer become "cold"? 30 days? 90 days? Should they move to a "Re-engage" stage or be archived?

5. **Buyer blast production mode**: Current blast filters by tags `["buyer", "ready to go", "test"]`. The "test" tag needs to be removed for production. Define the production eligibility criteria.

6. **Journey map conversion rates**: Need to establish THO's actual conversion rates at each funnel stage to populate the milestone table. Requires historical data analysis.

7. **SEO/digital presence tooling**: What analytics are currently in place? Need to evaluate Google Analytics, Search Console, GBP integrations for the command center.
