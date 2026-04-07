# Session Summary

**Date:** 2026-04-07
**Focus:** Deploy and debug Buyer Blast Agent — series of GHL API issues discovered during live testing with test contacts

## What Got Done

### Bug 1: Custom field values crash on non-string types
- **Commit:** `84a5e1a`
- **Symptom:** `TypeError: value.trim is not a function` during template interpolation
- **Root cause:** GHL returns some custom field values as numbers or arrays, not strings. Code called `.trim()` directly.
- **Fix:** Wrapped all custom field values with `String()` before `.trim()` in `src/lib/ghl-fields.ts`

### Bug 2: GHL task creation 422 — missing required fields
- **Commit:** `995b5eb`
- **Symptom:** `422 Unprocessable Entity` when creating follow-up tasks in GHL
- **Root cause:** GHL's task creation endpoint requires `dueDate` (non-empty string) and `completed` (boolean) fields that aren't documented prominently
- **Fix:** Added `dueDate` (set to 7 days out) and `completed: false` to task creation payload in `src/lib/ghl.ts`

### Bug 3: State field resolution — abbreviated vs full name
- **Commits:** `02bb9a6`, `4b4857a`
- **Symptom:** State field empty for some opportunities, breaking buyer matching
- **Root cause:** GHL has both `state_abbrv` and `state` custom fields. Some opportunities only have the full state name, not the abbreviation.
- **Fix:** Initially added fallback to full state name, then reverted — abbreviated state must be populated on the opportunity. Standardized on abbreviated state only.

### Bug 4: Buyer filter broken against real GHL data shapes
- **Commit:** `03664d8`
- **Symptom:** All buyers filtered out — zero matches despite matching criteria
- **Root cause:** Two incorrect assumptions: (1) `dndSettings` is an object keyed by channel (e.g., `{ SMS: { status: "active" } }`), not an array; (2) `customFields` values can be `string` or `string[]`
- **Fix:** Rewrote buyer filter logic in `src/trigger/buyer-blast.ts` to handle actual GHL data shapes, verified against live API responses

### Bug 5: Fetching all 3,400+ contacts instead of filtering server-side
- **Commit:** `b1c130b`
- **Symptom:** 34 paginated API calls to fetch all contacts, then client-side filter yielded only 3 matches
- **Root cause:** Used paginated list-all endpoint instead of GHL's search endpoint that supports tag filtering
- **Fix:** Replaced paginated fetch with GHL search endpoint (`POST /contacts/search`) filtered by tags server-side. 3 contacts returned in 1 API call instead of 3,400+ across 34 calls.

### Bug 6: Idempotency key too strict — blocked re-blasts
- **Commit:** `fb241d4`
- **Symptom:** Couldn't re-trigger a blast for the same opportunity (e.g., after fixing bugs)
- **Root cause:** Idempotency key was based on opportunity ID alone, so Trigger.dev rejected duplicate triggers even when intentional re-blasts were needed
- **Fix:** Added timestamp to idempotency key. Duplicate prevention for the same opportunity is now handled by `findExistingBlast` logic in the task itself, not the trigger-level idempotency key.

### Bug 7: SMS sent to conversationId instead of contactId
- **Commit:** `7f8b903`
- **Symptom:** SMS delivery failed — GHL returned error
- **Root cause:** GHL's `POST /conversations/messages` requires `contactId` in the payload, not `conversationId`. The unnecessary conversation search/create step was removed.
- **Fix:** Simplified to send directly with `contactId` in `src/lib/ghl.ts` and `src/trigger/buyer-blast.ts`

### Deployment Result
- Successfully deployed and tested with 3 test-tagged contacts
- All 7 bugs found and fixed during live testing
- SMS messages delivered successfully after final fix

## Decisions Made
- GHL custom field values must always be coerced to strings — never trust the type (see DECISIONS.md)
- GHL task creation requires `dueDate` + `completed` — undocumented required fields (see DECISIONS.md)
- Use abbreviated state only for buyer matching — full state name is a data quality issue to fix at source
- GHL `dndSettings` is an object keyed by channel, not an array — document shape assumptions (see DECISIONS.md)
- Use GHL search endpoint with server-side tag filtering instead of paginating all contacts (see DECISIONS.md)
- Idempotency key should prevent rapid-fire duplicates only; business-level duplicate prevention belongs in task logic (see DECISIONS.md)
- GHL SMS requires `contactId`, not `conversationId` — no need to create conversations first (see DECISIONS.md)

## Open Items / Next Steps
- Remove "test" tag filter when ready for production blasts
- Monitor delivery rates and GHL rate limits in production
- Build CRM sync status UI component (in progress, uncommitted)
- Consider adding retry logic for failed SMS deliveries

## Files Changed
- `src/lib/ghl-fields.ts` — String coercion for custom field values, state field handling
- `src/lib/ghl.ts` — Task creation required fields, SMS contactId fix, search endpoint
- `src/trigger/buyer-blast.ts` — Buyer filter rewrite, server-side tag search, contactId for SMS
- `src/app/api/webhooks/buyer-blast/route.ts` — Timestamp in idempotency key

## Memory Updates
- Preferences learned: GHL API documentation is unreliable — always verify field shapes against live responses before coding
- Decisions to log: 7 entries added to DECISIONS.md
