-- Ensure prompts RLS and policies (authenticated only)
ALTER TABLE IF EXISTS prompts ENABLE ROW LEVEL SECURITY;

-- Drop existing permissive policies if any
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'prompts' AND policyname = 'Allow public read access') THEN
    DROP POLICY "Allow public read access" ON prompts;
  END IF;
END $$;

-- Create secure policies
DROP POLICY IF EXISTS "Users can view own prompts" ON prompts;
CREATE POLICY "Users can view own prompts" ON prompts
  FOR SELECT USING (auth.uid() = user_id OR is_system = true);

DROP POLICY IF EXISTS "Users can insert own prompts" ON prompts;
CREATE POLICY "Users can insert own prompts" ON prompts
  FOR INSERT WITH CHECK (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can update own prompts" ON prompts;
CREATE POLICY "Users can update own prompts" ON prompts
  FOR UPDATE USING (auth.uid() = user_id AND is_system = false);

DROP POLICY IF EXISTS "Users can delete own prompts" ON prompts;
CREATE POLICY "Users can delete own prompts" ON prompts
  FOR DELETE USING (auth.uid() = user_id AND is_system = false);

-- Grants without anon
GRANT SELECT, INSERT, UPDATE, DELETE ON prompts TO authenticated;

-- Create user_prompt_settings table with RLS
CREATE TABLE IF NOT EXISTS user_prompt_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_prompt_id UUID REFERENCES prompts(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_prompt_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ups_select ON user_prompt_settings;
CREATE POLICY ups_select ON user_prompt_settings FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ups_insert ON user_prompt_settings;
CREATE POLICY ups_insert ON user_prompt_settings FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS ups_update ON user_prompt_settings;
CREATE POLICY ups_update ON user_prompt_settings FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS ups_delete ON user_prompt_settings;
CREATE POLICY ups_delete ON user_prompt_settings FOR DELETE USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON user_prompt_settings TO authenticated;
