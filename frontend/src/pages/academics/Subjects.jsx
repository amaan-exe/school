import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, BookOpen } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { subjectsAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, trimOrNull } from '../../utils/format'

const CATEGORIES = ['core', 'elective', 'language', 'practical', 'co-curricular']

const categoryVariant = (cat) => {
  switch (cat) {
    case 'core': return 'primary'
    case 'elective': return 'pink'
    case 'language': return 'info'
    case 'practical': return 'warning'
    case 'co-curricular': return 'success'
    default: return 'neutral'
  }
}

const emptyForm = {
  name: '',
  code: '',
  category: 'core',
  description: '',
  is_active: true,
}

const Subjects = () => {
  const { hasPermission, hasRole } = useAuth()
  const canWrite = hasRole(['admin']) && hasPermission('subjects', 'write')
  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchSubjects = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await subjectsAPI.getAll({ limit: 500 })
      setSubjects(Array.isArray(res.data) ? res.data : [])
    } catch {
      setError('Could not load subjects. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchSubjects()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return subjects.filter((s) => {
      if (categoryFilter !== 'all' && s.category !== categoryFilter) return false
      if (!q) return true
      return (
        s.name?.toLowerCase().includes(q) ||
        s.code?.toLowerCase().includes(q) ||
        s.description?.toLowerCase().includes(q)
      )
    })
  }, [subjects, search, categoryFilter])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (s) => {
    setEditing(s)
    setForm({
      name: s.name || '',
      code: s.code || '',
      category: s.category || 'core',
      description: s.description || '',
      is_active: s.is_active !== false,
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.code.trim()) {
      setFormError('Subject name and code are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim().toUpperCase(),
        category: form.category || null,
        description: trimOrNull(form.description),
        is_active: !!form.is_active,
      }
      if (editing) await subjectsAPI.update(editing.id, payload)
      else await subjectsAPI.create(payload)
      setModalOpen(false)
      fetchSubjects()
    } catch (err) {
      setFormError(errDetail(err, 'Could not save the subject. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await subjectsAPI.remove(deleteId)
      setDeleteId(null)
      fetchSubjects()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the subject.'))
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading subjects…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Subjects <span className="accent-word">({subjects.length})</span>
          </div>
          <div className="page-subtitle">
            The curriculum catalogue every class, teacher and report reads from.
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Add subject
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search name, code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={subjects.length === 0 ? 'No subjects yet' : 'No matches found'}
            desc={
              subjects.length === 0
                ? 'Add the subjects your school teaches to start building the curriculum.'
                : 'Try a different search or category filter.'
            }
            icon={BookOpen}
            action={
              canWrite && subjects.length === 0 ? (
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus /> Add subject
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Code</th>
                  <th>Category</th>
                  <th>Status</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-name">{s.name}</div>
                      {s.description && <div className="cell-sub">{s.description}</div>}
                    </td>
                    <td>{s.code}</td>
                    <td>
                      {s.category ? (
                        <Badge variant={categoryVariant(s.category)}>{s.category}</Badge>
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                    <td>
                      {s.is_active === false ? (
                        <Badge variant="neutral">Inactive</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    {canWrite && (
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="row-action" onClick={() => openEdit(s)}>
                            Edit
                          </button>
                          <button className="row-action danger" onClick={() => setDeleteId(s.id)}>
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
        <span className="pagination-info">
          Showing {filtered.length} of {subjects.length} subjects
        </span>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit subject' : 'Add a new subject'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add subject'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Subject name<span className="required">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Mathematics"
                />
              </div>
              <div className="form-group">
                <label className="form-label">
                  Code<span className="required">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value })}
                  placeholder="MATH"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Category</label>
              <select
                className="form-select"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this subject covers…"
              />
            </div>
            <label className="status-toggle active-present" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Offered this year
            </label>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete subject?"
          size="sm"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This subject will be permanently removed. Class mappings that use it will break.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Subjects