"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEAM_MEMBERS } from "@/lib/constants";
import { toast } from "sonner";

export function NoteEditor({
  meetingId,
  onCreated,
}: {
  meetingId?: string;
  onCreated?: () => void;
}) {
  const [content, setContent] = useState("");
  const [author, setAuthor] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() || !author) return;

    setLoading(true);

    const res = await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: content.trim(),
        author,
        meeting_id: meetingId || null,
      }),
    });

    setLoading(false);

    if (res.ok) {
      toast.success("Note added");
      setContent("");
      onCreated?.();
    } else {
      toast.error("Failed to add note");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <Textarea
        placeholder="Add a note..."
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={3}
      />
      <div className="flex gap-3 items-center">
        <Select value={author} onValueChange={(v) => v && setAuthor(v)}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Your name" />
          </SelectTrigger>
          <SelectContent>
            {TEAM_MEMBERS.map((member) => (
              <SelectItem key={member} value={member}>
                {member}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          size="sm"
          disabled={loading || !content.trim() || !author}
        >
          {loading ? "Saving..." : "Add Note"}
        </Button>
      </div>
    </form>
  );
}
