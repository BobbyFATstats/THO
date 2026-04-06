import { NextResponse } from "next/server";
import { tasks } from "@trigger.dev/sdk/v3";

export async function POST(request: Request) {
  // Validate webhook secret
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "GHL_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

  // GHL may send the secret as a query param or header — check both
  const url = new URL(request.url);
  const headerSecret = request.headers.get("x-webhook-secret");
  const querySecret = url.searchParams.get("secret");

  if (headerSecret !== secret && querySecret !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Extract opportunity ID from GHL webhook payload
  const opportunityId =
    (body.opportunityId as string) ||
    (body.opportunity_id as string) ||
    ((body.opportunity as Record<string, unknown>)?.id as string) ||
    (body.id as string);

  if (!opportunityId) {
    return NextResponse.json({ error: "Missing opportunity ID" }, { status: 400 });
  }

  try {
    const handle = await tasks.trigger(
      "buyer-blast",
      { opportunityId },
      { idempotencyKey: `buyer-blast-${opportunityId}` }
    );

    return NextResponse.json({
      success: true,
      taskId: handle.id,
      opportunityId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to trigger blast task", details: message },
      { status: 500 }
    );
  }
}
