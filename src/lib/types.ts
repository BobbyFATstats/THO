import type { Priority, Status, Source, Category } from "./constants";

export type Meeting = {
  id: string;
  zoom_meeting_id: string;
  date: string;
  raw_transcript: string | null;
  ai_summary: string | null;
  processed_at: string | null;
  reprocess_count: number;
  created_at: string;
};

export type ActionItem = {
  id: string;
  meeting_id: string | null;
  title: string;
  description: string | null;
  assignee: string | null;
  priority: Priority;
  status: Status;
  confidence_score: number;
  source: Source;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type DiscussionTopic = {
  id: string;
  meeting_id: string;
  category: Category;
  title: string;
  summary: string | null;
  confidence_score: number;
  created_at: string;
};

export type Note = {
  id: string;
  meeting_id: string | null;
  content: string;
  author: string;
  created_at: string;
  updated_at: string;
};

export type MeetingWithRelations = Meeting & {
  action_items: ActionItem[];
  discussion_topics: DiscussionTopic[];
  notes: Note[];
};

export type ExtractionResult = {
  summary: string;
  action_items: {
    title: string;
    description: string | null;
    assignee: string | null;
    priority: Priority;
    confidence: number;
  }[];
  discussion_topics: {
    category: Category;
    title: string;
    summary: string | null;
    confidence: number;
  }[];
};
