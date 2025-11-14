// Enhanced Configuration State Management
let configState = {
  prompts: {
    all: [],
    current: null,
    system: [],
    user: []
  },
  llm: {},
  api: {},
  app: {},
  content: {},
  timeline: {}
};

let currentPromptId = null;
let unsavedChanges = false;
let originalConfig = null;

// Initialize enhanced configuration system
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 Initializing enhanced XSchedule-X configuration...');
  await loadEnhancedConfiguration();
  setupEventListeners();
  
  // Check if we're in configuration mode
  if (window.location.pathname.includes('config')) {
    showConfigSection('prompts');
  }
});

/**
 * Load enhanced configuration from server
 */
async function loadEnhancedConfiguration() {
  try {
    const res = await fetch('/api/config');
    const data = await res.json();
    
    if (data.success !== false) {
      // Parse the enhanced configuration structure
      configState = {
        prompts: data.prompts || { all: [], current: null, system: [], user: [] },
        llm: data.config?.llm || {},
        api: data.config?.api || {},
        app: data.config?.app || {},
        content: data.config?.content || {},
        timeline: data.config?.timeline || {}
      };
      
      originalConfig = JSON.parse(JSON.stringify(configState));
      populateEnhancedConfigUI();
      updateUnsavedChangesWarning();
      
      console.log('✅ Enhanced configuration loaded successfully');
      console.log(`📊 Storage type: ${data.storage_type || 'local'}`);
      console.log(`📝 Total prompts: ${configState.prompts.all.length}`);
      console.log(`⚙️  System prompts: ${configState.prompts.system.length}`);
      console.log(`👤 User prompts: ${configState.prompts.user.length}`);
      
      if (configState.prompts.current) {
        console.log(`🎯 Current prompt: ${configState.prompts.current.name}`);
      }
    } else {
      console.error('Error loading enhanced configuration:', data.error);
      showNotification('Error al cargar configuración mejorada', 'error');
    }
  } catch (error) {
    console.error('Error loading enhanced configuration:', error);
    showNotification('Error al cargar configuración mejorada', 'error');
  }
}

/**
 * Populate enhanced configuration UI
 */
function populateEnhancedConfigUI() {
  // Populate LLM settings
  if (configState.llm) {
    const elements = {
      'llm-provider': configState.llm.provider,
      'llm-model': configState.llm.model,
      'llm-temperature': configState.llm.temperature,
      'llm-top-p': configState.llm.top_p,
      'llm-max-tokens': configState.llm.max_tokens,
      'llm-api-key': configState.llm.apiKey,
      'llm-endpoint': configState.llm.endpoint
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && value !== undefined) {
        element.value = value;
      }
    });
  }
  
  // Populate API settings
  if (configState.api) {
    if (configState.api.twitter) {
      const elements = {
        'twitter-api-key': configState.api.twitter.apiKey,
        'twitter-api-secret': configState.api.twitter.apiSecret,
        'twitter-access-token': configState.api.twitter.accessToken,
        'twitter-access-secret': configState.api.twitter.accessSecret,
        'twitter-bearer-token': configState.api.twitter.bearerToken
      };
      
      Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && value !== undefined) {
          element.value = value;
        }
      });
    }
    
    if (configState.api.supabase) {
      const elements = {
        'supabase-url': configState.api.supabase.url,
        'supabase-anon-key': configState.api.supabase.anonKey,
        'supabase-service-key': configState.api.supabase.serviceKey
      };
      
      Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element && value !== undefined) {
          element.value = value;
        }
      });
    }
  }
  
  // Populate app settings
  if (configState.app) {
    const elements = {
      'auto-save': configState.app.autoSave,
      'auto-save-interval': configState.app.autoSaveInterval,
      'notifications': configState.app.notifications,
      'theme': configState.app.theme,
      'language': configState.app.language,
      'content-max-length': configState.app.contentMaxLength,
      'content-min-length': configState.app.contentMinLength,
      'quality-threshold': configState.app.qualityThreshold
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && value !== undefined) {
        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else {
          element.value = value;
        }
      }
    });
  }
  
  // Populate content settings
  if (configState.content) {
    const elements = {
      'content-max-length-global': configState.content.maxLength,
      'content-min-length-global': configState.content.minLength,
      'quality-threshold-global': configState.content.qualityThreshold,
      'enable-ai': configState.content.enableAI
    };
    
    Object.entries(elements).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element && value !== undefined) {
        if (element.type === 'checkbox') {
          element.checked = Boolean(value);
        } else {
          element.value = value;
        }
      }
    });
  }
  
  // Render prompts list
  renderEnhancedPromptsList();
}

/**
 * Render enhanced prompts list with system and user separation
 */
