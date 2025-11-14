// Script para crear la tabla de prompts usando el endpoint de administración
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function createPromptsTable() {
  console.log('🚀 Creando tabla prompts usando endpoint de administración...');
  
  try {
    const response = await fetch(`${SERVER_URL}/api/admin/create-prompts-table`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const result = await response.json();
    
    if (result.success) {
      console.log('✅ Tabla creada exitosamente:', result.message);
    } else {
      console.log('⚠️  Resultado:', result.error || 'Error desconocido');
      if (result.sql) {
        console.log('📝 SQL sugerido:', result.sql);
      }
    }
    
  } catch (error) {
    console.error('❌ Error de red:', error.message);
  }
}

// Ejecutar
createPromptsTable();