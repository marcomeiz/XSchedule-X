// Usar el endpoint de administración del servidor para crear la tabla
const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3000';

async function createTableViaAdmin() {
  console.log('🚀 Usando endpoint de administración para crear tabla prompts...');
  
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
      console.log('✅ Tabla procesada exitosamente:', result.message);
    } else {
      console.log('⚠️  Resultado del endpoint:', result.error || 'Error desconocido');
      if (result.sql) {
        console.log('📝 SQL sugerido por el servidor:');
        console.log(result.sql);
      }
    }
    
  } catch (error) {
    console.error('❌ Error de red:', error.message);
  }
}

// Ejecutar
createTableViaAdmin();