import { readFileSync, writeFileSync } from "fs";
import { CONTACT_TYPE_MULTI_ID } from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
} from "./lib/types.js";

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const changes: ProposedChange[] = [];

for (const contact of data.contacts) {
  if (!contact.fromBuyerPipeline) continue;

  const hasBuyerTag = contact.tags.some(
    (t) => t.toLowerCase() === "buyer"
  );
  if (!hasBuyerTag) {
    changes.push({
      contactId: contact.contactId,
      name: contact.name,
      action: "ADD_BUYER_TAG",
      field: "tags",
      currentValue: contact.tags,
      proposedValue: [...contact.tags, "buyer"],
      reason: "Contact is in Buyer Pipeline but missing 'buyer' tag",
    });
  }

  const multiSelectField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_MULTI_ID
  );
  const currentValues: string[] = Array.isArray(multiSelectField?.value)
    ? (multiSelectField.value as string[])
    : [];
  const hasBuyerType = currentValues.some(
    (v) => v.toLowerCase() === "buyer"
  );

  if (!hasBuyerType) {
    changes.push({
      contactId: contact.contactId,
      name: contact.name,
      action: "ADD_BUYER_TYPE",
      field: `customField:${CONTACT_TYPE_MULTI_ID}`,
      currentValue: currentValues,
      proposedValue: [...currentValues, "Buyer"],
      reason: "Contact is in Buyer Pipeline but missing 'Buyer' in Contact Type multi-select",
    });
  }
}

const output: ProposedChangeFile = {
  analyzer: "02-analyze-buyer-tags",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(".tmp/proposed-buyer-tags.json", JSON.stringify(output, null, 2));

console.log(`Buyer tag analyzer complete`);
console.log(`   Contacts scanned: ${data.contacts.filter((c) => c.fromBuyerPipeline).length}`);
console.log(`   Missing buyer tag: ${changes.filter((c) => c.action === "ADD_BUYER_TAG").length}`);
console.log(`   Missing Buyer type: ${changes.filter((c) => c.action === "ADD_BUYER_TYPE").length}`);
console.log(`   Total proposals: ${changes.length}`);
