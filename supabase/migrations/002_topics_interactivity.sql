-- Add interactivity columns to discussion_topics
ALTER TABLE discussion_topics ADD COLUMN status text NOT NULL DEFAULT 'open';
ALTER TABLE discussion_topics ADD COLUMN priority text NOT NULL DEFAULT 'medium';
ALTER TABLE discussion_topics ADD COLUMN sort_order integer DEFAULT 0;
ALTER TABLE discussion_topics ADD COLUMN updated_at timestamptz DEFAULT now();
ALTER TABLE discussion_topics ADD COLUMN assignee text;

CREATE INDEX idx_discussion_topics_status ON discussion_topics(status);
