-- SQL Script to create the prompts table in Supabase
-- Run this in the Supabase SQL Editor at: https://lzzmfproweybcafbecnm.supabase.co/project/default/sql

-- Create the prompts table with all required columns
CREATE TABLE IF NOT EXISTS public.prompts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(name)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_prompts_name ON public.prompts(name);
CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON public.prompts(is_active);

-- Enable Row Level Security
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Allow public read access" ON public.prompts
  FOR SELECT USING (true);
  
CREATE POLICY "Allow authenticated users to insert" ON public.prompts
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');
  
CREATE POLICY "Allow authenticated users to update" ON public.prompts
  FOR UPDATE USING (auth.role() = 'authenticated');
  
CREATE POLICY "Allow authenticated users to delete" ON public.prompts
  FOR DELETE USING (auth.role() = 'authenticated');

-- Grant permissions
GRANT SELECT ON public.prompts TO anon;
GRANT ALL ON public.prompts TO authenticated;

-- Verify the table was created
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' AND table_name = 'prompts';

-- Test insert
INSERT INTO public.prompts (name, content, is_active) 
VALUES ('test-prompt', 'This is a test prompt', false)
ON CONFLICT (name) DO NOTHING;

-- Verify the test record
SELECT * FROM public.prompts WHERE name = 'test-prompt';

-- Clean up test record
DELETE FROM public.prompts WHERE name = 'test-prompt';