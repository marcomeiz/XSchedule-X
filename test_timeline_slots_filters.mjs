import assert from 'node:assert/strict'

async function req(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, options)
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, text } }
}

async function run() {
  // Ensure a timeline exists
  const body = { totalSlots: 12, intervalHours: 0.5, monthsAhead: 0.1, workStart: '09:00', workEnd: '18:00', timezone: 'America/Mexico_City' }
  await req('/api/timeline/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  // Filter by status=empty should return only empty slots
  const r = await req('/api/timeline/slots?status=empty&page=1&pageSize=20')
  assert.equal(r.status, 200)
  assert.equal(r.json.success, true)
  assert.ok(Array.isArray(r.json.items))
  for (const s of r.json.items) {
    assert.equal(s.status, 'empty')
  }
  console.log('✅ Timeline slots filters test passed')
}

run()
