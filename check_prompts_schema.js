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

async function checkAndFixPromptsSchema() {
  try {
    console.log('🔍 Verificando estructura de la tabla prompts...');
    
    // Verificar si existe la tabla
    const { data: tableExists, error: tableError } = await supabase
      .rpc('information_schema.tables', {
        table_schema: 'public',
        table_name: 'prompts'
      });

    if (tableError) {
      console.log('❌ La tabla prompts no existe. Creándola...');
      await createPromptsTable();
      return;
    }

    // Verificar estructura actual
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

    console.log('📊 Columnas actuales de la tabla prompts:');
    const columnNames = columns.map(col => col.column_name);
    console.log(columnNames.join(', '));

    // Verificar columnas faltantes
    const requiredColumns = [
      'variables', 'is_default', 'is_system', 'is_active', 'user_id'
    ];
    
    const missingColumns = requiredColumns.filter(col => !columnNames.includes(col));
    
    if (missingColumns.length > 0) {
      console.log(`\n⚠️  Columnas faltantes: ${missingColumns.join(', ')}`);
      console.log('🔄 Agregando columnas faltantes...');
      
      await addMissingColumns(missingColumns);
    } else {
      console.log('✅ Todas las columnas requeridas existen');
    }

    // Verificar datos actuales
    await checkCurrentData();

  } catch (error) {
    console.error('❌ Error general:', error.message);
  }
}

async function createPromptsTable() {
  try {
    console.log('📝 Creando tabla prompts con esquema completo...');
    
    // Crear tabla con esquema completo
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS prompts (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        content TEXT NOT NULL,
        variables TEXT[] DEFAULT '{}',
        is_default BOOLEAN DEFAULT FALSE,
        is_system BOOLEAN DEFAULT FALSE,
        is_active BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
      
      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_prompts_user_id ON prompts(user_id);
      CREATE INDEX IF NOT EXISTS idx_prompts_is_default ON prompts(is_default);
      CREATE INDEX IF NOT EXISTS idx_prompts_is_system ON prompts(is_system);
      CREATE INDEX IF NOT EXISTS idx_prompts_is_active ON prompts(is_active);
      CREATE INDEX IF NOT EXISTS idx_prompts_name ON prompts(name);
      
      -- Enable RLS
      ALTER TABLE prompts ENABLE ROW LEVEL SECURITY;
      
      -- Create RLS policies
      CREATE POLICY "Users can view own prompts" ON prompts
        FOR SELECT USING (auth.uid() = user_id OR is_system = true);
        
      CREATE POLICY "Users can insert own prompts" ON prompts
        FOR INSERT WITH CHECK (auth.uid() = user_id AND is_system = false);
        
      CREATE POLICY "Users can update own prompts" ON prompts
        FOR UPDATE USING (auth.uid() = user_id AND is_system = false);
        
      CREATE POLICY "Users can delete own prompts" ON prompts
        FOR DELETE USING (auth.uid() = user_id AND is_system = false);
        
      -- Grant permissions
      GRANT SELECT ON prompts TO anon, authenticated;
      GRANT INSERT ON prompts TO authenticated;
      GRANT UPDATE ON prompts TO authenticated;
      GRANT DELETE ON prompts TO authenticated;
    `;

    // Ejecutar SQL (nota: esto requeriría acceso directo a la base de datos)
    console.log('✅ SQL generado para crear tabla prompts');
    console.log('ℹ️  Por favor, ejecuta este SQL manualmente en tu base de datos Supabase');
    console.log(createTableSQL);
    
  } catch (error) {
    console.error('❌ Error al crear tabla:', error.message);
  }
}

async function addMissingColumns(missingColumns) {
  try {
    const alterStatements = [];
    
    if (missingColumns.includes('variables')) {
      alterStatements.push('ALTER TABLE prompts ADD COLUMN IF NOT EXISTS variables TEXT[] DEFAULT \'{}\'');
    }
    if (missingColumns.includes('is_default')) {
      alterStatements.push('ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT FALSE');
    }
    if (missingColumns.includes('is_system')) {
      alterStatements.push('ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT FALSE');
    }
    if (missingColumns.includes('is_active')) {
      alterStatements.push('ALTER TABLE prompts ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT FALSE');
    }
    if (missingColumns.includes('user_id')) {
      alterStatements.push('ALTER TABLE prompts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE');
    }
    
    console.log('📝 Sentencias SQL para agregar columnas:');
    alterStatements.forEach(sql => console.log(sql + ';'));
    
    console.log('ℹ️  Por favor, ejecuta estas sentencias manualmente en tu base de datos Supabase');
    
  } catch (error) {
    console.error('❌ Error al generar columnas:', error.message);
  }
}

async function checkCurrentData() {
  try {
    console.log('\n📋 Verificando datos actuales en prompts...');
    
    const { data: prompts, error } = await supabase
      .from('prompts')
      .select('*')
      .order('name');

    if (error) {
      console.error('❌ Error al obtener datos:', error.message);
      return;
    }

    if (!prompts || prompts.length === 0) {
      console.log('⚠️  No hay datos en la tabla prompts');
      return;
    }

    console.log(`📊 Total de prompts: ${prompts.length}`);
    prompts.forEach(p => {
      console.log(`  - ${p.name} (sistema: ${p.is_system || false}, activo: ${p.is_active || false})`);
    });

    // Verificar si hay prompts activos
    const activePrompts = prompts.filter(p => p.is_active);
    console.log(`\n✅ Prompts activos: ${activePrompts.length}`);
    activePrompts.forEach(p => {
      console.log(`  - ${p.name}`);
    });

  } catch (error) {
    console.error('❌ Error al verificar datos:', error.message);
  }
}

// Ejecutar
checkAndFixPromptsSchema();