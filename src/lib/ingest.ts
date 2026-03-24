import { createServiceClient } from "@/lib/supabase";
import {
  getZoomAccessToken,
  getRecordingsInRange,
  downloadTranscript,
} from "@/lib/zoom";
import { extractMeetingData } from "@/lib/claude";

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split("T")[0];
}

function today(): string {
  return new Date().toISOString().split("T")[0];
}

export type IngestResult = {
  from: string;
  to: string;
  found: number;
  skippedExisting: number;
  skippedNoTranscript: number;
  processed: number;
  errors: string[];
};

/**
 * Ingest Zoom recordings for a date range.
 * Safe to call repeatedly — idempotency check prevents re-processing.
 */
export async function ingestRecordings(
  from?: string,
  to?: string
): Promise<IngestResult> {
  const dateFrom = from || daysAgo(3);
  const dateTo = to || today();

  const result: IngestResult = {
    from: dateFrom,
    to: dateTo,
    found: 0,
    skippedExisting: 0,
    skippedNoTranscript: 0,
    processed: 0,
    errors: [],
  };

  const supabase = createServiceClient();
  const accessToken = await getZoomAccessToken();
  const recordings = await getRecordingsInRange(accessToken, dateFrom, dateTo);

  result.found = recordings.length;

  if (recordings.length === 0) {
    return result;
  }

  for (const recording of recordings) {
    const zoomMeetingId = String(recording.id);

    // Idempotency check
    const { data: existing } = await supabase
      .from("meetings")
      .select("id")
      .eq("zoom_meeting_id", zoomMeetingId)
      .single();

    if (existing) {
      result.skippedExisting++;
      continue;
    }

    // Find the transcript file
    const transcriptFile = recording.recording_files?.find(
      (f) => f.file_type === "TRANSCRIPT" && f.status === "completed"
    );

    if (!transcriptFile) {
      result.skippedNoTranscript++;
      continue;
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
      result.errors.push(
        `Failed to insert meeting ${zoomMeetingId}: ${insertError?.message}`
      );
      continue;
    }

    // Extract with Claude
    try {
      const extraction = await extractMeetingData(transcript);

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

      await supabase
        .from("meetings")
        .update({
          ai_summary: extraction.summary,
          processed_at: new Date().toISOString(),
        })
        .eq("id", meeting.id);

      result.processed++;
    } catch (extractionError) {
      const msg =
        extractionError instanceof Error
          ? extractionError.message
          : "Unknown extraction error";
      result.errors.push(`Claude extraction failed for ${zoomMeetingId}: ${msg}`);
      // Meeting row exists but processed_at is null — can retry via reprocess
    }
  }

  return result;
}
