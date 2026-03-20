import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { jsonError } from "@/lib/api";
import { extractMeetingData } from "@/lib/claude";
import { MAX_REPROCESS_COUNT } from "@/lib/constants";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createServiceClient();

  // Get meeting
  const { data: meeting, error } = await supabase
    .from("meetings")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !meeting) {
    return jsonError("Meeting not found", 404);
  }

  if (meeting.reprocess_count >= MAX_REPROCESS_COUNT) {
    return jsonError("Maximum reprocess limit reached", 429);
  }

  if (!meeting.raw_transcript) {
    return jsonError("No transcript available to reprocess", 400);
  }

  // Delete existing extracted items
  await Promise.all([
    supabase.from("action_items").delete().eq("meeting_id", id),
    supabase.from("discussion_topics").delete().eq("meeting_id", id),
  ]);

  // Re-run extraction
  const extraction = await extractMeetingData(meeting.raw_transcript);

  // Insert new items
  if (extraction.action_items.length > 0) {
    await supabase.from("action_items").insert(
      extraction.action_items.map((item, idx) => ({
        meeting_id: id,
        title: item.title,
        description: item.description,
        assignee: item.assignee,
        priority: item.priority,
        confidence_score: item.confidence,
        source: "ai_extracted" as const,
        sort_order: idx,
      }))
    );
  }

  if (extraction.discussion_topics.length > 0) {
    await supabase.from("discussion_topics").insert(
      extraction.discussion_topics.map((topic) => ({
        meeting_id: id,
        category: topic.category,
        title: topic.title,
        summary: topic.summary,
        confidence_score: topic.confidence,
      }))
    );
  }

  // Update meeting
  await supabase
    .from("meetings")
    .update({
      ai_summary: extraction.summary,
      processed_at: new Date().toISOString(),
      reprocess_count: meeting.reprocess_count + 1,
    })
    .eq("id", id);

  return NextResponse.json({ success: true });
}
