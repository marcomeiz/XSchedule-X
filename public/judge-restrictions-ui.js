/**
 * UI Controller para gestión de restricciones del judge
 */

class JudgeRestrictionsUI {
  constructor() {
    this.currentRestrictions = [];
    this.currentEditingId = null;
    this.isLoading = false;
  }

  async init() {
    await this.loadRestrictions();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Tab switching
    document.addEventListener('tabChanged', (e) => {
      if (e.detail.tab === 'judge') {
        this.loadRestrictions();
      }
    });
  }

  async loadRestrictions() {
    if (this.isLoading) return;
    
    this.isLoading = true;
    this.showLoading();

    try {
      const healthRes = await fetch('/api/health');
      const health = await healthRes.json().catch(() => ({ supabase: false }));
      if (!health.supabase) {
        this.showError('Supabase no configurado. Configura SUPABASE_URL y SUPABASE_ANON_KEY en el servidor.');
        return;
      }
      const restrictions = await window.judgeRestrictionsService.getAllRestrictions();
      this.currentRestrictions = restrictions;
      this.renderRestrictionsList();
    } catch (error) {
      console.error('Error loading restrictions:', error);
      this.showError('Error al cargar las restricciones: ' + error.message);
    } finally {
      this.isLoading = false;
      this.hideLoading();
    }
  }

  showLoading() {
    const container = document.getElementById('judgeRestrictionsList');
    container.innerHTML = `
      <div class="loading-indicator">
        <i class="fas fa-spinner fa-spin"></i> Cargando restricciones...
      </div>
    `;
  }

  hideLoading() {
    // El loading se reemplaza con el contenido real
  }

  showError(message) {
    const container = document.getElementById('judgeRestrictionsList');
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-exclamation-triangle" style="color: #ef4444; font-size: 2rem; margin-bottom: 1rem;"></i>
        <p>${message}</p>
        <button onclick="window.judgeRestrictionsUI.loadRestrictions()" class="btn btn-primary">
          <i class="fas fa-redo"></i> Reintentar
        </button>
      </div>
    `;
  }

  renderRestrictionsList() {
    const container = document.getElementById('judgeRestrictionsList');
    
    if (!this.currentRestrictions || this.currentRestrictions.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-gavel" style="font-size: 2rem; margin-bottom: 1rem;"></i>
          <p>No hay configuraciones de restricciones creadas</p>
          <button onclick="window.judgeRestrictionsUI.showCreateForm()" class="btn btn-primary">
            <i class="fas fa-plus"></i> Crear Primera Configuración
          </button>
        </div>
      `;
      return;
    }

    const activeRestriction = this.currentRestrictions.find(r => r.is_active);

