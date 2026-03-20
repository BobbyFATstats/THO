import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "20");
  const page = parseInt(searchParams.get("page") || "1");
  const offset = (page - 1) * limit;

  const supabase = createServiceClient();
  const { data, error, count } = await supabase
    .from("meetings")
    .select("*", { count: "exact" })
    .order("date", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ meetings: data, total: count });
}
