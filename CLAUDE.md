# [PROJECT NAME] — Workspace Map

<!--
=======================================================================
UNIVERSAL PROJECT KICKSTARTER — OVERLAND AGENTS / BOBBY SOUZA
Version: 1.0

ARCHITECTURE: WAT + Trigger.dev
  Workflows  → markdown SOPs inside each agent room
  Agents     → Claude handles reasoning and coordination
  Tools      → Python scripts and CLI commands for deterministic execution
  Trigger.dev → production orchestration (retries, queues, scheduling)

HOW THIS FILE WORKS:
  1. Drop this CLAUDE.md into a new project folder in VS Code
  2. Claude Code reads it automatically on session start
  3. If agents/ doesn't exist → run the BOOTSTRAP INTERVIEW below
  4. Scaffold generates everything in one shot (see artifact list below)
  5. Fill in the TODOs with your domain expertise and start building

WHAT THIS FILE ALWAYS CONTAINS (do not bloat it):
  - Bootstrap interview + scaffold instructions (first run only, then inert)
  - Folder structure map
  - Navigation tables
  - Pipeline flow diagram
  - Model routing table
  - Naming conventions
  - Tools overview
  - Token management rules
  - WAT operating principles
  - Trigger.dev rules
  - Environment variable list
  - Deployment rules
  - Output rules
  - Session + decision log protocols

WHAT DOES NOT BELONG HERE:
  - Detailed workflow instructions → agents/*/workflow.md
  - Domain expertise / methodology → docs/
  - Sub-agent process details → agents/*/CONTEXT.md
=======================================================================
-->

---

## ⚡ FIRST RUN: Bootstrap Interview

<!--
TRIGGER CONDITION: agents/ folder is missing or empty.

Collect ALL answers first. Generate the COMPLETE scaffold in ONE shot.
Do NOT generate file by file. Collect everything, then build everything.
After scaffold is generated, this section becomes inert.
-->

**When triggered, ask the user these questions in order:**

---

```
BOOTSTRAP INTERVIEW — answer all of these, then I'll generate everything at once:

1. PROJECT NAME
   What is this agent system called?
   (e.g. "Harvey Parks", "Deal Scout", "TC Agent")

2. AGENT BRAND / PERSONA
   What name does the agent go by when communicating with users?
   (e.g. "Harvey", "Scout", "Molly")
   This becomes the agent's identity in iMessages and emails.

3. ONE-LINE PURPOSE
   What does this agent system do in one sentence?
   (e.g. "Underwrites RV parks and MHPs for real estate investors")

4. INPUT SOURCE(S) — select all that apply
   a) iMessage (via imsg CLI on Mac Mini)
   b) Email
   c) API endpoint (agent-to-agent or direct call)
   d) Web form / webhook
   e) Other: ___

5. OUTPUT FORMAT(S) — select all that apply
   a) iMessage summary
   b) Email with report
   c) PDF report (Typst)
   d) Google Sheets
   e) Slack message
   f) API response (JSON)
   g) Other: ___

6. PIPELINE STAGES
   List every major stage of work between input and output.
   Minimum: Intake → Processing → Output.
   (Harvey Parks has 7: Intake → Market Research → Underwriting →
   Analysis → QA → Output → Data)

   Stage 1: Intake  ← always first
   Stage 2: ___
   Stage 3: ___
   Stage N: Output  ← always last
   (add middle stages as needed)

7. QA GATE NEEDED?
   Does output need independent validation before reaching the end user?
   (y/n)
   If yes, which stage does it gate? ___
   NOTE: If you have any stage involving numbers, decisions, or verdicts
   that investors or clients will act on — the answer should be yes.

8. DATA STORAGE NEEDED?
   Does the system log, store, or cache results for later? (y/n)
   If yes, storage approach:
   a) SQLite (simple, single file, great for v1)
   b) Supabase (hosted PostgreSQL, free tier, scales)
   c) Google Sheets (accessible, no-code, fine for v1)
   d) TBD

9. TOOLS & MCPS — select all that apply
   a) imsg CLI (iMessage send/receive)
   b) gws CLI (Google Workspace: Sheets, Gmail, Drive, Docs)
   c) Firecrawl CLI (deep web research)
   d) Playwright CLI (browser automation / scraping)
   e) Brave Search MCP (local business / geographic search)
   f) Exa Search MCP (semantic search)
   g) Census Bureau MCP (demographics)
   h) Trigger.dev MCP (deploy and monitor from Claude Code)
   i) numpy-financial + amortization (financial math)
   j) Typst (PDF generation from templates)
   k) Other: ___

10. OPERATOR
    Brand name: ___ (e.g. "Overland Agents")
    Domain: ___ (e.g. "overlandagents.com")
    GitHub username: ___ (e.g. "BobbyFATstats")
```

