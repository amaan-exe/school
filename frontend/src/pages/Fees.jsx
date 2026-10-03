import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Wallet } from 'lucide-react'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import Badge from '../components/Badge'
import { feesAPI, studentsAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const todayStr = () => new Date().toISOString().slice(0, 10)

const Fees = () => {
  const { hasRole } = useAuth()
  const canWrite = hasRole(['admin'])
  const [fees, setFees] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ student_id: '', amount: '', due_date: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [payingId, setPayingId] = useState(null)

  const studentName = (id) => students.find((s) => s.id === id)?.name || `#${id}`

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [f, s] = await Promise.all([
        feesAPI.getAll({ limit: 1000 }),
        studentsAPI.getAll({ limit: 1000 }),
      ])
      setFees(Array.isArray(f.data) ? f.data : [])
      setStudents(Array.isArray(s.data) ? s.data : [])
    } catch {
      setError('Could not load fees. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const stats = useMemo(() => {
    const collected = fees.filter((f) => f.paid).reduce((s, f) => s + (Number(f.amount) || 0), 0)
    const pending = fees.filter((f) => !f.paid).reduce((s, f) => s + (Number(f.amount) || 0), 0)
    const overdue = fees.filter((f) => !f.paid && f.due_date && f.due_date < todayStr()).length
    return { collected, pending, overdue }
  }, [fees])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return fees.filter((f) => {
      if (tab === 'paid' && !f.paid) return false
      if (tab === 'unpaid' && f.paid) return false
      if (!q) return true
      return studentName(f.student_id).toLowerCase().includes(q)
    })
  }, [fees, tab, search, students]) // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditing(null)
    setForm({ student_id: '', amount: '', due_date: '' })
    setFormError('')
    setModalOpen(true)
  }
  const openEdit = (f) => {
    setEditing(f)
    setForm({ student_id: String(f.student_id), amount: String(f.amount ?? ''), due_date: f.due_date || '' })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.student_id || !form.amount || !form.due_date) {
      setFormError('Student, amount and due date are required.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await feesAPI.update(editing.id, {
          amount: Number(form.amount),
          due_date: form.due_date,
        })
      } else {
        await feesAPI.create({
          student_id: Number(form.student_id),
          amount: Number(form.amount),
          due_date: form.due_date,
          paid: false,
          paid_date: null,
        })
      }
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the fee. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleMarkPaid = async (f) => {
    setPayingId(f.id)
    try {
      await feesAPI.update(f.id, { paid: true, paid_date: todayStr() })
      fetchAll()
    } catch {
      setError('Could not mark the fee as paid.')
    } finally {
      setPayingId(null)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await feesAPI.remove(deleteId)
      setDeleteId(null)
      fetchAll()
    } catch {
      setError('Could not delete the fee.')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  const overdueCheck = (f) => !f.paid && f.due_date && f.due_date < todayStr()

  if (loading) return <LoadingSpinner message="Loading fees…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Fees <span className="accent-word">({fees.length})</span>
          </div>
          <div className="page-subtitle">Track collection, dues and overdue payments.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Add fee
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">Collected</div>
          <div className="v">${Math.round(stats.collected).toLocaleString()}</div>
          <div className="s">Paid to date</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Pending</div>
          <div className="v">${Math.round(stats.pending).toLocaleString()}</div>
          <div className="s">Yet to collect</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Overdue</div>
          <div className="v">{stats.overdue}</div>
          <div className="s">Past the due date</div>
        </div>
      </div>

      <div className="tabs">
        {[
          { id: 'all', label: `All (${fees.length})` },
          { id: 'paid', label: `Paid (${fees.filter((f) => f.paid).length})` },
          { id: 'unpaid', label: `Unpaid (${fees.filter((f) => !f.paid).length})` },
        ].map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input placeholder="Search by student…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={fees.length === 0 ? 'No fee records' : 'Nothing in this view'}
            desc={fees.length === 0 ? 'Add the first fee record to start tracking payments.' : 'Try a different tab or search.'}
            icon={Wallet}
            action={canWrite && fees.length === 0 ? <button className="btn btn-primary" onClick={openAdd}><Plus /> Add fee</button> : null}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Amount</th>
                  <th>Due date</th>
                  <th>Status</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((f) => (
                  <tr key={f.id}>
                    <td className="cell-name">{studentName(f.student_id)}</td>
                    <td style={{ fontWeight: 700 }}>${Number(f.amount).toLocaleString()}</td>
                    <td>{f.due_date || '—'}</td>
                    <td>
                      {f.paid ? (
                        <Badge variant="success">Paid{f.paid_date ? ` · ${f.paid_date}` : ''}</Badge>
                      ) : overdueCheck(f) ? (
                        <Badge variant="danger">Overdue</Badge>
                      ) : (
                        <Badge variant="warning">Unpaid</Badge>
                      )}
                    </td>
                    {canWrite && (
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          {!f.paid && (
                            <button
                              className="row-action success"
                              onClick={() => handleMarkPaid(f)}
                              disabled={payingId === f.id}
                            >
                              Mark paid
                            </button>
                          )}
                          <button className="row-action" onClick={() => openEdit(f)}>
                            Edit
                          </button>
                          <button className="row-action danger" onClick={() => setDeleteId(f.id)}>
                            Remove
                          </button>
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
        <span className="pagination-info">Showing {filtered.length} of {fees.length} fee records</span>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit fee' : 'Add a new fee'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add fee'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            {!editing && (
              <div className="form-group">
                <label className="form-label">Student<span className="required">*</span></label>
                <select className="form-select" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                  <option value="">Select a student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} · Grade {s.grade}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Amount ($)<span className="required">*</span></label>
                <input type="number" min="0" step="0.01" className="form-input" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="250" />
              </div>
              <div className="form-group">
                <label className="form-label">Due date<span className="required">*</span></label>
                <input type="date" className="form-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
              </div>
            </div>
            <div className="form-hint" style={{ margin: 0 }}>
              {editing ? 'Use the check action in the table to mark a fee as paid.' : 'New fees start as unpaid — mark them paid once collected.'}
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete fee?"
          size="sm"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>This fee record will be permanently removed.</p>
        </Modal>
      )}
    </div>
  )
}

export default Fees
