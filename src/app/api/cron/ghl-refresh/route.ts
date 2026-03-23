import { NextResponse } from "next/server";
import { requireCronAuth } from "@/lib/api";
import { refreshGHLCache } from "@/lib/ghl-data";

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const data = await refreshGHLCache();
    return NextResponse.json({
      message: "GHL cache refreshed",
      refreshedAt: data.refreshedAt,
    });
  } catch (error) {
    console.error("GHL cron refresh error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GHL refresh failed" },
      { status: 500 }
    );
  }
}
