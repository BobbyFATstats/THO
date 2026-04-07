import { readFileSync, writeFileSync, existsSync } from "fs";
import {
  CONTACT_TYPE_MULTI_ID,
  CONTACT_TYPE_OLD_ID,
  updateContact,
} from "./lib/ghl-api.js";
import type {
  BuyerPipelineData,
  ProposedChange,
  ProposedChangeFile,
  AppliedResult,
  AppliedChangesFile,
} from "./lib/types.js";

const DRY_RUN = process.argv.includes("--dry-run");

const data: BuyerPipelineData = JSON.parse(
  readFileSync(".tmp/buyer-pipeline-data.json", "utf-8")
);

const proposalFiles = [
  ".tmp/proposed-buyer-tags.json",
  ".tmp/proposed-missing-info.json",
  ".tmp/proposed-old-type.json",
  ".tmp/proposed-tag-normalize.json",
];

const allChanges: ProposedChange[] = [];
for (const file of proposalFiles) {
  if (!existsSync(file)) {
    console.warn(`Warning: Missing proposal file: ${file} — skipping`);
    continue;
  }
  const proposal: ProposedChangeFile = JSON.parse(readFileSync(file, "utf-8"));
  allChanges.push(...proposal.changes);
  console.log(`${proposal.analyzer}: ${proposal.totalProposed} proposals`);
}

console.log(`\nTotal proposed changes: ${allChanges.length}`);

const byContact = new Map<string, ProposedChange[]>();
for (const change of allChanges) {
  const existing = byContact.get(change.contactId) || [];
  existing.push(change);
  byContact.set(change.contactId, existing);
}

console.log(`Contacts to update: ${byContact.size}`);
console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "LIVE — applying changes"}\n`);

const contactMap = new Map(data.contacts.map((c) => [c.contactId, c]));

const results: AppliedResult[] = [];
let successCount = 0;
let failCount = 0;
let skipCount = 0;
let i = 0;

for (const [contactId, changes] of byContact) {
  i++;
  const contact = contactMap.get(contactId);
  if (!contact) {
    console.warn(`  Warning: Contact ${contactId} not in data snapshot — skipping`);
    skipCount++;
    continue;
  }

  let finalTags = [...contact.tags];
  const customFieldUpdates = new Map<string, unknown>();

  const multiField = contact.customFields.find(
    (cf) => cf.id === CONTACT_TYPE_MULTI_ID
  );
  let multiValues: string[] = Array.isArray(multiField?.value)
    ? [...(multiField.value as string[])]
    : [];

  for (const change of changes) {
    switch (change.action) {
      case "ADD_BUYER_TAG": {
        if (!finalTags.some((t) => t.toLowerCase() === "buyer")) {
          finalTags.push("buyer");
        }
        break;
      }
      case "ADD_NEED_CONTACT_INFO_TAG": {
        const tag = "need contact info";
        if (!finalTags.some((t) => t.toLowerCase() === tag)) {
          finalTags.push(tag);
        }
        break;
      }
      case "NORMALIZE_HASHTAG_TAG": {
        const hashTags = finalTags.filter((t) => t.includes("#"));
        const cleanSet = new Set(
          finalTags.filter((t) => !t.includes("#")).map((t) => t.toLowerCase())
        );
        const newClean: string[] = [];
        for (const ht of hashTags) {
          const clean = ht.replace(/#/g, "").trim().toLowerCase();
          if (clean && !cleanSet.has(clean)) {
            newClean.push(clean);
            cleanSet.add(clean);
          }
        }
        finalTags = [
          ...finalTags.filter((t) => !t.includes("#")),
          ...newClean,
        ];
        break;
      }
      case "ADD_BUYER_TYPE": {
        if (!multiValues.some((v) => v.toLowerCase() === "buyer")) {
          multiValues.push("Buyer");
        }
        break;
      }
      case "MIGRATE_OLD_TYPE_ADD": {
        const newVal = change.proposedValue as string[];
        const added = (newVal as string[]).find(
          (v) => !(change.currentValue as string[]).includes(v)
        );
        if (added && !multiValues.some((v) => v.toLowerCase() === added.toLowerCase())) {
          multiValues.push(added);
        }
        break;
      }
      case "CLEAR_OLD_TYPE": {
        customFieldUpdates.set(CONTACT_TYPE_OLD_ID, "");
        break;
      }
    }
  }

  const payload: { tags?: string[]; customFields?: { id: string; value: unknown }[] } = {};

  const tagsChanged =
    finalTags.length !== contact.tags.length ||
    finalTags.some((t, idx) => t !== contact.tags[idx]) ||
    contact.tags.some((t) => !finalTags.includes(t));
  if (tagsChanged) {
    payload.tags = finalTags;
  }

  const cfUpdates: { id: string; value: unknown }[] = [];

  const origMulti = Array.isArray(multiField?.value)
    ? (multiField.value as string[])
    : [];
  const multiChanged =
    multiValues.length !== origMulti.length ||
    multiValues.some((v) => !origMulti.includes(v));
  if (multiChanged) {
    cfUpdates.push({ id: CONTACT_TYPE_MULTI_ID, value: multiValues });
  }

  if (customFieldUpdates.has(CONTACT_TYPE_OLD_ID)) {
    cfUpdates.push({ id: CONTACT_TYPE_OLD_ID, value: "" });
  }

  if (cfUpdates.length > 0) {
    payload.customFields = cfUpdates;
  }

  if (!payload.tags && !payload.customFields) {
    skipCount++;
    continue;
  }

  const result: AppliedResult = {
    contactId,
    name: contact.name,
    success: false,
    changes,
    payload,
  };

  if (DRY_RUN) {
    result.success = true;
    if (i <= 5) {
      console.log(`  [DRY RUN] ${contact.name}: ${changes.length} changes`);
      if (payload.tags) console.log(`    Tags: ${contact.tags.length} -> ${payload.tags.length}`);
      if (payload.customFields) console.log(`    Custom fields: ${payload.customFields.length} updates`);
    }
    successCount++;
  } else {
    try {
      await updateContact(contactId, payload);
      result.success = true;
      successCount++;
      if (i % 25 === 0) console.log(`  Applied ${i}/${byContact.size}...`);
    } catch (err) {
      result.success = false;
      result.error = String(err);
      failCount++;
      console.error(`  Failed ${contact.name} (${contactId}): ${err}`);
    }
  }

  results.push(result);
}

const output: AppliedChangesFile = {
  appliedAt: new Date().toISOString(),
  dryRun: DRY_RUN,
  totalContacts: byContact.size,
  totalSuccess: successCount,
  totalFailed: failCount,
  totalSkipped: skipCount,
  results,
};

writeFileSync(".tmp/changes-applied.json", JSON.stringify(output, null, 2));

console.log(`\n${DRY_RUN ? "DRY RUN" : "Apply"} complete!`);
console.log(`   Contacts processed: ${byContact.size}`);
console.log(`   Successful: ${successCount}`);
console.log(`   Failed: ${failCount}`);
console.log(`   Skipped (no changes needed): ${skipCount}`);
console.log(`   Written to: .tmp/changes-applied.json`);
