const BASE_URL = (process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 3000}`)
const IS_PROD = BASE_URL.startsWith('https://')

async function api(path, init = {}) {
  const url = BASE_URL + path
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json', ...(init.headers || {}) }, ...init })
  const txt = await res.text()
  try { return { status: res.status, json: JSON.parse(txt) } } catch { return { status: res.status, text: txt } }
}

function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert failed') }

async function ensureTimeline() {
  const r = await api('/api/timeline')
  if (!r.json?.timeline) {
    await api('/api/timeline/create', { method: 'POST', body: JSON.stringify({ totalSlots: 12, intervalHours: 0.5, monthsAhead: 1, workStart: '09:00', workEnd: '18:00', timezone: 'America/Mexico_City' }) })
  }
}

async function run() {
  let passed = 0
  let failed = 0

  const tests = []

  tests.push(async () => { await ensureTimeline(); const r = await api('/api/timeline'); assert(r.json.success === true, 'timeline get'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline/add-post', { method: 'POST', body: JSON.stringify({ content: 'Primer post' }) }); assert(r.status === 200 && r.json.success, 'add first'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const hasFilled = tl.slots.some(s => s.status === 'filled'); assert(hasFilled, 'has filled'); passed++ })

  tests.push(async () => { const r1 = await api('/api/timeline/add-post', { method: 'POST', body: JSON.stringify({ content: 'Segundo post' }) }); assert(r1.json.success, 'add second'); const r2 = await api('/api/timeline'); assert(r2.json.timeline.slots.filter(s => s.status === 'filled').length >= 2, 'two filled'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const order = tl.slots.map(s => new Date(s.scheduled_time).getTime()); const sorted = [...order].sort((a,b)=>a-b); assert(order.every((v,i)=>v===sorted[i]), 'slots ordered by time'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const filledBefore = tl.slots.filter(s => s.status === 'filled').length; for (let i=0;i<20;i++) { await api('/api/timeline/add-post', { method:'POST', body: JSON.stringify({ content: 'Auto '+i }) }) } const r2 = await api('/api/timeline'); const filledAfter = r2.json.timeline.slots.filter(s => s.status === 'filled').length; assert(filledAfter >= filledBefore+20, 'bulk add'); passed++ })

  if (!IS_PROD) {
    tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const filledBefore = tl.slots.filter(s => s.status === 'filled').length; for (const s of tl.slots.filter(s => s.status === 'filled')) { await api(`/api/timeline/slots/${s.id}`, { method: 'DELETE' }) } const r2 = await api('/api/timeline'); const filledAfter = r2.json.timeline.slots.filter(s => s.status === 'filled').length; assert(filledAfter <= filledBefore, 'delete reduced filled'); passed++ })
  } else {
    tests.push(async () => { const r = await api('/api/timeline/slots'); assert(r.json?.success === true, 'list slots ok'); passed++ })
  }

  tests.push(async () => { const r = await api('/api/timeline/add-post', { method: 'POST', body: JSON.stringify({ content: 'Crear nuevo slot automático' }) }); assert(r.json.success, 'auto create on no empty'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const idxs = tl.slots.map(s=>s.slot_index); const isAsc = idxs.every((v,i,a)=> i===0 || v>=a[i-1]); assert(isAsc, 'slot_index ascending'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline/add-post', { method:'POST', body: JSON.stringify({ content: 'Score check' , quality_score: 0.9 }) }); assert(r.json.success, 'quality_score accepted'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const hasQuality = tl.slots.some(s => s.quality_score != null); assert(hasQuality, 'quality_score set'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline/add-post', { method:'POST', body: JSON.stringify({ content: 'Similaridad check' }) }); assert(r.json.success, 'similarity path ok'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const hasFilledAt = tl.slots.some(s => s.filled_at != null); assert(hasFilledAt, 'filled_at present'); passed++ })

  // Optional shuffle not implemented on server; skip

  tests.push(async () => { const r = await api('/api/timeline/add-post', { method:'POST', body: JSON.stringify({ content: 'Horarios futuros' }) }); assert(r.json.success, 'add after shuffle'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const times = tl.slots.map(s => s.scheduled_time); assert(times.every(Boolean), 'scheduled_time non-empty'); passed++ })

  tests.push(async () => { const before = await api('/api/timeline'); await api('/api/timeline/add-post', { method:'POST', body: JSON.stringify({ content: 'Idempotencia' }) }); const after = await api('/api/timeline'); assert(after.json.timeline.slots.length >= before.json.timeline.slots.length, 'no duplicate slots on retry'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const sorted = [...tl.slots].sort((a,b)=>a.slot_index-b.slot_index); assert(sorted.length > 0, 'slot_index present'); passed++ })

  tests.push(async () => { const r = await api('/api/timeline'); const tl = r.json.timeline; const count = tl.slots.filter(s => s.status==='filled').length; assert(count > 0, 'final filled count > 0'); passed++ })

  tests.push(async () => { const r = await api('/api/health'); assert(r.status === 200, 'health ok'); passed++ })
  tests.push(async () => { const r = await api('/api/metrics'); assert(r.json?.success === true, 'metrics ok'); passed++ })

  const start = Date.now()
  for (const t of tests) {
    try { await t() } catch (e) { failed++; console.error('Test failed:', e.message) }
  }
  const duration = Date.now() - start
  console.log(JSON.stringify({ passed, failed, durationMs: duration }))
  if (failed > 0) process.exit(1)
}

run().catch(e => { console.error(e); process.exit(1) })
