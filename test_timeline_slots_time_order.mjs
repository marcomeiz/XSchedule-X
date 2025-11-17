import assert from 'node:assert/strict'

async function req(path, options = {}) {
  const res = await fetch(`http://localhost:3000${path}`, options)
  const text = await res.text()
  try { return { status: res.status, json: JSON.parse(text) } } catch { return { status: res.status, text } }
}

function isSorted(items, desc) {
  for (let i = 1; i < items.length; i++) {
    const a = new Date(items[i - 1].scheduled_time).getTime()
    const b = new Date(items[i].scheduled_time).getTime()
    if (desc ? a < b : a > b) return false
  }
  return true
}

async function run() {
  const now = new Date()
  const from = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  const to = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const r = await req(`/api/timeline/slots?scheduled_from=${encodeURIComponent(from)}&scheduled_to=${encodeURIComponent(to)}&order=desc&orderBy=scheduled_time&page=1&pageSize=50`)
  assert.equal(r.status, 200)
  assert.equal(r.json.success, true)
  assert.ok(Array.isArray(r.json.items))
  if (r.json.items.length > 1) {
    assert.ok(isSorted(r.json.items, true))
  }
  for (const s of r.json.items) {
    const t = new Date(s.scheduled_time).toISOString()
    assert.ok(t >= from && t <= to)
  }
  console.log('✅ Timeline slots time range & order test passed')
}

run()
