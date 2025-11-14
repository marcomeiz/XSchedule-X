-- Add the missing 'variables' column to the prompts table
ALTER TABLE public.prompts ADD COLUMN IF NOT EXISTS variables JSONB DEFAULT '[]'::jsonb;

-- Verify the table structure
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_schema = 'public' AND table_name = 'prompts' 
ORDER BY ordinal_position;