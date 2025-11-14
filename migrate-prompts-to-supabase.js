#!/usr/bin/env node

/**
 * Migration script to transfer local JSON prompts to Supabase
 * This preserves existing prompts while adding system defaults
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const USER_ID = process.env.USER_ID || '00000000-0000-0000-0000-000000000001'; // Default user for migration

// File paths
const CONFIG_DIR = path.join(__dirname, 'config');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');

// Default system prompts (these will always be available)
const SYSTEM_PROMPTS = [
    {
        name: 'Marco Voice Engine Default',
        content: 'Generate engaging social media content based on the following topic: {topic}',
        variables: ['topic'],
        is_default: true
    },
    {
        name: 'Business Operations',
        content: 'Create professional business content about: {topic}. Focus on operational insights and practical advice.',
        variables: ['topic'],
        is_default: false
    },
    {
        name: 'Creative Chaos',
        content: 'Generate creative, experimental content about: {topic}. Be bold and unconventional.',
        variables: ['topic'],
        is_default: false
    }
];

class PromptMigration {
    constructor() {
        this.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        this.migrationResults = {
            systemPrompts: 0,
            userPrompts: 0,
            currentPrompt: null,
            errors: []
        };
    }

    async migrate() {
        console.log('🚀 Starting prompt migration to Supabase...\n');

        try {
            // Step 1: Create system prompts
            console.log('📋 Step 1: Creating system prompts...');
            await this.createSystemPrompts();

            // Step 2: Migrate existing user prompts
            console.log('\n👤 Step 2: Migrating user prompts...');
            await this.migrateUserPrompts();

            // Step 3: Set current prompt
            console.log('\n⚙️  Step 3: Setting current prompt...');
            await this.setCurrentPrompt();

            // Step 4: Verify migration
            console.log('\n✅ Step 4: Verifying migration...');
            await this.verifyMigration();

            this.printResults();

        } catch (error) {
            console.error('❌ Migration failed:', error);
            this.migrationResults.errors.push(error.message);
            throw error;
        }
    }

    async createSystemPrompts() {
        try {
            for (const prompt of SYSTEM_PROMPTS) {
                const { data, error } = await this.supabase
                    .from('prompts')
                    .insert({
                        user_id: null, // System prompts have no user_id
                        name: prompt.name,
                        content: prompt.content,
                        variables: prompt.variables,
                        is_system: true,
                        is_default: prompt.is_default || false
                    })
                    .select()
                    .single();

                if (error) {
                    if (error.code === '23505') { // Unique constraint violation
                        console.log(`   ℹ️  System prompt already exists: ${prompt.name}`);
                    } else {
                        throw error;
                    }
                } else {
                    console.log(`   ✅ Created system prompt: ${prompt.name}`);
                    this.migrationResults.systemPrompts++;
                }
            }
        } catch (error) {
            console.error(`   ❌ Error creating system prompts: ${error.message}`);
            throw error;
        }
    }

    async migrateUserPrompts() {
        try {
            // Read existing configuration
            const settingsContent = await fs.readFile(SETTINGS_FILE, 'utf-8');
            const settings = JSON.parse(settingsContent);
            
            const prompts = settings.prompts || {};
            const userPrompts = [];

            // Collect all user prompts from different sections
            if (prompts.history && Array.isArray(prompts.history)) {
                userPrompts.push(...prompts.history);
            }

            // Add individual prompt entries (those with prompt_ prefix)
            Object.keys(prompts).forEach(key => {
                if (key.startsWith('prompt_') && typeof prompts[key] === 'object') {
                    userPrompts.push(prompts[key]);
                }
            });

            // Remove duplicates based on content
            const uniquePrompts = userPrompts.filter((prompt, index, self) => 
                index === self.findIndex(p => p.content === prompt.content)
            );

            console.log(`   📊 Found ${uniquePrompts.length} unique user prompts to migrate`);

            for (const prompt of uniquePrompts) {
                try {
                    const { data, error } = await this.supabase
                        .from('prompts')
                        .insert({
                            user_id: USER_ID,
                            name: prompt.name || 'Untitled Prompt',
                            content: prompt.content,
                            variables: prompt.variables || [],
                            is_system: false,
                            is_default: false
                        })
                        .select()
                        .single();

                    if (error) {
                        if (error.code === '23505') { // Duplicate
                            console.log(`   ℹ️  Skipped duplicate: ${prompt.name || 'Untitled'}`);
                        } else {
                            throw error;
                        }
                    } else {
                        console.log(`   ✅ Migrated: ${prompt.name || 'Untitled Prompt'}`);
                        this.migrationResults.userPrompts++;
                    }
                } catch (promptError) {
                    console.error(`   ⚠️  Error migrating prompt: ${promptError.message}`);
                }
            }

        } catch (error) {
            console.error(`   ❌ Error reading user prompts: ${error.message}`);
            throw error;
        }
    }

    async setCurrentPrompt() {
        try {
            // Read current prompt from local config
            const settingsContent = await fs.readFile(SETTINGS_FILE, 'utf-8');
            const settings = JSON.parse(settingsContent);
            const currentPrompt = settings.prompts?.current;

            if (currentPrompt && currentPrompt.id) {
                // Find the migrated prompt in Supabase
                const { data: migratedPrompt, error: findError } = await this.supabase
                    .from('prompts')
                    .select('id')
                    .eq('user_id', USER_ID)
                    .eq('content', currentPrompt.content)
                    .single();

                if (migratedPrompt) {
                    // Set as current prompt
                    const { error: setError } = await this.supabase
                        .from('user_prompt_settings')
                        .upsert({
                            user_id: USER_ID,
                            current_prompt_id: migratedPrompt.id
                        });

                    if (setError) throw setError;

                    console.log(`   ✅ Set current prompt: ${currentPrompt.name}`);
                    this.migrationResults.currentPrompt = currentPrompt.name;
                } else {
                    console.log(`   ℹ️  Current prompt not found in migrated data, will use default`);
                }
            } else {
                console.log(`   ℹ️  No current prompt found, will use system default`);
            }
        } catch (error) {
            console.error(`   ⚠️  Error setting current prompt: ${error.message}`);
            // Don't fail the migration for this
        }
    }

    async verifyMigration() {
        try {
            // Count system prompts
            const { count: systemCount, error: systemError } = await this.supabase
                .from('prompts')
                .select('*', { count: 'exact', head: true })
                .eq('is_system', true);

            if (systemError) throw systemError;

            // Count user prompts
            const { count: userCount, error: userError } = await this.supabase
                .from('prompts')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', USER_ID)
                .eq('is_system', false);

            if (userError) throw userError;

            // Check current prompt
            const { data: currentData, error: currentError } = await this.supabase
                .from('user_prompt_settings')
                .select('current_prompt_id')
                .eq('user_id', USER_ID)
                .single();

            if (currentError && currentError.code !== 'PGRST116') throw currentError;

            console.log(`   📊 Verification Results:`);
            console.log(`      System prompts: ${systemCount} (expected: ${SYSTEM_PROMPTS.length})`);
            console.log(`      User prompts: ${userCount} (expected: ${this.migrationResults.userPrompts})`);
            console.log(`      Current prompt: ${currentData?.current_prompt_id ? 'Set' : 'Using default'}`);

        } catch (error) {
            console.error(`   ❌ Verification failed: ${error.message}`);
            throw error;
        }
    }

    printResults() {
        console.log('\n' + '='.repeat(50));
        console.log('📊 MIGRATION RESULTS');
        console.log('='.repeat(50));
        console.log(`✅ System prompts created: ${this.migrationResults.systemPrompts}`);
        console.log(`✅ User prompts migrated: ${this.migrationResults.userPrompts}`);
        console.log(`✅ Current prompt: ${this.migrationResults.currentPrompt || 'Using system default'}`);
        
        if (this.migrationResults.errors.length > 0) {
            console.log(`\n⚠️  Errors encountered: ${this.migrationResults.errors.length}`);
            this.migrationResults.errors.forEach(error => {
                console.log(`   - ${error}`);
            });
        }
        
        console.log('\n🎉 Migration completed successfully!');
        console.log('\n💡 Next steps:');
        console.log('   1. Update your ConfigManager to use SupabaseConfigManager');
        console.log('   2. Test the new prompt storage system');
        console.log('   3. Your prompts are now safely stored in Supabase!');
    }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('❌ Please set SUPABASE_URL and SUPABASE_ANON_KEY environment variables');
        process.exit(1);
    }

    const migration = new PromptMigration();
    migration.migrate().catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    });
}

export { PromptMigration };