import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(__dirname, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');
const PROMPTS_FILE = path.join(CONFIG_DIR, 'prompts.json');
const PROMPT_HISTORY_FILE = path.join(CONFIG_DIR, 'prompt_history.json');

// Default configuration
const DEFAULT_CONFIG = {
  // LLM Configuration
  llm: {
    provider: 'openrouter', // openrouter, openai, anthropic
    model: 'anthropic/claude-3-sonnet',
    temperature: 0.7,
    top_p: 1.0,
    max_tokens: 1000,
    apiKey: '',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions'
  },
  
  // Prompt Management
  prompts: {
    current: {
      id: 'default',
      name: 'Default Prompt',
      content: 'Generate engaging social media content based on the following topic: {topic}',
      variables: ['topic'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    history: [],
    presets: []
  },
  
  // API Configuration
  api: {
    twitter: {
      apiKey: '',
      apiSecret: '',
      accessToken: '',
      accessSecret: ''
    },
    supabase: {
      url: '',
      anonKey: ''
    }
  },
  
  // Application Settings
  app: {
    autoSave: true,
    autoSaveInterval: 30000, // 30 seconds
    notifications: true,
    theme: 'light',
    language: 'es'
  },
  
  // Content Generation Settings
  content: {
    maxLength: 280,
    minLength: 10,
    qualityThreshold: 0.7,
    enableAI: true,
    variants: {
      ops: {
        enabled: true,
        description: 'Operational and business-focused content'
      },
      chaos: {
        enabled: true,
        description: 'Creative and experimental content'
      }
    }
  },
  
  // Timeline Settings
  timeline: {
    defaultSlots: 12,
    defaultInterval: 0.5,
    defaultMonths: 1,
    defaultWorkStart: '09:00',
    defaultWorkEnd: '18:00',
    defaultTimezone: 'America/Mexico_City'
  }
};

class ConfigManager {
  constructor() {
    this.config = { ...DEFAULT_CONFIG };
    this.listeners = new Set();
    this.autoSaveTimer = null;
    this.unsavedChanges = false;
  }

  async init() {
    try {
      await fs.mkdir(CONFIG_DIR, { recursive: true });
      await this.loadConfig();
      this.startAutoSave();
    } catch (error) {
      console.error('Error initializing config manager:', error);
      this.config = { ...DEFAULT_CONFIG };
    }
  }

  async loadConfig() {
    try {
      const configData = await fs.readFile(CONFIG_FILE, 'utf8');
      const loadedConfig = JSON.parse(configData);
      this.config = this.mergeDeep({ ...DEFAULT_CONFIG }, loadedConfig);
      
      // Override with environment variables if available
      this.syncWithEnvironment();
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, create it with defaults
        // First sync with environment variables
        this.syncWithEnvironment();
        await this.saveConfig();
      } else {
        console.error('Error loading config:', error);
      }
    }
  }

  syncWithEnvironment() {
    // Sync Supabase configuration from environment variables
    if (process.env.SUPABASE_URL) {
      this.config.api.supabase.url = process.env.SUPABASE_URL;
    }
    if (process.env.SUPABASE_ANON_KEY) {
      this.config.api.supabase.anonKey = process.env.SUPABASE_ANON_KEY;
    }
    
    // Sync Twitter configuration from environment variables
    if (process.env.TWITTER_API_KEY) {
      this.config.api.twitter.apiKey = process.env.TWITTER_API_KEY;
    }
    if (process.env.TWITTER_API_SECRET) {
      this.config.api.twitter.apiSecret = process.env.TWITTER_API_SECRET;
    }
    if (process.env.TWITTER_ACCESS_TOKEN) {
      this.config.api.twitter.accessToken = process.env.TWITTER_ACCESS_TOKEN;
    }
    if (process.env.TWITTER_ACCESS_SECRET) {
      this.config.api.twitter.accessSecret = process.env.TWITTER_ACCESS_SECRET;
    }
    
    // Sync LLM configuration from environment variables
    if (process.env.LLM_API_KEY) {
      this.config.llm.apiKey = process.env.LLM_API_KEY;
    }
    if (process.env.LLM_PROVIDER) {
      this.config.llm.provider = process.env.LLM_PROVIDER;
    }
    if (process.env.LLM_MODEL) {
      this.config.llm.model = process.env.LLM_MODEL;
    }
  }

  async saveConfig() {
    try {
      await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
      this.unsavedChanges = false;
      this.notifyListeners('configSaved', this.config);
    } catch (error) {
      console.error('Error saving config:', error);
      throw error;
    }
  }

  async exportConfig() {
    return JSON.stringify(this.config, null, 2);
  }

  async importConfig(configJson) {
    try {
      const importedConfig = JSON.parse(configJson);
      this.config = this.mergeDeep({ ...DEFAULT_CONFIG }, importedConfig);
      await this.saveConfig();
      this.notifyListeners('configImported', this.config);
      return true;
    } catch (error) {
      console.error('Error importing config:', error);
      throw new Error('Invalid configuration format');
    }
  }

  async resetToDefaults() {
    this.config = { ...DEFAULT_CONFIG };
    await this.saveConfig();
    this.notifyListeners('configReset', this.config);
  }

  get(path) {
    return path.split('.').reduce((obj, key) => obj?.[key], this.config);
  }

  set(path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((obj, key) => {
      if (!obj[key]) obj[key] = {};
      return obj[key];
    }, this.config);
    
    target[lastKey] = value;
    this.unsavedChanges = true;
    this.notifyListeners('configChanged', { path, value });
    
    if (this.config.app.autoSave) {
      this.scheduleAutoSave();
    }
  }

  getAll() {
    return { ...this.config };
  }

  hasUnsavedChanges() {
    return this.unsavedChanges;
  }

  startAutoSave() {
    if (this.config.app.autoSave && this.config.app.autoSaveInterval > 0) {
      this.autoSaveTimer = setInterval(() => {
        if (this.unsavedChanges) {
          this.saveConfig().catch(console.error);
        }
      }, this.config.app.autoSaveInterval);
    }
  }

  stopAutoSave() {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  scheduleAutoSave() {
    this.stopAutoSave();
    setTimeout(() => {
      if (this.unsavedChanges) {
        this.saveConfig().catch(console.error);
      }
      this.startAutoSave();
    }, 2000); // Wait 2 seconds after last change
  }

  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners(event, data) {
    this.listeners.forEach(listener => {
      try {
        listener(event, data);
      } catch (error) {
        console.error('Error in config listener:', error);
      }
    });
  }

  mergeDeep(target, source) {
    const result = { ...target };
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  // Prompt Management Methods
  async savePrompt(promptData) {
    const prompt = {
      ...promptData,
      id: promptData.id || `prompt_${Date.now()}`,
      created_at: promptData.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    // Add to history
    this.config.prompts.history.unshift({ ...prompt });
    if (this.config.prompts.history.length > 50) {
      this.config.prompts.history = this.config.prompts.history.slice(0, 50);
    }

    // Update current prompt
    this.config.prompts.current = prompt;
    
    this.unsavedChanges = true;
    this.notifyListeners('promptSaved', prompt);
    
    if (this.config.app.autoSave) {
      await this.saveConfig();
    }
    
    return prompt;
  }

  getPromptHistory() {
    return [...this.config.prompts.history];
  }

  getPromptPresets() {
    return [...this.config.prompts.presets];
  }

  loadPromptFromHistory(promptId) {
    const prompt = this.config.prompts.history.find(p => p.id === promptId);
    if (prompt) {
      this.config.prompts.current = { ...prompt };
      this.unsavedChanges = true;
      this.notifyListeners('promptLoaded', prompt);
      return prompt;
    }
    return null;
  }

  async getCurrentPrompt() {
    // Try to get from Supabase first if available
    if (global.supabase) {
      try {
        const { data: prompt, error } = await global.supabase
          .from('prompts')
          .select('*')
          .eq('is_active', true)
          .single();
        
        if (!error && prompt) {
          return {
            id: prompt.id,
            name: prompt.name,
            content: prompt.content,
            variables: prompt.variables || []
          };
        }
      } catch (supabaseError) {
        console.warn('Could not fetch current prompt from Supabase, using local cache:', supabaseError.message);
      }
    }
    
    // Fallback to local cache
    return this.config.prompts.current || null;
  }

  async getPromptByMode(mode) {
    // Try to get mode-specific prompt from Supabase first if available
    if (global.supabase) {
      try {
        const promptName = mode === 'ops' ? 'OPS Mode - Business Operations' : 
                          mode === 'chaos' ? 'CHAOS Mode - Creative Chaos' : null;
        
        if (promptName) {
          const { data: prompt, error } = await global.supabase
            .from('prompts')
            .select('*')
            .eq('name', promptName)
            .eq('is_active', true)
            .single();
          
          if (!error && prompt) {
            return {
              id: prompt.id,
              name: prompt.name,
              content: prompt.content,
              variables: prompt.variables || []
            };
          }
        }
      } catch (supabaseError) {
        console.warn(`Could not fetch ${mode} prompt from Supabase:`, supabaseError.message);
      }
    }
    
    // Return null to indicate no specific prompt found, let the backend use its default
    return null;
  }

  addPromptPreset(promptData) {
    const preset = {
      ...promptData,
      id: promptData.id || `preset_${Date.now()}`,
      created_at: new Date().toISOString()
    };
    
    this.config.prompts.presets.push(preset);
    this.unsavedChanges = true;
    this.notifyListeners('presetAdded', preset);
    return preset;
  }

  removePromptPreset(presetId) {
    const index = this.config.prompts.presets.findIndex(p => p.id === presetId);
    if (index !== -1) {
      const removed = this.config.prompts.presets.splice(index, 1)[0];
      this.unsavedChanges = true;
      this.notifyListeners('presetRemoved', removed);
      return removed;
    }
    return null;
  }
}

// Create singleton instance
const configManager = new ConfigManager();

export default configManager;
export { DEFAULT_CONFIG };