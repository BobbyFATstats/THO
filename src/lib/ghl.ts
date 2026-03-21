const BASE_URL = "https://services.leadconnectorhq.com";

function getHeaders() {
  const token = process.env.GHL_API_TOKEN;
  if (!token) throw new Error("Missing GHL_API_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Version: "2021-07-28",
    Accept: "application/json",
  };
}

function getLocationId() {
  const id = process.env.GHL_LOCATION_ID;
  if (!id) throw new Error("Missing GHL_LOCATION_ID");
  return id;
}

export type Pipeline = {
  id: string;
  name: string;
  stages: { id: string; name: string; position: number }[];
};

export type Opportunity = {
  id: string;
  name: string;
  monetaryValue: number;
  status: string;
  pipelineStageId: string;
  createdAt: string;
  updatedAt: string;
  contact?: {
    id: string;
    name: string;
    email?: string;
    phone?: string;
  };
  customFields?: {
    id: string;
    fieldValueString?: string;
    fieldValue?: string;
    type: string;
  }[];
};

export type GHLContact = {
  id: string;
  contactName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  assignedTo: string | null;
  dateAdded: string;
  source: string | null;
};

export async function getPipelines(): Promise<Pipeline[]> {
  const res = await fetch(
    `${BASE_URL}/opportunities/pipelines?locationId=${getLocationId()}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(`GHL pipelines: ${res.status}`);
  const data = await res.json();
  return data.pipelines;
}

export async function getOpportunities(
  pipelineId: string,
  limit = 100
): Promise<{ opportunities: Opportunity[]; total: number }> {
  const res = await fetch(
    `${BASE_URL}/opportunities/search?location_id=${getLocationId()}&pipeline_id=${pipelineId}&limit=${limit}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(`GHL opportunities: ${res.status}`);
  const data = await res.json();
  return {
    opportunities: data.opportunities || [],
    total: data.meta?.total || 0,
  };
}

export async function getContacts(
  limit = 100
): Promise<{ contacts: GHLContact[]; total: number }> {
  const res = await fetch(
    `${BASE_URL}/contacts/?locationId=${getLocationId()}&limit=${limit}`,
    { headers: getHeaders() }
  );
  if (!res.ok) throw new Error(`GHL contacts: ${res.status}`);
  const data = await res.json();
  return {
    contacts: data.contacts || [],
    total: data.meta?.total || data.contacts?.length || 0,
  };
}

// Pipeline IDs for THO
export const PIPELINE_IDS = {
  acquisition: "AnuA711OZ2a5o4jMZ8kC",
  disposition: "uRdxeojrWkPy5oM5yyUr",
} as const;
