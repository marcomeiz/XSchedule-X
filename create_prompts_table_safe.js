import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ SUPABASE_URL y SUPABASE_ANON_KEY son requeridos');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function createPromptsTableStepByStep() {
  console.log('🔧 Creando tabla prompts paso a paso...');
  
  try {
    // Paso 1: Verificar si existe la tabla
    const { data: tableExists, error: tableError } = await supabase
      .rpc('information_schema.tables', {
        table_schema: 'public',
        table_name: 'prompts'
      });

    if (tableError || !tableExists) {
      console.log('📋 La tabla prompts no existe. Creándola...');
      await createTableFromScratch();
    } else {
      console.log('📋 La tabla prompts ya existe. Verificando columnas...');
      await verifyAndFixColumns();
    }
    
    console.log('✅ Tabla prompts lista!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

async function createTableFromScratch() {
  try {
    // Crear tabla básica primero (sin restricciones complejas)
    console.log('📝 Paso 1: Creando tabla básica...');
    
    const createBasicTable = `
      CREATE TABLE prompts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    // Intentar crear la tabla básica
    try {
      const { error } = await supabase.rpc('exec_sql', { 
        sql: createBasicTable 
      });
      if (error) throw error;
      console.log('✅ Tabla básica creada');
    } catch (err) {
      console.log('⚠️  Tabla podría ya existir o error en creación básica:', err.message);
    }
    
    // Agregar columnas adicionales una por una
    const columns = [
      {
        name: 'user_id',
        sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS user_id UUID;'
      },
      {
        name: 'variables',
        sql: "ALTER TABLE prompts ADD COLUMN IF NOT EXISTS variables TEXT[] DEFAULT '{}';"
      },
      {
        name: 'is_default',
        sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE;'
      },
      {
        name: 'is_system',
        sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE;'
      },
      {
        name: 'is_active',
        sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE;'
      },
      {
        name: 'updated_at',
        sql: 'ALTER TABLE prompts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();'
      }
    ];
    
    for (const column of columns) {
      try {
        console.log(`📝 Agregando columna ${column.name}...`);
        const { error } = await supabase.rpc('exec_sql', { sql: column.sql });
        if (error) {
          console.log(`⚠️  Columna ${column.name} podría ya existir o error:`, error.message);
        } else {
          console.log(`✅ Columna ${column.name} agregada`);
        }
      } catch (err) {
        console.log(`⚠️  Error al agregar ${column.name}:`, err.message);
      }
    }
    
    // Crear índices
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
    
  } catch (error) {
    console.error('❌ Error al crear tabla:', error.message);
  }
}

async function verifyAndFixColumns() {
  try {
    // Obtener columnas actuales
    const { data: columns, error: colError } = await supabase
      .rpc('information_schema.columns', {
        table_schema: 'public',
        table_name: 'prompts'
      })
      .order('ordinal_position');

    if (colError) {
      console.error('❌ Error al obtener columnas:', colError.message);
      return;
    }

    const existingColumns = columns.map(col => col.column_name);
    console.log('📊 Columnas existentes:', existingColumns.join(', '));

    // Columnas que necesitamos
    const requiredColumns = [
      { name: 'user_id', type: 'UUID' },
      { name: 'variables', type: 'TEXT[]', default: "'{}'" },
      { name: 'is_default', type: 'BOOLEAN', default: 'FALSE' },
      { name: 'is_system', type: 'BOOLEAN', default: 'FALSE' },
      { name: 'is_active', type: 'BOOLEAN', default: 'FALSE' }
    ];

    for (const col of requiredColumns) {
      if (!existingColumns.includes(col.name)) {
        console.log(`📝 Agregando columna faltante: ${col.name}`);
        const defaultClause = col.default ? ` DEFAULT ${col.default}` : '';
        const sql = `ALTER TABLE prompts ADD COLUMN IF NOT EXISTS ${col.name} ${col.type}${defaultClause};`;
        
        try {
          const { error } = await supabase.rpc('exec_sql', { sql });
          if (error) throw error;
          console.log(`✅ Columna ${col.name} agregada`);
        } catch (err) {
          console.log(`⚠️  Error al agregar ${col.name}:`, err.message);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error al verificar columnas:', error.message);
  }
}

// Ejecutar
createPromptsTableStepByStep();