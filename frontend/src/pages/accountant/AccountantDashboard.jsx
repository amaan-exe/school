import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Wallet,
  CreditCard,
  AlertTriangle,
  Receipt,
  ArrowRight,
  Check,
  TrendingUp,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import Badge from '../../components/Badge'
import { financeAPI, paymentsAPI, expensesAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { fmtMoney, fmtPercent, ratioPercent, todayStr } from '../../utils/format'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const buildMonthKeys = (count = 6) => {
  const keys = []
  const now = new Date()
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    keys.push({
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: MONTH_LABELS[d.getMonth()],
    })
  }
  return keys
}

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const dateLine = () =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

const AccountantDashboard = () => {
  const { user, hasRole } = useAuth()
  // Approve/reject on the backend is admin/principal/vice_principal only.
  const canApprove = hasRole(['admin', 'principal', 'vice_principal'])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [finance, setFinance] = useState(null)
  const [financeError, setFinanceError] = useState('')
  const [payments, setPayments] = useState([])
  const [expenses, setExpenses] = useState([])
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      setFinanceError('')
      const [finRes, payRes, expRes] = await Promise.all([
        financeAPI.summary().catch((e) => {
          if (mounted) setFinanceError('The finance summary is not available for your account.')
          return { data: null }
        }),
        paymentsAPI.getAll({ limit: 100 }).catch(() => ({ data: [] })),
        expensesAPI.getAll({ status: 'pending', limit: 100 }).catch(() => ({ data: [] })),
      ])
      if (!mounted) return
      setFinance(finRes?.data || null)
      setPayments(Array.isArray(payRes.data) ? payRes.data : [])
      setExpenses(Array.isArray(expRes.data) ? expRes.data : [])
      if (!finRes?.data && !payRes?.data) {
        setError('Could not load the accounts desk. Please try again.')
      }
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const monthly = useMemo(() => {
    const months = buildMonthKeys(6)
    const buckets = new Map(months.map((m) => [m.key, { period: m.label, amount: 0 }]))
    payments
      .filter((p) => p.status === 'successful' && p.paid_on)
      .forEach((p) => {
        const key = String(p.paid_on).slice(0, 7)
        if (buckets.has(key)) buckets.get(key).amount += Number(p.amount) || 0
      })
    return [...buckets.values()]
  }, [payments])

  const recentPayments = payments.slice(0, 8)
  const pendingExpenses = expenses.slice(0, 8)
  const today = todayStr()

  const collectionsToday = payments
    .filter((p) => p.status === 'successful' && p.paid_on === today)
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const collectionsFromList = payments
    .filter((p) => p.status === 'successful')
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const todayTotal = Number(finance?.today_collection ?? collectionsToday) || 0
  const monthTotal = Number(finance?.month_collection ?? collectionsFromList) || 0
  const outstanding = Number(finance?.outstanding) || 0
  const overdue = Number(finance?.overdue) || 0
  const overdueCount = useMemo(() => {
    const byStudent = finance?.outstanding_by_student || {}
    const rows = Object.values(byStudent)
      .map((v) => Number(v) || 0)
      .filter((v) => v > 0)
    return rows.length
  }, [finance])
  const collectionRate = ratioPercent(Number(finance?.collected) || 0, Number(finance?.net_billed) || 0)

  const approveExpense = async (expense) => {
    setBusyId(expense.id)
    try {
      await expensesAPI.approve(expense.id)
      setExpenses((prev) => prev.filter((e) => e.id !== expense.id))
    } catch {
      setError('Could not approve that expense.')
    } finally {
      setBusyId(null)
    }
  }

  const hasMonthly = monthly.some((m) => (m.amount || 0) > 0)

  if (loading) return <LoadingSpinner message="Loading the accounts desk…" />

  return (
    <div className="brief-hero">
      <div className="page-header">
        <div>
          <div className="page-kicker">{dateLine()}</div>
          <h1 className="brief-greeting">
            {greeting()}, <em>{user?.name?.split(' ')[0] || 'Accountant'}</em>.
          </h1>
          <p className="brief-sub">
            Collections, dues and the expense queue — the money side of the school, start to finish.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/app/expenses" className="btn btn-secondary">
            Expenses
          </Link>
          <Link to="/app/finance" className="btn btn-primary">
            Finance summary <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {financeError && <div className="form-error">{financeError}</div>}

      <div className="grid grid-cols-4" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Collected today</div>
          <div className="stat-value">{fmtMoney(todayTotal, { decimals: 0 })}</div>
          <div className="stat-sub">Successful payments today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Collected this month</div>
          <div className="stat-value">{fmtMoney(monthTotal, { decimals: 0 })}</div>
          <div className="stat-sub">
            {fmtPercent(Number(finance?.collected) || 0, Number(finance?.net_billed) || 0)} of net billed
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Outstanding</div>
          <div className="stat-value">{fmtMoney(outstanding, { decimals: 0 })}</div>
          <div className="stat-sub">Across {overdueCount} students with a balance</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Overdue</div>
          <div className="stat-value">{fmtMoney(overdue, { decimals: 0 })}</div>
          <div className="stat-sub">Past the invoice due date</div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Collections</div>
              <div className="card-sub">Successful payments, last six months</div>
            </div>
            <Link to="/app/payments" className="row-action">
              <CreditCard size={13} /> Payments
            </Link>
          </div>
          <div className="card-body">
            {!hasMonthly ? (
              <EmptyState
                title="No collections recorded"
                desc="Payments you record chart here month by month."
                icon={TrendingUp}
              />
            ) : (
              <>
                <div className="chart-container">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={monthly}>
                      <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                      <XAxis dataKey="period" stroke="#94A3B8" fontSize={12} />
                      <YAxis
                        stroke="#94A3B8"
                        fontSize={12}
                        tickFormatter={(v) => fmtMoney(v, { compact: true, decimals: 0 })}
                      />
                      <Tooltip formatter={(v) => fmtMoney(v)} />
                      <Bar dataKey="amount" name="Collected" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {finance && (
                  <div style={{ marginTop: 14 }}>
                    <div className="progress-bar">
                      <div className="progress-bar-fill" style={{ width: `${collectionRate}%` }} />
                    </div>
                    <div className="form-hint">
                      {fmtPercent(Number(finance.collected) || 0, Number(finance.net_billed) || 0)} of{' '}
                      {fmtMoney(Number(finance.net_billed) || 0, { decimals: 0 })} net billed
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Expense approvals</div>
              <div className="card-sub">Waiting on you</div>
            </div>
            <Link to="/app/expenses" className="row-action">
              <Receipt size={13} /> All
            </Link>
          </div>
          <div className="card-body">
            {pendingExpenses.length === 0 ? (
              <EmptyState title="Queue is clear" desc="No expenses are waiting for approval." icon={Receipt} />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Expense</th>
                      <th className="num">Amount</th>
                      <th style={{ textAlign: 'right' }}>{canApprove ? 'Action' : 'Status'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingExpenses.map((e) => (
                      <tr key={e.id}>
                        <td>
                          <div className="cell-name">{e.payee || e.description || `Expense #${e.id}`}</div>
                          <div className="cell-sub">{e.expense_date || 'No date'}</div>
                        </td>
                        <td className="num">{fmtMoney(e.amount)}</td>
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            {canApprove ? (
                              <button
                                className="row-action success"
                                onClick={() => approveExpense(e)}
                                disabled={busyId === e.id}
                              >
                                <Check size={13} /> Approve
                              </button>
                            ) : (
                              <Badge variant="warning">pending</Badge>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Recent payments</div>
            <div className="card-sub">Latest money in</div>
          </div>
          <Link to="/app/payments" className="row-action">
            All payments
          </Link>
        </div>
        <div className="card-body">
          {recentPayments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              desc="Recorded payments appear here with their receipt numbers."
              icon={CreditCard}
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Student</th>
                    <th>Method</th>
                    <th>Paid on</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="cell-name">{p.receipt_no || `#${p.id}`}</td>
                      <td>Student #{p.student_id}</td>
                      <td>{p.method}</td>
                      <td>{p.paid_on || '—'}</td>
                      <td className="num">{fmtMoney(p.amount)}</td>
                      <td>
                        <Badge
                          variant={
                            p.status === 'successful'
                              ? 'success'
                              : p.status === 'failed'
                              ? 'danger'
                              : 'warning'
                          }
                        >
                          {p.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div className="card-title">Shortcuts</div>
        </div>
        <div className="card-body">
          <div className="quick-actions">
            <Link to="/app/invoices" className="quick-action-btn">
              <Wallet /> <span>Raise an invoice</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/payments" className="quick-action-btn">
              <CreditCard /> <span>Record a payment</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/expenses" className="quick-action-btn">
              <Receipt /> <span>Approve expenses</span>
              <span className="qa-go">›</span>
            </Link>
            {outstanding > 0 && (
              <Link to="/app/finance" className="quick-action-btn">
                <AlertTriangle /> <span>Chase {fmtMoney(outstanding, { decimals: 0 })} outstanding</span>
                <span className="qa-go">›</span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default AccountantDashboard