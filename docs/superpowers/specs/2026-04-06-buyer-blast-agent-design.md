# Buyer Blast Agent — Design Spec

**Date:** 2026-04-06
**Status:** Approved
**Author:** Bobby Souza + Claude

---

## Purpose

Automate buyer SMS notifications when a wholesale deal is ready to market. When an opportunity moves to "Marketing Active" in GHL's Disposition pipeline, the agent pulls deal details, identifies eligible buyers, and drip-sends personalized bilingual SMS messages through GHL's native messaging — zero manual intervention.

## Non-Goals

- Not a chatbot or conversational agent. Runs a job and finishes.
- Not an external SMS tool. Everything flows through GHL's messaging infrastructure.
- Not a replacement for GHL. GHL remains the CRM and communication hub.
- Does not touch seller-side communication.

---

## Architecture

**Runtime:** Vercel (webhook receiver) + Trigger.dev (blast execution)
**Trigger.dev Project:** TotalHouseOffer (`proj_krnvhjbohzlcfyficusz`)
**Data Store:** Supabase (blast tracking, tier management)
**GHL Integration:** Direct REST API via `fetch()` (extends existing `src/lib/ghl.ts`)

### Flow

```
GHL opportunity → "Marketing Active" stage
        │
        ▼
GHL outbound webhook
        │
        ▼
Vercel: POST /api/webhooks/buyer-blast
  - Validates GHL_WEBHOOK_SECRET
  - Extracts opportunity ID
  - Triggers Trigger.dev task (idempotency key = opportunity ID)
  - Returns 200
        │
        ▼
Trigger.dev: buyer-blast task
  1. Fetch opportunity from GHL
  2. Extract deal fields + validate completeness
     - Missing fields → create GHL task assigned to Karla, exit
  3. Fetch templates from GHL Custom Values
  4. Fetch eligible buyers (paginated)
  5. Split by language
  6. Create blast_run + blast_recipients in Supabase
  7. Drip loop: send messages respecting tier limits
  8. Mark complete, write log
        │
        ▼
GHL message status webhooks
        │
        ▼
Vercel: POST /api/webhooks/message-status
  - Updates delivery_status, replied, opted_out in blast_recipients
```

---

## Trigger & Webhook

- GHL fires an outbound webhook when an opportunity in the **Disposition pipeline** (`uRdxeojrWkPy5oM5yyUr`) moves to **"Marketing Active"** stage
- Webhook URL: `https://{vercel-domain}/api/webhooks/buyer-blast`
- Security: `GHL_WEBHOOK_SECRET` env var, validated on every request
- Idempotency: opportunity ID as Trigger.dev task idempotency key — duplicate webhooks are no-ops
- Duplicate blast prevention: if a `blast_runs` record already exists for the opportunity with status `completed` or `in_progress`, skip

---

## Deal Details Extraction

**API Call:** `GET /opportunities/{opportunityId}`

**Required fields from opportunity custom fields:**

| Template Variable | GHL Custom Field | Notes |
|---|---|---|
| `city` | City | ID: `6gTTgmpuqIMXA8CbZUX8` |
| `state` | State | Discover at runtime |
| `bedroom_count` | Bedrooms | Discover at runtime |
| `bathroom_count` | Bathrooms | Discover at runtime |
| `property_square_footage` | Sq Ft | Discover at runtime |
| `property_cross_streets` | Cross Streets | Discover at runtime |

Fields marked "discover at runtime" are resolved via `GET /locations/{locationId}/customFields?model=opportunity` and cached for the duration of the task run.

**Validation:** If ANY required template field is missing from the opportunity:
1. Create a GHL task via `POST /contacts/{contactId}/tasks` assigned to Karla
   - Contact: opportunity's primary contact ID, fallback to first follower's contact ID
   - Title: "Missing blast fields for {address}"
   - Body: lists exactly which fields are empty
2. Log failure to blast log
3. Exit — no messages sent

---

## Buyer List Assembly

**Query:** Paginated `GET /contacts/` from GHL

**Eligibility criteria (all must be true):**
- Contact has tag `"buyer"`
- Contact has tag `"ready to go"`
- Contact does NOT have DND enabled for SMS/text
- Contact has a valid phone number

**Language routing:**
- Preferred language field checked with case-insensitive partial match for `"spanish"`
  - Actual GHL values: `"English / Ingles"`, `"Spanish / Espanol"`, `"Other / Otro"`
  - Contains "spanish" (case-insensitive) → Spanish template
  - Everything else → English template

**Per-buyer data collected:** `contactId`, `firstName`, `phone`, `language`

