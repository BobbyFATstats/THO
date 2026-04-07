import "dotenv/config";

const BASE_URL = "https://services.leadconnectorhq.com";

function getHeaders(): Record<string, string> {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("Missing GHL_API_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

function getLocationId(): string {
  const id = process.env.GHL_LOCATION_ID;
  if (!id) throw new Error("Missing GHL_LOCATION_ID");
  return id;
}

// --- Constants ---
export const BUYER_PIPELINE_ID = "6gtCenYOAl8NwRWyTjhZ";
export const CONTACT_TYPE_MULTI_ID = "1zPxrX6N62CUfSIwxOH0";
export const CONTACT_TYPE_OLD_ID = "4GYXWVRN8x18qWLrdeXX";

export const BUYER_PIPELINE_STAGES: Record<string, string> = {
  "81823ded-2c08-41ea-be76-2cf6ee18a7a2": "New Buyer",
  "f65b9a3b-07c2-4e62-880f-8aa8029411fd": "Buyer In Review",
  "37250c40-7e09-4c51-842a-851b01fd8bfc": "Buyer Unqualified",
  "dc165896-68f2-43c6-a3ea-59417f5fe0d1": "Buyer Qualified",
  "2847e208-ebc6-4135-966c-f71eda51d894": "Property Walkthrough Scheduled",
  "fc130835-2e0b-4b0c-b517-baeb0a4c9890": "Property Walkthrough Completed",
  "4d158ab0-2fd2-4648-8295-550d47960cf8": "Agreement Sent",
  "b8376a10-b217-4bf4-9464-6e01b517266b": "Buyer Signed Contract",
  "fbe8a42a-0483-405c-b851-4ce05c73926f": "Closed Won",
  "fe018e88-120e-450a-8479-ad22358aff6b": "Contract Canceled",
};

export const OLD_TYPE_MIGRATION: Record<string, string> = {
  Seller: "Seller",
  Agent: "Agent",
  Investor: "Buyer",
  "Private Money Lender": "PML",
  "Hard Money Lender": "PML",
  Contractor: "Service Provider",
  "Escrow Officer": "Service Provider",
  Inspector: "Service Provider",
  TC: "Service Provider",
};

// --- Helpers ---
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status === 429) {
      const wait = Math.pow(2, attempt + 1) * 1000;
      console.log(`  Rate limited, waiting ${wait}ms (attempt ${attempt + 1}/${retries})...`);
      await sleep(wait);
      continue;
    }
    return res;
  }
  throw new Error(`Failed after ${retries} retries (429)`);
}

// --- API Functions ---

/**
 * Fetch one page of opportunities from a pipeline.
 * GHL returns max 100 per page. Use startAfterId for cursor pagination.
 */
export async function fetchOpportunitiesPage(
  pipelineId: string,
  startAfterId?: string
): Promise<{
  opportunities: import("./types.js").GHLOpportunity[];
  total: number;
}> {
  const params = new URLSearchParams({
    location_id: getLocationId(),
    pipeline_id: pipelineId,
    limit: "100",
  });
  if (startAfterId) params.set("startAfterId", startAfterId);

  const res = await fetchWithRetry(
    `${BASE_URL}/opportunities/search?${params}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(`GHL opps: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return {
    opportunities: data.opportunities || [],
    total: data.meta?.total || 0,
  };
}

/**
 * Fetch full contact details including custom fields.
 * Includes 600ms delay for rate limiting.
 */
export async function fetchContact(
  contactId: string
): Promise<import("./types.js").GHLContactFull> {
  await sleep(600);
  const res = await fetchWithRetry(
    `${BASE_URL}/contacts/${contactId}`,
    { headers: getHeaders() }
  );
  if (!res.ok)
    throw new Error(`GHL contact ${contactId}: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.contact;
}

/**
 * Fetch one page of contacts (list endpoint, no custom fields).
 * Used for scanning all contacts to find old Contact Type values.
 */
export async function fetchContactsPage(
  cursor?: { startAfterId: string; startAfter: number }
): Promise<{
  contacts: { id: string; tags: string[]; firstName: string; lastName: string }[];
  nextCursor: { startAfterId: string; startAfter: number } | null;
  total: number;
}> {
  await sleep(600);
  const params = new URLSearchParams({
    locationId: getLocationId(),
    limit: "100",
  });
  if (cursor) {
    params.set("startAfterId", cursor.startAfterId);
    params.set("startAfter", String(cursor.startAfter));
  }

  const res = await fetchWithRetry(`${BASE_URL}/contacts/?${params}`, {
    headers: getHeaders(),
  });
  if (!res.ok)
    throw new Error(`GHL contacts page: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const meta = data.meta || {};
  return {
    contacts: data.contacts || [],
    nextCursor:
      meta.startAfterId && meta.startAfter
        ? { startAfterId: meta.startAfterId, startAfter: meta.startAfter }
        : null,
    total: meta.total || 0,
  };
}

/**
 * Update a contact's tags and/or custom fields.
 * Tags is a FULL REPLACEMENT — send the complete final array.
 * CustomFields is partial — only updates fields you specify.
 * Includes 600ms delay for rate limiting.
 */
export async function updateContact(
  contactId: string,
  payload: {
    tags?: string[];
    customFields?: { id: string; value: unknown }[];
  }
): Promise<void> {
  await sleep(600);
  const res = await fetchWithRetry(`${BASE_URL}/contacts/${contactId}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`GHL update ${contactId}: ${res.status} ${body}`);
  }
}
