import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Layers } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import { gradesAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, inputNumber, optInt, trimOrNull } from '../../utils/format'

const emptyForm = { name: '', display_order: '', description: '' }

const Grades = () => {
  const { hasRole, hasPermission } = useAuth()
  const canWrite = hasRole(['admin']) && hasPermission('grades', 'write')
  const [grades, setGrades] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchGrades = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await gradesAPI.getAll({ limit: 200 })
      setGrades(Array.isArray(res.data) ? res.data : [])
    } catch {
      setError('Could not load grades. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchGrades()
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return grades
    return grades.filter(
      (g) => g.name?.toLowerCase().includes(q) || g.description?.toLowerCase().includes(q)
    )
  }, [grades, search])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, display_order: inputNumber(grades.length + 1) })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (g) => {
    setEditing(g)
    setForm({
      name: g.name || '',
      display_order: inputNumber(g.display_order),
      description: g.description || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Grade name is required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        display_order: optInt(form.display_order),
        description: trimOrNull(form.description),
      }
      if (editing) await gradesAPI.update(editing.id, payload)
      else await gradesAPI.create(payload)
      setModalOpen(false)
      fetchGrades()
    } catch (err) {
      setFormError(errDetail(err, 'Could not save the grade. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await gradesAPI.remove(deleteId)
      setDeleteId(null)
      fetchGrades()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the grade.'))
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading grades…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Grades <span className="accent-word">({grades.length})</span>
          </div>
          <div className="page-subtitle">
            The class ladder the whole school is measured against, in display order.
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Add grade
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search grade…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={grades.length === 0 ? 'No grades yet' : 'No matches found'}
            desc={
              grades.length === 0
                ? 'Add the grade levels your school runs — Nursery through Grade 12.'
                : 'Try a different search.'
            }
            icon={Layers}
            action={
              canWrite && grades.length === 0 ? (
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus /> Add grade
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">Order</th>
                  <th>Grade</th>
                  <th>Description</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g) => (
                  <tr key={g.id}>
                    <td className="num muted-cell">{g.display_order ?? '—'}</td>
                    <td className="cell-name">{g.name}</td>
                    <td>{g.description || <span className="muted-cell">—</span>}</td>
                    {canWrite && (
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="row-action" onClick={() => openEdit(g)}>
                            Edit
                          </button>
                          <button className="row-action danger" onClick={() => setDeleteId(g.id)}>
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
          Showing {filtered.length} of {grades.length} grades
        </span>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit grade' : 'Add a new grade'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add grade'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Grade<span className="required">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="10"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Display order</label>
                <input
                  type="number"
                  className="form-input"
                  value={form.display_order}
                  onChange={(e) => setForm({ ...form, display_order: e.target.value })}
                  placeholder="10"
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Secondary · first year"
              />
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete grade?"
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
            This grade will be permanently removed. Existing class sections stay, but lose their grade link.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Grades