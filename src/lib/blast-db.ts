import { createServiceClient } from "@/lib/supabase";

// --- Types ---

export type BlastRun = {
  id: string;
  opportunity_id: string;
  trigger_task_id: string | null;
  property_address: string | null;
  total_buyers: number;
  sent_count: number;
  failed_count: number;
  status: string;
  started_at: string;
  completed_at: string | null;
  deal_data: Record<string, string> | null;
};

export type BlastRecipient = {
  id: string;
  blast_run_id: string;
  contact_id: string;
  contact_name: string | null;
  phone: string | null;
  language: "en" | "es";
  status: string;
  ghl_message_id: string | null;
  delivery_status: string;
  replied: boolean;
  replied_at: string | null;
  opted_out: boolean;
  sent_at: string | null;
  error_detail: string | null;
};

export type SendingTier = {
  current_limit: number;
  sent_today: number;
  last_send_date: string;
  graduated_at: string | null;
};

// --- Blast Runs ---

export async function findExistingBlast(opportunityId: string): Promise<BlastRun | null> {
  const sb = createServiceClient();
  const { data } = await sb
    .from("blast_runs")
    .select("*")
    .eq("opportunity_id", opportunityId)
    .in("status", ["in_progress", "completed", "paused_tier_limit"])
    .maybeSingle();
  return data;
}

export async function createBlastRun(params: {
  opportunityId: string;
  triggerTaskId: string;
  propertyAddress: string;
  totalBuyers: number;
  dealData: Record<string, string>;
}): Promise<string> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("blast_runs")
    .insert({
      opportunity_id: params.opportunityId,
      trigger_task_id: params.triggerTaskId,
      property_address: params.propertyAddress,
      total_buyers: params.totalBuyers,
      deal_data: params.dealData,
    })
    .select("id")
    .single();
  if (error) throw new Error(`Failed to create blast run: ${error.message}`);
  return data.id;
}

export async function updateBlastRun(
  blastRunId: string,
  updates: Partial<Pick<BlastRun, "status" | "sent_count" | "failed_count" | "completed_at">>
): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.from("blast_runs").update(updates).eq("id", blastRunId);
  if (error) throw new Error(`Failed to update blast run: ${error.message}`);
}

export async function getBlastRun(blastRunId: string): Promise<BlastRun | null> {
  const sb = createServiceClient();
  const { data } = await sb.from("blast_runs").select("*").eq("id", blastRunId).maybeSingle();
  return data;
}

// --- Blast Recipients ---

export async function insertRecipients(
  blastRunId: string,
  recipients: {
    contactId: string;
    contactName: string | null;
    phone: string | null;
    language: "en" | "es";
    status: string;
  }[]
): Promise<void> {
  const sb = createServiceClient();
  const rows = recipients.map((r) => ({
    blast_run_id: blastRunId,
    contact_id: r.contactId,
    contact_name: r.contactName,
    phone: r.phone,
    language: r.language,
    status: r.status,
  }));

  // Insert in batches of 500 to avoid payload limits
  for (let i = 0; i < rows.length; i += 500) {
    const batch = rows.slice(i, i + 500);
    const { error } = await sb.from("blast_recipients").insert(batch);
    if (error) throw new Error(`Failed to insert recipients batch: ${error.message}`);
  }
}

export async function getPendingRecipients(blastRunId: string): Promise<BlastRecipient[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("blast_recipients")
    .select("*")
    .eq("blast_run_id", blastRunId)
    .eq("status", "pending")
    .order("id");
  if (error) throw new Error(`Failed to fetch pending recipients: ${error.message}`);
  return data || [];
}

export async function updateRecipient(
  recipientId: string,
  updates: Partial<Pick<BlastRecipient, "status" | "ghl_message_id" | "delivery_status" | "sent_at" | "error_detail">>
): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb.from("blast_recipients").update(updates).eq("id", recipientId);
  if (error) throw new Error(`Failed to update recipient: ${error.message}`);
}

export async function updateRecipientByMessageId(
  messageId: string,
  updates: Partial<Pick<BlastRecipient, "delivery_status" | "replied" | "replied_at" | "opted_out">>
): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from("blast_recipients")
    .update(updates)
    .eq("ghl_message_id", messageId);
  if (error) throw new Error(`Failed to update recipient by message ID: ${error.message}`);
}

// --- Sending Tier ---

export async function getSendingTier(): Promise<SendingTier> {
  const sb = createServiceClient();
  const { data, error } = await sb.from("sending_tier").select("*").eq("id", 1).single();
  if (error) throw new Error(`Failed to fetch sending tier: ${error.message}`);
  return data;
}

export async function incrementSentToday(): Promise<void> {
  const sb = createServiceClient();
  const tier = await getSendingTier();
  const { error } = await sb
    .from("sending_tier")
    .update({ sent_today: tier.sent_today + 1 })
    .eq("id", 1);
  if (error) throw new Error(`Failed to increment sent_today: ${error.message}`);
}

export async function resetAndGraduateTier(): Promise<number> {
  const sb = createServiceClient();
  const tier = await getSendingTier();

  const TIER_LADDER = [100, 250, 500, 750, 1500, 3000, 5000];
  const currentIdx = TIER_LADDER.indexOf(tier.current_limit);
  const nextLimit =
    currentIdx >= 0 && currentIdx < TIER_LADDER.length - 1
      ? TIER_LADDER[currentIdx + 1]
      : Math.min(tier.current_limit * 2, 10000);

  const { error } = await sb
    .from("sending_tier")
    .update({
      current_limit: nextLimit,
      sent_today: 0,
      last_send_date: new Date().toISOString().split("T")[0],
      graduated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) throw new Error(`Failed to graduate tier: ${error.message}`);
  return nextLimit;
}

export async function resetDailyCount(): Promise<void> {
  const sb = createServiceClient();
  const { error } = await sb
    .from("sending_tier")
    .update({
      sent_today: 0,
      last_send_date: new Date().toISOString().split("T")[0],
    })
    .eq("id", 1);
  if (error) throw new Error(`Failed to reset daily count: ${error.message}`);
}

// --- Summary Queries ---

export async function getBlastSummary(blastRunId: string): Promise<{
  totalEn: number;
  totalEs: number;
  delivered: number;
  undelivered: number;
  failed: number;
  replies: number;
  optOuts: number;
  skipped: number;
}> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("blast_recipients")
    .select("language, status, delivery_status, replied, opted_out")
    .eq("blast_run_id", blastRunId);
  if (error) throw new Error(`Failed to get blast summary: ${error.message}`);

  const rows = data || [];
  return {
    totalEn: rows.filter((r) => r.language === "en").length,
    totalEs: rows.filter((r) => r.language === "es").length,
    delivered: rows.filter((r) => r.delivery_status === "delivered").length,
    undelivered: rows.filter((r) => r.delivery_status === "undelivered").length,
    failed: rows.filter((r) => r.status === "failed").length,
    replies: rows.filter((r) => r.replied).length,
    optOuts: rows.filter((r) => r.opted_out).length,
    skipped: rows.filter((r) => r.status.startsWith("skipped_")).length,
  };
}
