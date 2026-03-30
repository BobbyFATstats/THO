"use client";

import { use, useState } from "react";
import { useMeeting } from "@/lib/hooks/use-meetings";
import { PriorityBadge } from "@/components/priority-badge";
import { StatusBadge } from "@/components/status-badge";
import { ConfidenceIndicator } from "@/components/confidence-indicator";
import { AddActionItemDialog } from "@/components/add-action-item-dialog";
import { NoteEditor } from "@/components/note-editor";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { CATEGORY_LABELS, MAX_REPROCESS_COUNT } from "@/lib/constants";
import type { Category } from "@/lib/constants";
import { format } from "date-fns";
import { toast } from "sonner";

export default function MeetingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: meeting, mutate } = useMeeting(id);
  const [showTranscript, setShowTranscript] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);

  if (!meeting) {
    return <p className="text-muted-foreground">Loading meeting...</p>;
  }

  async function handleReprocess() {
    setReprocessing(true);
    const res = await fetch(`/api/meetings/${id}/reprocess`, {
      method: "POST",
    });
    setReprocessing(false);

    if (res.ok) {
      toast.success("Meeting reprocessed");
      mutate();
    } else if (res.status === 429) {
      toast.error("Maximum reprocess limit reached");
    } else {
      toast.error("Reprocess failed");
    }
  }

  async function handleDeleteNote(noteId: string) {
    const res = await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Note deleted");
      mutate();
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">
            {format(new Date(meeting.date + "T00:00:00"), "EEEE, MMMM d, yyyy")}
          </h1>
          <p className="text-sm text-muted-foreground">Meeting Detail</p>
        </div>
        <div className="flex gap-2">
          <AddActionItemDialog
            meetingId={meeting.id}
            onCreated={() => mutate()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleReprocess}
            disabled={
              reprocessing ||
              meeting.reprocess_count >= MAX_REPROCESS_COUNT ||
              !meeting.raw_transcript
            }
          >
            {reprocessing
              ? "Processing..."
              : `Reprocess (${meeting.reprocess_count}/${MAX_REPROCESS_COUNT})`}
          </Button>
        </div>
      </div>

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">AI Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm">
            {meeting.ai_summary || "No summary available. Try reprocessing."}
          </p>
        </CardContent>
      </Card>

      {/* Action Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Action Items ({meeting.action_items.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {meeting.action_items.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No action items extracted
            </p>
          )}
          {meeting.action_items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 p-2 rounded border"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{item.title}</span>
                  <ConfidenceIndicator score={item.confidence_score} />
                </div>
                {item.description && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.description}
                  </p>
                )}
              </div>
              {item.assignee && (
                <Badge variant="outline" className="text-xs">
                  {item.assignee}
                </Badge>
              )}
              <PriorityBadge priority={item.priority} />
              <StatusBadge status={item.status} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Discussion Topics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Discussion Topics ({meeting.discussion_topics.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {meeting.discussion_topics.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No topics extracted
            </p>
          )}
          {meeting.discussion_topics.map((topic) => (
            <div key={topic.id} className="p-2 rounded border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{topic.title}</span>
                <Badge variant="secondary" className="text-xs">
                  {CATEGORY_LABELS[topic.category as Category]}
                </Badge>
                <ConfidenceIndicator score={topic.confidence_score} />
              </div>
              {topic.summary && (
                <p className="text-xs text-muted-foreground mt-1">
                  {topic.summary}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Notes ({meeting.notes.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {meeting.notes.map((note) => (
            <div key={note.id} className="p-3 rounded border">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium">{note.author}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {format(new Date(note.created_at), "MMM d, h:mm a")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs text-destructive"
                    onClick={() => handleDeleteNote(note.id)}
                  >
                    Delete
                  </Button>
                </div>
              </div>
              <p className="text-sm">{note.content}</p>
            </div>
          ))}

          <Separator />
          <NoteEditor meetingId={meeting.id} onCreated={() => mutate()} />
        </CardContent>
      </Card>

      {/* Raw Transcript */}
      {meeting.raw_transcript && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Raw Transcript
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowTranscript(!showTranscript)}
              >
                {showTranscript ? "Collapse" : "Expand"}
              </Button>
            </CardTitle>
          </CardHeader>
          {showTranscript && (
            <CardContent>
              <pre className="text-xs whitespace-pre-wrap font-mono bg-muted p-4 rounded max-h-96 overflow-y-auto">
                {meeting.raw_transcript}
              </pre>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  );
}
