import { NextResponse } from "next/server";
import { getCachedGHLData, refreshGHLCache } from "@/lib/ghl-data";

/** Serve cached GHL data (fast — no external API calls) */
export async function GET() {
  try {
    const cached = await getCachedGHLData();

    if (!cached) {
      // No cache yet — do a live fetch to seed it
      const fresh = await refreshGHLCache();
      return NextResponse.json(fresh);
    }

    return NextResponse.json(cached);
  } catch (error) {
    console.error("GHL cache read error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GHL cache error" },
      { status: 500 }
    );
  }
}

/** Manual refresh — fetches fresh data from GHL API and updates cache */
export async function POST() {
  try {
    const fresh = await refreshGHLCache();
    return NextResponse.json(fresh);
  } catch (error) {
    console.error("GHL refresh error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "GHL refresh error" },
      { status: 500 }
    );
  }
}
