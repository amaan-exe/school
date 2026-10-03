// ─── Small shared formatters (no new dependencies) ───────────────────────────
// Everything here is defensive: the ERP API returns floats, nulls and (for the
// finance aggregates) all-zero payloads, so nothing is allowed to leak NaN,
// Infinity or "Invalid Date" into the UI.

export const CURRENCY_SYMBOL = '$'

const num = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Money with thousands separators. `compact` shortens thousands/millions for
// chart axes so the tick labels never overlap.
export const fmtMoney = (value, { compact = false, decimals = 2 } = {}) => {
  const n = num(value)
  if (compact) {
    const abs = Math.abs(n)
    if (abs >= 1000000) return `${CURRENCY_SYMBOL}${trimZeros(n / 1000000, 1)}M`
    if (abs >= 1000) return `${CURRENCY_SYMBOL}${trimZeros(n / 1000, 1)}k`
  }
  const fixed = n.toFixed(decimals)
  const [whole, frac] = fixed.split('.')
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${CURRENCY_SYMBOL}${frac ? `${grouped}.${frac}` : grouped}`
}

const trimZeros = (n, digits) => {
  const s = n.toFixed(digits)
  return s.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1')
}

export const fmtCount = (value) => num(value).toLocaleString()

// Percentage guarded against a zero (or missing) denominator.
export const fmtPercent = (value, total, decimals = 0) => {
  const t = num(total)
  if (t <= 0) return '0%'
  const pct = (num(value) / t) * 100
  if (!Number.isFinite(pct)) return '0%'
  return `${pct.toFixed(decimals)}%`
}

// Safe ratio used for progress bars (0..100, clamped, never NaN).
export const ratioPercent = (value, total) => {
  const t = num(total)
  if (t <= 0) return 0
  const pct = (num(value) / t) * 100
  if (!Number.isFinite(pct)) return 0
  return Math.max(0, Math.min(100, pct))
}

export const todayStr = () => new Date().toISOString().slice(0, 10)

export const monthStartStr = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10)
}

export const fmtDay = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Numbers for form inputs: '' when empty, otherwise the raw value (no NaN).
export const inputNumber = (value) => {
  if (value === null || value === undefined || value === '') return ''
  const n = Number(value)
  return Number.isFinite(n) ? n : ''
}

export const optInt = (value) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? Math.trunc(n) : null
}

// Float variant (money, percentages) — keeps the decimals the API expects.
export const optNum = (value) => {
  if (value === null || value === undefined || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export const trimOrNull = (value) => {
  const s = (value ?? '').toString().trim()
  return s === '' ? null : s
}

// axios error → human message (matches the phrasing used by the older pages).
export const errDetail = (err, fallback) =>
  err?.response?.data?.detail || fallback || 'Something went wrong. Please try again.'