    container.innerHTML = `
      <div class="section-header" style="margin-bottom: 1.5rem;">
        <div>
          <h3 style="margin: 0; color: #1e293b;">Configuraciones Guardadas</h3>
          <p style="margin: 0.5rem 0; color: #64748b; font-size: 0.875rem;">
            Gestiona las configuraciones de restricciones del judge
          </p>
        </div>
        <button onclick="window.judgeRestrictionsUI.showCreateForm()" class="btn btn-primary">
          <i class="fas fa-plus"></i> Nueva Configuración
        </button>
      </div>
      
      <div class="restrictions-grid">
        ${this.currentRestrictions.map(restriction => this.renderRestrictionCard(restriction, activeRestriction?.id === restriction.id)).join('')}
      </div>
    `;
  }

  renderRestrictionCard(restriction, isActive) {
    const createdDate = new Date(restriction.created_at).toLocaleDateString('es-ES');
    const updatedDate = new Date(restriction.updated_at).toLocaleDateString('es-ES');

    return `
      <div class="restriction-card ${isActive ? 'active' : ''}" data-id="${restriction.id}">
        <div class="restriction-header">
          <div class="restriction-info">
            <h4>${restriction.name}</h4>
            ${restriction.description ? `<p>${restriction.description}</p>` : ''}
            <div style="margin-top: 0.5rem;">
              <span class="restriction-status ${restriction.is_active ? 'active' : 'inactive'}">
                <i class="fas fa-${restriction.is_active ? 'check-circle' : 'circle'}"></i>
                ${restriction.is_active ? 'Activa' : 'Inactiva'}
              </span>
              <small style="color: #64748b; margin-left: 1rem;">
                <i class="fas fa-calendar"></i> Creada: ${createdDate}
              </small>
            </div>
          </div>
        </div>
        
        <div class="restriction-summary" style="margin: 1rem 0; font-size: 0.875rem; color: #64748b;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem;">
            <div><strong>Longitud:</strong> ${restriction.min_length}-${restriction.max_length}</div>
            <div><strong>Similitud:</strong> ${restriction.min_similarity}-${restriction.max_similarity}</div>
            <div><strong>IA Detección:</strong> ${restriction.ai_cop_threshold}</div>
            <div><strong>Prohibidas:</strong> ${restriction.banned_substrings?.length || 0}</div>
          </div>
        </div>
        
        <div class="restriction-actions">
          ${!isActive ? `
            <button onclick="window.judgeRestrictionsUI.activateRestriction('${restriction.id}')" class="btn btn-success btn-sm">
              <i class="fas fa-play"></i> Activar
            </button>
          ` : ''}
          <button onclick="window.judgeRestrictionsUI.editRestriction('${restriction.id}')" class="btn btn-outline btn-sm">
            <i class="fas fa-edit"></i> Editar
          </button>
          ${!restriction.is_default ? `
            <button onclick="window.judgeRestrictionsUI.deleteRestriction('${restriction.id}')" class="btn btn-danger btn-sm">
              <i class="fas fa-trash"></i> Eliminar
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }

  showCreateForm() {
    this.currentEditingId = null;
    this.showEditForm(window.judgeRestrictionsService.getDefaultConfiguration());
  }

  editRestriction(id) {
    const restriction = this.currentRestrictions.find(r => r.id === id);
    if (!restriction) return;
    
    this.currentEditingId = id;
    this.showEditForm(restriction);
  }

  showEditForm(restrictionData) {
    const editor = document.getElementById('judgeRestrictionEditor');
    const list = document.getElementById('judgeRestrictionsList');
    
    // Rellenar formulario
    document.getElementById('restrictionName').value = restrictionData.name || '';
    document.getElementById('restrictionDescription').value = restrictionData.description || '';
    document.getElementById('minLength').value = restrictionData.min_length || 40;
    document.getElementById('maxLength').value = restrictionData.max_length || 280;
    document.getElementById('replyMinLength').value = restrictionData.mode_length_limits?.reply?.[0] || 20;
    document.getElementById('replyMaxLength').value = restrictionData.mode_length_limits?.reply?.[1] || 220;
    document.getElementById('minSimilarity').value = restrictionData.min_similarity || 0.35;
    document.getElementById('maxSimilarity').value = restrictionData.max_similarity || 0.97;
    document.getElementById('replyMinContextSim').value = restrictionData.reply_min_context_similarity || 0.32;
    document.getElementById('replyMaxContextSim').value = restrictionData.reply_max_context_similarity || 0.92;
    document.getElementById('aiCopThreshold').value = restrictionData.ai_cop_threshold || 0.5;
    document.getElementById('checklistPattern').value = restrictionData.checklist_pattern || '^\\s*(\\d+\\.|[-*])\\s+.*$';
    
    // Arrays
    document.getElementById('bannedSubstrings').value = (restrictionData.banned_substrings || []).join('\n');
    document.getElementById('bannedPrefixes').value = (restrictionData.banned_prefixes || []).join('\n');
    document.getElementById('replyBannedHooks').value = (restrictionData.reply_banned_hooks || []).join('\n');
    
    // Mostrar editor, ocultar lista
    editor.classList.remove('hidden');
    list.style.display = 'none';
  }

  async saveRestriction() {
    const restrictionData = this.getFormData();
    
    // Validar
    const validation = window.judgeRestrictionsService.validateRestriction(restrictionData);
    if (!validation.isValid) {
      this.showValidationErrors(validation.errors);
      return;
    }

    try {
      let result;
      if (this.currentEditingId) {
        result = await window.judgeRestrictionsService.updateRestriction(this.currentEditingId, restrictionData);
      } else {
        result = await window.judgeRestrictionsService.createRestriction(restrictionData);
      }
      
      this.hideEditForm();
      await this.loadRestrictions();
      this.showSuccess('Configuración guardada exitosamente');
    } catch (error) {
      console.error('Error saving restriction:', error);
      this.showError('Error al guardar la configuración: ' + error.message);
    }
  }

  getFormData() {
    return {
      name: document.getElementById('restrictionName').value.trim(),
      description: document.getElementById('restrictionDescription').value.trim(),
      min_length: parseInt(document.getElementById('minLength').value),
      max_length: parseInt(document.getElementById('maxLength').value),
      mode_length_limits: {
        reply: [
          parseInt(document.getElementById('replyMinLength').value),
          parseInt(document.getElementById('replyMaxLength').value)
        ]
      },
      min_similarity: parseFloat(document.getElementById('minSimilarity').value),
      max_similarity: parseFloat(document.getElementById('maxSimilarity').value),
      reply_min_context_similarity: parseFloat(document.getElementById('replyMinContextSim').value),
      reply_max_context_similarity: parseFloat(document.getElementById('replyMaxContextSim').value),
      ai_cop_threshold: parseFloat(document.getElementById('aiCopThreshold').value),
      checklist_pattern: document.getElementById('checklistPattern').value.trim(),
      banned_substrings: document.getElementById('bannedSubstrings').value.split('\n').filter(s => s.trim()),
      banned_prefixes: document.getElementById('bannedPrefixes').value.split('\n').filter(s => s.trim()),
      reply_banned_hooks: document.getElementById('replyBannedHooks').value.split('\n').filter(s => s.trim())
    };
  }

  hideEditForm() {
    const editor = document.getElementById('judgeRestrictionEditor');
    const list = document.getElementById('judgeRestrictionsList');
    
    editor.classList.add('hidden');
    list.style.display = 'block';
    this.currentEditingId = null;
  }

  cancelEdit() {
    this.hideEditForm();
  }

  async activateRestriction(id) {
    if (!confirm('¿Activar esta configuración? Las demás configuraciones se desactivarán.')) {
      return;
    }

    try {
      await window.judgeRestrictionsService.activateRestriction(id);
      await this.loadRestrictions();
      this.showSuccess('Configuración activada exitosamente');
    } catch (error) {
      console.error('Error activating restriction:', error);
      this.showError('Error al activar la configuración: ' + error.message);
    }
  }

  async deleteRestriction(id) {
    const restriction = this.currentRestrictions.find(r => r.id === id);
    if (!restriction) return;

    if (!confirm(`¿Eliminar la configuración "${restriction.name}"? Esta acción no se puede deshacer.`)) {
      return;
    }

    try {
      await window.judgeRestrictionsService.deleteRestriction(id);
      await this.loadRestrictions();
      this.showSuccess('Configuración eliminada exitosamente');
    } catch (error) {
      console.error('Error deleting restriction:', error);
      this.showError('Error al eliminar la configuración: ' + error.message);
    }
  }

  showValidationErrors(errors) {
    const errorMessages = Object.values(errors).join('\n');
    alert('Por favor corrige los siguientes errores:\n\n' + errorMessages);
  }

  showSuccess(message) {
    // Crear notificación temporal
    const notification = document.createElement('div');
    notification.className = 'success-notification';
    notification.innerHTML = `
      <i class="fas fa-check-circle"></i>
      <span>${message}</span>
    `;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: #10b981;
      color: white;
      padding: 1rem 1.5rem;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 1000;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      animation: slideIn 0.3s ease;
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
      notification.style.animation = 'slideOut 0.3s ease';
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}

// Crear instancia global
window.judgeRestrictionsUI = new JudgeRestrictionsUI();

// Funciones globales para los botones HTML
window.saveJudgeRestriction = function () {
  window.judgeRestrictionsUI.saveRestriction();
}

window.cancelJudgeRestrictionEdit = function () {
  window.judgeRestrictionsUI.cancelEdit();
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => window.judgeRestrictionsUI.init());
} else {
  window.judgeRestrictionsUI.init();
}
