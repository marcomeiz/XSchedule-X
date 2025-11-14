import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = 'https://lzzmfproweybcafbecnm.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx6em1mcHJvd2V5YmNhZmJlY25tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2Mjk1NzQ5MywiZXhwIjoyMDc4NTMzNDkzfQ.UnZg5zPmMCmXar4hDXIyYSd0dDJpTOWA1NKZ73wyijw';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  }
});

async function fixPromptsTable() {
  console.log('🔧 Arreglando tabla prompts con Service Key...');
  
  try {
    // Paso 1: Verificar estructura actual
    console.log('📊 Verificando estructura actual...');
    const { data: columns, error: colError } = await supabase
      .rpc('information_schema.columns', {
        table_schema: 'public',
        table_name: 'prompts'
      })
      .order('ordinal_position');

    if (colError) {
      console.error('❌ Error al verificar columnas:', colError.message);
      return;
    }

    if (columns && columns.length > 0) {
      const existingColumns = columns.map(col => col.column_name);
      console.log('📋 Columnas existentes:', existingColumns.join(', '));

      // Agregar columnas faltantes
      const missingColumns = [
        'user_id',
        'variables', 
        'is_default',
        'is_system',
        'is_active',
        'updated_at'
      ].filter(col => !existingColumns.includes(col));

      if (missingColumns.length > 0) {
        console.log(`📝 Agregando columnas faltantes: ${missingColumns.join(', ')}`);
        
        for (const col of missingColumns) {
          let sql = '';
          switch(col) {
            case 'user_id':
              sql = 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS user_id UUID;';
              break;
            case 'variables':
              sql = "ALTER TABLE prompts ADD COLUMN IF NOT EXISTS variables TEXT[] DEFAULT '{}';";
              break;
            case 'is_default':
              sql = 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;';
              break;
            case 'is_system':
              sql = 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;';
              break;
            case 'is_active':
              sql = 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;';
              break;
            case 'updated_at':
              sql = 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();';
              break;
          }
          
          try {
            const { error } = await supabase.rpc('exec_sql', { sql });
            if (error) {
              console.log(`⚠️  Columna ${col} podría ya existir:`, error.message);
            } else {
              console.log(`✅ Columna ${col} agregada`);
            }
          } catch (err) {
            console.log(`⚠️  Error al agregar ${col}:`, err.message);
          }
        }
      } else {
        console.log('✅ Todas las columnas ya existen');
      }
    } else {
      console.log('❌ La tabla prompts no existe');
      return;
    }

    // Paso 2: Crear índices
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

    // Paso 3: Habilitar RLS
    console.log('🔒 Habilitando RLS...');
    try {
      const { error } = await supabase.rpc('exec_sql', { 
        sql: 'ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;' 
      });
      if (error) throw error;
      console.log('✅ RLS habilitado');
    } catch (err) {
      console.log('⚠️  Error al habilitar RLS:', err.message);
    }

    // Paso 4: Crear políticas RLS
    console.log('🛡️  Creando políticas RLS...');
    const policies = [
      'CREATE POLICY "Users can view own prompts" ON prompts FOR SELECT USING (auth.uid() = user_id OR is_system = true);',
      'CREATE POLICY "Users can insert own prompts" ON prompts FOR INSERT WITH CHECK (auth.uid() = user_id AND is_system = false);',
      'CREATE POLICY "Users can update own prompts" ON prompts FOR UPDATE USING (auth.uid() = user_id AND is_system = false);',
      'CREATE POLICY "Users can delete own prompts" ON prompts FOR DELETE USING (auth.uid() = user_id AND is_system = false);'
    ];
    
    for (const policySQL of policies) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: policySQL });
        if (error) throw error;
        console.log('✅ Política creada');
      } catch (err) {
        console.log('⚠️  Error en política:', err.message);
      }
    }

    // Paso 5: Otorgar permisos
    console.log('🔑 Otorgando permisos...');
    const grants = [
      'GRANT SELECT ON prompts TO anon, authenticated;',
      'GRANT INSERT ON prompts TO authenticated;',
      'GRANT UPDATE ON prompts TO authenticated;',
      'GRANT DELETE ON prompts TO authenticated;'
    ];
    
    for (const grantSQL of grants) {
      try {
        const { error } = await supabase.rpc('exec_sql', { sql: grantSQL });
        if (error) throw error;
        console.log('✅ Permisos otorgados');
      } catch (err) {
        console.log('⚠️  Error en permisos:', err.message);
      }
    }

    console.log('🎉 ✅ Tabla prompts arreglada exitosamente!');

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

// Ejecutar
fixPromptsTable();