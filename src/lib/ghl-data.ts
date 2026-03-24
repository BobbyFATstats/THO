import {
  getPipelines,
  getOpportunities,
  getContacts,
  getUsers,
  PIPELINE_IDS,
  type Opportunity,
} from "@/lib/ghl";
import { createServiceClient } from "@/lib/supabase";

// GHL custom field ID → dashboard field name
const DISP_FIELD_MAP: Record<string, string> = {
  bKwe0xJQTKZmgo2WynUK: "address",
  LCZuQzVmjpOnNL28J5fg: "contractType",
  oOVFdoXZwLlM6aIb5P2Y: "closeOfEscrow",
  XH9MnewkDybk35T3Xq4l: "earnestMoney",
  roHzit7ZgNDZkH2lnUO5: "inspectionPeriodDays",
  azqaPEYzwC7myXYmhQCK: "dealStatus",
};

function parseDispositionFields(opp: Opportunity) {
  const fields: Record<string, string | number | null> = {
    address: null,
    contractType: null,
    contractSignedDate: null,
    inspectionPeriodDays: null,
    emdDueDate: null,
    emdSent: null,
    closeOfEscrow: null,
    earnestMoney: null,
    dealStatus: null,
  };

  for (const cf of opp.customFields || []) {
    const fieldName = DISP_FIELD_MAP[cf.id];
    if (fieldName) {
      fields[fieldName] = cf.fieldValueString ?? cf.fieldValue ?? null;
    }
  }

  return fields;
}

/** Fetch fresh data from GHL API and build the dashboard payload */
export async function fetchGHLData() {
  const [pipelines, acquisition, disposition, contactsData, users] =
    await Promise.all([
      getPipelines(),
      getOpportunities(PIPELINE_IDS.acquisition),
      getOpportunities(PIPELINE_IDS.disposition),
      getContacts(100),
      getUsers().catch(() => [] as Awaited<ReturnType<typeof getUsers>>),
    ]);

  // Known team members by GHL user ID (fallback if /users/ API fails)
  const KNOWN_USERS: Record<string, string> = {
    T9GisvXyUynTge6cKnGo: "Bobby",
    G9S5bkni8KLtpDBPcyUa: "Karla",
    cZZSCbHiHGF998bvBI3N: "Tammy",
  };

  const userNameMap: Record<string, string> = { ...KNOWN_USERS };
  for (const u of users) {
    userNameMap[u.id] = KNOWN_USERS[u.id] || u.firstName || u.name;
  }

  const acqPipeline = pipelines.find((p) => p.id === PIPELINE_IDS.acquisition);
  const dispPipeline = pipelines.find((p) => p.id === PIPELINE_IDS.disposition);

  const acqStageMap = Object.fromEntries(
    (acqPipeline?.stages || []).map((s) => [s.id, s.name])
  );
  const dispStageMap = Object.fromEntries(
    (dispPipeline?.stages || []).map((s) => [s.id, s.name])
  );

  const acqOpps = acquisition.opportunities.map((o) => ({
    ...o,
    stageName: acqStageMap[o.pipelineStageId] || "Unknown",
  }));
  const dispOpps = disposition.opportunities.map((o) => ({
    ...o,
    stageName: dispStageMap[o.pipelineStageId] || "Unknown",
  }));

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  // Buyer contacts: any tag containing "buyer" (case-insensitive)
  const isBuyer = (c: { tags?: string[] }) =>
    (c.tags || []).some((tag) => tag.toLowerCase().includes("buyer"));

  const buyerCount = contactsData.contacts.filter(
    (c) => new Date(c.dateAdded) > weekAgo && isBuyer(c)
  ).length;
  const prevBuyerCount = contactsData.contacts.filter(
    (c) => {
      const d = new Date(c.dateAdded);
      return d > twoWeeksAgo && d <= weekAgo && isBuyer(c);
    }
  ).length;

  // Acquisition opportunities: current vs previous week
  const acqRecentCount = acquisition.opportunities.filter(
    (o) => new Date(o.createdAt) > weekAgo
  ).length;
  const acqPrevCount = acquisition.opportunities.filter(
    (o) => {
      const d = new Date(o.createdAt);
      return d > twoWeeksAgo && d <= weekAgo;
    }
  ).length;

  const acqByStage: Record<string, number> = {};
  for (const o of acqOpps) {
    acqByStage[o.stageName] = (acqByStage[o.stageName] || 0) + 1;
  }

  const dispByStage: Record<string, number> = {};
  for (const o of dispOpps) {
    dispByStage[o.stageName] = (dispByStage[o.stageName] || 0) + 1;
  }

  const underContract = acqOpps.filter(
    (o) => o.stageName === "Under Contract"
  );

  // Only show disposition deals in active stages (Marketing Active and beyond)
  const DISPOSITION_ACTIVE_STAGES = [
    "Marketing Active",
    "Buyer Negotiations",
    "Buyer Selected",
    "Escrow Opened",
    "Inspection / Access",
    "Clear to Close",
  ];

  const activeDispDeals = dispOpps.filter((o) =>
    DISPOSITION_ACTIVE_STAGES.includes(o.stageName)
  );

  return {
    acquisition: {
      total: acquisition.total,
      byStage: acqByStage,
      stages: acqPipeline?.stages || [],
      underContract: underContract.map((o) => ({
        id: o.id,
        name: o.contact?.name || o.name,
        value: o.monetaryValue,
        stage: o.stageName,
        createdAt: o.createdAt,
        customFields: o.customFields,
      })),
    },
    disposition: {
      total: disposition.total,
      byStage: dispByStage,
      stages: dispPipeline?.stages || [],
      deals: activeDispDeals.slice(0, 20).map((o) => ({
        id: o.id,
        name: o.contact?.name || o.name,
        value: o.monetaryValue,
        stage: o.stageName,
        createdAt: o.createdAt,
        ...parseDispositionFields(o),
      })),
    },
    contacts: {
      total: contactsData.total,
      buyerCount,
      prevBuyerCount,
    },
    acquisitionActivity: {
      recentCount: acqRecentCount,
      prevCount: acqPrevCount,
    },
  };
}

/** Fetch fresh GHL data and write it to the Supabase cache */
export async function refreshGHLCache() {
  const data = await fetchGHLData();
  const refreshedAt = new Date().toISOString();
  const supabase = createServiceClient();

  await supabase.from("ghl_cache").upsert({
    id: "singleton",
    data,
    refreshed_at: refreshedAt,
  });

  return { ...data, refreshedAt };
}

/** Read cached GHL data from Supabase */
export async function getCachedGHLData() {
  const supabase = createServiceClient();
  const { data: row } = await supabase
    .from("ghl_cache")
    .select("data, refreshed_at")
    .eq("id", "singleton")
    .single();

  if (!row) return null;

  return { ...row.data, refreshedAt: row.refreshed_at };
}
