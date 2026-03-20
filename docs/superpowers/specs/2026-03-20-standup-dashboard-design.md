# THO Stand-Up Dashboard — Design Spec

**Date:** 2026-03-20
**Author:** Bobby Souza + Claude
**Status:** Approved

## Purpose

A web app dashboard for the Total House Offer (THO) wholesale real estate team that ingests daily Zoom stand-up transcripts, uses AI to extract structured data (action items, discussion topics, CRM bugs/features, ideas), and provides an interactive interface for the team to track, prioritize, and manage their work. Foundationally driven by the Mon-Thu "THO Daily Stand-Up" Zoom meetings but fully interactive through the application.

## Architecture

**Approach:** Next.js full-stack monolith with Supabase (Postgres) and Claude API.

Three layers:

1. **Ingestion Layer** — Scheduled cron job (Mon-Thu) calls Zoom API (Server-to-Server OAuth) to fetch the latest "THO Daily Stand-Up" transcript in VTT format.
2. **Processing Layer** — Raw VTT transcript sent to Claude API (Sonnet 4.6) which returns structured JSON: action items, discussion topics, ideas, CRM features/bugs, and notable points — each with a confidence score.
3. **Web Layer** — Next.js dashboard reads from Supabase. Team interacts directly: reprioritize, add, check off, cancel, reassign, edit. All changes persisted immediately.

**Data flow:**

```
Zoom Cloud → Cron Job → Zoom API (fetch VTT) → Claude API (extract) → Supabase (store) → Next.js Dashboard (display + interact)
```

Phase 2 adds GoHighLevel API as a second data source for pipeline deals, contacts, conversations, and tasks.

## Data Model

### `meetings`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| zoom_meeting_id | text | Zoom's meeting ID |
| date | date | Meeting date |
| raw_transcript | text | Full VTT content |
| ai_summary | text | 2-3 sentence AI-generated summary |
| processed_at | timestamp | When AI extraction completed |
| created_at | timestamp | |

### `action_items`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| meeting_id | uuid (FK, nullable) | Null for manually added items |
| title | text | Short description |
| description | text | Detailed context |
| assignee | text | Team member name (Bobby, Karla, Tammy, etc.) |
| priority | enum | high, medium, low |
| status | enum | open, in_progress, completed, cancelled |
| confidence_score | float | 0-1, from AI extraction |
| source | enum | ai_extracted, manual |
| created_at | timestamp | |
| completed_at | timestamp (nullable) | Set when status → completed |

### `discussion_topics`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| meeting_id | uuid (FK) | Always tied to a meeting |
| category | enum | crm_feature, crm_bug, idea, growth_learning, deal_update, general |
| title | text | |
| summary | text | |
| confidence_score | float | 0-1 |
| created_at | timestamp | |

### `notes`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| meeting_id | uuid (FK, nullable) | Null for standalone notes |
| content | text | |
| author | text | |
| created_at | timestamp | |
| updated_at | timestamp | |

**Key decisions:**
- `meeting_id` is nullable on `action_items` and `notes` so team can add items outside of meetings.
- Action items persist across meetings — they live until completed/cancelled.
- Discussion topics are always tied to a meeting.
- No user accounts table — assignee is a text field. Small trusted team, no RBAC needed.
- Confidence thresholds: high (>0.8), medium (0.5-0.8), low (<0.5).

## Dashboard Layout

**Sidebar + Main Content layout.**

### Sidebar (always visible)
- App logo / "THO Stand-Up"
- Navigation: Dashboard, Action Items, Topics, CRM Tracker (Phase 2)
- Divider
- Recent meetings list (dates, clickable)

### Pages

**1. Dashboard (home)**
- Today's meeting summary (or most recent)
- Quick stats: open action items, completed this week, items needing review
- Recent action items (top 5 by priority)
- Recent discussion topics grouped by category
- "Add Item" button for manual entries

**2. Action Items**
- Full list with filters: assignee, status, priority, source (AI/manual)
- Inline editing: click to change priority, assignee, status
- Check-off, cancel, reassign via quick actions
- Drag to reorder priority
- Low-confidence items get amber dot indicator

