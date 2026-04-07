import { readFileSync, writeFileSync } from "fs";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const changes: ProposedChange[] = [];
const TAG = "need contact info";

for (const contact of data.contacts) {
  if (!contact.fromBuyerPipeline) continue;

  const hasPhone = contact.phone && contact.phone.trim().length > 0;
  const hasEmail =
    contact.email &&
    contact.email.trim().length > 0 &&
    contact.email !== "?";

  if (!hasPhone && !hasEmail) {
    const alreadyTagged = contact.tags.some(
      (t) => t.toLowerCase() === TAG
    );
    if (!alreadyTagged) {
      changes.push({
        contactId: contact.contactId,
        name: contact.name,
        action: "ADD_NEED_CONTACT_INFO_TAG",
        field: "tags",
        currentValue: contact.tags,
        proposedValue: [...contact.tags, TAG],
        reason: "Contact has no phone and no email — unreachable for buyer blasts",
      });
    }
  }
}

const output: ProposedChangeFile = {
  analyzer: "03-analyze-missing-info",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(
  ".tmp/proposed-missing-info.json",
  JSON.stringify(output, null, 2)
);

console.log(`Missing info analyzer complete`);
console.log(`   Contacts scanned: ${data.contacts.filter((c) => c.fromBuyerPipeline).length}`);
console.log(`   Missing contact info (newly tagged): ${changes.length}`);
