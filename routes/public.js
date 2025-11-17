import express from 'express'

export function createPublicRouter({ SUPA_URL, SUPA_KEY, useSupabase }) {
  const router = express.Router()
  router.get('/api/public/supabase', (req, res) => {
    if (!useSupabase) {
      return res.json({ url: null, anonKey: null })
    }
    res.json({ url: SUPA_URL, anonKey: SUPA_KEY })
  })
  return router
}

