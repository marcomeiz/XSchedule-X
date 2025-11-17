const store = new Map()

function record(event, ms) {
  const arr = store.get(event) || []
  arr.push(ms)
  if (arr.length > 500) arr.shift()
  store.set(event, arr)
}

function percentile(values, p) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))]
}

function summary() {
  const out = {}
  for (const [key, arr] of store.entries()) {
    const mean = arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0
    out[key] = {
      count: arr.length,
      mean: Math.round(mean),
      p50: Math.round(percentile(arr, 50)),
      p95: Math.round(percentile(arr, 95)),
      p99: Math.round(percentile(arr, 99))
    }
  }
  return out
}

export const Metrics = { record, summary }

