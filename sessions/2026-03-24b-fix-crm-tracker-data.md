# Session Summary

**Date:** 2026-03-24
**Focus:** Fix CRM Tracker — data not landing correctly (zero totals, wrong pipeline data, missing disposition stage filter)

## What Got Done
- Diagnosed root cause: `getOpportunities()` was using POST method which ignores `pipeline_id` query param — GHL returned unfiltered results from all pipelines
- Switched to GET method with all params as query strings (`location_id`, `pipeline_id`, `limit`) — GHL properly filters by pipeline now
- Added disposition stage filter: only deals in Marketing Active, Buyer Negotiations, Buyer Selected, Escrow Opened, Inspection / Access, and Clear to Close appear in the deals list (excludes Intake/Prep, Closed – Paid, Dead / Withdrawn)
- Fixed frontend `GHLData` type mismatch on CRM Tracker page — was expecting `contacts.recentCount` but API returns `contacts.buyerCount`/`contacts.prevBuyerCount`
- Updated top stats grid: Acquisition Pipeline total, Disposition Pipeline total, New Acq Opps (7d) with WoW, Buyer Leads (7d) with WoW
- Verified end-to-end: Acquisition 429, Disposition 40, 11 filtered active disposition deals with proper addresses, 40 buyer leads this week

## Decisions Made
- GHL `/opportunities/search` must use GET (not POST) for `pipeline_id` filtering to work — POST ignores the param (see DECISIONS.md)
- Disposition deals list filtered to "Marketing Active and beyond" stages per Bobby's specification
- Replaced Under Contract count + Total Contacts stat cards with weekly acq opps + buyer leads with WoW comparison (more actionable)

## Open Items / Next Steps
- Acquisition stage breakdown only covers first 100 of 429 opps (GHL API caps at 100/page) — pagination needed for accurate full breakdown
- Verify on Vercel after deploy that cron refresh also works with GET method

## Files Changed
- `src/lib/ghl.ts` — switched `getOpportunities()` from POST to GET, moved location_id to query params
- `src/lib/ghl-data.ts` — added `DISPOSITION_ACTIVE_STAGES` filter, added fallback for total count
- `src/app/(dashboard)/crm-tracker/page.tsx` — fixed GHLData type, updated top stats grid with WoW metrics

## Memory Updates
- Preferences learned: Bobby wants disposition deals filtered to Marketing Active and beyond only
- Decisions to log: see DECISIONS.md entries for 2026-03-24
