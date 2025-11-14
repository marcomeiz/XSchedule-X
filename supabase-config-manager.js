import { createClient } from '@supabase/supabase-js';

/**
 * Supabase-based Configuration Manager for secure prompt storage
 * Provides persistent storage with user isolation and system defaults
 */
export class SupabaseConfigManager {
    constructor(supabaseUrl, supabaseAnonKey) {
        this.supabase = createClient(supabaseUrl, supabaseAnonKey);
        this.userId = null; // Will be set when user authenticates
        this.systemPrompts = new Map();
        this.userPrompts = new Map();
        this.currentPrompt = null;
        this.initialized = false;
    }

    /**
     * Initialize the manager with user context
     */
    async initialize(userId = null) {
        this.userId = userId;
        
        try {
            // Load system prompts (always available)
            await this.loadSystemPrompts();
            
            // Load user prompts if authenticated
            if (userId) {
                await this.loadUserPrompts();
                await this.loadCurrentPrompt();
            }
            
            this.initialized = true;
            console.log('✅ SupabaseConfigManager initialized successfully');
        } catch (error) {
            console.error('❌ Failed to initialize SupabaseConfigManager:', error);
            throw error;
        }
    }

    /**
     * Load system prompts that are always available
     */
    async loadSystemPrompts() {
        try {
            const { data, error } = await this.supabase
                .from('prompts')
                .select('*')
                .eq('is_system', true)
                .order('created_at', { ascending: true });

            if (error) throw error;

            this.systemPrompts.clear();
            data.forEach(prompt => {
                this.systemPrompts.set(prompt.id, prompt);
            });

            console.log(`✅ Loaded ${this.systemPrompts.size} system prompts`);
        } catch (error) {
            console.error('❌ Error loading system prompts:', error);
            throw error;
        }
    }

    /**
     * Load user-specific prompts
     */
    async loadUserPrompts() {
        if (!this.userId) return;

        try {
            const { data, error } = await this.supabase
                .from('prompts')
                .select('*')
                .eq('user_id', this.userId)
                .eq('is_system', false)
                .order('updated_at', { ascending: false });

            if (error) throw error;

            this.userPrompts.clear();
            data.forEach(prompt => {
                this.userPrompts.set(prompt.id, prompt);
            });

            console.log(`✅ Loaded ${this.userPrompts.size} user prompts`);
        } catch (error) {
            console.error('❌ Error loading user prompts:', error);
            throw error;
        }
    }

    /**
     * Load the current prompt for the user
     */
    async loadCurrentPrompt() {
        if (!this.userId) return;

        try {
            const { data, error } = await this.supabase
                .from('user_prompt_settings')
                .select('current_prompt_id')
                .eq('user_id', this.userId)
                .single();

            if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

            if (data?.current_prompt_id) {
                // Try to find the prompt in user prompts first, then system prompts
                this.currentPrompt = 
                    this.userPrompts.get(data.current_prompt_id) ||
                    this.systemPrompts.get(data.current_prompt_id) ||
                    null;
            } else {
                // No current prompt set, use the default system prompt
                const defaultPrompt = Array.from(this.systemPrompts.values()).find(p => p.is_default);
                this.currentPrompt = defaultPrompt || null;
            }

            console.log(`✅ Current prompt loaded: ${this.currentPrompt?.name || 'none'}`);
        } catch (error) {
            console.error('❌ Error loading current prompt:', error);
            // Fallback to default system prompt
            const defaultPrompt = Array.from(this.systemPrompts.values()).find(p => p.is_default);
            this.currentPrompt = defaultPrompt || null;
        }
    }

    /**
     * Get all available prompts (system + user)
     */
    getAllPrompts() {
        const allPrompts = new Map();
        
        // Add system prompts first
        this.systemPrompts.forEach((prompt, id) => {
            allPrompts.set(id, { ...prompt, type: 'system' });
        });
        
        // Add user prompts
        this.userPrompts.forEach((prompt, id) => {
            allPrompts.set(id, { ...prompt, type: 'user' });
        });
        
        return allPrompts;
    }

    /**
     * Get the current prompt
     */
    getCurrentPrompt() {
        return this.currentPrompt;
    }

