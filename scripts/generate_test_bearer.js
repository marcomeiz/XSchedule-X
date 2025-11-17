import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
const anonKey = process.env.SUPABASE_ANON_KEY
if (!url || !serviceKey || !anonKey) {
  process.stderr.write('Missing SUPABASE_URL or keys\n')
  process.exit(1)
}
const email = `test+${Date.now()}@example.com`
const password = crypto.randomBytes(16).toString('hex')
const admin = createClient(url, serviceKey)
const { error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
if (createErr) {
  process.stderr.write(`Create user error: ${createErr.message}\n`)
  process.exit(1)
}
const res = await fetch(`${url}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: anonKey, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password })
})
if (!res.ok) {
  const t = await res.text()
  process.stderr.write(`Login error: ${t}\n`)
  process.exit(1)
}
const j = await res.json()
process.stdout.write(j.access_token || '')
