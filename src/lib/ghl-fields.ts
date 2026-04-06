import { getOpportunityCustomFields } from "@/lib/ghl";

/**
 * Maps template variable names to GHL custom field keys.
 * These keys are matched against the fieldKey returned by GHL's custom fields API.
 */
const BLAST_FIELD_KEYS: Record<string, string> = {
  city: "opportunity.city",
  state: "opportunity.state_abbrv",
  bedroom_count: "opportunity.bedroom_count",
  bathroom_count: "opportunity.bathroom_count",
  property_square_footage: "opportunity.property_square_footage",
  property_cross_streets: "opportunity.property_cross_streets",
  street_address: "opportunity.street_address",
};

/** Known field IDs from field-map.ts — avoids discovery call for these */
const KNOWN_IDS: Record<string, string> = {
  city: "6gTTgmpuqIMXA8CbZUX8",
  street_address: "bKwe0xJQTKZmgo2WynUK",
  property_cross_streets: "8OiHAAGktWx0iI3sa2W7",
  property_square_footage: "elJBmIBuLLRx7N2TF0nU",
  state: "PoVaeS1yPQ7KoGJcjR6w",
};

export type BlastFieldMap = Record<string, string>;

let cachedFieldMap: BlastFieldMap | null = null;

/**
 * Resolves all blast template field IDs. Uses known IDs where available,
 * discovers the rest via GHL API. Caches result for the process lifetime.
 */
export async function getBlastFieldMap(): Promise<BlastFieldMap> {
  if (cachedFieldMap) return cachedFieldMap;

  const fieldMap: BlastFieldMap = { ...KNOWN_IDS };

  // Find fields that still need discovery
  const needsDiscovery = Object.entries(BLAST_FIELD_KEYS).filter(
    ([name]) => !KNOWN_IDS[name]
  );

  if (needsDiscovery.length > 0) {
    const ghlFields = await getOpportunityCustomFields();
    const keyToId = new Map(ghlFields.map((f) => [f.fieldKey, f.id]));

    for (const [name, fieldKey] of needsDiscovery) {
      const id = keyToId.get(fieldKey);
      if (id) {
        fieldMap[name] = id;
      }
    }
  }

  cachedFieldMap = fieldMap;
  return fieldMap;
}

/**
 * Extract blast-relevant deal data from an opportunity's custom fields.
 * Returns a flat object with template variable names as keys.
 */
export function extractDealData(
  customFields: { id: string; fieldValueString?: string; fieldValue?: string }[],
  fieldMap: BlastFieldMap
): Record<string, string> {
  const idToName = new Map(
    Object.entries(fieldMap).map(([name, id]) => [id, name])
  );

  const dealData: Record<string, string> = {};
  for (const cf of customFields) {
    const name = idToName.get(cf.id);
    if (name) {
      dealData[name] = cf.fieldValueString ?? cf.fieldValue ?? "";
    }
  }
  return dealData;
}

/**
 * Returns list of required template fields that are missing from deal data.
 */
export function getMissingFields(dealData: Record<string, string>): string[] {
  const required = [
    "city",
    "state",
    "bedroom_count",
    "bathroom_count",
    "property_square_footage",
    "property_cross_streets",
  ];
  return required.filter((f) => !dealData[f] || dealData[f].trim() === "");
}
