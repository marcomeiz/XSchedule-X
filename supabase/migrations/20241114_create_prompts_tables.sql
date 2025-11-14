-- Create prompts table for secure storage
CREATE TABLE IF NOT EXISTS prompts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    is_default BOOLEAN DEFAULT FALSE,
    is_system BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create prompt_history table for tracking changes
CREATE TABLE IF NOT EXISTS prompt_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prompt_id UUID REFERENCES prompts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    variables TEXT[] DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_prompt_settings table for current prompt selection
CREATE TABLE IF NOT EXISTS user_prompt_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    current_prompt_id UUID REFERENCES prompts(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
CREATE INDEX IF NOT EXISTS idx_prompts_is_default ON prompts(is_default);
CREATE INDEX IF NOT EXISTS idx_prompts_is_system ON prompts(is_system);
CREATE INDEX IF NOT EXISTS idx_prompt_history_prompt_id ON prompt_history(prompt_id);
CREATE INDEX IF NOT EXISTS idx_prompt_history_user_id ON prompt_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_prompt_settings_user_id ON user_prompt_settings(user_id);

-- Insert default system prompts (these will always be available)
INSERT INTO prompts (name, content, variables, is_default, is_system) VALUES
    ('Marco Voice Engine Default', 'Generate engaging social media content based on the following topic: {topic}', '{"topic"}', true, true),
    ('Business Operations', 'Create professional business content about: {topic}. Focus on operational insights and practical advice.', '{"topic"}', false, true),
    ('Creative Chaos', 'Generate creative, experimental content about: {topic}. Be bold and unconventional.', '{"topic"}', false, true)
ON CONFLICT (name, is_system) DO NOTHING;

-- Enable RLS (Row Level Security)
ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_prompt_settings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
-- Users can see their own prompts and system prompts
CREATE POLICY "Users can view own prompts" ON prompts
    FOR SELECT USING (
        auth.uid() = user_id OR is_system = true
    );

-- Users can insert their own prompts
CREATE POLICY "Users can insert own prompts" ON prompts
    FOR INSERT WITH CHECK (
        auth.uid() = user_id AND is_system = false
    );

-- Users can update their own prompts
CREATE POLICY "Users can update own prompts" ON prompts
    FOR UPDATE USING (
        auth.uid() = user_id AND is_system = false
    );

-- Users can delete their own prompts
CREATE POLICY "Users can delete own prompts" ON prompts
    FOR DELETE USING (
        auth.uid() = user_id AND is_system = false
    );

-- Users can view their own prompt history
CREATE POLICY "Users can view own prompt history" ON prompt_history
    FOR SELECT USING (
        auth.uid() = user_id
    );

-- Users can insert their own prompt history
CREATE POLICY "Users can insert own prompt history" ON prompt_history
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
    );

-- Users can view and update their own settings
CREATE POLICY "Users can view own settings" ON user_prompt_settings
    FOR SELECT USING (
        auth.uid() = user_id
    );

CREATE POLICY "Users can update own settings" ON user_prompt_settings
    FOR UPDATE USING (
        auth.uid() = user_id
    );

CREATE POLICY "Users can insert own settings" ON user_prompt_settings
    FOR INSERT WITH CHECK (
        auth.uid() = user_id
    );

-- Grant permissions to anon and authenticated roles
GRANT SELECT ON prompts TO anon, authenticated;
GRANT INSERT ON prompts TO authenticated;
GRANT UPDATE ON prompts TO authenticated;
GRANT DELETE ON prompts TO authenticated;

GRANT SELECT ON prompt_history TO anon, authenticated;
GRANT INSERT ON prompt_history TO authenticated;

GRANT SELECT ON user_prompt_settings TO anon, authenticated;
GRANT INSERT ON user_prompt_settings TO authenticated;
GRANT UPDATE ON user_prompt_settings TO authenticated;