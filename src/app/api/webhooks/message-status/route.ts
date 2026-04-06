import { NextResponse } from "next/server";
import { updateRecipientByMessageId } from "@/lib/blast-db";

export async function POST(request: Request) {
  // Validate webhook secret
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "GHL_WEBHOOK_SECRET not configured" }, { status: 500 });
  }

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

  const messageId =
    (body.messageId as string) ||
    (body.message_id as string) ||
    ((body.message as Record<string, unknown>)?.id as string);

  if (!messageId) {
    return NextResponse.json({ success: true, ignored: true });
  }

  const status = (body.status as string) || (body.messageStatus as string) || "";
  const type = (body.type as string) || (body.eventType as string) || "";

  try {
    const updates: Record<string, unknown> = {};

    const normalizedStatus = status.toLowerCase();
    if (["delivered", "sent", "undelivered", "failed"].includes(normalizedStatus)) {
      updates.delivery_status = normalizedStatus;
    }

    if (type.toLowerCase().includes("reply") || type.toLowerCase().includes("inbound")) {
      updates.replied = true;
      updates.replied_at = new Date().toISOString();
    }

    if (
      normalizedStatus.includes("opt") ||
      normalizedStatus.includes("dnd") ||
      type.toLowerCase().includes("opt")
    ) {
      updates.opted_out = true;
    }

    if (Object.keys(updates).length > 0) {
      await updateRecipientByMessageId(messageId, updates);
    }

    return NextResponse.json({ success: true, messageId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to update message status", details: message },
      { status: 500 }
    );
  }
}
