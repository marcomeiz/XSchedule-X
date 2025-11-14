import { createClient } from '@supabase/supabase-js';

// Get from environment variables
const supabaseUrl = process.env.SUPABASE_URL || 'https://xandbot.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhbmRib3QiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzAxMjUyNDQ4LCJleHAiOjIwMTY4Mjg0NDh9.ele-3dCXcVXTzl8N8KJm7u8FzP7t7y8x9w0e1r2t3';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function createPromptsTable() {
  try {
    console.log('Creating prompts table...');
    
    // Create the prompts table with all required columns
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS public.prompts (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          name TEXT NOT NULL,
          content TEXT NOT NULL,
          is_active BOOLEAN DEFAULT false,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE(name)
        );
        
        -- Create index on name for faster lookups
        CREATE INDEX IF NOT EXISTS idx_prompts_name ON public.prompts(name);
        
        -- Create index on is_active for faster filtering
        CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON public.prompts(is_active);
        
        -- Enable RLS
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
      `
    });
    
    if (error) {
      console.error('Error creating table:', error);
      return;
    }
    
    console.log('✅ Prompts table created successfully!');
    
    // Verify the table was created
    const { data: verifyData, error: verifyError } = await supabase
      .from('prompts')
      .select('*')
      .limit(1);
      
    if (verifyError) {
      console.error('Error verifying table:', verifyError);
    } else {
      console.log('✅ Table verification successful!');
    }
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createPromptsTable();