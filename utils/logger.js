function ts() {
  return new Date().toISOString()
}

function base(level, message, meta = {}) {
  const payload = { level, time: ts(), message, ...meta }
  process.stdout.write(JSON.stringify(payload) + "\n")
}

export function info(message, meta) { base('info', message, meta) }
export function warn(message, meta) { base('warn', message, meta) }
export function error(message, meta) { base('error', message, meta) }

