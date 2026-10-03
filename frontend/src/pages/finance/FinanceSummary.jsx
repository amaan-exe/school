import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  PieChart as PieIcon,
  TrendingUp,
  Wallet,
  Search,
  AlertTriangle,
  ArrowLeftRight,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { financeAPI, structureAPI, paymentsAPI } from '../../api'
import {
  fmtMoney,
  fmtPercent,
  monthStartStr,
  ratioPercent,
  todayStr,
} from '../../utils/format'

// Indigo → violet → amber ramp; every slice stays inside the token palette.
const SLICE_COLORS = ['#4F46E5', '#7C3AED', '#C7D2FE', '#312E81', '#F59E0B', '#6366F1', '#DDD6FE']

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Last `count` calendar months ending with the current one, keyed "YYYY-MM".
const buildMonthKeys = (count = 6) => {
  const keys = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: `${MONTH_LABELS[d.getMonth()]} ${String(d.getFullYear()).slice(2)}`,
    })
  }
  return keys
}

// ─── Monthly collection trend (built from the payments ledger) ───────────────
const CollectionTrend = ({ yearFilter }) => {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const months = buildMonthKeys(6)
      const buckets = new Map(months.map((m) => [m.key, { period: m.label, amount: 0 }]))
      const res = await paymentsAPI.getAll({ status: 'successful', limit: 1000 })
      const rows = Array.isArray(res.data) ? res.data : []
      rows.forEach((p) => {
        if (!p.paid_on) return
        const key = String(p.paid_on).slice(0, 7)
        if (buckets.has(key)) {
          buckets.get(key).amount += Number(p.amount) || 0
        }
      })
      setData([...buckets.values()])
    } catch {
      setError('Could not load the collection trend.')
      setData([])
    } finally {
      setLoading(false)
    }
  }, [yearFilter])

  useEffect(() => {
    load()
  }, [load])

  const hasMoney = data.some((d) => (d.amount || 0) > 0)

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Collection trend</div>
          <div className="card-sub">Successful payments, last six months</div>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>
      <div className="card-body">
        {loading ? (
          <LoadingSpinner message="Loading collections…" />
        ) : error ? (
          <EmptyState title="Collection trend unavailable" desc={error} icon={AlertTriangle} />
        ) : !hasMoney ? (
          <EmptyState
            title="No collections in the last six months"
            desc="Once payments are recorded they chart here month by month."
            icon={TrendingUp}
          />
        ) : (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data}>
                <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                <XAxis dataKey="period" stroke="#94A3B8" fontSize={12} />
                <YAxis
                  stroke="#94A3B8"
                  fontSize={12}
                  tickFormatter={(v) => fmtMoney(v, { compact: true, decimals: 0 })}
                />
                <Tooltip formatter={(v) => fmtMoney(v)} />
                <Bar dataKey="amount" name="Collected" radius={[6, 6, 0, 0]}>
                  {data.map((entry, idx) => (
                    <Cell key={entry.period} fill={SLICE_COLORS[idx % SLICE_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Income vs expense over a chosen range ───────────────────────────────────
const IncomeStatementPanel = () => {
  const [start, setStart] = useState(monthStartStr())
  const [end, setEnd] = useState(todayStr())
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (start) params.start_date = start
      if (end) params.end_date = end
      const res = await financeAPI.incomeStatement(params)
      setData(res.data || null)
    } catch {
      setError('Could not load the income statement.')
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [start, end])

  useEffect(() => {
    load()
  }, [load])

  const incomeTotal = (data?.income_by_source || []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const expenseTotal = (data?.expense_by_category || []).reduce(
    (s, r) => s + (Number(r.amount) || 0),
    0
  )
  const hasData = incomeTotal > 0 || expenseTotal > 0
  const bars = hasData
    ? [
        { name: 'Income', amount: incomeTotal },
        { name: 'Expense', amount: expenseTotal },
      ]
    : []

  return (
    <div className="card">
      <div className="card-header">
        <div>
          <div className="card-title">Income vs expense</div>
          <div className="card-sub">Income statement over a date range</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            type="date"
            className="filter-select"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="Start date"
          />
          <input
            type="date"
            className="filter-select"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-label="End date"
          />
          <button className="btn btn-secondary btn-sm" onClick={load} disabled={loading}>
            Apply
          </button>
        </div>
      </div>
      <div className="card-body">
        {loading ? (
          <LoadingSpinner message="Loading income statement…" />
        ) : error ? (
          <EmptyState title="Income statement unavailable" desc={error} icon={AlertTriangle} />
        ) : !hasData ? (
          <EmptyState
            title="Nothing in this range"
            desc="No income or approved expenses were recorded between these dates."
            icon={ArrowLeftRight}
          />
        ) : (
          <>
            <div className="chart-container chart-container-sm">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bars}>
                  <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                  <XAxis dataKey="name" stroke="#94A3B8" fontSize={12} />
                  <YAxis
                    stroke="#94A3B8"
                    fontSize={12}
                    tickFormatter={(v) => fmtMoney(v, { compact: true, decimals: 0 })}
                  />
                  <Tooltip formatter={(v) => fmtMoney(v)} />
                  <Bar dataKey="amount" name="Amount" radius={[6, 6, 0, 0]}>
                    {bars.map((entry, idx) => (
                      <Cell key={entry.name} fill={SLICE_COLORS[idx % SLICE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="kv-list" style={{ marginTop: 16 }}>
              <div className="kv-row">
                <span className="k">Total income</span>
                <span className="v money-pos">{fmtMoney(incomeTotal)}</span>
              </div>
              <div className="kv-row">
                <span className="k">Total expense</span>
                <span className="v money-neg">{fmtMoney(expenseTotal)}</span>
              </div>
              <div className="kv-row">
                <span className="k">Net surplus</span>
                <span className="v">{fmtMoney(data?.net_surplus)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

const FinanceSummary = () => {
  const [summary, setSummary] = useState(null)
  const [outstanding, setOutstanding] = useState([])
  const [years, setYears] = useState([])
  const [yearFilter, setYearFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportLoading, setReportLoading] = useState(true)
  const [reportError, setReportError] = useState('')

  const loadSummary = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (yearFilter !== 'all') params.academic_year_id = yearFilter
      const [sumRes, yrRes] = await Promise.all([
        financeAPI.summary(params),
        structureAPI.academicYears({ limit: 100 }).catch(() => ({ data: [] })),
      ])
      setSummary(sumRes.data || {})
      setYears(Array.isArray(yrRes.data) ? yrRes.data : [])
    } catch {
      setError('Could not load the finance summary.')
      setSummary(null)
    } finally {
      setLoading(false)
    }
  }, [yearFilter])

  const loadOutstanding = useCallback(async () => {
    setReportLoading(true)
    setReportError('')
    try {
      const params = { limit: 200 }
      if (yearFilter !== 'all') params.academic_year_id = yearFilter
      const res = await financeAPI.outstanding(params)
      setOutstanding(Array.isArray(res.data) ? res.data : [])
    } catch {
      setReportError('Could not load the outstanding report.')
      setOutstanding([])
    } finally {
      setReportLoading(false)
    }
  }, [yearFilter])

  useEffect(() => {
    loadSummary()
  }, [loadSummary])

  useEffect(() => {
    loadOutstanding()
  }, [loadOutstanding])

  const filteredOutstanding = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return outstanding
    return outstanding.filter((r) => r.student_name?.toLowerCase().includes(q) || String(r.student_id) === q)
  }, [outstanding, search])

  const totalBilled = Number(summary?.total_billed) || 0
  const netBilled = Number(summary?.net_billed) || 0
  const collected = Number(summary?.collected) || 0
  const outstandingTotal = Number(summary?.outstanding) || 0
  const overdue = Number(summary?.overdue) || 0
  const expensesTotal = Number(summary?.expenses_total) || 0
  const collectionRate = ratioPercent(collected, netBilled)
  const hasBilling = totalBilled > 0 || collected > 0 || (summary?.by_fee_head?.length || 0) > 0

  const expensePie = useMemo(() => {
    const rows = summary?.expense_by_category || []
    return rows
      .filter((r) => (Number(r.amount) || 0) > 0)
      .map((r) => ({ name: r.category || 'Uncategorised', amount: Number(r.amount) || 0 }))
  }, [summary])

  const feeHeadRows = useMemo(() => {
    const rows = summary?.by_fee_head || []
    return rows
      .filter((r) => (Number(r.amount) || 0) > 0)
      .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
  }, [summary])

  if (loading) return <LoadingSpinner message="Loading finance summary…" />

  if (error && !summary) {
    return (
      <div>
        <div className="page-header">
          <div>
            <div className="page-title">Finance</div>
            <div className="page-subtitle">Collections, expenses and what is still owed.</div>
          </div>
        </div>
        <div className="card">
          <EmptyState
            title="Finance summary unavailable"
            desc={error}
            icon={AlertTriangle}
            action={
              <button className="btn btn-primary" onClick={loadSummary}>
                Try again
              </button>
            }
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Finance</div>
          <div className="page-subtitle">
            Collections, expenses and what families still owe — one screen for the whole year.
          </div>
        </div>
        <div className="page-actions">
          <select
            className="filter-select"
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
          >
            <option value="all">All academic years</option>
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">Net billed</div>
          <div className="v">{fmtMoney(netBilled, { decimals: 0 })}</div>
          <div className="s">Gross {fmtMoney(totalBilled, { decimals: 0 })} before discounts</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Collected</div>
          <div className="v">{fmtMoney(collected, { decimals: 0 })}</div>
          <div className="s">{fmtPercent(collected, netBilled)} of net billed</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Outstanding</div>
          <div className="v">{fmtMoney(outstandingTotal, { decimals: 0 })}</div>
          <div className="s">Overdue {fmtMoney(overdue, { decimals: 0 })}</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Expenses</div>
          <div className="v">{fmtMoney(expensesTotal, { decimals: 0 })}</div>
          <div className="s">Approved and paid</div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginBottom: 24 }}>
        <CollectionTrend yearFilter={yearFilter} />
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Expense mix</div>
              <div className="card-sub">Approved and paid, by category</div>
            </div>
          </div>
          <div className="card-body">
            {expensePie.length === 0 ? (
              <EmptyState
                title="No expenses yet"
                desc="Approve an expense and the category split appears here."
                icon={PieIcon}
              />
            ) : (
              <div className="chart-container chart-container-sm">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expensePie}
                      dataKey="amount"
                      nameKey="name"
                      innerRadius="48%"
                      outerRadius="78%"
                      paddingAngle={2}
                    >
                      {expensePie.map((entry, idx) => (
                        <Cell key={entry.name} fill={SLICE_COLORS[idx % SLICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => fmtMoney(v)} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginBottom: 24 }}>
        <IncomeStatementPanel />
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Billed by fee head</div>
              <div className="card-sub">Where the billing went</div>
            </div>
          </div>
          <div className="card-body">
            {!hasBilling ? (
              <EmptyState
                title="No billing data yet"
                desc="Raise an invoice and the fee-head split fills in here."
                icon={Wallet}
              />
            ) : feeHeadRows.length === 0 ? (
              <EmptyState title="No fee-head breakdown" desc="No invoice lines to group yet." icon={Wallet} />
            ) : (
              <div className="kv-list">
                {feeHeadRows.map((r) => (
                  <div className="kv-row" key={r.fee_head_id ?? r.fee_head}>
                    <span className="k">{r.fee_head || 'Uncategorised'}</span>
                    <span className="v">{fmtMoney(r.amount)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card-header" style={{ borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0' }}>
        <div>
          <div className="card-title">Outstanding by student</div>
          <div className="card-sub">Who owes what, and for how long</div>
        </div>
        {hasBilling && (
          <div style={{ minWidth: 180 }}>
            <div className="progress-bar">
              <div className="progress-bar-fill" style={{ width: `${collectionRate}%` }} />
            </div>
            <div className="form-hint">{fmtPercent(collected, netBilled)} collected</div>
          </div>
        )}
      </div>

      <div className="filter-bar" style={{ marginTop: 16 }}>
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        {reportLoading ? (
          <LoadingSpinner message="Loading outstanding balances…" />
        ) : reportError ? (
          <EmptyState title="Outstanding report unavailable" desc={reportError} icon={AlertTriangle} />
        ) : filteredOutstanding.length === 0 ? (
          <EmptyState
            title="Nothing outstanding"
            desc="Every invoice in this scope is settled. That is worth celebrating."
            icon={Wallet}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Grade</th>
                  <th className="num">Billed</th>
                  <th className="num">Paid</th>
                  <th className="num">Outstanding</th>
                  <th className="num">Overdue</th>
                  <th className="num">Days</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutstanding.map((r) => (
                  <tr key={r.student_id}>
                    <td className="cell-name">{r.student_name || `Student #${r.student_id}`}</td>
                    <td>{r.grade || <span className="muted-cell">—</span>}</td>
                    <td className="num">{fmtMoney(r.total_billed)}</td>
                    <td className="num money-pos">{fmtMoney(r.total_paid)}</td>
                    <td className="num">{fmtMoney(r.outstanding)}</td>
                    <td className="num">
                      {Number(r.overdue_amount) > 0 ? (
                        <Badge variant="danger">{fmtMoney(r.overdue_amount)}</Badge>
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                    <td className="num">{Number(r.days_overdue) > 0 ? r.days_overdue : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="pagination">
        <span className="pagination-info">
          Showing {filteredOutstanding.length} of {outstanding.length} students with a balance
        </span>
      </div>
    </div>
  )
}

export default FinanceSummary