import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_DIR = path.join(__dirname, 'config');
const CONFIG_FILE = path.join(CONFIG_DIR, 'settings.json');

/**
 * Enhanced Configuration Manager with Supabase integration
 * Provides seamless transition from local JSON to cloud storage
 */
export class EnhancedConfigManager {
    constructor() {
        this.supabase = null;
        this.useSupabase = false;
        this.userId = null;
        this.config = null;
        this.listeners = new Map();
        this.unsavedChanges = false;
        this.initialized = false;
        
        // Default configuration
        this.defaultConfig = {
            llm: {
                provider: 'openrouter',
                model: 'anthropic/claude-3-sonnet',
                temperature: 0.7,
                top_p: 1.0,
                max_tokens: 1000,
                apiKey: '',
                endpoint: 'https://openrouter.ai/api/v1/chat/completions'
            },
            api: {
                twitter: {
                    apiKey: '',
                    apiSecret: '',
                    accessToken: '',
                    accessSecret: '',
                    bearerToken: ''
                },
                supabase: {
                    url: '',
                    anonKey: '',
                    serviceKey: ''
                }
            },
            app: {
                autoSave: true,
                autoSaveInterval: 30,
                notifications: true,
                theme: 'light',
                language: 'es',
                contentMaxLength: 280,
                contentMinLength: 10,
                qualityThreshold: 0.7
            },
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
            timeline: {
                defaultSlots: 12,
                defaultInterval: 0.5,
                defaultMonths: 1,
                defaultWorkStart: '09:00',
                defaultWorkEnd: '18:00',
                defaultTimezone: 'America/Mexico_City'
            },
            llmPresets: {}
        };
    }

    /**
     * Initialize the configuration manager
     */
    async initialize(userId = null) {
        try {
            this.userId = userId;
            
            // Load local configuration first
            await this.loadLocalConfig();
            
            // Check if Supabase is configured
            const supabaseUrl = this.config.api.supabase.url;
            const supabaseKey = this.config.api.supabase.anonKey;
            
            if (supabaseUrl && supabaseKey) {
                this.supabase = createClient(supabaseUrl, supabaseKey);
                this.useSupabase = true;
                console.log('✅ Supabase integration enabled');
                
                // Initialize Supabase tables if needed
                await this.initializeSupabaseTables();
                
                // Migrate prompts if this is the first time
                if (userId) {
                    await this.migratePromptsToSupabase();
                }
            } else {
                console.log('ℹ️  Using local JSON storage (Supabase not configured)');
            }
            
            this.initialized = true;
            console.log('✅ EnhancedConfigManager initialized successfully');
            
        } catch (error) {
            console.error('❌ Failed to initialize EnhancedConfigManager:', error);
            // Fallback to local config
            this.config = { ...this.defaultConfig };
            this.initialized = true;
        }
    }

