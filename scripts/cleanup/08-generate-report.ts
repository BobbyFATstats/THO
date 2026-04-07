import { readFileSync, writeFileSync, existsSync } from "fs";
import { BUYER_PIPELINE_STAGES } from "./lib/ghl-api.js";
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

function loadProposal(file: string): ProposedChangeFile | null {
  return existsSync(file)
    ? JSON.parse(readFileSync(file, "utf-8"))
    : null;
}
const buyerTags = loadProposal(".tmp/proposed-buyer-tags.json");
const missingInfo = loadProposal(".tmp/proposed-missing-info.json");
const oldType = loadProposal(".tmp/proposed-old-type.json");
const tagNorm = loadProposal(".tmp/proposed-tag-normalize.json");

const date = new Date().toISOString().split("T")[0];
let md = `# Buyer Pipeline Audit Report — ${date}\n\n`;

const pipelineContacts = data.contacts.filter((c) => c.fromBuyerPipeline);
md += `## Summary\n\n`;
md += `| Metric | Count |\n|--------|-------|\n`;
md += `| Total opportunities | ${data.totalOpportunities} |\n`;
md += `| Unique contacts (pipeline) | ${pipelineContacts.length} |\n`;
md += `| Additional contacts (old type scan) | ${data.contacts.filter((c) => c.fromOldTypeScan).length} |\n`;
md += `| Contacts updated | ${applied.totalSuccess} |\n`;
md += `| Contacts failed | ${applied.totalFailed} |\n`;
md += `| Contacts skipped (already clean) | ${applied.totalSkipped} |\n`;
md += `| Mode | ${applied.dryRun ? "DRY RUN" : "LIVE"} |\n\n`;

md += `## Buyer Pipeline Stage Breakdown\n\n`;
md += `| Stage | Contacts |\n|-------|----------|\n`;
const stageCounts = new Map<string, number>();
for (const contact of pipelineContacts) {
  for (const opp of contact.opportunities) {
    const stage = BUYER_PIPELINE_STAGES[opp.stageId] || opp.stageId;
    stageCounts.set(stage, (stageCounts.get(stage) || 0) + 1);
  }
}
for (const [stage, count] of [...stageCounts.entries()].sort((a, b) => b[1] - a[1])) {
  md += `| ${stage} | ${count} |\n`;
}
md += `\n`;

if (buyerTags) {
  const tagAdds = buyerTags.changes.filter((c) => c.action === "ADD_BUYER_TAG");
  md += `## Buyer Tag Added (${tagAdds.length} contacts)\n\n`;
  if (tagAdds.length > 0) {
    md += `| Name | Contact ID | Previous Tags (sample) |\n|------|-----------|------------------------|\n`;
    for (const c of tagAdds.slice(0, 50)) {
      const tags = (c.currentValue as string[]).slice(0, 5).join(", ");
      md += `| ${c.name} | ${c.contactId} | ${tags} |\n`;
    }
    if (tagAdds.length > 50) md += `| ... | ${tagAdds.length - 50} more | |\n`;
    md += `\n`;
  }

  const typeAdds = buyerTags.changes.filter((c) => c.action === "ADD_BUYER_TYPE");
  md += `## Buyer Type Added to Multi-Select (${typeAdds.length} contacts)\n\n`;
  if (typeAdds.length > 0) {
    md += `| Name | Contact ID | Previous Values | New Values |\n|------|-----------|-----------------|------------|\n`;
    for (const c of typeAdds.slice(0, 50)) {
      md += `| ${c.name} | ${c.contactId} | ${JSON.stringify(c.currentValue)} | ${JSON.stringify(c.proposedValue)} |\n`;
    }
    if (typeAdds.length > 50) md += `| ... | ${typeAdds.length - 50} more | | |\n`;
    md += `\n`;
  }
}

if (missingInfo) {
  md += `## Need Contact Info Tagged (${missingInfo.totalProposed} contacts)\n\n`;
  if (missingInfo.totalProposed > 0) {
    md += `| Name | Contact ID | Opportunities |\n|------|-----------|---------------|\n`;
    for (const c of missingInfo.changes.slice(0, 50)) {
      const contact = data.contacts.find((ct) => ct.contactId === c.contactId);
      const oppCount = contact?.opportunities.length || 0;
      md += `| ${c.name} | ${c.contactId} | ${oppCount} |\n`;
    }
    if (missingInfo.changes.length > 50)
      md += `| ... | ${missingInfo.changes.length - 50} more | |\n`;
    md += `\n`;
  }
}

if (oldType) {
  const migrations = oldType.changes.filter((c) => c.action === "MIGRATE_OLD_TYPE_ADD");
  md += `## Old Contact Type Migrated (${migrations.length} contacts)\n\n`;
  if (migrations.length > 0) {
    md += `| Name | Contact ID | Old Value | New Value |\n|------|-----------|-----------|----------|\n`;
    for (const c of migrations) {
      const oldVal = c.reason.match(/Old Contact Type "(.+?)"/)?.[1] || "?";
      const newVal = c.reason.match(/maps to "(.+?)"/)?.[1] || "?";
      md += `| ${c.name} | ${c.contactId} | ${oldVal} | ${newVal} |\n`;
    }
    md += `\n`;
  }
}

if (tagNorm) {
  md += `## Hashtag Tags Normalized (${tagNorm.totalProposed} tags)\n\n`;
  if (tagNorm.totalProposed > 0) {
    md += `| Name | Old Tag | New Tag |\n|------|---------|--------|\n`;
    for (const c of tagNorm.changes.slice(0, 50)) {
      md += `| ${c.name} | ${c.currentValue} | ${c.proposedValue} |\n`;
    }
    if (tagNorm.changes.length > 50)
      md += `| ... | ${tagNorm.changes.length - 50} more | |\n`;
    md += `\n`;
  }
}

md += `## Remaining Issues\n\n`;

const unqualified = pipelineContacts.filter((c) =>
  c.opportunities.some((o) => o.stageId === "37250c40-7e09-4c51-842a-851b01fd8bfc")
);
md += `- **Contacts in "Buyer Unqualified" stage:** ${unqualified.length} (review if they should remain)\n`;

const needInfo = pipelineContacts.filter(
  (c) => !c.phone && !c.email
);
md += `- **Contacts with no contact info:** ${needInfo.length} (dispo manager follow-up needed)\n`;

const multiOppContacts = pipelineContacts.filter(
  (c) => c.opportunities.length > 1
);
md += `- **Contacts with multiple opportunities:** ${multiOppContacts.length} (review for true duplicates vs different buy boxes)\n`;

if (applied.totalFailed > 0) {
  md += `- **Failed updates:** ${applied.totalFailed} (review errors in changes-applied.json)\n`;
}

md += `\n---\n\n*Generated at ${new Date().toISOString()}*\n`;

const filename = `.tmp/buyer-pipeline-audit-${date}.md`;
writeFileSync(filename, md);

console.log(`Report generated: ${filename}`);
console.log(`   Pipeline contacts: ${pipelineContacts.length}`);
console.log(`   Updates applied: ${applied.totalSuccess}`);
console.log(`   Remaining issues flagged: ${unqualified.length + needInfo.length + multiOppContacts.length}`);
