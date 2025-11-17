import assert from 'node:assert/strict'

async function req(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, options)
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, text } }
}

async function run() {
  const pub = await req('/api/health')
  const supa = pub.json.supabase
  const body = { totalSlots: 12, intervalHours: 0.5, monthsAhead: 0.1, workStart: '09:00', workEnd: '18:00', timezone: 'America/Mexico_City' }
  const create = await req('/api/timeline/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(create.status, 200)
  const list = await req('/api/timeline/slots?page=1&pageSize=100')
  assert.equal(list.status, 200)
  assert.equal(list.json.success, true)
  assert.ok(Array.isArray(list.json.items))
  if (supa) {
    assert.equal(typeof list.json.total, 'number')
    assert.ok(list.json.items.length <= 100)
  }
  console.log('✅ Timeline slots pagination test passed')
}

run()
