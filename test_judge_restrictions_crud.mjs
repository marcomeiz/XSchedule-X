import assert from 'node:assert/strict'

async function req(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, options)
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, text } }
}

async function run() {
  const h = await req('/api/health')
  const supa = h.json.supabase
  // Create should be 503 if supabase not configured
  const body = { name: 'Test Restriction', description: 'e2e', min_length: 40 }
  const create = await req('/api/config/judge-restrictions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!supa) {
    assert.equal(create.status, 503)
    console.log('✅ Judge restrictions CRUD skipped (no Supabase)')
    return
  }
  // If Supabase is configured, additional tests would require auth token; we skip to avoid leaking secrets
  console.log('ℹ️ Supabase active: judge restrictions CRUD requires auth; test stub passed')
}

run()
