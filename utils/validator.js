export function validateGenerateBody(body) {
  const modes = new Set(['ops', 'chaos', 'reply'])
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid JSON body' }
  if (!body.mode || !modes.has(String(body.mode))) return { ok: false, error: 'Invalid mode' }
  if (body.prompt && typeof body.prompt !== 'string') return { ok: false, error: 'Invalid prompt' }
  if (body.promptId && typeof body.promptId !== 'string') return { ok: false, error: 'Invalid promptId' }
  return { ok: true }
}

export function validatePromptCreate(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid JSON body' }
  if (!body.name || typeof body.name !== 'string') return { ok: false, error: 'Name required' }
  if (!body.content || typeof body.content !== 'string') return { ok: false, error: 'Content required' }
  if (body.variables && !Array.isArray(body.variables)) return { ok: false, error: 'Variables must be array' }
  return { ok: true }
}

export function validateJudgeRestriction(body) {
  if (!body || typeof body !== 'object') return { ok: false, error: 'Invalid JSON body' }
  if (!body.name || typeof body.name !== 'string') return { ok: false, error: 'Name required' }
  if (body.description && typeof body.description !== 'string') return { ok: false, error: 'Invalid description' }
  const ints = [
    ['min_length', 0, 10000],
    ['max_length', 1, 10000]
  ]
  for (const [k, min, max] of ints) {
    if (body[k] != null) {
      const v = parseInt(body[k], 10)
      if (Number.isNaN(v) || v < min || v > max) return { ok: false, error: `Invalid ${k}` }
    }
  }
  const floats = [
    ['min_similarity', 0, 1],
    ['max_similarity', 0, 1],
    ['reply_min_context_similarity', 0, 1],
    ['reply_max_context_similarity', 0, 1],
    ['ai_cop_threshold', 0, 1]
  ]
  for (const [k, min, max] of floats) {
    if (body[k] != null) {
      const v = Number(body[k])
      if (!Number.isFinite(v) || v < min || v > max) return { ok: false, error: `Invalid ${k}` }
    }
  }
  const arrays = ['banned_substrings', 'banned_prefixes', 'reply_banned_hooks']
  for (const k of arrays) {
    if (body[k] != null) {
      if (!Array.isArray(body[k])) return { ok: false, error: `Invalid ${k}` }
    }
  }
  if (body.checklist_pattern && typeof body.checklist_pattern !== 'string') return { ok: false, error: 'Invalid checklist_pattern' }
  if (body.mode_length_limits && typeof body.mode_length_limits !== 'object') return { ok: false, error: 'Invalid mode_length_limits' }
  return { ok: true }
}
