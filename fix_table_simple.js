import { createClient } from '@supabase/supabase-js';

// Conectar con Service Key para tener acceso completo
const supabaseUrl = 'https://lzzmfproweybcafbecnm.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6em1mcHJvd2V5YmNhZmJlY25tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk1NzQ5MywiZXhwIjoyMDc4NTMzNDkzfQ.UnZg5zPmMCmXar4hDXIyYSd0dDJpTOWA1NKZ73wyijw';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function fixTableStructure() {
  console.log('🔧 Arreglando estructura de tabla prompts...');
  
  try {
    // Paso 1: Verificar columnas actuales
    console.log('📊 Verificando columnas actuales...');
    const { data: columns, error: colError } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type, column_default')
      .eq('table_schema', 'public')
      .eq('table_name', 'prompts')
      .order('ordinal_position');

    if (colError) {
      console.error('❌ Error al verificar columnas:', colError.message);
      return;
    }

    if (columns && columns.length > 0) {
      const existingColumns = columns.map(col => col.column_name);
      console.log('📋 Columnas existentes:', existingColumns.join(', '));

      // Paso 2: Agregar columnas faltantes
      const columnsToAdd = [
        { name: 'user_id', sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS user_id UUID;' },
        { name: 'variables', sql: "ALTER TABLE prompts ADD COLUMN IF NOT EXISTS variables TEXT[] DEFAULT '{}';" },
        { name: 'is_default', sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;' },
        { name: 'is_system', sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;' },
        { name: 'is_active', sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;' },
        { name: 'updated_at', sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();' }
      ];

      for (const col of columnsToAdd) {
        if (!existingColumns.includes(col.name)) {
          console.log(`📝 Agregando columna ${col.name}...`);
          
          // Ejecutar SQL directamente usando rpc
          try {
            const { error } = await supabase.rpc('exec_sql', { sql: col.sql });
            if (error) {
              console.log(`⚠️  Columna ${col.name} podría ya existir:`, error.message);
            } else {
              console.log(`✅ Columna ${col.name} agregada`);
            }
          } catch (err) {
            console.log(`⚠️  Error al agregar ${col.name}:`, err.message);
          }
        } else {
          console.log(`✅ Columna ${col.name} ya existe`);
        }
      }
    } else {
      console.log('❌ La tabla prompts no existe');
      return;
    }

    // Paso 3: Crear índices
    console.log('📝 Creando índices...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);',
      'CREATE INDEX IF NOT EXISTS idx_prompts_is_default ON prompts(is_default);',
      'CREATE INDEX IF NOT EXISTS idx_prompts_is_system ON prompts(is_system);',
      'CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON prompts(is_active);',
      'CREATE INDEX IF NOT EXISTS idx_prompts_name ON prompts(name);'
    ];
    
    for (const indexSQL of indexes) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: indexSQL });
        if (error) throw error;
        console.log('✅ Índice creado');
      } catch (err) {
        console.log('⚠️  Error en índice:', err.message);
      }
    }

    // Paso 4: Verificar estructura final
    console.log('📋 Verificando estructura final...');
    const { data: finalColumns } = await supabase
      .from('information_schema.columns')
      .select('column_name, data_type')
      .eq('table_schema', 'public')
      .eq('table_name', 'prompts')
      .order('ordinal_position');

    if (finalColumns) {
      console.log('✅ Estructura final:', finalColumns.map(col => col.column_name).join(', '));
    }

    console.log('🎉 ✅ Tabla prompts arreglada exitosamente!');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar
fixTableStructure();