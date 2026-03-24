import { NextResponse } from "next/server";
import { ingestRecordings } from "@/lib/ingest";

/** Manual meeting ingest — fetches Zoom recordings and processes them.
 *  Optional query params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *  Defaults to 7-day lookback when called manually. */
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from") || undefined;
    const to = searchParams.get("to") || undefined;

    // Manual trigger uses 7-day lookback (vs 3-day for cron)
    const lookbackFrom =
      from ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() - 7);
        return d.toISOString().split("T")[0];
      })();

    const result = await ingestRecordings(lookbackFrom, to);
    console.log("Manual ingest result:", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    console.error("Manual ingestion error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
