import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase";
import { requireCronAuth } from "@/lib/api";
import {
  getZoomAccessToken,
  getTodayRecordings,
  downloadTranscript,
} from "@/lib/zoom";
import { extractMeetingData } from "@/lib/claude";

export async function POST(request: Request) {
  const authError = requireCronAuth(request);
  if (authError) return authError;

  try {
    const supabase = createServiceClient();
    const accessToken = await getZoomAccessToken();
    const recordings = await getTodayRecordings(accessToken);

    if (recordings.length === 0) {
      return NextResponse.json({
        message: "No THO Daily Stand-Up recordings found for today",
        processed: 0,
      });
    }

    let processed = 0;

    for (const recording of recordings) {
      const zoomMeetingId = String(recording.id);

      // Idempotency check
      const { data: existing } = await supabase
        .from("meetings")
        .select("id")
        .eq("zoom_meeting_id", zoomMeetingId)
        .single();

      if (existing) {
        continue; // Already processed
      }

      // Find the transcript file
      const transcriptFile = recording.recording_files?.find(
        (f) => f.file_type === "TRANSCRIPT" && f.status === "completed"
      );

      if (!transcriptFile) {
        continue; // No transcript available yet
      }

      // Download transcript
      const transcript = await downloadTranscript(
        transcriptFile.download_url,
        accessToken
      );

      // Insert meeting row
      const meetingDate = recording.start_time.split("T")[0];
      const { data: meeting, error: insertError } = await supabase
        .from("meetings")
        .insert({
          zoom_meeting_id: zoomMeetingId,
          date: meetingDate,
          raw_transcript: transcript,
        })
        .select()
        .single();

      if (insertError || !meeting) {
        console.error("Failed to insert meeting:", insertError);
        continue;
      }

      // Extract with Claude
      try {
        const extraction = await extractMeetingData(transcript);

        // Insert action items
        if (extraction.action_items.length > 0) {
          await supabase.from("action_items").insert(
            extraction.action_items.map((item, idx) => ({
              meeting_id: meeting.id,
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

        // Insert discussion topics
        if (extraction.discussion_topics.length > 0) {
          await supabase.from("discussion_topics").insert(
            extraction.discussion_topics.map((topic) => ({
              meeting_id: meeting.id,
              category: topic.category,
              title: topic.title,
              summary: topic.summary,
              confidence_score: topic.confidence,
            }))
          );
        }

        // Update meeting with summary
        await supabase
          .from("meetings")
          .update({
            ai_summary: extraction.summary,
            processed_at: new Date().toISOString(),
          })
          .eq("id", meeting.id);

        processed++;
      } catch (extractionError) {
        console.error("Claude extraction failed:", extractionError);
        // Leave processed_at as null — can be retried via reprocess
      }
    }

    return NextResponse.json({
      message: `Processed ${processed} meeting(s)`,
      processed,
    });
  } catch (error) {
    console.error("Ingestion error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
