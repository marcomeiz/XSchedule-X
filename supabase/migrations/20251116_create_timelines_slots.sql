CREATE TABLE IF NOT EXISTS timelines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  total_slots INTEGER NOT NULL,
  interval_hours NUMERIC,
  work_start TIME NOT NULL,
  work_end TIME NOT NULL,
  timezone TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure user_id exists in preexisting timelines
ALTER TABLE timelines ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE timelines DROP CONSTRAINT IF EXISTS timelines_user_id_fkey;
ALTER TABLE timelines ADD CONSTRAINT timelines_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE TABLE IF NOT EXISTS slots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  timeline_id UUID REFERENCES timelines(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL,
  scheduled_time TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'empty',
  content TEXT,
  filled_at TIMESTAMPTZ,
  published_at TIMESTAMPTZ,
  tweet_id TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE timelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS timelines_select ON timelines;
CREATE POLICY timelines_select ON timelines FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS timelines_insert ON timelines;
CREATE POLICY timelines_insert ON timelines FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS timelines_update ON timelines;
CREATE POLICY timelines_update ON timelines FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS timelines_delete ON timelines;
CREATE POLICY timelines_delete ON timelines FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS slots_select ON slots;
CREATE POLICY slots_select ON slots FOR SELECT USING (
  EXISTS (SELECT 1 FROM timelines t WHERE t.id = slots.timeline_id AND t.user_id = auth.uid())
);
DROP POLICY IF EXISTS slots_insert ON slots;
CREATE POLICY slots_insert ON slots FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM timelines t WHERE t.id = slots.timeline_id AND t.user_id = auth.uid())
);
DROP POLICY IF EXISTS slots_update ON slots;
CREATE POLICY slots_update ON slots FOR UPDATE USING (
  EXISTS (SELECT 1 FROM timelines t WHERE t.id = slots.timeline_id AND t.user_id = auth.uid())
);
DROP POLICY IF EXISTS slots_delete ON slots;
CREATE POLICY slots_delete ON slots FOR DELETE USING (
  EXISTS (SELECT 1 FROM timelines t WHERE t.id = slots.timeline_id AND t.user_id = auth.uid())
);

GRANT SELECT, INSERT, UPDATE, DELETE ON timelines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON slots TO authenticated;

CREATE INDEX IF NOT EXISTS idx_slots_timeline_id ON slots(timeline_id);
CREATE INDEX IF NOT EXISTS idx_slots_slot_index ON slots(slot_index);
CREATE INDEX IF NOT EXISTS idx_slots_scheduled_time ON slots(scheduled_time);
CREATE INDEX IF NOT EXISTS idx_slots_status ON slots(status);
