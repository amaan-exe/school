import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, CreditCard, CheckCheck, XCircle, ArrowLeftRight } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { paymentsAPI, invoicesAPI, studentsAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, fmtMoney, optInt, todayStr, trimOrNull } from '../../utils/format'

const STATUSES = ['initiated', 'pending', 'successful', 'failed', 'refunded']
const METHODS = ['cash', 'cheque', 'card', 'bank_transfer', 'online', 'gateway']

const statusVariant = (s) => {
  switch (s) {
    case 'successful':
      return 'success'
    case 'failed':
      return 'danger'
    case 'refunded':
      return 'neutral'
    case 'pending':
    case 'initiated':
      return 'warning'
    default:
      return 'neutral'
  }
}

const emptyPay = {
  invoice_id: '',
  student_id: '',
  amount: '',
  method: 'cash',
  reference_no: '',
  paid_on: todayStr(),
  status: 'successful',
  note: '',
}
const emptyRefund = { amount: '', reason: '', status: 'completed' }

const Payments = () => {
  const { hasRole, hasPermission } = useAuth()
  const canWrite = hasRole(['admin', 'accountant']) || (hasRole(['staff']) && hasPermission('fees', 'write'))

  const [payments, setPayments] = useState([])
  const [students, setStudents] = useState([])
  const [invoices, setInvoices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [studentFilter, setStudentFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyPay)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [refundTarget, setRefundTarget] = useState(null)
  const [refundForm, setRefundForm] = useState(emptyRefund)
  const [refundSaving, setRefundSaving] = useState(false)
  const [refundError, setRefundError] = useState('')

  const studentName = (id) => students.find((s) => s.id === id)?.name || `Student #${id}`
  const invoiceNo = (id) => invoices.find((i) => i.id === id)?.invoice_no || (id ? `#${id}` : '—')

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { limit: 300 }
      if (statusFilter !== 'all') params.status = statusFilter
      if (studentFilter !== 'all') params.student_id = studentFilter
      const [pRes, stuRes, invRes] = await Promise.all([
        paymentsAPI.getAll(params),
        studentsAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
        invoicesAPI.getAll({ limit: 300 }).catch(() => ({ data: [] })),
      ])
      setPayments(Array.isArray(pRes.data) ? pRes.data : [])
      setStudents(Array.isArray(stuRes.data) ? stuRes.data : [])
      setInvoices(Array.isArray(invRes.data) ? invRes.data : [])
    } catch {
      setError('Could not load payments. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, studentFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return payments
    return payments.filter(
      (p) =>
        p.receipt_no?.toLowerCase().includes(q) ||
        p.reference_no?.toLowerCase().includes(q) ||
        studentName(p.student_id).toLowerCase().includes(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payments, search, students])

  const stats = useMemo(() => {
    const collected = payments
      .filter((p) => p.status === 'successful')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const pending = payments
      .filter((p) => ['pending', 'initiated'].includes(p.status))
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    const refunded = payments
      .filter((p) => p.status === 'refunded')
      .reduce((s, p) => s + (Number(p.amount) || 0), 0)
    return { collected, pending, refunded }
  }, [payments])

  const openAdd = () => {
    setForm({
      ...emptyPay,
      student_id: studentFilter !== 'all' ? studentFilter : '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setFormError('')
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter an amount greater than zero.')
      return
    }
    if (!form.invoice_id && !form.student_id) {
      setFormError('Pick an invoice, or a student for a standalone payment.')
      return
    }
    setSaving(true)
    try {
      await paymentsAPI.create({
        invoice_id: optInt(form.invoice_id),
        student_id: optInt(form.student_id),
        amount,
        method: form.method,
        reference_no: trimOrNull(form.reference_no),
        paid_on: form.paid_on || null,
        status: form.status,
        note: trimOrNull(form.note),
      })
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not record the payment.'))
    } finally {
      setSaving(false)
    }
  }

  const act = async (payment, action) => {
    setBusyId(payment.id)
    try {
      if (action === 'confirm') await paymentsAPI.confirmWebhook(payment.id, { status: 'successful' })
      if (action === 'fail') await paymentsAPI.fail(payment.id)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not update that payment.'))
    } finally {
      setBusyId(null)
    }
  }

  const openRefund = (payment) => {
    setRefundTarget(payment)
    setRefundForm({ amount: String(payment.amount ?? ''), reason: '', status: 'completed' })
    setRefundError('')
  }

  const saveRefund = async (e) => {
    e?.preventDefault()
    setRefundError('')
    const amount = Number(refundForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setRefundError('Enter a refund amount greater than zero.')
      return
    }
    if (amount > (Number(refundTarget?.amount) || 0) + 0.01) {
      setRefundError('A refund cannot exceed the original payment.')
      return
    }
    setRefundSaving(true)
    try {
      await paymentsAPI.refund(refundTarget.id, {
        amount,
        reason: trimOrNull(refundForm.reason),
        status: refundForm.status,
      })
      setRefundTarget(null)
      fetchAll()
    } catch (err) {
      setRefundError(errDetail(err, 'Could not refund that payment.'))
    } finally {
      setRefundSaving(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading payments…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Payments <span className="accent-word">({payments.length})</span>
          </div>
          <div className="page-subtitle">
            Money in the door — receipts, gateway confirmations and refunds.
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Record payment
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">Collected</div>
          <div className="v">{fmtMoney(stats.collected, { decimals: 0 })}</div>
          <div className="s">Successful payments</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Awaiting confirmation</div>
          <div className="v">{fmtMoney(stats.pending, { decimals: 0 })}</div>
          <div className="s">Pending or initiated</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Refunded</div>
          <div className="v">{fmtMoney(stats.refunded, { decimals: 0 })}</div>
          <div className="s">Returned to families</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search receipt, reference or student…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={studentFilter}
          onChange={(e) => setStudentFilter(e.target.value)}
        >
          <option value="all">All students</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={payments.length === 0 ? 'No payments yet' : 'No matches found'}
            desc={
              payments.length === 0
                ? 'Record the first payment to start tracking collections.'
                : 'Try a different search or filter.'
            }
            icon={CreditCard}
            action={
              canWrite && payments.length === 0 ? (
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus /> Record payment
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Receipt</th>
                  <th>Student</th>
                  <th>Invoice</th>
                  <th>Method</th>
                  <th>Paid on</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <div className="cell-name">{p.receipt_no || `#${p.id}`}</div>
                      {p.reference_no && <div className="cell-sub">Ref {p.reference_no}</div>}
                    </td>
                    <td>{studentName(p.student_id)}</td>
                    <td>{invoiceNo(p.invoice_id)}</td>
                    <td>{p.method}</td>
                    <td>{p.paid_on || <span className="muted-cell">—</span>}</td>
                    <td className="num">{fmtMoney(p.amount)}</td>
                    <td>
                      <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                    </td>
                    {canWrite && (
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          {['pending', 'initiated'].includes(p.status) && (
                            <>
                              <button
                                className="row-action success"
                                onClick={() => act(p, 'confirm')}
                                disabled={busyId === p.id}
                              >
                                <CheckCheck size={13} /> Confirm
                              </button>
                              <button
                                className="row-action danger"
                                onClick={() => act(p, 'fail')}
                                disabled={busyId === p.id}
                              >
                                <XCircle size={13} /> Fail
                              </button>
                            </>
                          )}
                          {p.status === 'successful' && (
                            <button className="row-action" onClick={() => openRefund(p)}>
                              <ArrowLeftRight size={13} /> Refund
                            </button>
                          )}
                          {!['pending', 'initiated', 'successful'].includes(p.status) && (
                            <span className="muted-cell">—</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="pagination">
        <span className="pagination-info">
          Showing {filtered.length} of {payments.length} payments
        </span>
      </div>

      {modalOpen && (
        <Modal
          title="Record a payment"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Record payment'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">Invoice</label>
              <select
                className="form-select"
                value={form.invoice_id}
                onChange={(e) => {
                  const inv = invoices.find((i) => String(i.id) === e.target.value)
                  setForm({
                    ...form,
                    invoice_id: e.target.value,
                    student_id: inv ? String(inv.student_id) : form.student_id,
                    amount: inv && Number(inv.balance) > 0 ? String(inv.balance) : form.amount,
                  })
                }}
              >
                <option value="">Standalone payment (no invoice)</option>
                {invoices
                  .filter((i) => i.status !== 'cancelled')
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.invoice_no} · {studentName(i.student_id)} · balance {fmtMoney(i.balance)}
                    </option>
                  ))}
              </select>
            </div>
            {!form.invoice_id && (
              <div className="form-group">
                <label className="form-label">Student</label>
                <select
                  className="form-select"
                  value={form.student_id}
                  onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                >
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Amount<span className="required">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={form.amount}
                  onChange={(e) => setForm({ ...form, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Method</label>
                <select
                  className="form-select"
                  value={form.method}
                  onChange={(e) => setForm({ ...form, method: e.target.value })}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Paid on</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.paid_on}
                  onChange={(e) => setForm({ ...form, paid_on: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Reference no</label>
              <input
                className="form-input"
                value={form.reference_no}
                onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      )}

      {refundTarget && (
        <Modal
          title={`Refund ${refundTarget.receipt_no || `#${refundTarget.id}`}`}
          onClose={() => setRefundTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setRefundTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={saveRefund} disabled={refundSaving}>
                {refundSaving ? 'Saving…' : 'Refund'}
              </button>
            </>
          }
        >
          <form onSubmit={saveRefund}>
            {refundError && <div className="form-error">{refundError}</div>}
            <div className="kv-list" style={{ marginBottom: 16 }}>
              <div className="kv-row">
                <span className="k">Original amount</span>
                <span className="v">{fmtMoney(refundTarget.amount)}</span>
              </div>
              <div className="kv-row">
                <span className="k">Student</span>
                <span className="v">{studentName(refundTarget.student_id)}</span>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Refund amount<span className="required">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={refundForm.amount}
                  onChange={(e) => setRefundForm({ ...refundForm, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <select
                  className="form-select"
                  value={refundForm.status}
                  onChange={(e) => setRefundForm({ ...refundForm, status: e.target.value })}
                >
                  <option value="pending">pending</option>
                  <option value="completed">completed</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Reason</label>
              <input
                className="form-input"
                value={refundForm.reason}
                onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })}
                placeholder="Duplicate receipt"
              />
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}

export default Payments