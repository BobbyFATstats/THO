import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  CONTACT_TYPE_MULTI_ID,
  CONTACT_TYPE_OLD_ID,
  OLD_TYPE_MIGRATION,
} from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChangeFile,
  AppliedChangesFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);
const applied: AppliedChangesFile = JSON.parse(
  readFileSync(".tmp/changes-applied.json", "utf-8")
);

const proposalFiles: Record<string, string> = {
  "02-analyze-buyer-tags": ".tmp/proposed-buyer-tags.json",
  "03-analyze-missing-info": ".tmp/proposed-missing-info.json",
  "04-analyze-old-type": ".tmp/proposed-old-type.json",
  "05-analyze-tags": ".tmp/proposed-tag-normalize.json",
};

const proposals = new Map<string, ProposedChangeFile>();
for (const [name, file] of Object.entries(proposalFiles)) {
  if (existsSync(file)) {
    proposals.set(name, JSON.parse(readFileSync(file, "utf-8")));
  }
}

interface QACheck {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  details: string;
  issues: string[];
}

const checks: QACheck[] = [];

// Check 1: Completeness
{
  const proposedContactIds = new Set<string>();
  for (const [, p] of proposals) {
    for (const c of p.changes) proposedContactIds.add(c.contactId);
  }
  const appliedContactIds = new Set(applied.results.map((r) => r.contactId));
  const missed = [...proposedContactIds].filter((id) => !appliedContactIds.has(id));

  checks.push({
    name: "Completeness",
    status: missed.length === 0 ? "PASS" : "WARN",
    details: `${appliedContactIds.size} of ${proposedContactIds.size} proposed contacts were processed`,
    issues: missed.map((id) => {
      const contact = data.contacts.find((c) => c.contactId === id);
      return `Contact ${contact?.name || id} was proposed but not in applied results`;
    }),
  });
}

// Check 2: Correctness — buyer tag proposals
{
  const issues: string[] = [];
  const buyerProposals = proposals.get("02-analyze-buyer-tags");

  if (buyerProposals) {
    for (const change of buyerProposals.changes) {
      if (change.action === "ADD_BUYER_TAG") {
        const contact = data.contacts.find((c) => c.contactId === change.contactId);
        if (contact?.tags.some((t) => t.toLowerCase() === "buyer")) {
          issues.push(`${change.name}: proposed ADD_BUYER_TAG but already has "buyer" tag`);
        }
      }
      if (change.action === "ADD_BUYER_TYPE") {
        const contact = data.contacts.find((c) => c.contactId === change.contactId);
        const field = contact?.customFields.find((cf) => cf.id === CONTACT_TYPE_MULTI_ID);
        const values = Array.isArray(field?.value) ? (field.value as string[]) : [];
        if (values.some((v) => v.toLowerCase() === "buyer")) {
          issues.push(`${change.name}: proposed ADD_BUYER_TYPE but already has "Buyer"`);
        }
      }
    }
  }

  checks.push({
    name: "Correctness — Buyer Tag + Type",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `Checked ${buyerProposals?.changes.length || 0} buyer tag/type proposals`,
    issues,
  });
}

// Check 3: Correctness — old type migration mapping
{
  const issues: string[] = [];
  const oldTypeProposals = proposals.get("04-analyze-old-type");

  if (oldTypeProposals) {
    for (const change of oldTypeProposals.changes) {
      if (change.action === "MIGRATE_OLD_TYPE_ADD") {
        const oldVal = change.reason.match(/Old Contact Type "(.+?)"/)?.[1];
        const newVal = change.reason.match(/maps to "(.+?)"/)?.[1];
        if (oldVal && newVal && OLD_TYPE_MIGRATION[oldVal] !== newVal) {
          issues.push(
            `${change.name}: mapped "${oldVal}" to "${newVal}" but spec says "${OLD_TYPE_MIGRATION[oldVal]}"`
          );
        }
      }
    }
  }

  checks.push({
    name: "Correctness — Old Type Migration",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `Checked ${oldTypeProposals?.changes.length || 0} migration proposals`,
    issues,
  });
}