---

**After collecting all answers — generate these artifacts in one pass:**

| Artifact | Notes |
|----------|-------|
| `CONTEXT.md` (root) | Top-level task router, pre-filled with all agent rooms |
| `agents/intake/CONTEXT.md` | Pre-filled routing table |
| `agents/intake/workflow.md` | Section headers + TODO markers |
| `agents/intake/docs/.gitkeep` | Empty folder placeholder |
| `agents/[each-stage]/CONTEXT.md` | One per stage, pre-filled |
| `agents/[each-stage]/workflow.md` | One per stage, headers + TODOs |
| `agents/[each-stage]/docs/.gitkeep` | Empty folder placeholder |
| `agents/qa/CONTEXT.md` | Only if QA gate requested |
| `agents/qa/workflow.md` | Only if QA gate requested |
| `agents/data/CONTEXT.md` | Only if data storage requested |
| `agents/data/workflow.md` | Only if data storage requested |
| `tools/[primary_calcs].py` | Stubs named for project domain |
| `tools/doc_extraction.py` | Standard stub |
| `tools/sheets_template.py` | Standard stub (if Sheets selected) |
| `src/trigger/[project]/orchestrator.ts` | Full pipeline chain |
| `src/trigger/[project]/[stage]-task.ts` | One per stage, typed payload |
| `templates/report-template.typ` | Typst placeholder |
| `templates/[sheets-template]/.gitkeep` | Sheets placeholder |
| `docs/[project]-framework.md` | Architecture doc + domain TODO |
| `config/trigger-ref.md` | Trigger.dev SDK v4 quick reference |
| `config/.env.example` | All required env vars for selected tools |
| `_examples/context-template.md` | CONTEXT.md authoring template |
| `_examples/common-mistakes.md` | Earned anti-patterns reference |
| `_examples/how-to-add-agent-room.md` | New room guide |
| `DECISIONS.md` | Pre-populated with scaffold decisions |
| `SESSION_LOG.md` | Pre-populated with Session 1 entry |
| `README.md` | Auto-filled from interview answers |
| `.gitignore` | Standard (.env, .tmp/, node_modules/, __pycache__/, etc.) |
| `CLAUDE.md` | This file — updated with actual project name and structure |

---

**Rules for generated CONTEXT.md files:**

Every agent room CONTEXT.md must contain these sections in this order:
1. `## What This Room Is` — 1-2 sentences, upstream source, downstream target
2. `## Context Routing` — READ / SKIP / USE / MODEL table
3. `## What to Load Per Task` — task-specific load/skip tables
4. `## Folder Structure` — just this room's files
5. `## The Process` — numbered steps
6. `## Skills & Tools` — every tool has a WHEN trigger condition
7. `## What NOT to Do` — leave empty on day one, fill as mistakes happen
8. `## Handoff` — receives from, passes to, format

**Model assignment rules (apply automatically during scaffold):**
- Intake, retrieval/research, QA, output, data stages → **Sonnet 4.6**
- Core reasoning, synthesis, financial analysis, final verdict stages → **Opus 4.6**
- Default when uncertain → **Sonnet 4.6**

**DECISIONS.md — pre-populate with scaffold decisions:**

