import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_KEY
if (!url || !serviceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}
const supabase = createClient(url, serviceKey)

async function run() {
  const { data: cols, error: colErr } = await supabase.rpc('exec_sql', { sql: "select column_name from information_schema.columns where table_schema='public' and table_name='slots'" })
  if (colErr) { console.error('Column check error', colErr.message); process.exit(1) }
  const rows = Array.isArray(cols) ? cols : []
  const existing = new Set(rows.map(r => r.column_name))
  const alters = []
  if (!existing.has('tweet_id')) alters.push('ALTER TABLE slots ADD COLUMN IF NOT EXISTS tweet_id TEXT;')
  if (!existing.has('error_message')) alters.push('ALTER TABLE slots ADD COLUMN IF NOT EXISTS error_message TEXT;')
  if (!existing.has('filled_at')) alters.push('ALTER TABLE slots ADD COLUMN IF NOT EXISTS filled_at TIMESTAMPTZ;')
  if (!existing.has('published_at')) alters.push('ALTER TABLE slots ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;')
  if (!existing.has('quality_score')) alters.push('ALTER TABLE slots ADD COLUMN IF NOT EXISTS quality_score NUMERIC;')
  if (!existing.has('similarity')) alters.push('ALTER TABLE slots ADD COLUMN IF NOT EXISTS similarity NUMERIC;')
  for (const sql of alters) {
    const { error } = await supabase.rpc('exec_sql', { sql })
    if (error) console.log('Alter error', error.message)
    else console.log('Applied:', sql)
  }
  console.log('Done')
}

run().catch(e => { console.error(e); process.exit(1) })
