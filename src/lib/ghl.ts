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
  tags: string[];
  followers: string[];
};

export async function getPipelines(): Promise<Pipeline[]> {
  const res = await fetch(
    `${BASE_URL}/opportunities/pipelines?locationId=${getLocationId()}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL pipelines: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.pipelines;
}

export async function getOpportunities(
  pipelineId: string,
  limit = 100
): Promise<{ opportunities: Opportunity[]; total: number }> {
  const params = new URLSearchParams({
    location_id: getLocationId(),
    pipeline_id: pipelineId,
    limit: String(limit),
  });
  const res = await fetch(`${BASE_URL}/opportunities/search?${params}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL opportunities: ${res.status} ${body}`);
  }
  const data = await res.json();
  return {
    opportunities: data.opportunities || [],
    total: data.meta?.total || data.opportunities?.length || 0,
  };
}

export async function getContacts(
  limit = 100
): Promise<{ contacts: GHLContact[]; total: number }> {
  const res = await fetch(
    `${BASE_URL}/contacts/?locationId=${getLocationId()}&limit=${limit}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL contacts: ${res.status} ${body}`);
  }
  const data = await res.json();
  return {
    contacts: data.contacts || [],
    total: data.meta?.total || data.contacts?.length || 0,
  };
}

export type GHLUser = {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
};

export async function getUsers(): Promise<GHLUser[]> {
  const res = await fetch(
    `${BASE_URL}/users/?locationId=${getLocationId()}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL users: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.users || [];
}

// Pipeline IDs for THO
export const PIPELINE_IDS = {
  acquisition: "AnuA711OZ2a5o4jMZ8kC",
  disposition: "uRdxeojrWkPy5oM5yyUr",
} as const;

export async function getOpportunity(opportunityId: string): Promise<Opportunity> {
  const res = await fetch(`${BASE_URL}/opportunities/${opportunityId}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL getOpportunity: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.opportunity;
}

export async function getContactsPaginated(params: {
  query?: string;
  limit?: number;
  startAfterId?: string;
}): Promise<{ contacts: GHLContact[]; nextPageUrl: string | null }> {
  const queryParams = new URLSearchParams({
    locationId: getLocationId(),
    limit: String(params.limit ?? 100),
  });
  if (params.query) queryParams.set("query", params.query);
  if (params.startAfterId) queryParams.set("startAfterId", params.startAfterId);

  const res = await fetch(`${BASE_URL}/contacts/?${queryParams}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL getContactsPaginated: ${res.status} ${body}`);
  }
  const data = await res.json();
  return {
    contacts: data.contacts || [],
    nextPageUrl: data.meta?.nextPageUrl ?? null,
  };
}

export async function searchContacts(params: {
  tags: string[];
  page?: number;
  pageLimit?: number;
}): Promise<{ contacts: GHLContact[]; total: number }> {
  const filters = params.tags.map((tag) => ({
    field: "tags",
    operator: "contains",
    value: tag,
  }));

  const res = await fetch(`${BASE_URL}/contacts/search`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      locationId: getLocationId(),
      filters,
      page: params.page || 1,
      pageLimit: params.pageLimit || 100,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL searchContacts: ${res.status} ${body}`);
  }
  const data = await res.json();
  return {
    contacts: data.contacts || [],
    total: data.total || 0,
  };
}

export async function searchConversation(contactId: string): Promise<string | null> {
  const queryParams = new URLSearchParams({
    locationId: getLocationId(),
    contactId,
  });
  const res = await fetch(`${BASE_URL}/conversations/search?${queryParams}`, {
    headers: getHeaders(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL searchConversation: ${res.status} ${body}`);
  }
  const data = await res.json();
  const conversations = data.conversations || [];
  return conversations.length > 0 ? conversations[0].id : null;
}

export async function createConversation(contactId: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/conversations/`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ locationId: getLocationId(), contactId }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL createConversation: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.conversation.id;
}

export async function sendSMS(params: {
  conversationId: string;
  message: string;
}): Promise<{ messageId: string }> {
  const res = await fetch(`${BASE_URL}/conversations/messages`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "SMS",
      conversationId: params.conversationId,
      message: params.message,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL sendSMS: ${res.status} ${body}`);
  }
  const data = await res.json();
  return { messageId: data.messageId };
}

export async function createContactTask(params: {
  contactId: string;
  title: string;
  body: string;
  assignedTo: string;
  dueDate?: string;
}): Promise<{ taskId: string }> {
  const payload: Record<string, unknown> = {
    title: params.title,
    body: params.body,
    assignedTo: params.assignedTo,
    dueDate: params.dueDate || new Date(Date.now() + 86400000).toISOString(),
    completed: false,
  };

  const res = await fetch(`${BASE_URL}/contacts/${params.contactId}/tasks`, {
    method: "POST",
    headers: { ...getHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL createContactTask: ${res.status} ${body}`);
  }
  const data = await res.json();
  return { taskId: data.task.id };
}

export async function getCustomValues(): Promise<
  { id: string; name: string; value: string; fieldKey: string }[]
> {
  const res = await fetch(
    `${BASE_URL}/locations/${getLocationId()}/customValues`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL getCustomValues: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.customValues || [];
}

export async function getOpportunityCustomFields(): Promise<
  { id: string; name: string; fieldKey: string; dataType: string }[]
> {
  const queryParams = new URLSearchParams({ model: "opportunity" });
  const res = await fetch(
    `${BASE_URL}/locations/${getLocationId()}/customFields?${queryParams}`,
    { headers: getHeaders() }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`GHL getOpportunityCustomFields: ${res.status} ${body}`);
  }
  const data = await res.json();
  return data.customFields || [];
}
