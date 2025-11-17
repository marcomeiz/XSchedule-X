import assert from 'node:assert/strict'
import { calculateSlots } from './server-enhanced.js'

const slots = calculateSlots(4, 1, 0.1, '09:00', '18:00', 'America/Mexico_City')
assert.ok(Array.isArray(slots))
assert.ok(slots.length > 0)
for (const s of slots.slice(0, 5)) {
  assert.ok(typeof s.scheduled_time === 'string')
  assert.ok(s.status === 'empty')
}
console.log('✅ Timeline calculateSlots test passed')