    /**
     * Load configuration from local JSON file
     */
    async loadLocalConfig() {
        try {
            await fs.mkdir(CONFIG_DIR, { recursive: true });
            
            try {
                const configData = await fs.readFile(CONFIG_FILE, 'utf8');
                const loadedConfig = JSON.parse(configData);
                this.config = this.mergeDeep({ ...this.defaultConfig }, loadedConfig);
                console.log('✅ Local configuration loaded');
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // Config file doesn't exist, create it with defaults
                    this.config = { ...this.defaultConfig };
                    await this.saveLocalConfig();
                    console.log('✅ Created default local configuration');
                } else {
                    console.error('Error loading local config:', error);
                    this.config = { ...this.defaultConfig };
                }
            }
        } catch (error) {
            console.error('Error in loadLocalConfig:', error);
            this.config = { ...this.defaultConfig };
        }
    }

    /**
     * Save configuration to local JSON file
     */
    async saveLocalConfig() {
        try {
            await fs.writeFile(CONFIG_FILE, JSON.stringify(this.config, null, 2));
            this.unsavedChanges = false;
            console.log('✅ Local configuration saved');
        } catch (error) {
            console.error('Error saving local config:', error);
            throw error;
        }
    }

    /**
     * Initialize Supabase tables (create if not exists)
     */
    async initializeSupabaseTables() {
        if (!this.supabase) return;

        try {
            // Check if tables exist by trying to query them
            const { data: promptsData, error: promptsError } = await this.supabase
                .from('prompts')
                .select('id')
                .limit(1);

            if (promptsError && promptsError.code === 'PGRST116') {
                console.log('⚠️  Supabase tables not found. Please run the migration script first.');
                this.useSupabase = false;
                return;
            }

            console.log('✅ Supabase tables verified');
            
        } catch (error) {
            console.error('❌ Error verifying Supabase tables:', error);
            this.useSupabase = false;
        }
    }

    /**
     * Migrate existing prompts to Supabase
     */
    async migratePromptsToSupabase() {
        if (!this.supabase || !this.userId) return;

        try {
            // Check if migration has already been done
            const { data: existingPrompts } = await this.supabase
                .from('prompts')
                .select('id')
                .eq('user_id', this.userId)
                .limit(1);

            if (existingPrompts && existingPrompts.length > 0) {
                console.log('ℹ️  Prompts already migrated to Supabase');
                return;
            }

            console.log('🚀 Migrating existing prompts to Supabase...');
            
            // Extract prompts from local config
            const prompts = this.config.prompts || {};
            const promptsToMigrate = [];

            // Add current prompt if it exists and is not a system default
            if (prompts.current && prompts.current.id !== 'default') {
                promptsToMigrate.push({
                    name: prompts.current.name || 'Current Prompt',
                    content: prompts.current.content,
                    variables: prompts.current.variables || []
                });
            }

            // Add history prompts
            if (prompts.history && Array.isArray(prompts.history)) {
                prompts.history.forEach(prompt => {
                    if (prompt.id !== 'default') {
                        promptsToMigrate.push({
                            name: prompt.name || 'Historical Prompt',
                            content: prompt.content,
                            variables: prompt.variables || []
                        });
                    }
                });
            }

            // Add individual prompt entries
            Object.keys(prompts).forEach(key => {
                if (key.startsWith('prompt_')) {
                    const prompt = prompts[key];
                    promptsToMigrate.push({
                        name: prompt.name || 'Migrated Prompt',
                        content: prompt.content,
                        variables: prompt.variables || []
                    });
                }
            });

            // Remove duplicates based on content
            const uniquePrompts = promptsToMigrate.filter((prompt, index, self) => 
                index === self.findIndex(p => p.content === prompt.content)
            );

            console.log(`📋 Found ${uniquePrompts.length} unique prompts to migrate`);

            // Migrate each prompt
            for (const prompt of uniquePrompts) {
                try {
                    const { data, error } = await this.supabase
                        .from('prompts')
                        .insert({
                            user_id: this.userId,
                            name: prompt.name,
                            content: prompt.content,
                            variables: prompt.variables,
                            is_system: false,
                            is_default: false
                        })
                        .select()
                        .single();

                    if (error) {
                        if (error.code === '23505') { // Duplicate
                            console.log(`   ℹ️  Skipped duplicate: ${prompt.name}`);
                        } else {
                            throw error;
                        }
                    } else {
                        console.log(`   ✅ Migrated: ${prompt.name}`);
                    }
                } catch (error) {
                    console.error(`   ⚠️  Error migrating prompt: ${error.message}`);
                }
            }

            console.log('✅ Prompt migration completed');
            
        } catch (error) {
            console.error('❌ Error during prompt migration:', error);
            // Don't fail initialization, just continue with local storage
        }
    }

    /**
     * Get current prompt (from Supabase if available, otherwise from local config)
     */
    async getCurrentPrompt() {
        if (this.useSupabase && this.userId) {
            try {
                const { data, error } = await this.supabase
                    .from('user_prompt_settings')
                    .select(`
                        current_prompt_id,
                        prompts!inner(
                            id,
                            name,
                            content,
                            variables,
                            is_system,
                            is_default
                        )
                    `)
                    .eq('user_id', this.userId)
                    .single();

                if (error && error.code !== 'PGRST116') throw error;

                if (data?.prompts) {
                    return data.prompts;
                }

                // No current prompt set, return default system prompt
                const { data: defaultPrompt } = await this.supabase
                    .from('prompts')
                    .select('*')
                    .eq('is_system', true)
                    .eq('is_default', true)
                    .single();

                return defaultPrompt;
                
            } catch (error) {
                console.error('Error getting current prompt from Supabase:', error);
                // Fallback to local config
                return this.config.prompts?.current || null;
            }
        }
        
        // Fallback to local config
        return this.config.prompts?.current || null;
    }

    /**
     * Get all prompts (from Supabase if available, otherwise from local config)
     */
    async getAllPrompts() {
        if (this.useSupabase && this.userId) {
            try {
                const { data, error } = await this.supabase
                    .from('prompts')
                    .select('*')
                    .or(`user_id.eq.${this.userId},is_system.eq.true`)
                    .order('is_system', { ascending: true })
                    .order('created_at', { ascending: true });

                if (error) throw error;
                return data || [];
                
            } catch (error) {
                console.error('Error getting prompts from Supabase:', error);
                // Fallback to local config
                return this.getLocalPrompts();
            }
        }
        
        // Fallback to local config
        return this.getLocalPrompts();
    }

    /**
     * Get prompts from local configuration
     */
    getLocalPrompts() {
        const prompts = this.config.prompts || {};
        const allPrompts = [];

        // Add current prompt
        if (prompts.current) {
            allPrompts.push({ ...prompts.current, type: 'current' });
        }

        // Add history
        if (prompts.history && Array.isArray(prompts.history)) {
            allPrompts.push(...prompts.history.map(p => ({ ...p, type: 'history' })));
        }

        // Add individual prompt entries
        Object.keys(prompts).forEach(key => {
            if (key.startsWith('prompt_')) {
                allPrompts.push({ ...prompts[key], type: 'custom' });
            }
        });

        return allPrompts;
    }

    /**
     * Set current prompt (in Supabase if available, otherwise in local config)
     */
    async setCurrentPrompt(promptId, promptData) {
        if (this.useSupabase && this.userId) {
            try {
                // Verify the prompt exists and user has access
                const { data: prompt, error: verifyError } = await this.supabase
                    .from('prompts')
                    .select('id')
                    .eq('id', promptId)
                    .or(`user_id.eq.${this.userId},is_system.eq.true`)
                    .single();

                if (verifyError) throw verifyError;
                if (!prompt) throw new Error('Prompt not found or access denied');

                // Update or insert user settings
                const { error } = await this.supabase
                    .from('user_prompt_settings')
                    .upsert({
                        user_id: this.userId,
                        current_prompt_id: promptId,
                        updated_at: new Date().toISOString()
                    });

                if (error) throw error;

                console.log(`✅ Set current prompt in Supabase: ${promptData.name}`);
                return true;
                
            } catch (error) {
                console.error('Error setting current prompt in Supabase:', error);
                // Fallback to local config
                return this.setLocalCurrentPrompt(promptData);
            }
        }
        
        // Fallback to local config
        return this.setLocalCurrentPrompt(promptData);
    }

    /**
     * Set current prompt in local configuration
     */
    async setLocalCurrentPrompt(promptData) {
        try {
            if (!this.config.prompts) {
                this.config.prompts = {};
            }
            
            this.config.prompts.current = {
                ...promptData,
                updated_at: new Date().toISOString()
            };
            
            await this.saveLocalConfig();
            console.log(`✅ Set current prompt locally: ${promptData.name}`);
            return true;
            
        } catch (error) {
            console.error('Error setting current prompt locally:', error);
            throw error;
        }
    }

    /**
     * Create a new prompt (in Supabase if available, otherwise in local config)
     */
    async createPrompt(name, content, variables = []) {
        if (this.useSupabase && this.userId) {
            try {
                const promptData = {
                    user_id: this.userId,
                    name: name,
                    content: content,
                    variables: variables,
                    is_system: false,
                    is_default: false,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                };

                const { data, error } = await this.supabase
                    .from('prompts')
                    .insert(promptData)
                    .select()
                    .single();

                if (error) throw error;

                console.log(`✅ Created prompt in Supabase: ${name}`);
                return data;
                
            } catch (error) {
                console.error('Error creating prompt in Supabase:', error);
                // Fallback to local config
                return this.createLocalPrompt(name, content, variables);
            }
        }
        
        // Fallback to local config
        return this.createLocalPrompt(name, content, variables);
    }

    /**
     * Create a prompt in local configuration
     */
    async createLocalPrompt(name, content, variables = []) {
        try {
            if (!this.config.prompts) {
                this.config.prompts = {};
            }
            
            const promptId = `prompt_${Date.now()}`;
            const promptData = {
                id: promptId,
                name: name,
                content: content,
                variables: variables,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };
            
            this.config.prompts[promptId] = promptData;
            
            // Add to history
            if (!this.config.prompts.history) {
                this.config.prompts.history = [];
            }
            this.config.prompts.history.unshift(promptData);
            
            // Keep history limited to 50 items
            if (this.config.prompts.history.length > 50) {
                this.config.prompts.history = this.config.prompts.history.slice(0, 50);
            }
            
            await this.saveLocalConfig();
            console.log(`✅ Created prompt locally: ${name}`);
            return promptData;
            
        } catch (error) {
            console.error('Error creating prompt locally:', error);
            throw error;
        }
    }

    /**
     * Update an existing prompt
     */
    async updatePrompt(promptId, updates) {
        if (this.useSupabase && this.userId) {
            try {
                // Verify it's a user prompt (not system)
                const { data: existingPrompt, error: verifyError } = await this.supabase
                    .from('prompts')
                    .select('id, is_system')
                    .eq('id', promptId)
                    .eq('user_id', this.userId)
                    .single();

                if (verifyError) throw verifyError;
                if (!existingPrompt || existingPrompt.is_system) {
                    throw new Error('Cannot update system prompts');
                }

                const updateData = {
                    ...updates,
                    updated_at: new Date().toISOString()
                };

                const { data, error } = await this.supabase
                    .from('prompts')
                    .update(updateData)
                    .eq('id', promptId)
                    .eq('user_id', this.userId)
                    .select()
                    .single();

                if (error) throw error;

                console.log(`✅ Updated prompt in Supabase: ${data.name}`);
                return data;
                
            } catch (error) {
                console.error('Error updating prompt in Supabase:', error);
                // Fallback to local config
                return this.updateLocalPrompt(promptId, updates);
            }
        }
        
        // Fallback to local config
        return this.updateLocalPrompt(promptId, updates);
    }

    /**
     * Update a prompt in local configuration
     */
    async updateLocalPrompt(promptId, updates) {
        try {
            if (this.config.prompts && this.config.prompts[promptId]) {
                this.config.prompts[promptId] = {
                    ...this.config.prompts[promptId],
                    ...updates,
                    updated_at: new Date().toISOString()
                };
                
                await this.saveLocalConfig();
                console.log(`✅ Updated prompt locally: ${promptId}`);
                return this.config.prompts[promptId];
            } else {
                throw new Error('Prompt not found locally');
            }
        } catch (error) {
            console.error('Error updating prompt locally:', error);
            throw error;
        }
    }

    /**
     * Delete a prompt
     */
    async deletePrompt(promptId) {
        if (this.useSupabase && this.userId) {
            try {
                // Verify it's a user prompt
                const { data: existingPrompt, error: verifyError } = await this.supabase
                    .from('prompts')
                    .select('id, is_system')
                    .eq('id', promptId)
                    .eq('user_id', this.userId)
                    .single();

                if (verifyError) throw verifyError;
                if (!existingPrompt || existingPrompt.is_system) {
                    throw new Error('Cannot delete system prompts');
                }

                const { error } = await this.supabase
                    .from('prompts')
                    .delete()
                    .eq('id', promptId)
                    .eq('user_id', this.userId);

                if (error) throw error;

                console.log(`✅ Deleted prompt from Supabase: ${promptId}`);
                return true;
                
            } catch (error) {
                console.error('Error deleting prompt from Supabase:', error);
                // Fallback to local config
                return this.deleteLocalPrompt(promptId);
            }
        }
        
        // Fallback to local config
        return this.deleteLocalPrompt(promptId);
    }

    /**
     * Delete a prompt from local configuration
     */
    async deleteLocalPrompt(promptId) {
        try {
            if (this.config.prompts && this.config.prompts[promptId]) {
                delete this.config.prompts[promptId];
                
                // Remove from history if present
                if (this.config.prompts.history) {
                    this.config.prompts.history = this.config.prompts.history.filter(
                        p => p.id !== promptId
                    );
                }
                
                await this.saveLocalConfig();
                console.log(`✅ Deleted prompt locally: ${promptId}`);
                return true;
            } else {
                throw new Error('Prompt not found locally');
            }
        } catch (error) {
            console.error('Error deleting prompt locally:', error);
            throw error;
        }
    }

    /**
     * Utility function to deeply merge objects
     */
    mergeDeep(target, source) {
        const output = Object.assign({}, target);
        if (this.isObject(target) && this.isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this.isObject(source[key])) {
                    if (!(key in target))
                        Object.assign(output, { [key]: source[key] });
                    else
                        output[key] = this.mergeDeep(target[key], source[key]);
                } else {
                    Object.assign(output, { [key]: source[key] });
                }
            });
        }
        return output;
    }

    /**
     * Check if a value is an object
     */
    isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }

    /**
     * Get a configuration value
     */
    get(path, defaultValue = null) {
        const keys = path.split('.');
        let current = this.config;
        
        for (const key of keys) {
            if (current && typeof current === 'object' && key in current) {
                current = current[key];
            } else {
                return defaultValue;
            }
        }
        
        return current;
    }

    /**
     * Set a configuration value
     */
    async set(path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        let current = this.config;
        
        for (const key of keys) {
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }
        
        current[lastKey] = value;
        this.unsavedChanges = true;
        
        // Save immediately if auto-save is enabled
        if (this.config.app?.autoSave) {
            await this.saveLocalConfig();
        }
        
        this.notifyListeners('configChanged', { path, value });
    }

    /**
     * Add event listener
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove event listener
     */
    off(event, callback) {
        if (this.listeners.has(event)) {
            const callbacks = this.listeners.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Notify listeners of an event
     */
    notifyListeners(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('Error in config listener:', error);
                }
            });
        }
    }

    /**
     * Export configuration
     */
    async exportConfig() {
        const prompts = await this.getAllPrompts();
        const currentPrompt = await this.getCurrentPrompt();
        
        return JSON.stringify({
            config: this.config,
            prompts: {
                all: prompts,
                current: currentPrompt
            },
            storage_type: this.useSupabase ? 'supabase' : 'local',
            exported_at: new Date().toISOString()
        }, null, 2);
    }

    /**
     * Import configuration
     */
    async importConfig(configJson) {
        try {
            const importedData = JSON.parse(configJson);
            
            if (importedData.config) {
                this.config = this.mergeDeep({ ...this.defaultConfig }, importedData.config);
                await this.saveLocalConfig();
            }
            
            if (importedData.prompts && !this.useSupabase) {
                // Import prompts to local storage
                const prompts = importedData.prompts.all || [];
                for (const prompt of prompts) {
                    if (!prompt.is_system) {
                        await this.createLocalPrompt(prompt.name, prompt.content, prompt.variables || []);
                    }
                }
            }
            
            this.notifyListeners('configImported', this.config);
            console.log('✅ Configuration imported successfully');
            return true;
            
        } catch (error) {
            console.error('Error importing configuration:', error);
            throw error;
        }
    }
}

// Export singleton instance
const configManager = new EnhancedConfigManager();
export default configManager;