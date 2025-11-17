import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations')

function listSqlFiles(dir) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql'))
  files.sort()
  const full = files.map(f => path.join(dir, f))
  const execFile = full.find(f => f.includes('create_exec_sql'))
  if (execFile) {
    return [execFile, ...full.filter(f => f !== execFile)]
  }
  return full
}

async function applyFile(file) {
  const sql = fs.readFileSync(file, 'utf8')
  const { error } = await supabase.rpc('exec_sql', { sql })
  if (error) {
    console.error(`❌ Migration failed: ${path.basename(file)} -> ${error.message}`)
    throw error
  } else {
    console.log(`✅ Applied: ${path.basename(file)}`)
  }
}

async function main() {
  try {
    const files = listSqlFiles(migrationsDir)
    if (files.length === 0) {
      console.log('No migrations found')
      return
    }
    for (const file of files) {
      console.log(`➡️  Applying ${path.basename(file)}`)
      await applyFile(file)
    }
    console.log('🎉 All migrations applied successfully')
  } catch (e) {
    process.exit(1)
  }
}

main()
