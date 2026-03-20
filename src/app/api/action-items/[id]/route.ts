import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const body = await request.json();

  const allowedFields = [
    "title",
    "description",
    "assignee",
    "priority",
    "status",
    "sort_order",
  ];
  const updates: Record<string, unknown> = {};

  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  updates.updated_at = new Date().toISOString();

  if (body.status === "completed") {
    updates.completed_at = new Date().toISOString();
  } else if ("status" in body && body.status !== "completed") {
    updates.completed_at = null;
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("action_items")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
