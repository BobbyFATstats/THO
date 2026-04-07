import { task, wait } from "@trigger.dev/sdk/v3";
import {
  getOpportunity,
  searchContacts,
  sendSMS,
  createContactTask,
  getUsers,
} from "@/lib/ghl";
import { getBlastFieldMap, extractDealData, getMissingFields } from "@/lib/ghl-fields";
import {
  findExistingBlast,
  createBlastRun,
  updateBlastRun,
  getBlastRun,
  insertRecipients,
  getPendingRecipients,
  updateRecipient,
  getSendingTier,
  incrementSentToday,
  resetAndGraduateTier,
  resetDailyCount,
  getBlastSummary,
} from "@/lib/blast-db";
import { buildMessage } from "@/templates/buyer-blast";
import { writeBlastLog } from "@/lib/blast-logger";

type BuyerBlastPayload = {
  opportunityId: string;
};

const KARLA_NAME = "Karla";
const DRIP_DELAY_SECONDS = 4;

export const buyerBlastTask = task({
  id: "buyer-blast",
  run: async (payload: BuyerBlastPayload, { ctx }) => {
    const { opportunityId } = payload;

    // --- 1. Duplicate check ---
    const existing = await findExistingBlast(opportunityId);
    if (existing) {
      if (existing.status === "completed") {
        return { skipped: true, reason: "Blast already completed for this opportunity" };
      }
      if (existing.status === "in_progress" || existing.status === "paused_tier_limit") {
        return await resumeBlast(existing.id);
      }
    }

    // --- 2. Fetch opportunity ---
    const opportunity = await getOpportunity(opportunityId);

    // --- 3. Resolve field map and extract deal data ---
    const fieldMap = await getBlastFieldMap();
    const dealData = extractDealData(opportunity.customFields || [], fieldMap);
    const address = dealData.street_address || opportunity.name || "Unknown Address";

    // --- 4. Validate required fields ---
    const missingFields = getMissingFields(dealData);
    if (missingFields.length > 0) {
      const contactId = opportunity.contact?.id;
      const followers = (opportunity as Record<string, unknown>).followers as string[] | undefined;
      const taskContactId = contactId || (followers && followers[0]);

      if (taskContactId) {
        const users = await getUsers();
        const karla = users.find((u) =>
          u.firstName.toLowerCase() === KARLA_NAME.toLowerCase()
        );

        if (karla) {
          await createContactTask({
            contactId: taskContactId,
            title: `Missing blast fields for ${address}`,
            body: `The following fields are missing and must be filled before the buyer blast can run:\n\n${missingFields.map((f) => `- ${f}`).join("\n")}`,
            assignedTo: karla.id,
          });
        }
      }

      return { skipped: true, reason: "Missing required fields", missingFields, address };
    }

    // --- 5. Fetch eligible buyers ---
    const buyers = await fetchEligibleBuyers();

    if (buyers.length === 0) {
      return { skipped: true, reason: "No eligible buyers found" };
    }

    // --- 6. Create blast run + insert recipients ---
    const blastRunId = await createBlastRun({
      opportunityId,
      triggerTaskId: ctx.run.id,
      propertyAddress: address,
      totalBuyers: buyers.length,
      dealData,
    });

    const recipientRows = buyers.map((b) => ({
      contactId: b.contactId,
      contactName: b.firstName,
      phone: b.phone,
      language: b.language,
      status: b.phone ? "pending" as const : "skipped_no_phone" as const,
    }));

    await insertRecipients(blastRunId, recipientRows);

    // --- 7. Run the drip loop ---
    return await runDripLoop(blastRunId, dealData);
  },
});

// --- Helper: Fetch eligible buyers ---

type EligibleBuyer = {
  contactId: string;
  firstName: string;
  phone: string | null;
  language: "en" | "es";
};

async function fetchEligibleBuyers(): Promise<EligibleBuyer[]> {
  const buyers: EligibleBuyer[] = [];

  // Use GHL search endpoint to filter by tags server-side
  // TEST MODE: include "test" tag — remove when going live
  // TODO: Remove "test" from this array when ready for all buyers
  const requiredTags = ["buyer", "ready to go", "test"];

  let page = 1;
  while (true) {
    const result = await searchContacts({
      tags: requiredTags,
      page,
      pageLimit: 100,
    });

    for (const contact of result.contacts) {
      // Check DND — dnd is a boolean, dndSettings is an object keyed by channel
      const dnd = (contact as Record<string, unknown>).dnd as boolean | undefined;
      if (dnd === true) continue;

      const dndSettings = (contact as Record<string, unknown>).dndSettings as
        | Record<string, { status: string; code: string; message: string }>
        | undefined;
      if (dndSettings?.SMS?.status === "active") continue;

      // Determine language from contact custom fields
      // GHL contact customFields have shape: { id: string, value: string | string[] }
      let language: "en" | "es" = "en";

      const customFields = (contact as Record<string, unknown>).customFields as
        | { id: string; value: unknown }[]
        | undefined;

      if (customFields) {
        for (const cf of customFields) {
          const vals = Array.isArray(cf.value) ? cf.value : [cf.value];
          for (const v of vals) {
            if (String(v || "").toLowerCase().includes("spanish")) {
              language = "es";
              break;
            }
          }
          if (language === "es") break;
        }
      }

      buyers.push({
        contactId: contact.id,
        firstName: contact.firstName || "there",
        phone: contact.phone,
        language,
      });
    }

    // Stop when we've fetched all results
    if (result.contacts.length < 100 || buyers.length >= result.total) break;
    page++;
  }

  return buyers;
}

