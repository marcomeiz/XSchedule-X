-- Fix RLS policies for prompts table
-- First, let's see what policies exist
SELECT polname, polcmd, polroles::regrole[], polqual, polwithcheck
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'prompts';

-- Drop existing policies and create simpler ones
DROP POLICY IF EXISTS "Allow public read access" ON public.prompts;
DROP POLICY IF EXISTS "Allow authenticated users to insert" ON public.prompts;
DROP POLICY IF EXISTS "Allow authenticated users to update" ON public.prompts;
DROP POLICY IF EXISTS "Allow authenticated users to delete" ON public.prompts;

-- Create simpler policies
CREATE POLICY "Allow all operations" ON public.prompts
  FOR ALL USING (true);

-- Grant all permissions
GRANT ALL ON public.prompts TO anon;
GRANT ALL ON public.prompts TO authenticated;

-- Verify the changes
SELECT polname, polcmd, polroles::regrole[], polqual, polwithcheck
FROM pg_policies 
WHERE schemaname = 'public' AND tablename = 'prompts';