function renderEnhancedPromptsList() {
  const promptsList = document.getElementById('promptsList');
  
  if (!promptsList) {
    console.warn('Elemento promptsList no encontrado');
    return;
  }
  
  if (!configState.prompts.all || configState.prompts.all.length === 0) {
    promptsList.innerHTML = '<div class="empty-state">No hay prompts disponibles</div>';
    return;
  }
  
  // Separate system and user prompts
  const systemPrompts = configState.prompts.all.filter(p => p.is_system);
  const userPrompts = configState.prompts.all.filter(p => !p.is_system);
  
  let html = '';
  
  // System prompts section
  if (systemPrompts.length > 0) {
    html += '<div class="prompts-section">';
    html += '<h3 class="section-title">🛠️ Prompts del Sistema</h3>';
    html += '<p class="section-description">Estos prompts están siempre disponibles y sirven como respaldo</p>';
    
    systemPrompts.forEach(prompt => {
      const isCurrent = configState.prompts.current && configState.prompts.current.id === prompt.id;
      html += createPromptCard(prompt, isCurrent, true);
    });
    
    html += '</div>';
  }
  
  // User prompts section
  if (userPrompts.length > 0) {
    html += '<div class="prompts-section">';
    html += '<h3 class="section-title">👤 Tus Prompts</h3>';
    html += '<p class="section-description">Tus prompts personalizados almacenados de forma segura</p>';
    
    userPrompts.forEach(prompt => {
      const isCurrent = configState.prompts.current && configState.prompts.current.id === prompt.id;
      html += createPromptCard(prompt, isCurrent, false);
    });
    
    html += '</div>';
  }
  
  promptsList.innerHTML = html;
}

/**
 * Create a prompt card HTML
 */
function createPromptCard(prompt, isCurrent, isSystem) {
  const currentBadge = isCurrent ? '<span class="current-badge">✅ ACTUAL</span>' : '';
  const systemBadge = isSystem ? '<span class="system-badge">🛠️ SISTEMA</span>' : '';
  const typeBadges = `${currentBadge} ${systemBadge}`.trim();
  
  return `
    <div class="prompt-card ${isCurrent ? 'current' : ''}" data-prompt-id="${prompt.id}">
      <div class="prompt-header">
        <div class="prompt-info">
          <h4 class="prompt-name">${escapeHtml(prompt.name)}</h4>
          <div class="prompt-badges">${typeBadges}</div>
        </div>
        <div class="prompt-actions">
          ${!isSystem ? `<button onclick="editPrompt('${prompt.id}')" class="btn-text">Editar</button>` : ''}
          ${!isSystem ? `<button onclick="deletePrompt('${prompt.id}')" class="btn-text btn-danger">Eliminar</button>` : ''}
          ${!isCurrent ? `<button onclick="setCurrentPrompt('${prompt.id}')" class="btn-primary">Usar</button>` : ''}
        </div>
      </div>
      <div class="prompt-content">
        ${escapeHtml(prompt.content.substring(0, 150))}${prompt.content.length > 150 ? '...' : ''}
      </div>
      <div class="prompt-meta">
        <span class="prompt-date">${formatDate(prompt.updated_at)}</span>
        ${prompt.variables && prompt.variables.length > 0 ? 
          `<span class="prompt-variables">Variables: ${prompt.variables.join(', ')}</span>` : ''
        }
      </div>
    </div>
  `;
}

/**
 * Set current prompt
 */
async function setCurrentPrompt(promptId) {
  try {
    const prompt = configState.prompts.all.find(p => p.id === promptId);
    if (!prompt) {
      showNotification('Prompt no encontrado', 'error');
      return;
    }
    
    const res = await fetch(`/api/config/prompts/${promptId}/set-current`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });
    
    const data = await res.json();
    
    if (data.success) {
      configState.prompts.current = prompt;
      renderEnhancedPromptsList();
      showNotification(`Prompt "${prompt.name}" establecido como actual`, 'success');
      
      // Update the current prompt display in the main interface
      updateCurrentPromptDisplay();
    } else {
      showNotification('Error al establecer prompt actual: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error setting current prompt:', error);
    showNotification('Error al establecer prompt actual', 'error');
  }
}

/**
 * Create new prompt
 */