// --- Helper: Run the drip send loop ---

async function runDripLoop(
  blastRunId: string,
  dealData: Record<string, string>
): Promise<{ completed: boolean; sent: number; failed: number }> {
  let totalSent = 0;
  let totalFailed = 0;
  const daySummaries: { date: string; sent: number; failed: number; skipped: number; tierLimit: number }[] = [];
  const errors: { date: string; phone: string; detail: string }[] = [];

  while (true) {
    const pending = await getPendingRecipients(blastRunId);
    if (pending.length === 0) break;

    // Check tier and date rollover
    let tier = await getSendingTier();
    const today = new Date().toISOString().split("T")[0];

    if (tier.last_send_date !== today) {
      if (tier.sent_today >= tier.current_limit) {
        const newLimit = await resetAndGraduateTier();
        tier = { ...tier, current_limit: newLimit, sent_today: 0, last_send_date: today, graduated_at: new Date().toISOString() };
      } else {
        await resetDailyCount();
        tier = { ...tier, sent_today: 0, last_send_date: today };
      }
    }

    let daySent = 0;
    let dayFailed = 0;
    let daySkipped = 0;
    let hitTierLimit = false;

    for (const recipient of pending) {
      const currentTier = await getSendingTier();
      if (currentTier.sent_today >= currentTier.current_limit) {
        daySummaries.push({
          date: today,
          sent: daySent,
          failed: dayFailed,
          skipped: daySkipped,
          tierLimit: currentTier.current_limit,
        });

        await updateBlastRun(blastRunId, {
          status: "paused_tier_limit",
          sent_count: totalSent,
          failed_count: totalFailed,
        });

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 1, 0, 0);
        await wait.until({ date: tomorrow });

        hitTierLimit = true;
        break;
      }

      if (!recipient.phone) {
        await updateRecipient(recipient.id, { status: "skipped_no_phone" });
        daySkipped++;
        continue;
      }

      try {
        const message = await buildMessage(
          recipient.language as "en" | "es",
          recipient.contact_name || "there",
          dealData
        );

        const { messageId } = await sendSMS({
          contactId: recipient.contact_id,
          message,
        });

        await updateRecipient(recipient.id, {
          status: "sent",
          ghl_message_id: messageId,
          delivery_status: "sent",
          sent_at: new Date().toISOString(),
        });

        await incrementSentToday();
        daySent++;
        totalSent++;

        await wait.for({ seconds: DRIP_DELAY_SECONDS });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Unknown error";
        const isRateLimit = errorMsg.includes("429");
        const isAuthError = errorMsg.includes("401");

        if (isAuthError) {
          await updateBlastRun(blastRunId, {
            status: "paused_error",
            sent_count: totalSent,
            failed_count: totalFailed,
          });
          throw new Error(`GHL auth failure — blast halted: ${errorMsg}`);
        }

        if (isRateLimit) {
          await wait.for({ seconds: 30 });
          continue;
        }

        await updateRecipient(recipient.id, {
          status: "failed",
          error_detail: errorMsg,
        });
        errors.push({
          date: today,
          phone: recipient.phone || "unknown",
          detail: errorMsg,
        });
        dayFailed++;
        totalFailed++;
      }
    }

    if (!hitTierLimit) {
      const remainingPending = await getPendingRecipients(blastRunId);
      if (remainingPending.length === 0) {
        daySummaries.push({
          date: today,
          sent: daySent,
          failed: dayFailed,
          skipped: daySkipped,
          tierLimit: (await getSendingTier()).current_limit,
        });
      }
    }
  }

  // --- Blast complete ---
  await updateBlastRun(blastRunId, {
    status: "completed",
    sent_count: totalSent,
    failed_count: totalFailed,
    completed_at: new Date().toISOString(),
  });

  const run = await getBlastRun(blastRunId);
  if (run) {
    const summary = await getBlastSummary(blastRunId);
    writeBlastLog({ run, daySummaries, summary, errors });
  }

  return { completed: true, sent: totalSent, failed: totalFailed };
}

// --- Helper: Resume an existing paused blast ---

async function resumeBlast(
  blastRunId: string
): Promise<{ completed: boolean; sent: number; failed: number }> {
  const run = await getBlastRun(blastRunId);
  if (!run) throw new Error(`Blast run ${blastRunId} not found`);

  await updateBlastRun(blastRunId, { status: "in_progress" });
  return await runDripLoop(blastRunId, run.deal_data || {});
}
