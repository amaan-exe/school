import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, FileText, Eye, Ban, CreditCard, CheckCheck } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { invoicesAPI, paymentsAPI, studentsAPI, structureAPI, feeHeadsAPI, discountsAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, fmtMoney, inputNumber, optInt, todayStr, trimOrNull } from '../../utils/format'

const STATUSES = ['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'cancelled']
const METHODS = ['cash', 'cheque', 'card', 'bank_transfer', 'online', 'gateway']

const statusVariant = (s) => {
  switch (s) {
    case 'paid':
      return 'success'
    case 'partially_paid':
      return 'info'
    case 'overdue':
      return 'danger'
    case 'issued':
      return 'primary'
    case 'cancelled':
      return 'neutral'
    default:
      return 'warning'
  }
}

const paymentStatusVariant = (s) => {
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

const emptyItem = () => ({ fee_head_id: '', description: '', amount: '', quantity: '1' })
const emptyForm = () => ({
  student_id: '',
  academic_year_id: '',
  class_section_id: '',
  issue_date: todayStr(),
  due_date: '',
  status: 'issued',
  discount_id: '',
  notes: '',
  items: [emptyItem()],
})
const emptyPay = { amount: '', method: 'cash', reference_no: '', paid_on: todayStr(), note: '' }

const itemTotal = (it) => {
  const amount = Number(it.amount)
  const qty = Number(it.quantity)
  return (Number.isFinite(amount) ? amount : 0) * (Number.isFinite(qty) && qty > 0 ? qty : 1)
}

const Invoices = () => {
  const { hasRole, hasPermission } = useAuth()
  const canBill = hasRole(['admin', 'accountant'])
  const canCollect = canBill || (hasPermission('fees', 'write') && hasRole(['staff']))

  const [invoices, setInvoices] = useState([])
  const [students, setStudents] = useState([])
  const [years, setYears] = useState([])
  const [classes, setClasses] = useState([])
  const [feeHeads, setFeeHeads] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [studentFilter, setStudentFilter] = useState('all')
  const [yearFilter, setYearFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [detail, setDetail] = useState(null)
  const [detailPayments, setDetailPayments] = useState([])
  const [detailLoading, setDetailLoading] = useState(false)

  const [payTarget, setPayTarget] = useState(null)
  const [payForm, setPayForm] = useState(emptyPay)
  const [paySaving, setPaySaving] = useState(false)
  const [payError, setPayError] = useState('')

  const [cancelTarget, setCancelTarget] = useState(null)
  const [cancelReason, setCancelReason] = useState('')
  const [cancelling, setCancelling] = useState(false)

  const studentName = (id) => students.find((s) => s.id === id)?.name || `Student #${id}`
  const yearName = (id) => years.find((y) => y.id === id)?.name
  const className = (id) => classes.find((c) => c.id === id)?.class_name

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { limit: 300 }
      if (statusFilter !== 'all') params.status = statusFilter
      if (studentFilter !== 'all') params.student_id = studentFilter
      if (yearFilter !== 'all') params.academic_year_id = yearFilter
      const [invRes, stuRes, yrRes, clsRes, headRes, discRes] = await Promise.all([
        invoicesAPI.getAll(params),
        studentsAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
        structureAPI.academicYears({ limit: 100 }).catch(() => ({ data: [] })),
        structureAPI.classes({ limit: 500 }).catch(() => ({ data: [] })),
        feeHeadsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
        discountsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
      ])
      setInvoices(Array.isArray(invRes.data) ? invRes.data : [])
      setStudents(Array.isArray(stuRes.data) ? stuRes.data : [])
      setYears(Array.isArray(yrRes.data) ? yrRes.data : [])
      setClasses(Array.isArray(clsRes.data) ? clsRes.data : [])
      setFeeHeads(Array.isArray(headRes.data) ? headRes.data : [])
      setDiscounts(Array.isArray(discRes.data) ? discRes.data : [])
    } catch {
      setError('Could not load invoices. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, studentFilter, yearFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return invoices
    return invoices.filter(
      (i) =>
        i.invoice_no?.toLowerCase().includes(q) ||
        studentName(i.student_id).toLowerCase().includes(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoices, search, students])

  const totals = useMemo(() => {
    const billed = filtered.reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
    const paid = filtered.reduce((s, i) => s + (Number(i.paid_amount) || 0), 0)
    const balance = filtered.reduce((s, i) => s + (Number(i.balance ?? (i.total_amount - i.paid_amount)) || 0), 0)
    return { billed, paid, balance }
  }, [filtered])

  const formTotal = useMemo(
    () => form.items.reduce((sum, it) => sum + itemTotal(it), 0),
    [form.items]
  )

  const openAdd = () => {
    setForm({
      ...emptyForm(),
      academic_year_id: yearFilter !== 'all' ? yearFilter : '',
      class_section_id: '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const setItem = (index, key, value) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === index ? { ...it, [key]: value } : it)),
    }))

  const addItem = () => setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))

  const removeItem = (index) =>
    setForm((f) => ({ ...f, items: f.items.filter((_, i) => i !== index) }))

  const handleSave = async (e) => {
    e?.preventDefault()
    setFormError('')
    if (!form.student_id) {
      setFormError('Choose the student being billed.')
      return
    }
    const items = form.items
      .map((it) => ({
        fee_head_id: optInt(it.fee_head_id),
        description: trimOrNull(it.description),
        amount: Number(it.amount),
        quantity: optInt(it.quantity) || 1,
      }))
      .filter((it) => Number.isFinite(it.amount) && it.amount >= 0)
    if (!items.length) {
      setFormError('Add at least one invoice line with an amount.')
      return
    }
    setSaving(true)
    try {
      await invoicesAPI.create({
        student_id: optInt(form.student_id),
        academic_year_id: optInt(form.academic_year_id),
        class_section_id: optInt(form.class_section_id),
        issue_date: form.issue_date || null,
        due_date: form.due_date || null,
        status: form.status,
        discount_id: optInt(form.discount_id),
        notes: trimOrNull(form.notes),
        items,
      })
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not create the invoice. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const openDetail = async (invoice) => {
    setDetail(invoice)
    setDetailPayments([])
    setDetailLoading(true)
    try {
      const res = await paymentsAPI.getAll({ invoice_id: invoice.id, limit: 100 })
      setDetailPayments(Array.isArray(res.data) ? res.data : [])
    } catch {
      setDetailPayments([])
    } finally {
      setDetailLoading(false)
    }
  }

  const openPay = (invoice) => {
    setPayTarget(invoice)
    setPayForm({ ...emptyPay, amount: inputNumber(Number(invoice.balance) || 0) })
    setPayError('')
  }

  const savePayment = async (e) => {
    e?.preventDefault()
    setPayError('')
    const amount = Number(payForm.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError('Enter an amount greater than zero.')
      return
    }
    const balance = Number(payTarget?.balance) || 0
    if (balance > 0 && amount > balance + 0.01) {
      setPayError(`Amount is above the remaining balance of ${fmtMoney(balance)}.`)
      return
    }
    setPaySaving(true)
    try {
      await paymentsAPI.create({
        invoice_id: payTarget.id,
        student_id: payTarget.student_id,
        amount,
        method: payForm.method,
        reference_no: trimOrNull(payForm.reference_no),
        paid_on: payForm.paid_on || null,
        note: trimOrNull(payForm.note),
      })
      setPayTarget(null)
      fetchAll()
    } catch (err) {
      setPayError(errDetail(err, 'Could not record the payment.'))
    } finally {
      setPaySaving(false)
    }
  }

  const confirmWebhook = async (payment) => {
    setBusyId(payment.id)
    try {
      await paymentsAPI.confirmWebhook(payment.id, { status: 'successful' })
      fetchAll()
      if (detail?.id === payment.invoice_id) openDetail(detail)
    } catch (err) {
      setError(errDetail(err, 'Could not confirm that payment.'))
    } finally {
      setBusyId(null)
    }
  }

  const doCancel = async () => {
    if (!cancelTarget) return
    setCancelling(true)
    try {
      await invoicesAPI.cancel(cancelTarget.id, { reason: trimOrNull(cancelReason) })
      setCancelTarget(null)
      setCancelReason('')
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not cancel the invoice.'))
      setCancelTarget(null)
    } finally {
      setCancelling(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading invoices…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Invoices <span className="accent-word">({invoices.length})</span>
          </div>
          <div className="page-subtitle">
            Every bill raised against a student — lines, discounts and the running balance.
          </div>
        </div>
        {canBill && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> New invoice
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">Billed</div>
          <div className="v">{fmtMoney(totals.billed, { decimals: 0 })}</div>
          <div className="s">Across {filtered.length} invoices</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Collected</div>
          <div className="v">{fmtMoney(totals.paid, { decimals: 0 })}</div>
          <div className="s">Payments received</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Balance</div>
          <div className="v">{fmtMoney(totals.balance, { decimals: 0 })}</div>
          <div className="s">Still to collect</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search invoice no or student…"
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
        <select
          className="filter-select"
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
        >
          <option value="all">All years</option>
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={invoices.length === 0 ? 'No invoices yet' : 'No matches found'}
            desc={
              invoices.length === 0
                ? 'Raise the first invoice to start billing fee heads to students.'
                : 'Try a different search or filter.'
            }
            icon={FileText}
            action={
              canBill && invoices.length === 0 ? (
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus /> New invoice
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Student</th>
                  <th>Due</th>
                  <th className="num">Total</th>
                  <th className="num">Paid</th>
                  <th className="num">Balance</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const balance = Number(inv.balance ?? (inv.total_amount - inv.paid_amount)) || 0
                  return (
                    <tr key={inv.id}>
                      <td>
                        <div className="cell-name">{inv.invoice_no}</div>
                        <div className="cell-sub">
                          {yearName(inv.academic_year_id) || 'No year'}
                          {className(inv.class_section_id) ? ` · ${className(inv.class_section_id)}` : ''}
                        </div>
                      </td>
                      <td>{studentName(inv.student_id)}</td>
                      <td>{inv.due_date || <span className="muted-cell">—</span>}</td>
                      <td className="num">{fmtMoney(inv.total_amount)}</td>
                      <td className="num money-pos">{fmtMoney(inv.paid_amount)}</td>
                      <td className="num">{fmtMoney(balance)}</td>
                      <td>
                        <Badge variant={statusVariant(inv.status)}>{inv.status}</Badge>
                      </td>
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="row-action" onClick={() => openDetail(inv)}>
                            <Eye size={13} /> View
                          </button>
                          {canCollect && balance > 0 && inv.status !== 'cancelled' && (
                            <button className="row-action success" onClick={() => openPay(inv)}>
                              <CreditCard size={13} /> Payment
                            </button>
                          )}
                          {canBill && !['paid', 'cancelled'].includes(inv.status) && (
                            <button className="row-action danger" onClick={() => setCancelTarget(inv)}>
                              <Ban size={13} /> Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <div className="pagination">
        <span className="pagination-info">
          Showing {filtered.length} of {invoices.length} invoices
        </span>
      </div>

      {/* ── Create invoice ── */}
      {modalOpen && (
        <Modal
          size="lg"
          title="Raise a new invoice"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Create invoice'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Student<span className="required">*</span>
                </label>
                <select
                  className="form-select"
                  value={form.student_id}
                  onChange={(e) => setForm({ ...form, student_id: e.target.value })}
                >
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} · Grade {s.grade}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class section</label>
                <select
                  className="form-select"
                  value={form.class_section_id}
                  onChange={(e) => setForm({ ...form, class_section_id: e.target.value })}
                >
                  <option value="">No section</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">Academic year</label>
                <select
                  className="form-select"
                  value={form.academic_year_id}
                  onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
                >
                  <option value="">No year</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
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
              <div className="form-group">
                <label className="form-label">Issue date</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.issue_date}
                  onChange={(e) => setForm({ ...form, issue_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Due date</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Discount</label>
                <select
                  className="form-select"
                  value={form.discount_id}
                  onChange={(e) => setForm({ ...form, discount_id: e.target.value })}
                >
                  <option value="">No discount</option>
                  {discounts
                    .filter((d) => d.is_active !== false)
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({d.type === 'percentage' ? `${d.value}%` : fmtMoney(d.value)})
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <input
                  className="form-input"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>

            <div className="item-editor">
              <div className="item-editor-head">
                <span className="kicker">Invoice lines</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItem}>
                  <Plus size={14} /> Add line
                </button>
              </div>
              {form.items.map((item, index) => (
                <div className="item-row" key={index}>
                  <div className="form-group" style={{ gridColumn: 'span 4' }}>
                    <label className="form-label">Fee head</label>
                    <select
                      className="form-select"
                      value={item.fee_head_id}
                      onChange={(e) => setItem(index, 'fee_head_id', e.target.value)}
                    >
                      <option value="">Uncategorised</option>
                      {feeHeads.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 4' }}>
                    <label className="form-label">Description</label>
                    <input
                      className="form-input"
                      value={item.description}
                      onChange={(e) => setItem(index, 'description', e.target.value)}
                      placeholder="Term 1 tuition"
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input"
                      value={item.amount}
                      onChange={(e) => setItem(index, 'amount', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 1' }}>
                    <label className="form-label">Qty</label>
                    <input
                      type="number"
                      min="1"
                      className="form-input"
                      value={item.quantity}
                      onChange={(e) => setItem(index, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 1' }}>
                    <label className="form-label">&nbsp;</label>
                    <button
                      type="button"
                      className="row-action danger"
                      onClick={() => removeItem(index)}
                      disabled={form.items.length === 1}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="item-row-total">
                <span>Invoice total</span>
                <span>{fmtMoney(formTotal)}</span>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Detail ── */}
      {detail && (
        <Modal
          size="lg"
          title={`Invoice ${detail.invoice_no}`}
          onClose={() => setDetail(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDetail(null)}>
                Close
              </button>
              {canCollect && (Number(detail.balance) || 0) > 0 && detail.status !== 'cancelled' && (
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    openPay(detail)
                    setDetail(null)
                  }}
                >
                  Record payment
                </button>
              )}
            </>
          }
        >
          <div className="kv-list" style={{ marginBottom: 16 }}>
            <div className="kv-row">
              <span className="k">Student</span>
              <span className="v">{studentName(detail.student_id)}</span>
            </div>
            <div className="kv-row">
              <span className="k">Issued / due</span>
              <span className="v">
                {detail.issue_date || '—'} · {detail.due_date || '—'}
              </span>
            </div>
            <div className="kv-row">
              <span className="k">Status</span>
              <span className="v">
                <Badge variant={statusVariant(detail.status)}>{detail.status}</Badge>
              </span>
            </div>
            {detail.notes && (
              <div className="kv-row">
                <span className="k">Notes</span>
                <span className="v">{detail.notes}</span>
              </div>
            )}
          </div>

          <div className="table-container" style={{ marginBottom: 16 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Line</th>
                  <th className="num">Amount</th>
                  <th className="num">Qty</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {(detail.items || []).map((it) => (
                  <tr key={it.id}>
                    <td>
                      <div className="cell-name">
                        {it.description || feeHeads.find((h) => h.id === it.fee_head_id)?.name || 'Fee'}
                      </div>
                    </td>
                    <td className="num">{fmtMoney(it.amount)}</td>
                    <td className="num">{it.quantity ?? 1}</td>
                    <td className="num">{fmtMoney((Number(it.amount) || 0) * (Number(it.quantity) || 1))}</td>
                  </tr>
                ))}
                <tr className="num-total">
                  <td colSpan={3}>Total / discount / paid / balance</td>
                  <td className="num">
                    {fmtMoney(detail.total_amount)} / {fmtMoney(detail.discount_amount)} /{' '}
                    {fmtMoney(detail.paid_amount)} /{' '}
                    <span className="money-neg">
                      {fmtMoney(Number(detail.balance) || 0)}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <h4 className="kicker" style={{ marginBottom: 10 }}>
            Payments
          </h4>
          {detailLoading ? (
            <LoadingSpinner small message="Loading payments…" />
          ) : detailPayments.length === 0 ? (
            <EmptyState
              title="No payments yet"
              desc="Nothing has been collected against this invoice."
              icon={CreditCard}
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Receipt</th>
                    <th>Method</th>
                    <th>Paid on</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {detailPayments.map((p) => (
                    <tr key={p.id}>
                      <td className="cell-name">{p.receipt_no || `#${p.id}`}</td>
                      <td>{p.method}</td>
                      <td>{p.paid_on || <span className="muted-cell">—</span>}</td>
                      <td className="num">{fmtMoney(p.amount)}</td>
                      <td>
                        <Badge variant={paymentStatusVariant(p.status)}>{p.status}</Badge>
                      </td>
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          {canCollect && ['pending', 'initiated'].includes(p.status) && (
                            <button
                              className="row-action success"
                              onClick={() => confirmWebhook(p)}
                              disabled={busyId === p.id}
                            >
                              <CheckCheck size={13} /> Confirm
                            </button>
                          )}
                          {!canCollect && <span className="muted-cell">—</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Modal>
      )}

      {/* ── Record payment ── */}
      {payTarget && (
        <Modal
          title={`Record payment · ${payTarget.invoice_no}`}
          onClose={() => setPayTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPayTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={savePayment} disabled={paySaving}>
                {paySaving ? 'Saving…' : 'Record payment'}
              </button>
            </>
          }
        >
          <form onSubmit={savePayment}>
            {payError && <div className="form-error">{payError}</div>}
            <div className="kv-list" style={{ marginBottom: 16 }}>
              <div className="kv-row">
                <span className="k">Student</span>
                <span className="v">{studentName(payTarget.student_id)}</span>
              </div>
              <div className="kv-row">
                <span className="k">Balance due</span>
                <span className="v">{fmtMoney(payTarget.balance)}</span>
              </div>
            </div>
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
                  value={payForm.amount}
                  onChange={(e) => setPayForm({ ...payForm, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Method</label>
                <select
                  className="form-select"
                  value={payForm.method}
                  onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}
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
                <label className="form-label">Reference no</label>
                <input
                  className="form-input"
                  value={payForm.reference_no}
                  onChange={(e) => setPayForm({ ...payForm, reference_no: e.target.value })}
                  placeholder="Cheque / txn id"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Paid on</label>
                <input
                  type="date"
                  className="form-input"
                  value={payForm.paid_on}
                  onChange={(e) => setPayForm({ ...payForm, paid_on: e.target.value })}
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* ── Cancel ── */}
      {cancelTarget && (
        <Modal
          title={`Cancel invoice ${cancelTarget.invoice_no}?`}
          size="sm"
          onClose={() => setCancelTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setCancelTarget(null)}>
                Keep invoice
              </button>
              <button className="btn btn-danger" onClick={doCancel} disabled={cancelling}>
                {cancelling ? 'Cancelling…' : 'Cancel invoice'}
              </button>
            </>
          }
        >
          <div className="form-group">
            <label className="form-label">Reason (optional)</label>
            <input
              className="form-input"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Raised in error"
            />
          </div>
        </Modal>
      )}
    </div>
  )
}

export default Invoices