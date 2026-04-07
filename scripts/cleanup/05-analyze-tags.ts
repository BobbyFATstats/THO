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

for (const contact of data.contacts) {
  if (!contact.fromBuyerPipeline) continue;

  const hashtagTags = contact.tags.filter((t) => t.includes("#"));
  if (hashtagTags.length === 0) continue;

  const cleanTagSet = new Set<string>();
  const tagsToRemove: string[] = [];

  for (const tag of contact.tags) {
    if (tag.includes("#")) {
      tagsToRemove.push(tag);
      const clean = tag.replace(/#/g, "").trim().toLowerCase();
      if (clean) cleanTagSet.add(clean);
    } else {
      cleanTagSet.add(tag);
    }
  }

  const existingLower = new Set(
    contact.tags.filter((t) => !t.includes("#")).map((t) => t.toLowerCase())
  );
  const newCleanTags: string[] = [];
  for (const clean of cleanTagSet) {
    if (!existingLower.has(clean)) {
      newCleanTags.push(clean);
    }
  }

  const finalTags = [
    ...contact.tags.filter((t) => !t.includes("#")),
    ...newCleanTags,
  ];

  for (const hashTag of tagsToRemove) {
    const clean = hashTag.replace(/#/g, "").trim().toLowerCase();
    changes.push({
      contactId: contact.contactId,
      name: contact.name,
      action: "NORMALIZE_HASHTAG_TAG",
      field: "tags",
      currentValue: hashTag,
      proposedValue: clean || "(removed)",
      reason: `Hashtag tag "${hashTag}" normalized to "${clean || "(empty, removed)"}"`,
    });
  }
}

const output: ProposedChangeFile = {
  analyzer: "05-analyze-tags",
  analyzedAt: new Date().toISOString(),
  totalProposed: changes.length,
  changes,
};

writeFileSync(
  ".tmp/proposed-tag-normalize.json",
  JSON.stringify(output, null, 2)
);

const uniqueContacts = new Set(changes.map((c) => c.contactId)).size;

console.log(`Tag normalizer analyzer complete`);
console.log(`   Contacts with hashtag tags: ${uniqueContacts}`);
console.log(`   Tags to normalize: ${changes.length}`);