**Edge cases:**
- No phone number → skip, mark `skipped_no_phone`
- No first name → use `"there"` as fallback ("Hey there!")
- Zero eligible buyers → log, exit, no blast

---

## SMS Templates

Templates are stored in GHL Custom Values — editable in GHL without a deploy.

**English** (Custom Value ID: `bA7zsDQqgm4zhuv6ts5g`):
```
Hey {{contact.first_name}}! We just got this property in {{opportunity.city}}, {{opportunity.state}}.

{{opportunity.bedroom_count}}bd / {{opportunity.bathroom_count}}ba

{{opportunity.property_square_footage}}sq ft

Near {{opportunity.property_cross_streets}}

Reply 'YES' for full details and photos.

Thank you!
```

**Spanish** (Custom Value ID: `73ObSJKCwvgSPxNIRNA7`):
```
Hola {{contact.first_name}}! Acabamos de conseguir esta propiedad en {{opportunity.city}}, {{opportunity.state}}.

{{opportunity.bedroom_count}}hab / {{opportunity.bathroom_count}}banos

{{opportunity.property_square_footage}}pies cuadrados

Cerca de {{opportunity.property_cross_streets}}

Responde 'SI' para mas detalles y fotos.

Gracias!
```

**Template processing at send time:**
1. Fetch template from Custom Values API
2. Replace `\n` with actual newlines
3. Interpolate placeholders with real data from opportunity + contact
4. Send via GHL Conversations API (preserves line breaks in SMS)

---

## Message Sending & Drip Logic

**Per-message flow:**
1. Find or create a GHL conversation for the contact (`POST /conversations/` or `GET /conversations/search?contactId={id}`)
2. Send SMS via `POST /conversations/messages` with `type: "SMS"` and populated template body
3. Update `blast_recipients` record with status + `ghl_message_id`

**Drip pacing:**
- Configurable delay between messages (default: 3-5 seconds)
- Trigger.dev `wait.for({ seconds: N })` handles pause without holding compute

**Daily tier enforcement:**
- `sending_tier` Supabase table (singleton) tracks: `current_limit`, `sent_today`, `last_send_date`
- Before each message: check if `sent_today >= current_limit`
  - No → send, increment counter
  - Yes → `wait.until` (midnight + buffer), auto-graduate tier, reset counter, resume

**Tier graduation ladder:** 100 → 250 → 500 → 750 → 1500 → ...
- Graduation condition: `sent_today == current_limit` on the previous day
- Graduation is automatic — no manual intervention

**Resume safety:** Each buyer's send status tracked in `blast_recipients`. On task restart, skip anyone already marked `sent`. No duplicates.

**Example timeline (100-tier start, 600 buyers):**
| Day | Tier Limit | Sent | Remaining |
|-----|-----------|------|-----------|
| 1 | 100 | 100 | 500 |
| 2 | 250 | 250 | 250 |
| 3 | 500 | 250 | 0 |

---

## Data Model (Supabase)

### `blast_runs`

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid, PK | Blast run ID |
| `opportunity_id` | text, unique | GHL opportunity ID |
| `trigger_task_id` | text | Trigger.dev run ID |
| `property_address` | text | For log reference |
| `total_buyers` | int | Total eligible buyers found |
| `sent_count` | int | Running count of sent |
| `failed_count` | int | Messages that failed |
| `status` | text | `in_progress`, `completed`, `paused_tier_limit`, `paused_error`, `failed_validation` |
| `started_at` | timestamptz | Blast start time |
| `completed_at` | timestamptz | Null until done |
| `deal_data` | jsonb | Snapshot of deal fields used |

### `blast_recipients`

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid, PK | |
| `blast_run_id` | uuid, FK | Links to `blast_runs` |
| `contact_id` | text | GHL contact ID |
| `contact_name` | text | For readability |
| `phone` | text | Number messaged |
| `language` | text | `en` or `es` |
| `status` | text | `pending`, `sent`, `failed`, `skipped_dnd`, `skipped_no_phone`, `skipped_invalid_phone` |
| `ghl_message_id` | text | Returned on send — for status tracking |
| `delivery_status` | text | `pending`, `sent`, `delivered`, `undelivered`, `failed` |
| `replied` | boolean | True if contact replied |
| `replied_at` | timestamptz | When they replied |
| `opted_out` | boolean | True if DND'd after blast |
| `sent_at` | timestamptz | Null until sent |
| `error_detail` | text | Null unless failed |

### `sending_tier`

| Column | Type | Purpose |
|---|---|---|
| `id` | int, PK | Always 1 (singleton) |
| `current_limit` | int | Current daily max |
| `sent_today` | int | Count for current day |
| `last_send_date` | date | Resets `sent_today` on new day |
| `graduated_at` | timestamptz | Last tier graduation |

