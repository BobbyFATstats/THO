import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api";

export async function PATCH(request: Request) {
  const body = await request.json();
  const items: { id: string; sort_order: number }[] = body.items;

  if (!Array.isArray(items)) {
    return jsonError("items must be an array");
  }

  const supabase = createServiceClient();

  const updates = items.map(({ id, sort_order }) =>
    supabase
      .from("discussion_topics")
      .update({ sort_order, updated_at: new Date().toISOString() })
      .eq("id", id)
  );

  await Promise.all(updates);

  return NextResponse.json({ success: true });
}