**3. Topics**
- Category tabs: All, CRM Features, CRM Bugs, Ideas, Growth/Learning, General
- Each topic: date discussed, summary, confidence score
- Searchable

**4. Meeting Detail** (click date in sidebar)
- AI-generated summary
- All extracted items from that meeting
- Editable notes section
- Expandable raw transcript

**5. CRM Tracker** (Phase 2 — placeholder)
- GoHighLevel pipeline deals, contact counts, conversation metrics, tasks

## Transcript Processing

### Ingestion
- Vercel Cron fires Mon-Thu at configurable time (e.g., 1 PM PT)
- Calls Zoom API: `GET /users/me/recordings` filtered by date
- Looks for meetings matching "THO Daily Stand-Up"
- Downloads VTT transcript
- Stores raw transcript in `meetings` table
- Triggers Claude API processing

### AI Extraction
- Model: Claude Sonnet 4.6
- Input: raw VTT transcript
- Output: structured JSON

```json
{
  "summary": "2-3 sentence meeting overview",
  "action_items": [
    {
      "title": "Follow up with seller on 123 Main St",
      "description": "Seller hasn't responded to last offer...",
      "assignee": "Bobby",
      "priority": "high",
      "confidence": 0.92
    }
  ],
  "discussion_topics": [
    {
      "category": "crm_bug",
      "title": "Contact merge duplicating notes",
      "summary": "Karla noticed that merging contacts...",
      "confidence": 0.85
    }
  ]
}
```

### Confidence Scoring
- **High (>0.8):** Clearly stated action or topic
- **Medium (0.5-0.8):** Implied or ambiguous — mentioned but no clear owner/timeline
- **Low (<0.5):** AI is guessing — offhand comment that might be worth tracking

### Display Treatment
- High confidence: normal display, no indicator
- Medium confidence: subtle amber dot
- Low confidence: amber dot + "AI flagged — review" label

### Edge Cases
- No transcript available: cron retries once 30 min later, then skips
- Meeting cancelled: no recording found, nothing created
- Manual re-processing: "Reprocess" button on meeting detail page

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS |
| Components | shadcn/ui |
| Database | Supabase (hosted Postgres) |
| AI | Claude API (Sonnet 4.6) via @anthropic-ai/sdk |
| Zoom | Zoom REST API (Server-to-Server OAuth) |
| Auth | NextAuth.js (credentials provider, shared team password) |
| Scheduling | Vercel Cron |
| Deployment | Vercel |
| CRM (Phase 2) | GoHighLevel API |

## Environment Variables

```
ANTHROPIC_API_KEY=
ZOOM_ACCOUNT_ID=
ZOOM_CLIENT_ID=
ZOOM_CLIENT_SECRET=
ZOOM_SECURITY_TOKEN=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXTAUTH_SECRET=
NEXTAUTH_URL=
TEAM_PASSWORD=

# Phase 2
GHL_API_TOKEN=
GHL_LOCATION_ID=
```

## Auth

- NextAuth.js credentials provider
- Single shared team password
- No individual accounts or roles
- Everyone sees the same view, everyone can edit everything

## Phasing

### Phase 1 — Meeting Intelligence Dashboard (build now)
1. Zoom API integration — fetch transcripts automatically
2. Claude API processing — extract action items, topics, ideas, bugs with confidence scores
3. Dashboard UI — sidebar layout, all pages (Dashboard, Action Items, Topics, Meeting Detail)
4. Full interactivity — reprioritize, add, check-off, cancel, reassign, edit
5. Simple auth — shared team password
6. Deploy to Vercel

### Phase 2 — GoHighLevel Integration (build later)
1. GHL API connection — pull opportunities, contacts, conversations, tasks
2. CRM Tracker page — Acquisition pipeline, Disposition & Closing pipeline
3. Deal cards — contract type (sub-to, PSA, seller finance, hybrids), key dates (contracted, inspection period, EMD due, COE)
4. Team metrics — contacts created by Karla/Tammy, SMS/email/call counts, tasks created/completed (last 7 days)

## Out of Scope
- Mobile-responsive design (desktop-first)
- Individual user accounts / role-based permissions
- Real-time collaboration (live cursors, etc.)
- Zoom recording playback in the app
- Automated notifications/reminders
