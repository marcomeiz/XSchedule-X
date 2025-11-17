import express from 'express';
import { TwitterApi } from 'twitter-api-v2';
import cron from 'node-cron';
import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';
import configManager from './enhanced-config.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize enhanced configuration manager
await configManager.initialize();

const SUPA_URL = process.env.SUPABASE_URL;
const SUPA_KEY = process.env.SUPABASE_ANON_KEY;
const useSupabase = Boolean(SUPA_URL && SUPA_KEY);
const supabase = useSupabase ? createClient(SUPA_URL, SUPA_KEY) : null;
const memory = { timeline: null, slots: [] };

function getTwitterClient() {
  const { TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET } = process.env;
  if (!TWITTER_API_KEY || !TWITTER_API_SECRET || !TWITTER_ACCESS_TOKEN || !TWITTER_ACCESS_SECRET) return null;
  try {
    return new TwitterApi({
      appKey: TWITTER_API_KEY,
      appSecret: TWITTER_API_SECRET,
      accessToken: TWITTER_ACCESS_TOKEN,
      accessSecret: TWITTER_ACCESS_SECRET,
    });
  } catch (error) {
    console.error('Twitter client error:', error);
    return null;
  }
}

app.use(express.json());
app.use(express.static('public'));

// API Routes
app.get('/api/config', async (req, res) => {
  try {
    const config = await configManager.exportConfig();
    res.json(JSON.parse(config));
  } catch (error) {
    console.error('Error getting config:', error);
    res.status(500).json({ error: 'Failed to get configuration' });
  }
});

app.post('/api/config', async (req, res) => {
  try {
    await configManager.importConfig(JSON.stringify(req.body));
    res.json({ success: true, message: 'Configuration saved' });
  } catch (error) {
    console.error('Error saving config:', error);
    res.status(500).json({ error: 'Failed to save configuration' });
  }
});

app.post('/api/config/import', async (req, res) => {
  try {
    await configManager.importConfig(JSON.stringify(req.body));
    res.json({ success: true, message: 'Configuration imported' });
  } catch (error) {
    console.error('Error importing config:', error);
    res.status(500).json({ error: 'Failed to import configuration' });
  }
});

// Enhanced Prompt Management Routes
app.get('/api/config/prompts', async (req, res) => {
  try {
    const prompts = await configManager.getAllPrompts();
    res.json({ success: true, prompts });
  } catch (error) {
    console.error('Error getting prompts:', error);
    res.status(500).json({ error: 'Failed to get prompts' });
  }
});

app.get('/api/config/prompts/current', async (req, res) => {
  try {
    const prompt = await configManager.getCurrentPrompt();
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error getting current prompt:', error);
    res.status(500).json({ error: 'Failed to get current prompt' });
  }
});

app.post('/api/config/prompts', async (req, res) => {
  try {
    const { name, content, variables = [] } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }
    
    const prompt = await configManager.createPrompt(name, content, variables);
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error creating prompt:', error);
    res.status(500).json({ error: 'Failed to create prompt' });
  }
});

app.put('/api/config/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const prompt = await configManager.updatePrompt(id, updates);
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Error updating prompt:', error);
    res.status(500).json({ error: 'Failed to update prompt' });
  }
});

app.delete('/api/config/prompts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await configManager.deletePrompt(id);
    res.json({ success: true, message: 'Prompt deleted' });
  } catch (error) {
    console.error('Error deleting prompt:', error);
    res.status(500).json({ error: 'Failed to delete prompt' });
  }
});

app.post('/api/config/prompts/:id/set-current', async (req, res) => {
  try {
    const { id } = req.params;
    const { prompt } = req.body;
    
    await configManager.setCurrentPrompt(id, prompt);
    res.json({ success: true, message: 'Current prompt updated' });
  } catch (error) {
    console.error('Error setting current prompt:', error);
    res.status(500).json({ error: 'Failed to set current prompt' });
  }
});