// Check 4: No collateral damage — tags
{
  const issues: string[] = [];

  for (const result of applied.results) {
    if (!result.payload.tags) continue;

    const contact = data.contacts.find((c) => c.contactId === result.contactId);
    if (!contact) continue;

    for (const existingTag of contact.tags) {
      if (existingTag.includes("#")) continue;
      if (!result.payload.tags.some((t) => t.toLowerCase() === existingTag.toLowerCase())) {
        issues.push(
          `${result.name}: existing tag "${existingTag}" would be removed`
        );
      }
    }
  }

  checks.push({
    name: "No Collateral Damage — Tags",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `Checked ${applied.results.filter((r) => r.payload.tags).length} tag updates for accidental removals`,
    issues,
  });
}

// Check 5: Error accounting
{
  const failedResults = applied.results.filter((r) => !r.success);

  checks.push({
    name: "Error Accounting",
    status: failedResults.length === 0 ? "PASS" : "WARN",
    details: `${applied.totalSuccess} succeeded, ${applied.totalFailed} failed, ${applied.totalSkipped} skipped`,
    issues: failedResults.map(
      (r) => `${r.name} (${r.contactId}): ${r.error || "unknown error"}`
    ),
  });
}

// Check 6: Pipeline coverage
{
  const issues: string[] = [];
  const pipelineContacts = data.contacts.filter((c) => c.fromBuyerPipeline);
  const processedIds = new Set(applied.results.map((r) => r.contactId));

  let needingFixCount = 0;
  for (const contact of pipelineContacts) {
    const hasBuyerTag = contact.tags.some((t) => t.toLowerCase() === "buyer");
    const multiField = contact.customFields.find((cf) => cf.id === CONTACT_TYPE_MULTI_ID);
    const multiValues = Array.isArray(multiField?.value) ? (multiField.value as string[]) : [];
    const hasBuyerType = multiValues.some((v) => v.toLowerCase() === "buyer");

    if (!hasBuyerTag || !hasBuyerType) {
      needingFixCount++;
      if (!processedIds.has(contact.contactId)) {
        issues.push(
          `${contact.name} (${contact.contactId}): needs fix but wasn't processed`
        );
      }
    }
  }

  checks.push({
    name: "Pipeline Coverage",
    status: issues.length === 0 ? "PASS" : "FAIL",
    details: `${needingFixCount} pipeline contacts needed fixes, ${processedIds.size} were processed`,
    issues,
  });
}

// Generate report
const passed = checks.filter((c) => c.status === "PASS").length;
const failed = checks.filter((c) => c.status === "FAIL").length;
const warned = checks.filter((c) => c.status === "WARN").length;

let report = `# QA Review Report — ${new Date().toISOString().split("T")[0]}\n\n`;
report += `**Mode:** ${applied.dryRun ? "DRY RUN" : "LIVE"}\n`;
report += `**Result:** ${failed === 0 ? "ALL CHECKS PASSED" : "ISSUES FOUND"}\n`;
report += `**Summary:** ${passed} PASS, ${warned} WARN, ${failed} FAIL\n\n`;
report += `---\n\n`;

for (const check of checks) {
  const icon = check.status === "PASS" ? "PASS" : check.status === "WARN" ? "WARN" : "FAIL";
  report += `## ${icon}: ${check.name}\n\n`;
  report += `${check.details}\n\n`;
  if (check.issues.length > 0) {
    report += `**Issues:**\n`;
    for (const issue of check.issues.slice(0, 20)) {
      report += `- ${issue}\n`;
    }
    if (check.issues.length > 20) {
      report += `- ... and ${check.issues.length - 20} more\n`;
    }
    report += `\n`;
  }
}

writeFileSync(".tmp/qa-review-report.md", report);

console.log(`\nQA Review Complete`);
console.log(`   ${passed} PASS | ${warned} WARN | ${failed} FAIL`);
console.log(`   Report: .tmp/qa-review-report.md`);

if (failed > 0) {
  console.error(`\nQA FAILED — review .tmp/qa-review-report.md before proceeding`);
  process.exit(1);
}
