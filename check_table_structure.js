const { createClient } = require('@supabase/supabase-js');

// Usar el Service Key para tener acceso completo
const supabase = createClient(
  'https://lzzmfproweybcafbecnm.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6em1mcHJvd2V5YmNhZmJlY25tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk1NzQ5MywiZXhwIjoyMDc4NTMzNDkzfQ.UnZg5zPmMCmXar4hDXIyYSd0dDJpTOWA1NKZ73wyijw'
);

async function checkTableStructure() {
  try {
    console.log('🔍 Verificando estructura de la base de datos...\n');
    
    // Primero, verificar qué tablas existen
    const { data: tables, error: tablesError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public');
    
    if (tablesError) {
      console.error('Error al obtener tablas:', tablesError);
      return;
    }
    
    console.log('📋 Tablas existentes en la base de datos:');
    tables.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });
    
    // Verificar si existe la tabla prompts
    const promptsTable = tables.find(t => t.table_name === 'prompts');
    
    if (promptsTable) {
      console.log('\n✅ La tabla "prompts" existe');
      
      // Obtener estructura de la tabla prompts
      const { data: columns, error: columnsError } = await supabase
        .from('information_schema.columns')
        .select('column_name, data_type, is_nullable, column_default')
        .eq('table_name', 'prompts')
        .eq('table_schema', 'public')
        .order('ordinal_position');
      
      if (columnsError) {
        console.error('Error al obtener columnas:', columnsError);
        return;
      }
      
      console.log('\n📊 Estructura de la tabla "prompts":');
      console.log('Columna | Tipo | Nullable | Default');
      console.log('--------|------|----------|--------');
      columns.forEach(col => {
        console.log(`${col.column_name.padEnd(15)} | ${col.data_type.padEnd(10)} | ${col.is_nullable.padEnd(8)} | ${col.column_default || 'NULL'}`);
      });
      
      // Verificar datos existentes
      const { data: promptsData, error: dataError } = await supabase
        .from('prompts')
        .select('*');
      
      if (dataError) {
        console.error('Error al obtener datos:', dataError);
      } else {
        console.log(`\n📄 Registros en tabla "prompts": ${promptsData.length}`);
        if (promptsData.length > 0) {
          console.log('Primer registro:', JSON.stringify(promptsData[0], null, 2));
        }
      }
      
    } else {
      console.log('\n❌ La tabla "prompts" NO existe');
    }
    
    // Verificar políticas RLS
    const { data: policies, error: policiesError } = await supabase
      .from('information_schema.role_table_grants')
      .select('grantee, privilege_type')
      .eq('table_name', 'prompts');
    
    if (!policiesError && policies.length > 0) {
      console.log('\n🔒 Permisos RLS para tabla "prompts":');
      policies.forEach(policy => {
        console.log(`  - ${policy.grantee}: ${policy.privilege_type}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error general:', error);
  }
}

checkTableStructure();