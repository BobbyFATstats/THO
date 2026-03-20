import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireAuth } from "@/lib/api";

export async function GET(request: Request) {
  const authError = await requireAuth();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");

  const supabase = createServiceClient();
  let query = supabase
    .from("discussion_topics")
    .select("*, meetings(date)")
    .order("created_at", { ascending: false });

  if (category) {
    query = query.eq("category", category);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ topics: data });
}
