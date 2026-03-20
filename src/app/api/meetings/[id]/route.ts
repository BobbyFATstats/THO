import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { id } = await params;
  const supabase = createServiceClient();

  const [meetingRes, itemsRes, topicsRes, notesRes] = await Promise.all([
    supabase.from("meetings").select("*").eq("id", id).single(),
    supabase
      .from("action_items")
      .select("*")
      .eq("meeting_id", id)
      .order("sort_order"),
    supabase
      .from("discussion_topics")
      .select("*")
      .eq("meeting_id", id)
      .order("created_at"),
    supabase
      .from("notes")
      .select("*")
      .eq("meeting_id", id)
      .order("created_at"),
  ]);

  if (meetingRes.error) {
    return NextResponse.json(
      { error: meetingRes.error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ...meetingRes.data,
    action_items: itemsRes.data || [],
    discussion_topics: topicsRes.data || [],
    notes: notesRes.data || [],
  });
}
