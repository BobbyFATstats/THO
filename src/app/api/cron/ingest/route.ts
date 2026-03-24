import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/api";
import { ingestRecordings } from "@/lib/ingest";

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const result = await ingestRecordings(); // 3-day lookback by default
    console.log("Cron ingest result:", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Ingestion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
