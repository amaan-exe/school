import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Search } from 'lucide-react'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import { assignmentsAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const emptyForm = { title: '', subject: '', class_name: '', description: '', due_date: '' }

const Assignments = () => {
  const { hasPermission, hasRole } = useAuth()
  const canWrite = hasPermission('assignments', 'create') || hasRole(['admin', 'teacher'])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await assignmentsAPI.getAll({ limit: 500 })
      const list = Array.isArray(res.data) ? res.data : []
      list.sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
      setItems(list)
    } catch {
      setError('Could not load assignments. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (a) =>
        a.title?.toLowerCase().includes(q) ||
        a.subject?.toLowerCase().includes(q) ||
        a.class_name?.toLowerCase().includes(q)
    )
  }, [items, search])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (a) => {
    setEditing(a)
    setForm({
      title: a.title || '',
      subject: a.subject || '',
      class_name: a.class_name || '',
      description: a.description || '',
      due_date: a.due_date ? String(a.due_date).slice(0, 10) : '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) {
      setFormError('Title is required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        title: form.title.trim(),
        subject: form.subject.trim() || null,
        class_name: form.class_name.trim() || null,
        description: form.description.trim() || null,
        due_date: form.due_date || null,
      }
      if (editing) await assignmentsAPI.update(editing.id, payload)
      else await assignmentsAPI.create(payload)
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the assignment.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await assignmentsAPI.remove(deleteId)
      setDeleteId(null)
      fetchAll()
    } catch {
      setDeleteId(null)
      setError('Could not delete the assignment.')
    }
  }

  if (loading) return <LoadingSpinner message="Loading assignments…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Assignments</div>
          <div className="page-subtitle">Classwork and homework set by teachers.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus /> New assignment
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search assignments…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No assignments"
            desc={canWrite ? 'Create the first assignment for your classes.' : 'No assignments have been set yet.'}
            icon={ClipboardList}
            action={canWrite ? <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus /> New assignment</button> : null}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2">
          {filtered.map((a) => (
            <div key={a.id} className="card card-padded">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <div>
                  <div className="card-title">{a.title}</div>
                  <div className="card-sub">
                    {[a.subject, a.class_name].filter(Boolean).join(' · ') || 'General'}
                  </div>
                </div>
                {a.due_date && (
                  <Badge variant="warning">Due {String(a.due_date).slice(0, 10)}</Badge>
                )}
              </div>
              {a.description && (
                <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 10 }}>{a.description}</p>
              )}
              {canWrite && (
                <div className="table-actions" style={{ marginTop: 12 }}>
                  <button className="row-action" onClick={() => openEdit(a)}>
                    Edit
                  </button>
                  <button className="row-action danger" onClick={() => setDeleteId(a.id)}>
                    Remove
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Edit assignment' : 'New assignment'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">Title<span className="required">*</span></label>
              <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Chapter 5 worksheet" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Subject</label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Maths" />
              </div>
              <div className="form-group">
                <label className="form-label">Class</label>
                <input className="form-input" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} placeholder="Primary 2-A" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Due date</label>
              <input type="date" className="form-input" value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label className="form-label">Instructions</label>
              <textarea className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What should students do?" />
            </div>
            <div className="modal-footer" style={{ margin: '0 -24px -24px', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete assignment?" onClose={() => setDeleteId(null)} size="sm">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>This will permanently remove the assignment.</p>
          <div className="modal-footer" style={{ margin: '16px -24px -24px', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default Assignments