async function saveEnhancedPrompt() {
  const name = document.getElementById('promptName')?.value.trim();
  const content = document.getElementById('promptContent')?.value.trim();
  const variablesInput = document.getElementById('promptVariables')?.value.trim();
  
  if (!name || !content) {
    showNotification('Nombre y contenido son requeridos', 'error');
    return;
  }
  
  const variables = variablesInput ? 
    variablesInput.split(',').map(v => v.trim()).filter(v => v) : [];
  
  try {
    const res = await fetch('/api/config/prompts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, content, variables })
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Reload configuration to get updated prompt list
      await loadEnhancedConfiguration();
      
      // Clear form
      document.getElementById('promptName').value = '';
      document.getElementById('promptContent').value = '';
      document.getElementById('promptVariables').value = '';
      
      showNotification(`Prompt "${name}" creado exitosamente`, 'success');
      
      // Hide editor and show list
      document.getElementById('promptEditor')?.classList.add('hidden');
      document.getElementById('promptsList')?.classList.remove('hidden');
    } else {
      showNotification('Error al crear prompt: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error creating prompt:', error);
    showNotification('Error al crear prompt', 'error');
  }
}

/**
 * Update current prompt display in main interface
 */
function updateCurrentPromptDisplay() {
  const currentPromptElement = document.getElementById('currentPromptDisplay');
  if (currentPromptElement && configState.prompts.current) {
    currentPromptElement.innerHTML = `
      <div class="current-prompt-info">
        <strong>Prompt Actual:</strong> ${escapeHtml(configState.prompts.current.name)}
        <br><small>${escapeHtml(configState.prompts.current.content.substring(0, 100))}...</small>
      </div>
    `;
  }
}

/**
 * Enhanced save configuration
 */
async function saveEnhancedConfiguration() {
  try {
    const configData = {
      llm: {
        provider: getElementValue('llm-provider'),
        model: getElementValue('llm-model'),
        temperature: getNumericValue('llm-temperature'),
        top_p: getNumericValue('llm-top-p'),
        max_tokens: getNumericValue('llm-max-tokens'),
        apiKey: getElementValue('llm-api-key'),
        endpoint: getElementValue('llm-endpoint')
      },
      api: {
        twitter: {
          apiKey: getElementValue('twitter-api-key'),
          apiSecret: getElementValue('twitter-api-secret'),
          accessToken: getElementValue('twitter-access-token'),
          accessSecret: getElementValue('twitter-access-secret'),
          bearerToken: getElementValue('twitter-bearer-token')
        },
        supabase: {
          url: getElementValue('supabase-url'),
          anonKey: getElementValue('supabase-anon-key'),
          serviceKey: getElementValue('supabase-service-key')
        }
      },
      app: {
        autoSave: getElementValue('auto-save'),
        autoSaveInterval: getNumericValue('auto-save-interval'),
        notifications: getElementValue('notifications'),
        theme: getElementValue('theme'),
        language: getElementValue('language'),
        contentMaxLength: getNumericValue('content-max-length'),
        contentMinLength: getNumericValue('content-min-length'),
        qualityThreshold: getNumericValue('quality-threshold')
      },
      content: {
        maxLength: getNumericValue('content-max-length-global'),
        minLength: getNumericValue('content-min-length-global'),
        qualityThreshold: getNumericValue('quality-threshold-global'),
        enableAI: getElementValue('enable-ai'),
        variants: configState.content?.variants || {}
      },
      timeline: {
        defaultSlots: getNumericValue('default-slots'),
        defaultInterval: getNumericValue('default-interval'),
        defaultMonths: getNumericValue('default-months'),
        defaultWorkStart: getElementValue('default-work-start'),
        defaultWorkEnd: getElementValue('default-work-end'),
        defaultTimezone: getElementValue('default-timezone')
      }
    };
    
    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(configData)
    });
    
    const data = await res.json();
    
    if (data.success) {
      // Reload configuration to reflect changes
      await loadEnhancedConfiguration();
      unsavedChanges = false;
      updateUnsavedChangesWarning();
      showNotification('Configuración guardada exitosamente', 'success');
      
      // Show restart warning if Supabase settings changed
      const oldSupabaseUrl = configState.api?.supabase?.url;
      const newSupabaseUrl = configData.api.supabase.url;
      if (oldSupabaseUrl !== newSupabaseUrl && newSupabaseUrl) {
        showNotification('⚠️ Los cambios en Supabase requieren reiniciar la aplicación', 'warning');
      }
    } else {
      showNotification('Error al guardar configuración: ' + data.error, 'error');
    }
  } catch (error) {
    console.error('Error saving configuration:', error);
    showNotification('Error al guardar configuración', 'error');
  }
}

/**
 * Utility functions
 */
function getElementValue(elementId) {
  const element = document.getElementById(elementId);
  if (!element) return null;
  
  if (element.type === 'checkbox') {
    return element.checked;
  }
  
  const value = element.value.trim();
  return value === '' ? null : value;
}

function getNumericValue(elementId) {
  const value = getElementValue(elementId);
  return value === null ? null : parseFloat(value);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-MX', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return 'Fecha inválida';
  }
}

function showNotification(message, type = 'info') {
  // Implementation depends on your notification system
  console.log(`[${type.toUpperCase()}] ${message}`);
  
  // You can integrate with your existing notification system here
  if (typeof showNotification === 'function') {
    showNotification(message, type);
  }
}

function updateUnsavedChangesWarning() {
  // Implementation depends on your existing system
  if (typeof updateUnsavedChangesWarning === 'function') {
    updateUnsavedChangesWarning();
  }
}

function setupEventListeners() {
  // Setup enhanced event listeners for the new system
  // This would include handlers for prompt creation, editing, etc.
  console.log('✅ Enhanced event listeners configured');
}

// Export functions for use in other parts of the application
window.loadEnhancedConfiguration = loadEnhancedConfiguration;
window.saveEnhancedPrompt = saveEnhancedPrompt;
window.setCurrentPrompt = setCurrentPrompt;
window.renderEnhancedPromptsList = renderEnhancedPromptsList;