import assert from 'node:assert/strict'

async function req(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, options)
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, text } }
}

async function run() {
  let r = await req('/api/timeline')
  assert.equal(r.status, 200)
  assert.equal(r.json.success, true)
  assert.ok(Array.isArray(r.json.slots))

  const body = {
    totalSlots: 12,
    intervalHours: 0.5,
    monthsAhead: 0.1,
    workStart: '09:00',
    workEnd: '18:00',
    timezone: 'America/Mexico_City'
  }
  r = await req('/api/timeline/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  assert.equal(r.status, 200)
  assert.equal(r.json.success, true)
  assert.ok(r.json.timeline)
  assert.ok(Array.isArray(r.json.timeline.slots))

  const body2 = { ...body, totalSlots: 8 }
  const r3 = await req('/api/timeline/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body2) })
  assert.equal(r3.status, 200)
  assert.equal(r3.json.success, true)
  assert.equal(typeof r3.json.preservedCount, 'number')
  assert.equal(typeof r3.json.publishedCount, 'number')

  console.log('✅ Timeline endpoints tests passed')
}

run()
