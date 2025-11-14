-- Fix prompts table schema to match server.js expectations
-- Add is_active column that server.js is trying to use
ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;

-- Create index for better performance on is_active
CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON prompts(is_active);

-- Update RLS policies to handle is_active column
-- Users can view active prompts (including system ones)
DROP POLICY IF EXISTS "Users can view own prompts" ON prompts;
CREATE POLICY "Users can view own prompts" ON prompts
    FOR SELECT USING (
        auth.uid() = user_id OR is_system = true OR is_active = true
    );

-- Ensure only one prompt can be active at a time
CREATE OR REPLACE FUNCTION ensure_single_active_prompt()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_active = true THEN
        -- Deactivate all other prompts for this user
        UPDATE prompts 
        SET is_active = false 
        WHERE (user_id = NEW.user_id OR is_system = true) 
        AND id != NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to ensure only one active prompt
DROP TRIGGER IF EXISTS trigger_single_active_prompt ON prompts;
CREATE TRIGGER trigger_single_active_prompt
    BEFORE INSERT OR UPDATE ON prompts
    FOR EACH ROW
    EXECUTE FUNCTION ensure_single_active_prompt();

-- No default system prompt with hardcoded content - let users configure their own prompts

-- Grant permissions for the new column
GRANT SELECT ON prompts TO anon, authenticated;
GRANT INSERT ON prompts TO authenticated;
GRANT UPDATE ON prompts TO authenticated;
GRANT DELETE ON prompts TO authenticated;