---

## Delivery Status Tracking

**Second webhook:** `POST /api/webhooks/message-status`
- GHL fires `message.updated` events when SMS delivery status changes
- Vercel route matches `ghl_message_id` to `blast_recipients` record
- Updates: `delivery_status`, `replied`, `replied_at`, `opted_out`

**Available statuses for SMS:**
- `delivered` — carrier confirmed delivery
- `undelivered` — carrier rejected
- `failed` — send failure
- Reply detection — contact responded
- Opt-out detection — contact enabled DND after receiving

No read receipts for SMS (protocol limitation).

---

## Blast Logging

**Location:** `logs/blasts/` (gitignored — data lives in Supabase)

**File format:** `YYYY-MM-DD-{address-slug}.md`

Multi-day blasts append to the same file.

**Log structure:**
```markdown
# Buyer Blast — {address}

**Opportunity ID:** {id}
**Triggered:** {datetime}
**Status:** {status}

## Deal Details
- City: {city} | State: {state}
- {beds}bd / {baths}ba | {sqft} sq ft
- Cross Streets: {cross_streets}

## Send Summary
| Date | Sent | Failed | Skipped | Tier Limit |
|------|------|--------|---------|------------|
| {date} | {n} | {n} | {n} | {n} |
| **Total** | **{n}** | **{n}** | **{n}** | |

## Recipient Breakdown
- English: {n} | Spanish: {n}
- Delivered: {n} | Undelivered: {n}
- Replies: {n} | Opt-outs: {n}

## Errors
- {date}: {phone} — {error detail}
```

---

## File Structure

```
src/
├── app/api/webhooks/
│   ├── buyer-blast/route.ts       ← GHL stage change webhook
│   └── message-status/route.ts    ← GHL delivery status webhook
├── trigger/
│   └── buyer-blast.ts             ← Main Trigger.dev task
├── lib/
│   ├── ghl.ts                     ← Existing — add messaging + task creation
│   └── ghl-fields.ts              ← Runtime custom field ID discovery + cache
├── crm_agent/                     ← Untouched
└── templates/
    └── buyer-blast.ts             ← Template fetch + interpolation logic

supabase/migrations/
└── 005_buyer_blast.sql            ← blast_runs, blast_recipients, sending_tier

logs/blasts/                       ← Markdown logs (gitignored)
```

---

## Error Handling

**GHL API failures:**
- 429 (rate limit) → exponential backoff, 3 retries, then mark `failed`
- 401 (auth) → halt entire blast, log error
- 500/502/503 → retry with backoff, same as 429
- Timeout → retry once, then mark `failed`

**Mid-blast failures:**
- Task crash/restart → resume from last `pending` recipient (no duplicates)
- GHL extended outage → retry up to 10 minutes, then set blast status to `paused_error`

**Data edge cases:**
- No opportunity contact → create GHL task on primary contact, fallback to follower contact
- Invalid phone format → skip, mark `skipped_invalid_phone`
- Empty/missing template → halt blast, log error
- Unresolved placeholder in template → send with raw placeholder visible (makes problem obvious)

**Duplicate prevention:**
- Trigger.dev idempotency key = opportunity ID
- Existing completed/in_progress blast for same opportunity → skip

---

## Environment Variables (New)

| Variable | Purpose |
|---|---|
| `GHL_WEBHOOK_SECRET` | Validates inbound GHL webhook requests |
| `TRIGGER_SECRET_KEY` | Trigger.dev SDK authentication (already exists for project) |

All other GHL variables (`GHL_API_TOKEN`, `GHL_LOCATION_ID`) already exist.

---

## Future Extensions (Designed For, Not Built)

- **Buy box matching:** filter buyers by zip, price range, property type before blasting
- **Throttling/deduplication:** cooldown window — skip buyers who received a blast within N days
- **Media attachments:** property photo or flyer link in SMS
- **Multi-deal queuing:** handle multiple deals hitting "Marketing Active" in quick succession
- **Notification channel:** system logs everything to Supabase + markdown now; notification (Slack, SMS to Bobby) plugs in when channel is chosen

---

## Known GHL IDs

| Entity | ID |
|---|---|
| Location | `tf96VFA51F89LjJ8ent4` |
| Disposition Pipeline | `uRdxeojrWkPy5oM5yyUr` |
| English Template (Custom Value) | `bA7zsDQqgm4zhuv6ts5g` |
| Spanish Template (Custom Value) | `73ObSJKCwvgSPxNIRNA7` |
| Marketing Active stage | Discover at runtime by name |
| Karla (task assignee) | Discover from KNOWN_USERS map |
