async function makeRequest(url, options = {}) {
  const res = await fetch(url, options)
  const text = await res.text()
  try { return JSON.parse(text) } catch { return { success: false, error: text } }
}

async function run() {
  const base = 'http://localhost:3000'

  const newPrompt = {
    name: `Test Prompt ${Date.now()}`,
    content: 'Generate content about {topic}',
    variables: ['topic']
  }
  const create = await makeRequest(`${base}/api/config/prompts`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(newPrompt)
  })
  if (!create.success) {
    console.error('❌ Failed to create prompt:', create.error)
    process.exit(1)
  }

  const list = await makeRequest(`${base}/api/config/prompts`)
  if (!list.success) {
    console.error('❌ Failed to list prompts:', list.error)
    process.exit(1)
  }
  const prompts = Array.isArray(list.prompts) ? list.prompts : Object.values(list.prompts || {})
  const found = prompts.find(p => p.name === newPrompt.name)
  if (!found) {
    console.error('❌ Created prompt not found')
    process.exit(1)
  }
  console.log('✅ Prompts CRUD works, created prompt present')
}

run()
