import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const assignee = searchParams.get("assignee");
  const priority = searchParams.get("priority");
  const source = searchParams.get("source");

  const supabase = createServiceClient();
  let query = supabase
    .from("action_items")
    .select("*, meetings(date)")
    .order("priority")
    .order("sort_order");

  if (status) query = query.eq("status", status);
  if (assignee) query = query.eq("assignee", assignee);
  if (priority) query = query.eq("priority", priority);
  if (source) query = query.eq("source", source);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ action_items: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { title, description, assignee, priority, meeting_id } = body;

  if (!title) {
    return jsonError("Title is required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("action_items")
    .insert({
      title,
      description: description || null,
      assignee: assignee || null,
      priority: priority || "medium",
      meeting_id: meeting_id || null,
      source: "manual",
      confidence_score: 1.0,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
