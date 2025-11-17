import assert from 'node:assert/strict'
import {
  checkLength,
  checkBannedContent,
  checkChecklistPattern,
  checkAIDetection,
  calculateJudgeScore,
  calculateJudgeConfidence
} from './server-enhanced.js'

const restriction = {
  min_length: 40,
  max_length: 280,
  mode_length_limits: { reply: [20, 220] },
  banned_substrings: ['forbidden'],
  banned_prefixes: ['badstart'],
  ai_cop_threshold: 0.4,
  checklist_pattern: '^\\s*(\\d+\\.|[-*])\\s+.*$'
}

const contentOk = 'Este es un contenido humano claro y suficiente, sin patrones de lista ni palabras prohibidas.'
const contentShort = 'Corto'
const contentBanned = 'badstart ejemplo de contenido'
const contentChecklist = '- item uno\n- item dos\n- item tres'
const contentAIish = 'I apologize, as an AI I cannot provide that'

const lengthRes = checkLength(contentOk, false, restriction)
assert.equal(lengthRes.passed, true)

const lengthReplyRes = checkLength(contentOk, true, restriction)
assert.equal(lengthReplyRes.passed, true)

const lengthFail = checkLength(contentShort, false, restriction)
assert.equal(lengthFail.passed, false)

const bannedRes = checkBannedContent(contentBanned, restriction)
assert.equal(bannedRes.passed, false)
assert.ok(bannedRes.foundPrefixes.includes('badstart'))

const checklistRes = checkChecklistPattern(contentChecklist, restriction)
assert.equal(checklistRes.passed, false)

const aiRes = checkAIDetection(contentAIish, restriction)
assert.equal(aiRes.passed, false)

const checks = {
  length: lengthRes,
  bannedContent: { passed: true },
  aiDetection: { passed: true },
  checklistPattern: { passed: true },
  similarity: { passed: true }
}

const score = calculateJudgeScore(checks)
assert.equal(score, 100)

const confidence = calculateJudgeConfidence(checks)
assert.ok(confidence > 0)

console.log('✅ Judge functions tests passed')
