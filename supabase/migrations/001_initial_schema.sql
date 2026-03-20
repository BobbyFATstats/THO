-- THO Stand-Up Dashboard — Initial Schema
-- Creates all 4 tables with enums, constraints, and indexes

-- Enum types
CREATE TYPE priority_level AS ENUM ('high', 'medium', 'low');
CREATE TYPE item_status AS ENUM ('open', 'in_progress', 'completed', 'cancelled');
CREATE TYPE item_source AS ENUM ('ai_extracted', 'manual');
CREATE TYPE topic_category AS ENUM ('crm_feature', 'crm_bug', 'idea', 'growth_learning', 'deal_update', 'general');

-- Meetings table
CREATE TABLE meetings (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  zoom_meeting_id text UNIQUE NOT NULL,
  date date NOT NULL,
  raw_transcript text,
  ai_summary text,
  processed_at timestamptz,
  reprocess_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Action items table
CREATE TABLE action_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  assignee text,
  priority priority_level NOT NULL DEFAULT 'medium',
  status item_status NOT NULL DEFAULT 'open',
  confidence_score float NOT NULL DEFAULT 1.0,
  source item_source NOT NULL DEFAULT 'manual',
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_action_items_status_priority ON action_items(status, priority);
CREATE INDEX idx_action_items_assignee ON action_items(assignee);
CREATE INDEX idx_action_items_meeting_id ON action_items(meeting_id);

-- Discussion topics table
CREATE TABLE discussion_topics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid REFERENCES meetings(id) ON DELETE CASCADE NOT NULL,
  category topic_category NOT NULL DEFAULT 'general',
  title text NOT NULL,
  summary text,
  confidence_score float NOT NULL DEFAULT 1.0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_discussion_topics_category ON discussion_topics(category);
CREATE INDEX idx_discussion_topics_meeting_id ON discussion_topics(meeting_id);

-- Notes table
CREATE TABLE notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id uuid REFERENCES meetings(id) ON DELETE SET NULL,
  content text NOT NULL,
  author text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_notes_meeting_id ON notes(meeting_id);

-- Disable RLS on all tables (small trusted team, all access via service role key)
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE discussion_topics ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

-- Create permissive policies (RLS enabled but allows all for service role)
CREATE POLICY "Allow all for service role" ON meetings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON action_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON discussion_topics FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for service role" ON notes FOR ALL USING (true) WITH CHECK (true);