```markdown
# Decision Log

| Date | Decision | Options Considered | Chosen | Rationale |
|------|----------|-------------------|--------|-----------|
| [date] | Pipeline stage count | [stages listed] | [N stages] | User-defined from bootstrap |
| [date] | Input source | [options] | [selected] | User-defined from bootstrap |
| [date] | Output format | [options] | [selected] | User-defined from bootstrap |
| [date] | QA gate | Yes / No | [selected] | User-defined from bootstrap |
| [date] | Storage approach | SQLite / Supabase / Sheets / TBD | [selected] | User-defined from bootstrap |
| [date] | Model routing | Sonnet vs Opus per stage | See CLAUDE.md model table | Opus only where judgment required |
```

**SESSION_LOG.md — pre-populate with Session 1:**

```markdown
# Session Log

## How to Use
One entry per Claude Code session. Most recent at the top.
Log: what was done, decisions made, blockers, status, next steps.

---

## [DATE] — Session 1: Scaffold Generated
- Generated full project scaffold via bootstrap interview
- Project: [PROJECT NAME] | Agent: [PERSONA] | Pipeline: [N] stages
- Status: Scaffold complete. workflow.md files need domain expertise.
- Next: Fill in agents/intake/workflow.md with domain SOPs
- Open questions: [any unresolved decisions from interview]
```

---

## What This Is

**[PROJECT NAME]** is [ONE-LINE PURPOSE]. Built by Bobby Souza under the **[BRAND]** brand ([domain]).

This project uses the **WAT + Trigger.dev** architecture:
- **Workflows** define what to do (markdown SOPs in each agent room)
- **Agents** handle reasoning and coordination (Claude)
- **Tools** handle deterministic execution (Python scripts and CLI commands)
- **Trigger.dev** handles production orchestration (retries, queues, scheduling)

**CONTEXT.md** (top-level) routes incoming work to the correct agent room. This file is the map.

---

## Folder Structure

```
[project-name]/
├── CLAUDE.md                        ← You are here (always loaded, always lean)
├── CONTEXT.md                       ← Task router (dispatches to agent rooms)
├── DECISIONS.md                     ← Decision log (what, why, alternatives)
├── SESSION_LOG.md                   ← Session log (progress, blockers, next)
├── README.md                        ← Project overview
│
├── agents/                          ← Sub-agent rooms (each is self-contained)
│   ├── intake/
│   │   ├── CONTEXT.md              ← Routing table, process, tools for intake
│   │   ├── workflow.md             ← Detailed SOP (Bobby fills in expertise)
│   │   └── docs/                   ← Intake-specific reference material
│   │
│   ├── [middle-stage]/             ← One folder per pipeline stage
│   │   ├── CONTEXT.md
│   │   ├── workflow.md
│   │   └── docs/
│   │
│   ├── [qa]/                       ← Only if QA gate was requested
│   │   ├── CONTEXT.md
│   │   ├── workflow.md
│   │   └── docs/
│   │
│   ├── output/
│   │   ├── CONTEXT.md
│   │   ├── workflow.md
│   │   └── docs/
│   │
│   └── [data]/                     ← Only if data storage was requested
│       ├── CONTEXT.md
│       ├── workflow.md
│       └── docs/
│
├── tools/                           ← Python scripts for deterministic execution
│   ├── [primary_calcs].py          ← ALL math runs here. Never in AI head.
│   ├── doc_extraction.py           ← Document parsing (PDF, image, spreadsheet)
│   └── sheets_template.py          ← Google Sheets population
│
├── src/trigger/[project]/           ← Trigger.dev TypeScript tasks
│   ├── orchestrator.ts             ← Main entry point, chains all stages
│   ├── intake-task.ts
│   ├── [stage]-task.ts             ← One per pipeline stage
│   └── output-task.ts
│
├── templates/                       ← Output templates (PDF, Sheets structure)
│   ├── [sheets-template]/
│   └── report-template.typ
│
├── docs/                            ← Project-level reference (load on demand)
│   └── [project]-framework.md      ← Full architecture + domain methodology
│
├── config/
│   ├── trigger-ref.md              ← Trigger.dev SDK v4 quick reference
│   └── .env.example                ← Required env vars (no actual values)
│
├── _examples/                       ← Templates and references (not workflow)
│   ├── context-template.md         ← Template for new CONTEXT.md files
│   ├── common-mistakes.md          ← Earned anti-patterns (update as they happen)
│   └── how-to-add-agent-room.md    ← Guide for adding new pipeline stages
│
└── .tmp/                            ← Temporary files (gitignored, disposable)
```

