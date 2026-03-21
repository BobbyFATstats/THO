import { NextResponse } from "next/server";
import {
  getPipelines,
  getOpportunities,
  getContacts,
  PIPELINE_IDS,
} from "@/lib/ghl";

export async function GET() {
  try {
    const [pipelines, acquisition, disposition, contactsData] =
      await Promise.all([
        getPipelines(),
        getOpportunities(PIPELINE_IDS.acquisition),
        getOpportunities(PIPELINE_IDS.disposition),
        getContacts(100),
      ]);

    // Build stage lookup maps
    const acqPipeline = pipelines.find((p) => p.id === PIPELINE_IDS.acquisition);
    const dispPipeline = pipelines.find((p) => p.id === PIPELINE_IDS.disposition);

    const acqStageMap = Object.fromEntries(
      (acqPipeline?.stages || []).map((s) => [s.id, s.name])
    );
    const dispStageMap = Object.fromEntries(
      (dispPipeline?.stages || []).map((s) => [s.id, s.name])
    );

    // Enrich opportunities with stage names
    const acqOpps = acquisition.opportunities.map((o) => ({
      ...o,
      stageName: acqStageMap[o.pipelineStageId] || "Unknown",
    }));
    const dispOpps = disposition.opportunities.map((o) => ({
      ...o,
      stageName: dispStageMap[o.pipelineStageId] || "Unknown",
    }));

    // Count contacts created in last 7 days by assignee
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentContacts = contactsData.contacts.filter(
      (c) => new Date(c.dateAdded) > weekAgo
    );

    // Aggregate acquisition pipeline by stage
    const acqByStage: Record<string, number> = {};
    for (const o of acqOpps) {
      acqByStage[o.stageName] = (acqByStage[o.stageName] || 0) + 1;
    }

    // Aggregate disposition pipeline by stage
    const dispByStage: Record<string, number> = {};
    for (const o of dispOpps) {
      dispByStage[o.stageName] = (dispByStage[o.stageName] || 0) + 1;
    }

    // Find deals under contract (acquisition stage 7 + disposition active)
    const underContract = acqOpps.filter(
      (o) => o.stageName === "Under Contract"
    );

    return NextResponse.json({
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
        deals: dispOpps.slice(0, 20).map((o) => ({
          id: o.id,
          name: o.contact?.name || o.name,
          value: o.monetaryValue,
          stage: o.stageName,
          createdAt: o.createdAt,
        })),
      },
      contacts: {
        total: contactsData.total,
        recentCount: recentContacts.length,
      },
    });
  } catch (error) {
    console.error("GHL API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GHL API error" },
      { status: 500 }
    );
  }
}
