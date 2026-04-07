import { readFileSync, writeFileSync } from "fs";
import {
  CONTACT_TYPE_MULTI_ID,
  CONTACT_TYPE_OLD_ID,
  OLD_TYPE_MIGRATION,
} from "./lib/ghl-api.js";
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
  const oldField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_OLD_ID
  );
  if (!oldField || !oldField.value) continue;

  const oldValue = String(oldField.value).trim();
  if (!oldValue) continue;

  const newValue = OLD_TYPE_MIGRATION[oldValue];

  const multiField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_MULTI_ID
  );
  const currentMulti: string[] = Array.isArray(multiField?.value)
    ? (multiField.value as string[])
    : [];

  if (newValue) {
    const alreadyHas = currentMulti.some(
      (v) => v.toLowerCase() === newValue.toLowerCase()
    );
    if (!alreadyHas) {
      changes.push({
        contactId: contact.contactId,
        name: contact.name,
        action: "MIGRATE_OLD_TYPE_ADD",
        field: `customField:${CONTACT_TYPE_MULTI_ID}`,
        currentValue: currentMulti,
        proposedValue: [...currentMulti, newValue],
        reason: `Old Contact Type "${oldValue}" maps to "${newValue}" in new multi-select`,
      });
    }
  } else {
    console.warn(
      `  Warning: No mapping for old Contact Type value "${oldValue}" on ${contact.name} (${contact.contactId})`
    );
  }

  changes.push({
    contactId: contact.contactId,
    name: contact.name,
    action: "CLEAR_OLD_TYPE",
    field: `customField:${CONTACT_TYPE_OLD_ID}`,
    currentValue: oldValue,
    proposedValue: "",
    reason: `Clearing deprecated single-select Contact Type field (value was "${oldValue}")`,
  });
}

const output: ProposedChangeFile = {
  analyzer: "04-analyze-old-type",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(
  ".tmp/proposed-old-type.json",
  JSON.stringify(output, null, 2)
);

const migrations = changes.filter((c) => c.action === "MIGRATE_OLD_TYPE_ADD");
const clears = changes.filter((c) => c.action === "CLEAR_OLD_TYPE");

console.log(`Old Contact Type migration analyzer complete`);
console.log(`   Contacts with old field: ${clears.length}`);
console.log(`   Values to migrate: ${migrations.length}`);
console.log(`   Fields to clear: ${clears.length}`);
