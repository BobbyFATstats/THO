# Decision Log

| Date | Decision | Options Considered | Chosen | Rationale |
|------|----------|-------------------|--------|-----------|
| 2026-03-24 | GHL opportunities search HTTP method | GET with query params vs POST with body | GET with snake_case query params (`location_id`, `pipeline_id`, `limit`) | POST method ignores `pipeline_id` param entirely — returns unfiltered results from all pipelines. GET properly filters. |
| 2026-03-24 | Disposition deals stage filter | Show all stages vs Marketing Active and beyond | Marketing Active and beyond (6 stages) | Bobby specified only active disposition properties should appear. Excludes Intake/Prep, Closed – Paid, Dead / Withdrawn. |
| 2026-03-24 | CRM Tracker top stats cards | Under Contract + Total Contacts vs Weekly WoW metrics | New Acq Opps (7d) + Buyer Leads (7d) with week-over-week | More actionable than static counts. Under Contract still visible in deals section below. |
| 2026-03-24 | GHL error handling verbosity | Silent throw vs capture response body | Capture response body in error message | Bare status codes made debugging GHL API issues difficult. Including the response body surfaces the actual validation error. |
| 2026-03-24 | Session log format and location | Single SESSION_LOG.md vs individual files in `sessions/` | Individual files in `sessions/` | Easier to scan by date, avoids one massive file, better for context handoff between sessions. |
