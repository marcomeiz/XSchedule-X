/**
 * Servicio para gestionar restricciones del judge en el frontend
 */

const JUDGE_RESTRICTIONS_ENDPOINTS = {
  list: '/api/config/judge-restrictions',
  current: '/api/config/judge-restrictions/current',
  create: '/api/config/judge-restrictions',
  update: (id) => `/api/config/judge-restrictions/${id}`,
  delete: (id) => `/api/config/judge-restrictions/${id}`,
  activate: (id) => `/api/config/judge-restrictions/${id}/activate`
};

class JudgeRestrictionsService {
  constructor(authToken = null) {
    this.authToken = authToken;
  }

  setAuthToken(token) {
    this.authToken = token;
  }

  async makeRequest(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Obtener todas las restricciones del usuario
   */
  async getAllRestrictions() {
    const data = await this.makeRequest(JUDGE_RESTRICTIONS_ENDPOINTS.list);
    return data.restrictions;
  }

  /**
   * Obtener la restricción activa actual
   */
  async getCurrentRestriction() {
    const data = await this.makeRequest(JUDGE_RESTRICTIONS_ENDPOINTS.current);
    return data.restriction;
  }

  /**
   * Crear nueva restricción
   */
  async createRestriction(restrictionData) {
    const data = await this.makeRequest(JUDGE_RESTRICTIONS_ENDPOINTS.create, {
      method: 'POST',
      body: JSON.stringify(restrictionData)
    });
    return data.restriction;
  }

  /**
   * Actualizar restricción existente
   */
  async updateRestriction(id, restrictionData) {
    const data = await this.makeRequest(JUDGE_RESTRICTIONS_ENDPOINTS.update(id), {
      method: 'PUT',
      body: JSON.stringify(restrictionData)
    });
    return data.restriction;
  }

  /**
   * Eliminar restricción
   */
  async deleteRestriction(id) {
    await this.makeRequest(JUDGE_RESTRICTIONS_ENDPOINTS.delete(id), {
      method: 'DELETE'
    });
    return true;
  }

  /**
   * Activar restricción (desactiva las demás)
   */
  async activateRestriction(id) {
    const data = await this.makeRequest(JUDGE_RESTRICTIONS_ENDPOINTS.activate(id), {
      method: 'POST'
    });
    return data.restriction;
  }

  /**
   * Obtener configuración por defecto
   */
  getDefaultConfiguration() {
    return {
      name: 'Default Judge Configuration',
      description: 'Default configuration for judge restrictions',
      min_length: 40,
      max_length: 280,
      mode_length_limits: { reply: [20, 220] },
      min_similarity: 0.35,
      max_similarity: 0.97,
      reply_min_context_similarity: 0.32,
      reply_max_context_similarity: 0.92,
      banned_substrings: [
        "as an ai",
        "as a language model", 
        "chatgpt",
        "hustle",
        "crush your goals",
        "mindset de éxito",
        "emprende o muere",
        "querido fundador",
        "inspirational quote",
        "build something real",
        "that's when the real building happens",
        "guard this time like it's gold",
        "focus on real results",
        "if you want to build something real",
        "you feel important, but you're not getting anywhere"
      ],
      banned_prefixes: [
        "here are",
        "in this thread", 
        "as a founder you must",
        "debes entender que"
      ],
      reply_banned_hooks: [
        "this hits",
        "yep",
        "oof", 
        "love this"
      ],
      ai_cop_threshold: 0.5,
      checklist_pattern: '^\\s*(\\d+\\.|[-*])\\s+.*$',
      is_active: true,
      is_default: false
    };
  }

  /**
   * Validar configuración de restricción
   */
  validateRestriction(restriction) {
    const errors = {};

    if (!restriction.name || restriction.name.trim().length === 0) {
      errors.name = 'Name is required';
    }

    if (restriction.min_length !== undefined) {
      if (typeof restriction.min_length !== 'number' || restriction.min_length < 1) {
        errors.min_length = 'Min length must be a positive number';
      }
    }

    if (restriction.max_length !== undefined) {
      if (typeof restriction.max_length !== 'number' || restriction.max_length < 1) {
        errors.max_length = 'Max length must be a positive number';
      }
    }

    if (restriction.min_length && restriction.max_length) {
      if (restriction.min_length > restriction.max_length) {
        errors.min_length = 'Min length must be less than max length';
        errors.max_length = 'Max length must be greater than min length';
      }
    }

    if (restriction.min_similarity !== undefined) {
      if (typeof restriction.min_similarity !== 'number' || restriction.min_similarity < 0 || restriction.min_similarity > 1) {
        errors.min_similarity = 'Min similarity must be between 0 and 1';
      }
    }

    if (restriction.max_similarity !== undefined) {
      if (typeof restriction.max_similarity !== 'number' || restriction.max_similarity < 0 || restriction.max_similarity > 1) {
        errors.max_similarity = 'Max similarity must be between 0 and 1';
      }
    }

    if (restriction.min_similarity && restriction.max_similarity) {
      if (restriction.min_similarity > restriction.max_similarity) {
        errors.min_similarity = 'Min similarity must be less than max similarity';
        errors.max_similarity = 'Max similarity must be greater than min similarity';
      }
    }

    if (restriction.ai_cop_threshold !== undefined) {
      if (typeof restriction.ai_cop_threshold !== 'number' || restriction.ai_cop_threshold < 0 || restriction.ai_cop_threshold > 1) {
        errors.ai_cop_threshold = 'AI cop threshold must be between 0 and 1';
      }
    }

    return {
      isValid: Object.keys(errors).length === 0,
      errors
    };
  }
}

// Crear instancia global accesible desde UI
window.judgeRestrictionsService = new JudgeRestrictionsService();

// Integración de autenticación Supabase (cliente en navegador)
(async () => {
  try {
    const resp = await fetch('/api/public/supabase');
    const env = await resp.json();
    if (env && env.url && env.anonKey) {
      // Cargar supabase si existe global
      if (window.supabase && window.supabase.createClient) {
        window.supabaseClient = window.supabase.createClient(env.url, env.anonKey);
        // Token inicial
        const { data } = await window.supabaseClient.auth.getSession();
        if (data?.session?.access_token) {
          window.judgeRestrictionsService.setAuthToken(data.session.access_token);
        }
        // Suscripción a cambios
        window.supabaseClient.auth.onAuthStateChange((event, session) => {
          const token = session?.access_token || null;
          window.judgeRestrictionsService.setAuthToken(token);
        });
      }
    }
  } catch (e) {}
})();
