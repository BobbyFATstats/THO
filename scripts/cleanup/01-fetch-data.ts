import { writeFileSync, mkdirSync } from "fs";
import {
  BUYER_PIPELINE_ID,
  CONTACT_TYPE_OLD_ID,
  fetchOpportunitiesPage,
  fetchContact,
  fetchContactsPage,
} from "./lib/ghl-api.js";
import type {
  GHLOpportunity,
  ContactRecord,
  BuyerPipelineData,
} from "./lib/types.js";

mkdirSync(".tmp", { recursive: true });

async function fetchAllBuyerPipelineOpps(): Promise<GHLOpportunity[]> {
  const all: GHLOpportunity[] = [];
  let startAfterId: string | undefined;
  let page = 0;

  while (true) {
    page++;
    const { opportunities, total } = await fetchOpportunitiesPage(
      BUYER_PIPELINE_ID,
      startAfterId
    );
    all.push(...opportunities);
    console.log(`  Page ${page}: fetched ${opportunities.length} (${all.length}/${total} total)`);

    if (opportunities.length === 0 || all.length >= total) break;
    startAfterId = opportunities[opportunities.length - 1].id;
  }

  return all;
}

async function fetchFullContacts(
  contactIds: string[],
  label: string
): Promise<Map<string, ContactRecord>> {
  const contacts = new Map<string, ContactRecord>();
  let i = 0;

  for (const id of contactIds) {
    i++;
    if (i % 25 === 0) console.log(`  ${label}: ${i}/${contactIds.length}`);

    try {
      const c = await fetchContact(id);
      contacts.set(id, {
        contactId: c.id,
        name: `${c.firstName || ""} ${c.lastName || ""}`.trim() || c.name || "Unknown",
        email: c.email || null,
        phone: c.phone || null,
        tags: c.tags || [],
        customFields: c.customFields || [],
        opportunities: [],
        source: c.source || null,
        fromBuyerPipeline: false,
        fromOldTypeScan: false,
      });
    } catch (err) {
      console.error(`  Failed to fetch contact ${id}: ${err}`);
    }
  }

  return contacts;
}

async function scanForOldTypeContacts(
  alreadyFetched: Set<string>
): Promise<string[]> {
  const needsFetch: string[] = [];
  let startAfterId: string | undefined;
  let scanned = 0;
  let page = 0;

  console.log("\nScanning all contacts for old Contact Type field...");

  while (true) {
    page++;
    const result = await fetchContactsPage(startAfterId || undefined);
    scanned += result.contacts.length;

    if (page % 5 === 0) console.log(`  Scanned ${scanned} contacts (page ${page})...`);

    for (const c of result.contacts) {
      if (!alreadyFetched.has(c.id)) {
        needsFetch.push(c.id);
      }
    }

    if (result.contacts.length === 0 || !result.startAfterId) break;
    startAfterId = result.startAfterId;
  }

  console.log(`  Total scanned: ${scanned}. Need to check ${needsFetch.length} non-pipeline contacts.`);
  return needsFetch;
}

async function main() {
  console.log("Buyer Pipeline Data Fetch\n");

  // Step 1: Fetch all Buyer Pipeline opportunities
  console.log("Fetching Buyer Pipeline opportunities...");
  const opps = await fetchAllBuyerPipelineOpps();
  console.log(`  Total: ${opps.length} opportunities\n`);

  // Step 2: Deduplicate contacts
  const contactOppMap = new Map<string, GHLOpportunity[]>();
  for (const opp of opps) {
    if (!opp.contact?.id) continue;
    const existing = contactOppMap.get(opp.contact.id) || [];
    existing.push(opp);
    contactOppMap.set(opp.contact.id, existing);
  }
  console.log(`Unique contacts in Buyer Pipeline: ${contactOppMap.size}\n`);

  // Step 3: Fetch full details for pipeline contacts
  console.log("Fetching full contact details for pipeline contacts...");
  const pipelineContacts = await fetchFullContacts(
    [...contactOppMap.keys()],
    "Pipeline contacts"
  );

  // Attach opportunity data
  for (const [contactId, oppList] of contactOppMap) {
    const contact = pipelineContacts.get(contactId);
    if (contact) {
      contact.fromBuyerPipeline = true;
      contact.opportunities = oppList.map((o) => ({
        id: o.id,
        name: o.name,
        stageId: o.pipelineStageId,
        status: o.status,
      }));
    }
  }

  // Step 4: Scan all contacts for old Contact Type field
  const alreadyFetched = new Set(pipelineContacts.keys());
  const additionalIds = await scanForOldTypeContacts(alreadyFetched);

  // Fetch full details for additional contacts in batches
  // Only keep those with old Contact Type field set
  let oldTypeCount = 0;
  const additionalContacts = new Map<string, ContactRecord>();

  if (additionalIds.length > 0) {
    console.log(`\nFetching details for ${additionalIds.length} non-pipeline contacts...`);
    const fetched = await fetchFullContacts(additionalIds, "Old type scan");

    for (const [id, contact] of fetched) {
      const oldTypeField = contact.customFields.find(
        (cf) => cf.id === CONTACT_TYPE_OLD_ID
      );
      if (oldTypeField && oldTypeField.value) {
        contact.fromOldTypeScan = true;
        additionalContacts.set(id, contact);
        oldTypeCount++;
      }
    }
    console.log(`  Found ${oldTypeCount} non-pipeline contacts with old Contact Type set.`);
  }

  // Also check pipeline contacts for old type
  for (const [, contact] of pipelineContacts) {
    const oldTypeField = contact.customFields.find(
      (cf) => cf.id === CONTACT_TYPE_OLD_ID
    );
    if (oldTypeField && oldTypeField.value) {
      oldTypeCount++;
    }
  }

  // Step 5: Combine and write
  const allContacts = [
    ...pipelineContacts.values(),
    ...additionalContacts.values(),
  ];

  const data: BuyerPipelineData = {
    fetchedAt: new Date().toISOString(),
    totalOpportunities: opps.length,
    uniqueContacts: allContacts.length,
    contacts: allContacts,
  };

  writeFileSync(".tmp/buyer-pipeline-data.json", JSON.stringify(data, null, 2));

  console.log(`\nData fetch complete!`);
  console.log(`   Opportunities: ${data.totalOpportunities}`);
  console.log(`   Unique contacts: ${data.uniqueContacts}`);
  console.log(`   Pipeline contacts: ${pipelineContacts.size}`);
  console.log(`   Additional (old type): ${additionalContacts.size}`);
  console.log(`   Written to: .tmp/buyer-pipeline-data.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
