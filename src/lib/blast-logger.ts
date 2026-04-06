import { writeFileSync, readFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import type { BlastRun } from "@/lib/blast-db";

const LOGS_DIR = join(process.cwd(), "logs", "blasts");

function slugify(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 60);
}

function getLogPath(address: string, startDate: string): string {
  const datePrefix = startDate.split("T")[0];
  const slug = slugify(address);
  return join(LOGS_DIR, `${datePrefix}-${slug}.md`);
}

export function writeBlastLog(params: {
  run: BlastRun;
  daySummaries: { date: string; sent: number; failed: number; skipped: number; tierLimit: number }[];
  summary: {
    totalEn: number;
    totalEs: number;
    delivered: number;
    undelivered: number;
    replies: number;
    optOuts: number;
  };
  errors: { date: string; phone: string; detail: string }[];
}): string {
  mkdirSync(LOGS_DIR, { recursive: true });

  const { run, daySummaries, summary, errors } = params;
  const deal = run.deal_data || {};
  const logPath = getLogPath(run.property_address || "unknown", run.started_at);

  const totalSent = daySummaries.reduce((sum, d) => sum + d.sent, 0);
  const totalFailed = daySummaries.reduce((sum, d) => sum + d.failed, 0);
  const totalSkipped = daySummaries.reduce((sum, d) => sum + d.skipped, 0);

  const dayRows = daySummaries
    .map((d) => `| ${d.date} | ${d.sent} | ${d.failed} | ${d.skipped} | ${d.tierLimit} |`)
    .join("\n");

  const errorLines =
    errors.length > 0
      ? errors.map((e) => `- ${e.date}: ${e.phone} — ${e.detail}`).join("\n")
      : "None";

  const content = `# Buyer Blast — ${run.property_address || "Unknown"}

**Opportunity ID:** ${run.opportunity_id}
**Triggered:** ${run.started_at}
**Status:** ${run.status}

## Deal Details
- City: ${deal.city || "N/A"} | State: ${deal.state || "N/A"}
- ${deal.bedroom_count || "?"}bd / ${deal.bathroom_count || "?"}ba | ${deal.property_square_footage || "?"} sq ft
- Cross Streets: ${deal.property_cross_streets || "N/A"}

## Send Summary
| Date | Sent | Failed | Skipped | Tier Limit |
|------|------|--------|---------|------------|
${dayRows}
| **Total** | **${totalSent}** | **${totalFailed}** | **${totalSkipped}** | |

## Recipient Breakdown
- English: ${summary.totalEn} | Spanish: ${summary.totalEs}
- Delivered: ${summary.delivered} | Undelivered: ${summary.undelivered}
- Replies: ${summary.replies} | Opt-outs: ${summary.optOuts}

## Errors
${errorLines}
`;

  writeFileSync(logPath, content, "utf-8");
  return logPath;
}

/**
 * Appends a day summary line to an existing log file.
 * Used for multi-day blasts that resume after tier limits.
 */
export function appendDaySummary(
  logPath: string,
  day: { date: string; sent: number; failed: number; skipped: number; tierLimit: number }
): void {
  if (!existsSync(logPath)) return;
  const content = readFileSync(logPath, "utf-8");
  const newRow = `| ${day.date} | ${day.sent} | ${day.failed} | ${day.skipped} | ${day.tierLimit} |`;

  // Insert before the **Total** row
  const updated = content.replace(
    /(\| \*\*Total\*\*)/,
    `${newRow}\n$1`
  );
  writeFileSync(logPath, updated, "utf-8");
}