---

## Quick Navigation

| Want to... | Go here |
|------------|---------|
| **Understand the full architecture** | `docs/[project]-framework.md` |
| **Route an incoming task** | `CONTEXT.md` (top-level router) |
| **See what was decided and why** | `DECISIONS.md` |
| **See session progress + next steps** | `SESSION_LOG.md` |
| **Look up Trigger.dev SDK patterns** | `config/trigger-ref.md` |
| **Add a new agent room** | `_examples/how-to-add-agent-room.md` |
| **Create a new CONTEXT.md** | `_examples/context-template.md` |
| **Review earned anti-patterns** | `_examples/common-mistakes.md` |

<!-- AGENT ROOM NAVIGATION (filled in after bootstrap): -->

| Want to... | Go here |
|------------|---------|
| **[Intake task]** | `agents/intake/CONTEXT.md` |
| **[Middle stage task]** | `agents/[stage]/CONTEXT.md` |
| **[Output task]** | `agents/output/CONTEXT.md` |

---

## Pipeline Flow

<!--
Filled in after bootstrap with actual stage names.
Replace placeholders below.
-->

```
Incoming [INPUT SOURCE]
        │
        ▼
    INTAKE
    (validate input, extract data,
     request missing info if needed)
        │
        ▼
    [MIDDLE STAGE 1]
    (...)
        │
        ▼
    [MIDDLE STAGE N]
    (...)
        │
        ▼
    [QA GATE — if requested]
    (math checks, consistency,
     verdict alignment.
     NOTHING passes without QA.)
        │
        ▼
    OUTPUT
    ([output formats: iMessage, email, PDF, Sheets])
        │
        ▼
    [DATA STORAGE — if requested]
    (log results, cache, feedback loop)
```

**Cross-agent data flow is ONE-WAY down the pipeline.**
No agent reaches back up the chain. Each stage consumes the structured
output from the stage above it and produces structured output for the stage below.

---

## Model Routing

<!--
Cost optimization: use the cheapest model that can handle the job.
This table is the single source of truth for model assignments.
-->

| Tier | Model | Agents | Use When |
|------|-------|--------|----------|
| **Standard** | Sonnet 4.6 | Intake, research, QA, output, data | Default for 80%+ of all calls |
| **Heavy** | Opus 4.6 | Core reasoning stages | Financial analysis, synthesis, verdict, complex judgment |
| **Light** | Haiku 4.5 | *(future)* | Status checks, duplicate detection, routing, confirmations |

<!--
TOKEN OPTIMIZATION TODO — Intelligent Model Self-Routing
Implement this when processing 100+ jobs/week:

HAIKU  → 85%+ of ops: status confirmations, routing, session clears, dedup checks
SONNET → 10-15% of ops: extraction, research synthesis, QA, formatting, storage
OPUS   → <5% of ops: core reasoning stages only

Default to Sonnet everywhere. Escalate to Opus only where quality proves insufficient.
This alone cuts API costs 60-80% at scale.
-->

---

## Naming Conventions

| Content Type | Pattern | Example |
|-------------|---------|---------|
| Incoming jobs | `[id-slug]-intake.[ext]` | `job-123-intake.pdf` |
| Stage outputs | `[id-slug]-[stage]-v[n]` | `job-123-analysis-v1` |
| Final reports | `[id-slug]-report-v[n].[ext]` | `job-123-report-v1.pdf` |
| Sheets | `[id-slug]-sheet` | `job-123-sheet` |
| Workflow SOPs | `workflow.md` | Always `workflow.md` in each room |
| Context files | `CONTEXT.md` | Always `CONTEXT.md` in each room |

---

## Skills & Tools Available

<!--
System-level overview only. Each agent room's CONTEXT.md wires
specific tools to specific trigger conditions.
DO NOT wire tools here. Wire them in the room where they're used.
Every tool needs a WHEN trigger in the room that uses it.
-->

