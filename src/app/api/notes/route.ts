import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const meetingId = searchParams.get("meeting_id");

  const supabase = createServiceClient();
  let query = supabase
    .from("notes")
    .select("*")
    .order("created_at", { ascending: false });

  if (meetingId) {
    query = query.eq("meeting_id", meetingId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notes: data });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { content, author, meeting_id } = body;

  if (!content || !author) {
    return jsonError("Content and author are required");
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("notes")
    .insert({
      content,
      author,
      meeting_id: meeting_id || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
