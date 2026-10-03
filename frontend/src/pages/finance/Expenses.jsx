import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Receipt, Check, X, Banknote } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { expensesAPI, expenseCategoriesAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, fmtMoney, optInt, todayStr, trimOrNull } from '../../utils/format'

const STATUSES = ['pending', 'approved', 'paid', 'rejected']
const METHODS = ['cash', 'cheque', 'card', 'bank_transfer', 'online', 'gateway']

const statusVariant = (s) => {
  switch (s) {
    case 'paid':
      return 'success'
    case 'approved':
      return 'info'
    case 'rejected':
      return 'danger'
    default:
      return 'warning'
  }
}

const emptyForm = {
  category_id: '',
  expense_date: todayStr(),
  amount: '',
  payee: '',
  description: '',
  payment_method: 'cash',
  reference_no: '',
}
const emptyCategory = { name: '', description: '' }

const Expenses = () => {
  const { hasRole } = useAuth()
  // Recording / mark-paid: admin + accountant. Approve & reject: admin,
  // principal, vice_principal. Expense categories: admin only. (Backend rules.)
  const canManage = hasRole(['admin', 'accountant'])
  const canApprove = hasRole(['admin', 'principal', 'vice_principal'])
  const canManageCategories = hasRole(['admin'])

  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [busyId, setBusyId] = useState(null)

  const [tab, setTab] = useState('expenses')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [catModal, setCatModal] = useState(false)
  const [editingCat, setEditingCat] = useState(null)
  const [catForm, setCatForm] = useState(emptyCategory)
  const [catSaving, setCatSaving] = useState(false)
  const [catError, setCatError] = useState('')
  const [deleteCatId, setDeleteCatId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const [rejectTarget, setRejectTarget] = useState(null)

  const categoryName = (id) => categories.find((c) => c.id === id)?.name || `Category #${id}`

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { limit: 300 }
      if (statusFilter !== 'all') params.status = statusFilter
      if (categoryFilter !== 'all') params.category_id = categoryFilter
      const [expRes, catRes] = await Promise.all([
        expensesAPI.getAll(params),
        expenseCategoriesAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
      ])
      setExpenses(Array.isArray(expRes.data) ? expRes.data : [])
      setCategories(Array.isArray(catRes.data) ? catRes.data : [])
    } catch {
      setError('Could not load expenses. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, categoryFilter])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return expenses
    return expenses.filter(
      (e) =>
        e.payee?.toLowerCase().includes(q) ||
        e.description?.toLowerCase().includes(q) ||
        categoryName(e.category_id).toLowerCase().includes(q)
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, search, categories])

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return categories
    return categories.filter(
      (c) => c.name?.toLowerCase().includes(q) || c.description?.toLowerCase().includes(q)
    )
  }, [categories, search])

  const stats = useMemo(() => {
    const pending = expenses
      .filter((e) => e.status === 'pending')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const approved = expenses
      .filter((e) => e.status === 'approved')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const paid = expenses
      .filter((e) => e.status === 'paid')
      .reduce((s, e) => s + (Number(e.amount) || 0), 0)
    return { pending, approved, paid }
  }, [expenses])

  const openAdd = () => {
    setForm({ ...emptyForm, category_id: categoryFilter !== 'all' ? categoryFilter : '' })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setFormError('')
    if (!form.category_id) {
      setFormError('Choose an expense category.')
      return
    }
    const amount = Number(form.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError('Enter an amount greater than zero.')
      return
    }
    setSaving(true)
    try {
      await expensesAPI.create({
        category_id: optInt(form.category_id),
        expense_date: form.expense_date || null,
        amount,
        payee: trimOrNull(form.payee),
        description: trimOrNull(form.description),
        payment_method: form.payment_method || null,
        reference_no: trimOrNull(form.reference_no),
        status: 'pending',
      })
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not record the expense.'))
    } finally {
      setSaving(false)
    }
  }

  const act = async (expense, action) => {
    setBusyId(expense.id)
    try {
      if (action === 'approve') await expensesAPI.approve(expense.id)
      if (action === 'paid') await expensesAPI.markPaid(expense.id)
      if (action === 'reject') await expensesAPI.reject(expense.id)
      setRejectTarget(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not update that expense.'))
      setRejectTarget(null)
    } finally {
      setBusyId(null)
    }
  }

  const openCategory = (c) => {
    setEditingCat(c || null)
    setCatForm(c ? { name: c.name || '', description: c.description || '' } : emptyCategory)
    setCatError('')
    setCatModal(true)
  }

  const saveCategory = async (e) => {
    e?.preventDefault()
    setCatError('')
    if (!catForm.name.trim()) {
      setCatError('Category name is required.')
      return
    }
    setCatSaving(true)
    try {
      const payload = {
        name: catForm.name.trim(),
        description: trimOrNull(catForm.description),
      }
      if (editingCat) await expenseCategoriesAPI.update(editingCat.id, payload)
      else await expenseCategoriesAPI.create(payload)
      setCatModal(false)
      fetchAll()
    } catch (err) {
      setCatError(errDetail(err, 'Could not save the category.'))
    } finally {
      setCatSaving(false)
    }
  }

  const deleteCategory = async () => {
    if (!deleteCatId) return
    setDeleting(true)
    try {
      await expenseCategoriesAPI.remove(deleteCatId)
      setDeleteCatId(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the category.'))
      setDeleteCatId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading expenses…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Expenses <span className="accent-word">({expenses.length})</span>
          </div>
          <div className="page-subtitle">
            Money going out — claims, approvals and what has already been paid.
          </div>
        </div>
        {(tab === 'categories' ? canManageCategories : canManage) && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={tab === 'categories' ? () => openCategory(null) : openAdd}>
              <Plus /> {tab === 'categories' ? 'New category' : 'Record expense'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">Awaiting approval</div>
          <div className="v">{fmtMoney(stats.pending, { decimals: 0 })}</div>
          <div className="s">Pending claims</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Approved</div>
          <div className="v">{fmtMoney(stats.approved, { decimals: 0 })}</div>
          <div className="s">Ready to pay</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Paid</div>
          <div className="v">{fmtMoney(stats.paid, { decimals: 0 })}</div>
          <div className="s">Settled</div>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} onClick={() => setTab('expenses')}>
          Expenses ({expenses.length})
        </button>
        <button
          className={`tab ${tab === 'categories' ? 'active' : ''}`}
          onClick={() => setTab('categories')}
        >
          Categories ({categories.length})
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input placeholder="Search payee or description…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {tab === 'expenses' && (
          <>
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
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {tab === 'expenses' ? (
        <div className="card">
          {filtered.length === 0 ? (
            <EmptyState
              title={expenses.length === 0 ? 'No expenses recorded' : 'No matches found'}
              desc={
                expenses.length === 0
                  ? 'Record the first claim to start the expense pipeline.'
                  : 'Try a different search or filter.'
              }
              icon={Receipt}
              action={
                canManage && expenses.length === 0 ? (
                  <button className="btn btn-primary" onClick={openAdd}>
                    <Plus /> Record expense
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Expense</th>
                    <th>Category</th>
                    <th>Date</th>
                    <th className="num">Amount</th>
                    <th>Status</th>
                    {(canManage || canApprove) && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="cell-name">{e.payee || e.description || `Expense #${e.id}`}</div>
                        {e.description && e.payee && <div className="cell-sub">{e.description}</div>}
                      </td>
                      <td>{categoryName(e.category_id)}</td>
                      <td>{e.expense_date || <span className="muted-cell">—</span>}</td>
                      <td className="num">{fmtMoney(e.amount)}</td>
                      <td>
                        <Badge variant={statusVariant(e.status)}>{e.status}</Badge>
                      </td>
                      {(canManage || canApprove) && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            {e.status === 'pending' &&
                              (canApprove ? (
                                <>
                                  <button
                                    className="row-action success"
                                    onClick={() => act(e, 'approve')}
                                    disabled={busyId === e.id}
                                  >
                                    <Check size={13} /> Approve
                                  </button>
                                  <button className="row-action danger" onClick={() => setRejectTarget(e)}>
                                    <X size={13} /> Reject
                                  </button>
                                </>
                              ) : (
                                <span className="muted-cell">Needs approval</span>
                              ))}
                            {e.status === 'approved' &&
                              (canManage ? (
                                <button
                                  className="row-action success"
                                  onClick={() => act(e, 'paid')}
                                  disabled={busyId === e.id}
                                >
                                  <Banknote size={13} /> Mark paid
                                </button>
                              ) : (
                                <span className="muted-cell">Awaiting payment</span>
                              ))}
                            {!['pending', 'approved'].includes(e.status) && (
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
      ) : (
        <div className="card">
          {filteredCategories.length === 0 ? (
            <EmptyState
              title={categories.length === 0 ? 'No categories yet' : 'No matches found'}
              desc={
                categories.length === 0
                  ? 'Categories group the expenses on the income statement.'
                  : 'Try a different search.'
              }
              icon={Receipt}
              action={
                canManageCategories && categories.length === 0 ? (
                  <button className="btn btn-primary" onClick={() => openCategory(null)}>
                    <Plus /> New category
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Category</th>
                    <th>Description</th>
                    <th className="num">Expenses</th>
                    <th className="num">Total</th>
                    {canManageCategories && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredCategories.map((c) => {
                    const rows = expenses.filter((e) => e.category_id === c.id)
                    const total = rows.reduce((s, e) => s + (Number(e.amount) || 0), 0)
                    return (
                      <tr key={c.id}>
                        <td className="cell-name">{c.name}</td>
                        <td>{c.description || <span className="muted-cell">—</span>}</td>
                        <td className="num">{rows.length}</td>
                        <td className="num">{fmtMoney(total)}</td>
                        {canManageCategories && (
                          <td>
                            <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                              <button className="row-action" onClick={() => openCategory(c)}>
                                Edit
                              </button>
                              <button
                                className="row-action danger"
                                onClick={() => setDeleteCatId(c.id)}
                                disabled={rows.length > 0}
                                title={rows.length > 0 ? 'Expenses still use this category' : 'Delete category'}
                              >
                                {rows.length > 0 ? 'In use' : 'Remove'}
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="pagination">
        <span className="pagination-info">
          {tab === 'expenses'
            ? `Showing ${filtered.length} of ${expenses.length} expenses`
            : `Showing ${filteredCategories.length} of ${categories.length} categories`}
        </span>
      </div>

      {modalOpen && (
        <Modal
          title="Record an expense"
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : 'Record expense'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Category<span className="required">*</span>
                </label>
                <select
                  className="form-select"
                  value={form.category_id}
                  onChange={(e) => setForm({ ...form, category_id: e.target.value })}
                >
                  <option value="">Select a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
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
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Expense date</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.expense_date}
                  onChange={(e) => setForm({ ...form, expense_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Payee</label>
                <input
                  className="form-input"
                  value={form.payee}
                  onChange={(e) => setForm({ ...form, payee: e.target.value })}
                  placeholder="Vendor or supplier"
                />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Payment method</label>
                <select
                  className="form-select"
                  value={form.payment_method}
                  onChange={(e) => setForm({ ...form, payment_method: e.target.value })}
                >
                  {METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reference no</label>
                <input
                  className="form-input"
                  value={form.reference_no}
                  onChange={(e) => setForm({ ...form, reference_no: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this expense is for…"
              />
            </div>
            <div className="form-hint" style={{ margin: 0 }}>
              New expenses land as <strong>pending</strong> until they are approved.
            </div>
          </form>
        </Modal>
      )}

      {rejectTarget && (
        <Modal
          title="Reject this expense?"
          size="sm"
          onClose={() => setRejectTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setRejectTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                onClick={() => act(rejectTarget, 'reject')}
                disabled={busyId === rejectTarget.id}
              >
                Reject expense
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
            “{rejectTarget?.payee || rejectTarget?.description || 'This expense'}” of{' '}
            {fmtMoney(rejectTarget?.amount)} will be marked rejected and left out of the income
            statement.
          </p>
          <div className="form-hint" style={{ margin: 0 }}>
            Rejections are recorded in the audit log; the API takes no free-text reason.
          </div>
        </Modal>
      )}

      {catModal && (
        <Modal
          title={editingCat ? 'Edit category' : 'New expense category'}
          onClose={() => setCatModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setCatModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveCategory} disabled={catSaving}>
                {catSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form onSubmit={saveCategory}>
            {catError && <div className="form-error">{catError}</div>}
            <div className="form-group">
              <label className="form-label">
                Name<span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={catForm.name}
                onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                placeholder="Utilities"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={catForm.description}
                onChange={(e) => setCatForm({ ...catForm, description: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      )}

      {deleteCatId && (
        <Modal
          title="Delete category?"
          size="sm"
          onClose={() => setDeleteCatId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteCatId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={deleteCategory} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This expense category will be permanently removed.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Expenses