| Tool | Type | Notes |
|------|------|-------|
| `tools/[primary_calcs].py` | Python script | ALL deterministic calculations. Never in AI head. |
| `tools/doc_extraction.py` | Python script | PDF, image, spreadsheet parsing |
| `tools/sheets_template.py` | Python script | Google Sheets template population |
| `gws` CLI | CLI | Gmail + Drive + Sheets + Docs — one tool, fewer tokens than MCP |
| `imsg` CLI | CLI | iMessage send/receive on Mac Mini |
| Firecrawl CLI | CLI | Deep web research (results → `.tmp/`, never in context) |
| Playwright CLI | CLI | Browser automation, scraping (~4x fewer tokens than MCP) |
| Brave Search MCP | MCP | Local/geographic business search, 2k free queries/month |
| Exa Search MCP | MCP | Semantic/neural search, free tier |
| Census Bureau MCP | MCP | Demographics, free, unlimited |
| Trigger.dev MCP | MCP | Deploy, trigger, monitor runs directly from Claude Code |

---

## Token Management

**Each agent room is siloed. Don't load everything at once.**

- Running Intake? → Load `agents/intake/CONTEXT.md` + its workflow. Skip all other rooms.
- Running a middle stage? → Load that room's CONTEXT.md + upstream structured output only.
- Running QA? → Load `agents/qa/CONTEXT.md` + the package being validated. Skip upstream.
- Running Output? → Load `agents/output/CONTEXT.md` + validated package. Skip everything else.

The CONTEXT.md in each room tells you exactly what to load. **Trust them. Especially the SKIP rows.**

**Deduplication Guard:**
Before any API call, tool use, or DB query — check if the data is already in current context.
If yes, use it. Do NOT re-fetch. Before storing, check if it already exists. Don't duplicate.

**Results to disk, not context:**
Web research, scraped data, large documents → `.tmp/` on disk.
Reference by file path. Do not paste into context.

---

## WAT Operating Principles

**Probabilistic AI vs. Deterministic Code:**
AI handles reasoning, judgment, and coordination.
Deterministic scripts handle math, API calls, and file operations.
90% accuracy per AI step = 59% accuracy after 5 steps.
Offload execution to scripts. Always.

**The SKIP row matters more than the READ row:**
Loading the right context is good. NOT loading the wrong context is critical.
Every unnecessary file loaded = wasted tokens on every call in that session.

**Self-Improvement Loop:**
1. Identify what broke
2. Fix the tool or workflow
3. Verify the fix works
4. Update the relevant workflow.md
5. Log the change in SESSION_LOG.md
6. Move forward with a more robust system

**Workflow Evolution:**
Propose updates when you find better methods or recurring issues.
Do NOT overwrite workflow.md files without asking Bobby unless explicitly told to.

**Anti-patterns are earned, not imagined:**
`_examples/common-mistakes.md` starts with known patterns from Harvey Parks.
Update it as new mistakes happen in this project. Don't try to predict everything upfront.

---

## Trigger.dev Rules