// Proxy endpoint for AI generation with prompt injection
app.post('/api/generate', async (req, res) => {
  try {
    const { mode, prompt, promptId, promptVariables } = req.body;
    
    // Get the current configured prompt if no specific prompt is provided
    let finalPrompt = prompt;
    if (!finalPrompt) {
      const currentPrompt = await configManager.getCurrentPrompt();
      if (currentPrompt && currentPrompt.content) {
        finalPrompt = currentPrompt.content;
      }
    }
    
    // Log the prompt being used for debugging
    console.log(`AI Generation request - Mode: ${mode}, Prompt ID: ${promptId || 'default'}, Has custom prompt: ${!!finalPrompt}`);
    console.log(`Final prompt being sent to Marco Voice Engine: ${finalPrompt ? finalPrompt.substring(0, 100) + '...' : 'none'}`);
    
    // Forward to Marco Voice Engine
    const response = await fetch('https://marco-voice-engine.fly.dev/generate', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'User-Agent': 'XSchedule-X/1.0'
      },
      body: JSON.stringify({
        mode,
        prompt: finalPrompt || undefined,
        min_diff: 0.1 // Lower threshold for better success rate with custom prompts
      })
    });
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error('Marco Voice Engine error:', errorData);
      return res.status(response.status).json({ 
        success: false, 
        error: `Marco Voice Engine error: ${errorData}` 
      });
    }
    
    const data = await response.json();
    
    // Log successful generation
    console.log(`AI Generation successful - Received ${data.variants?.length || 0} variants`);
    
    res.json(data);
    
  } catch (error) {
    console.error('AI Generation proxy error:', error);
    res.status(500).json({ 
      success: false, 
      error: `Generation error: ${error.message}` 
    });
  }
});

// Timeline and slots endpoints (unchanged)

app.post('/api/timeline/create', async (req, res) => {
  try {
    const { totalSlots, intervalHours, monthsAhead, workStart, workEnd, timezone } = req.body;

    if (!totalSlots || !intervalHours || !workStart || !workEnd || !timezone) {
      return res.status(400).json({ error: 'Missing required timeline parameters' });
    }

    let slots = [];
    let currentTime = DateTime.now().setZone(timezone);
    const [startHour, startMinute] = workStart.split(':').map(Number);
    const [endHour, endMinute] = workEnd.split(':').map(Number);

    for (let i = 0; i < totalSlots; i++) {
      // Find next valid slot time
      while (true) {
        const hour = currentTime.hour;
        const minute = currentTime.minute;

        if (hour < startHour || (hour === startHour && minute < startMinute)) {
          // Before work hours, advance to start of work
          currentTime = currentTime.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
        } else if (hour > endHour || (hour === endHour && minute > endMinute)) {
          // After work hours, advance to next day's start
          currentTime = currentTime.plus({ days: 1 }).set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
        } else {
          // Within work hours, this is a valid time
          break;
        }
      }

      slots.push({
        id: `slot_${Date.now()}_${i}`,
        slot_index: i,
        scheduled_time: currentTime.toISO(),
        status: 'empty',
        content: null,
        tweet_id: null,
        quality_score: null,
        similarity: null,
      });

      currentTime = currentTime.plus({ hours: intervalHours });
    }

    const newTimeline = {
      id: `timeline_${Date.now()}`,
      created_at: DateTime.now().toISO(),
      total_slots: totalSlots,
      interval_hours: intervalHours,
      months_ahead: monthsAhead,
      work_start: workStart,
      work_end: workEnd,
      timezone: timezone,
      slots: slots, // Embed slots into the timeline object
    };

    memory.timeline = newTimeline;
    // memory.slots is no longer needed as it's part of the timeline object
    // memory.slots = slots;

    res.json({ success: true, timeline: newTimeline, preservedCount: 0, message: 'Timeline created successfully' });

  } catch (error) {
    console.error('Error creating timeline:', error);
    res.status(500).json({ error: 'Failed to create timeline' });
  }
});

app.get('/api/timeline', (req, res) => {
  res.json({ success: true, timeline: memory.timeline, slots: memory.slots });
});

app.post('/api/timeline', (req, res) => {
  const { timeline, slots } = req.body;
  memory.timeline = timeline;
  memory.slots = slots;
  res.json({ success: true, message: 'Timeline updated' });
});

app.get('/api/topics', async (req, res) => {
  try {
    const response = await fetch('https://marco-voice-engine.fly.dev/topics');
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    supabase: useSupabase,
    storage_type: useSupabase ? 'supabase' : 'local'
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: error.message 
  });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 XSchedule-X server running on port ${PORT}`);
  console.log(`📊 Storage mode: ${useSupabase ? 'Supabase (cloud)' : 'Local JSON'}`);
  console.log(`📝 Configuration: Enhanced with Supabase integration`);
});

export default app;