    /**
     * Set a prompt as current
     */
    async setCurrentPrompt(promptId) {
        if (!this.userId) {
            throw new Error('User must be authenticated to set current prompt');
        }

        try {
            // Verify the prompt exists and user has access
            const prompt = this.userPrompts.get(promptId) || this.systemPrompts.get(promptId);
            if (!prompt) {
                throw new Error('Prompt not found or access denied');
            }

            // Update or insert user settings
            const { error } = await this.supabase
                .from('user_prompt_settings')
                .upsert({
                    user_id: this.userId,
                    current_prompt_id: promptId,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            this.currentPrompt = prompt;
            console.log(`✅ Set current prompt: ${prompt.name}`);
            return true;
        } catch (error) {
            console.error('❌ Error setting current prompt:', error);
            throw error;
        }
    }

    /**
     * Create a new prompt
     */
    async createPrompt(name, content, variables = []) {
        if (!this.userId) {
            throw new Error('User must be authenticated to create prompts');
        }

        try {
            const promptData = {
                user_id: this.userId,
                name: name,
                content: content,
                variables: variables,
                is_system: false,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            };

            const { data, error } = await this.supabase
                .from('prompts')
                .insert(promptData)
                .select()
                .single();

            if (error) throw error;

            this.userPrompts.set(data.id, data);
            console.log(`✅ Created prompt: ${name}`);
            return data;
        } catch (error) {
            console.error('❌ Error creating prompt:', error);
            throw error;
        }
    }

    /**
     * Update an existing prompt
     */
    async updatePrompt(promptId, updates) {
        if (!this.userId) {
            throw new Error('User must be authenticated to update prompts');
        }

        // Verify it's a user prompt (not system)
        const existingPrompt = this.userPrompts.get(promptId);
        if (!existingPrompt) {
            throw new Error('Prompt not found or cannot update system prompts');
        }

        try {
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

            // Update local cache
            this.userPrompts.set(promptId, data);

            // Update current prompt if this was the current one
            if (this.currentPrompt?.id === promptId) {
                this.currentPrompt = data;
            }

            console.log(`✅ Updated prompt: ${data.name}`);
            return data;
        } catch (error) {
            console.error('❌ Error updating prompt:', error);
            throw error;
        }
    }

    /**
     * Delete a prompt
     */
    async deletePrompt(promptId) {
        if (!this.userId) {
            throw new Error('User must be authenticated to delete prompts');
        }

        // Verify it's a user prompt
        if (!this.userPrompts.has(promptId)) {
            throw new Error('Prompt not found or cannot delete system prompts');
        }

        try {
            const { error } = await this.supabase
                .from('prompts')
                .delete()
                .eq('id', promptId)
                .eq('user_id', this.userId);

            if (error) throw error;

            // Remove from local cache
            this.userPrompts.delete(promptId);

            // Clear current prompt if this was the current one
            if (this.currentPrompt?.id === promptId) {
                // Reset to default system prompt
                const defaultPrompt = Array.from(this.systemPrompts.values()).find(p => p.is_default);
                this.currentPrompt = defaultPrompt;
                
                // Update user settings
                if (this.userId) {
                    await this.setCurrentPrompt(defaultPrompt?.id || null);
                }
            }

            console.log(`✅ Deleted prompt: ${promptId}`);
            return true;
        } catch (error) {
            console.error('❌ Error deleting prompt:', error);
            throw error;
        }
    }

    /**
     * Add a prompt to history
     */
    async addToHistory(promptId, name, content, variables = []) {
        if (!this.userId) return;

        try {
            const historyData = {
                prompt_id: promptId,
                user_id: this.userId,
                name: name,
                content: content,
                variables: variables,
                created_at: new Date().toISOString()
            };

            const { error } = await this.supabase
                .from('prompt_history')
                .insert(historyData);

            if (error) throw error;

            console.log(`✅ Added to history: ${name}`);
            return true;
        } catch (error) {
            console.error('❌ Error adding to history:', error);
            throw error;
        }
    }

    /**
     * Get prompt history
     */
    async getPromptHistory(limit = 50) {
        if (!this.userId) return [];

        try {
            const { data, error } = await this.supabase
                .from('prompt_history')
                .select('*')
                .eq('user_id', this.userId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;

            return data || [];
        } catch (error) {
            console.error('❌ Error getting prompt history:', error);
            throw error;
        }
    }

    /**
     * Export configuration (for backup/migration)
     */
    exportConfig() {
        return {
            systemPrompts: Array.from(this.systemPrompts.values()),
            userPrompts: Array.from(this.userPrompts.values()),
            currentPrompt: this.currentPrompt,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Import configuration (for backup/migration)
     */
    async importConfig(configData) {
        if (!this.userId) {
            throw new Error('User must be authenticated to import configuration');
        }

        try {
            const { userPrompts = [] } = configData;
            
            for (const prompt of userPrompts) {
                await this.createPrompt(prompt.name, prompt.content, prompt.variables || []);
            }

            console.log(`✅ Imported ${userPrompts.length} prompts`);
            return true;
        } catch (error) {
            console.error('❌ Error importing configuration:', error);
            throw error;
        }
    }
}