- Use `@trigger.dev/sdk` **v4 patterns ONLY**. Never `client.defineJob` (that's v2, breaks everything).
- `triggerAndWait()` returns a `Result` object. Always check `result.ok` before `result.output`.
- **NEVER** wrap `triggerAndWait`, `batchTriggerAndWait`, or `wait.*` in `Promise.all`.
- Use `idempotencyKey` to prevent duplicate processing of the same job.
- TypeScript imports between task files require `.js` extension (not `.ts`).
- See `config/trigger-ref.md` for complete SDK code examples and common failure causes.

**MCP shortcuts (prefer over CLI during development):**

| Action | MCP Tool |
|--------|----------|
| Deploy to production | `mcp__trigger__deploy` |
| Fire a test run | `mcp__trigger__trigger_task` |
| Check run status | `mcp__trigger__get_run_details` |
| List recent runs | `mcp__trigger__list_runs` |

---

## Environment Variables

Every secret lives in `.env`. Never log, hardcode, or commit secrets.
See `config/.env.example` for the full list (generated from bootstrap tool selections).

```
ANTHROPIC_API_KEY=          # console.anthropic.com
TRIGGER_SECRET_KEY=         # cloud.trigger.dev > Project Settings

# Added based on bootstrap tool selections:
GOOGLE_WORKSPACE_CLI_CLIENT_ID=
GOOGLE_WORKSPACE_CLI_CLIENT_SECRET=
FIRECRAWL_API_KEY=
BRAVE_SEARCH_API_KEY=
# ... others per project
```

**Before deploying:** add ALL env vars to Trigger.dev dashboard (Project > Environment Variables).
This is the #1 cause of production failures.

---

## Deployment Rules

**NEVER push to production without Bobby's explicit approval.**
Wait for "push it", "deploy", or "ship it."

Pre-deploy checklist:
- [ ] All env vars added to Trigger.dev dashboard
- [ ] Tested locally with a real payload
- [ ] Bobby approved
- [ ] `.env` confirmed in `.gitignore`
- [ ] No secrets in code or committed files

Deploy: push to `master`. GitHub Actions auto-deploys.

---

## Output Rules

- Deliverables go to cloud (Sheets, Drive, Gmail). Local files are processing artifacts only.
- Everything in `.tmp/` is disposable and gitignored.
- Every report must have **identical structure across all jobs**. Only data changes.
- **QA gate is non-negotiable** (if QA stage exists). Nothing reaches the end user without it.
- iMessage summaries: **hard limit 500 characters**. Verdict + key numbers + one-line thesis. No fluff.
- Agent-to-agent handoff summaries: **under 100 tokens**. Never forward full pipeline history.

---

## Session Log Protocol

**This is MANDATORY. Every Claude Code session MUST end with a session log — no exceptions.**
This applies whether the session was planning, execution, debugging, or discussion.

Session logs live in `sessions/` as individual files. Use `sessions/TEMPLATE.md` as the format.

**Naming convention:** `sessions/YYYY-MM-DD-[short-slug].md`
Example: `sessions/2026-03-24-fix-ghl-422.md`

If multiple sessions happen on the same day, append a letter: `2026-03-24b-dashboard-refactor.md`

**When to write the session log:**
- At the END of every session, before signing off
- After completing a plan (even if no code was written — log what was planned and decided)
- After executing changes (log what changed, what was deployed, what broke)
- After debugging (log root cause, fix, and what to watch for)

**What goes in the session log (follows `sessions/TEMPLATE.md`):**

```markdown
# Session Summary

**Date:** YYYY-MM-DD
**Focus:** [one-line description of what this session was about]

## What Got Done
- [specific changes, files modified, features built]

## Decisions Made
- [every non-trivial decision — also log to DECISIONS.md]

## Open Items / Next Steps
- [exactly what to pick up next session]

## Files Changed
- [list of files added/modified/deleted]

## Memory Updates
- Preferences learned: [anything new about how Bobby wants things done]
- Decisions to log: [pointer to DECISIONS.md entries if applicable]
```

**Cross-reference rule:** Any decision logged in the session log MUST also be added to `DECISIONS.md`.
The session log captures the narrative; `DECISIONS.md` is the searchable index.

---

## Decision Log Protocol

Log every non-trivial decision to `DECISIONS.md` as it's made.
Format: `| [DATE] | [Topic] | [Options] | [Chosen] | [Why — 1-2 sentences] |`

**This happens IN REAL TIME — not just at session end.**
When a decision is made during the session, log it to `DECISIONS.md` immediately.
Then reference it in the session log at the end.

**Decisions worth logging:**
- Tool selections (which MCP, which library, which database)
- Model assignment changes from defaults
- Architecture deviations from the standard WAT pattern
- Pipeline stage additions or removals
- Bug fixes and root causes (what broke, why, how it was fixed)
- Cost-saving tradeoffs
- Any decision you might question or revisit later

---

## Bottom Line

You sit between what Bobby wants (workflows) and what actually gets done (tools).
Read the CONTEXT.md for the relevant agent room. Make smart decisions. Call the right tools.
Recover from errors. Log what you learn. Keep improving the system.

**AI handles reasoning. Scripts handle execution. Trigger.dev handles orchestration.
Markdown carries the knowledge forever, regardless of what model or platform runs it.**

Stay pragmatic. Stay reliable. Keep learning.
