import express from 'express'
import { validatePromptCreate } from '../utils/validator.js'

export function createPromptsRouter({ supabase, useSupabase, configManager }) {
  const router = express.Router()
  router.get('/api/config/prompts', async (req, res) => {
    try {
      let userId = null
      if (useSupabase && req.headers.authorization) {
        const token = req.headers.authorization.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id || null
      }
      const prompts = await configManager.getAllPrompts(userId)
      res.json({ success: true, prompts })
    } catch (error) {
      console.error('Error in route:', req.path, error);
      res.status(500).json({ error: 'Failed to get prompts' })
    }
  })
  router.get('/api/config/prompts/current', async (req, res) => {
    try {
      let userId = null
      if (useSupabase && req.headers.authorization) {
        const token = req.headers.authorization.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id || null
      }
      const prompt = await configManager.getCurrentPrompt(userId)
      res.json({ success: true, prompt })
    } catch (error) {
      console.error('Error in route:', req.path, error);
      res.status(500).json({ error: 'Failed to get current prompt' })
    }
  })
  router.post('/api/config/prompts', async (req, res) => {
    try {
      const v = validatePromptCreate(req.body)
      if (!v.ok) return res.status(400).json({ error: v.error })
      const { name, content, variables = [] } = req.body
      let userId = null
      if (useSupabase && req.headers.authorization) {
        const token = req.headers.authorization.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id || null
      }
      const prompt = await configManager.createPrompt(name, content, variables, userId)
      res.json({ success: true, prompt })
    } catch (error) {
      console.error('Error in route:', req.path, error);
      res.status(500).json({ error: 'Failed to create prompt' })
    }
  })
  router.put('/api/config/prompts/:id', async (req, res) => {
    try {
      const { id } = req.params
      const updates = req.body
      let userId = null
      if (useSupabase && req.headers.authorization) {
        const token = req.headers.authorization.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id || null
      }
      const prompt = await configManager.updatePrompt(id, updates, userId)
      res.json({ success: true, prompt })
    } catch (error) {
      console.error('Error in route:', req.path, error);
      res.status(500).json({ error: 'Failed to update prompt' })
    }
  })
  router.delete('/api/config/prompts/:id', async (req, res) => {
    try {
      const { id } = req.params
      let userId = null
      if (useSupabase && req.headers.authorization) {
        const token = req.headers.authorization.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id || null
      }
      await configManager.deletePrompt(id, userId)
      res.json({ success: true, message: 'Prompt deleted' })
    } catch (error) {
      console.error('Error in route:', req.path, error);
      res.status(500).json({ error: 'Failed to delete prompt' })
    }
  })
  router.post('/api/config/prompts/:id/set-current', async (req, res) => {
    try {
      const { id } = req.params
      const { prompt } = req.body
      let userId = null
      if (useSupabase && req.headers.authorization) {
        const token = req.headers.authorization.replace('Bearer ', '')
        const { data: { user } } = await supabase.auth.getUser(token)
        userId = user?.id || null
      }
      await configManager.setCurrentPrompt(id, prompt, userId)
      res.json({ success: true, message: 'Current prompt updated' })
    } catch (error) {
      console.error('Error in route:', req.path, error);
      res.status(500).json({ error: 'Failed to set current prompt' })
    }
  })
  return router
}
