import assert from 'node:assert/strict'

async function req(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, options)
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, text } }
}

async function run() {
  const token = process.env.TEST_BEARER
  const h = await req('/api/health')
  const supa = h.json.supabase
  if (!supa || !token) {
    console.log('ℹ️  Skipping auth E2E (no Supabase or TEST_BEARER)')
    return
  }
  const body = { name: 'Auth E2E Restriction', min_length: 50, is_active: true }
  const create = await req('/api/config/judge-restrictions', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify(body) })
  assert.equal(create.status, 200)
  assert.equal(create.json.success, true)
  assert.ok(create.json.restriction?.id)
  console.log('✅ Auth E2E judge restriction create passed')
}

run()
