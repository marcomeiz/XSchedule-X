import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://xandbot.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhbmRib3QiLCJyb2xlIjoiYW5vbiIsImlhdCI6MTcwMTI1MjQ0OCwiZXhwIjoyMDE2ODI4NDQ4fQ.zt3k8y6dCXcVXTzl8N8KJm7u8FzP7t7y8x9w0e1r2t3'
);

async function checkSchema() {
  try {
    console.log('Testing Supabase connection...');
    
    // Check if prompts table exists
    const { data, error } = await supabase
      .from('prompts')
      .select('*')
      .limit(1);
    
    if (error) {
      console.log('❌ Error accessing prompts table:', error.message);
      console.log('Error code:', error.code);
      console.log('Error details:', error);
      
      // Try to check what tables exist
      const { data: tables, error: tableError } = await supabase
        .rpc('get_tables');
      
      if (!tableError && tables) {
        console.log('Available tables:', tables);
      }
      
      return;
    }
    
    console.log('✅ Prompts table accessible');
    if (data && data.length > 0) {
      console.log('Sample data columns:', Object.keys(data[0]));
      console.log('Sample prompt:', data[0]);
    } else {
      console.log('No data found in prompts table');
    }
    
    // Check table structure
    console.log('\n📋 Checking table structure...');
    const { data: structure, error: structError } = await supabase
      .rpc('describe_table', { table_name: 'prompts' });
    
    if (!structError && structure) {
      console.log('Table structure:', structure);
    } else {
      console.log('Could not get table structure:', structError?.message);
    }
    
  } catch (err) {
    console.error('❌ Connection error:', err.message);
  }
}

checkSchema();