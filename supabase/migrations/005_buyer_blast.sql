-- Buyer Blast Agent: blast tracking, recipient status, sending tier management

-- Tracks each blast run (one per opportunity)
CREATE TABLE blast_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id TEXT NOT NULL,
  trigger_task_id TEXT,
  property_address TEXT,
  total_buyers INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'paused_tier_limit', 'paused_error', 'failed_validation')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  deal_data JSONB,
  CONSTRAINT uq_blast_runs_opportunity UNIQUE (opportunity_id)
);

CREATE INDEX idx_blast_runs_status ON blast_runs(status);
CREATE INDEX idx_blast_runs_opportunity ON blast_runs(opportunity_id);

-- Tracks each recipient within a blast
CREATE TABLE blast_recipients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blast_run_id UUID NOT NULL REFERENCES blast_runs(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  contact_name TEXT,
  phone TEXT,
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'skipped_dnd', 'skipped_no_phone', 'skipped_invalid_phone')),
  ghl_message_id TEXT,
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'sent', 'delivered', 'undelivered', 'failed')),
  replied BOOLEAN NOT NULL DEFAULT FALSE,
  replied_at TIMESTAMPTZ,
  opted_out BOOLEAN NOT NULL DEFAULT FALSE,
  sent_at TIMESTAMPTZ,
  error_detail TEXT,
  CONSTRAINT uq_blast_recipient UNIQUE (blast_run_id, contact_id)
);

CREATE INDEX idx_blast_recipients_run ON blast_recipients(blast_run_id);
CREATE INDEX idx_blast_recipients_status ON blast_recipients(status);
CREATE INDEX idx_blast_recipients_message ON blast_recipients(ghl_message_id);

-- Singleton table tracking the current sending tier (message ramp)
CREATE TABLE sending_tier (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  current_limit INTEGER NOT NULL DEFAULT 100,
  sent_today INTEGER NOT NULL DEFAULT 0,
  last_send_date DATE NOT NULL DEFAULT CURRENT_DATE,
  graduated_at TIMESTAMPTZ
);

-- Seed the singleton row
INSERT INTO sending_tier (id, current_limit, sent_today, last_send_date)
VALUES (1, 100, 0, CURRENT_DATE);
