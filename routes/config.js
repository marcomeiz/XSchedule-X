import express from 'express'

export function createConfigRouter(configManager) {
  const router = express.Router()
  router.get('/api/config', async (req, res) => {
    try {
      const config = await configManager.exportConfig()
      res.json(JSON.parse(config))
    } catch (error) {
      res.status(500).json({ error: 'Failed to get configuration' })
    }
  })
  router.post('/api/config', async (req, res) => {
    try {
      await configManager.importConfig(JSON.stringify(req.body))
      res.json({ success: true, message: 'Configuration saved' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to save configuration' })
    }
  })
  router.post('/api/config/import', async (req, res) => {
    try {
      await configManager.importConfig(JSON.stringify(req.body))
      res.json({ success: true, message: 'Configuration imported' })
    } catch (error) {
      res.status(500).json({ error: 'Failed to import configuration' })
    }
  })
  return router
}

