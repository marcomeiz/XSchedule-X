#!/usr/bin/env node

// Simple script to create prompts table using the server's Supabase connection
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTable() {
  try {
    console.log('Creating prompts table...');
    
    // Use raw SQL execution through Supabase
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
        
        -- Create indexes
        CREATE INDEX IF NOT EXISTS idx_prompts_name ON public.prompts(name);
        CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON public.prompts(is_active);
        
        -- Enable RLS
        ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
        
        -- Grant permissions
        GRANT SELECT ON public.prompts TO anon;
        GRANT ALL ON public.prompts TO authenticated;
      `
    });
    
    if (error) {
      console.error('Error creating table:', error);
      return;
    }
    
    console.log('✅ Table created successfully!');
    
  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

createTable();