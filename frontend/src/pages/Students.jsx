import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Users } from 'lucide-react'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import Badge from '../components/Badge'
import { studentsAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const initials = (name = '?') =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

const emptyForm = { name: '', email: '', phone: '', grade: '', date_of_birth: '', address: '' }

const Students = () => {
  const { hasRole } = useAuth()
  const canWrite = hasRole(['admin'])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [gradeFilter, setGradeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchStudents = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await studentsAPI.getAll({ limit: 1000 })
      setStudents(Array.isArray(res.data) ? res.data : [])
    } catch {
      setError('Could not load students. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStudents()
  }, [])

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade).filter(Boolean))].sort(),
    [students]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return students.filter((s) => {
      if (gradeFilter !== 'all' && s.grade !== gradeFilter) return false
      if (!q) return true
      return (
        s.name?.toLowerCase().includes(q) ||
        s.email?.toLowerCase().includes(q) ||
        s.phone?.toLowerCase().includes(q)
      )
    })
  }, [students, search, gradeFilter])

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
      email: s.email || '',
      phone: s.phone || '',
      grade: s.grade || '',
      date_of_birth: s.date_of_birth || '',
      address: s.address || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.email.trim() || !form.grade.trim()) {
      setFormError('Name, email and grade are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        grade: form.grade.trim(),
        date_of_birth: form.date_of_birth || null,
        address: form.address.trim() || null,
      }
      if (editing) await studentsAPI.update(editing.id, payload)
      else await studentsAPI.create(payload)
      setModalOpen(false)
      fetchStudents()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the student. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await studentsAPI.remove(deleteId)
      setDeleteId(null)
      fetchStudents()
    } catch {
      setError('Could not delete the student.')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading students…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Students <span className="accent-word">({students.length})</span>
          </div>
          <div className="page-subtitle">Every learner at BabyLand, in one friendly roster.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Add student
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input placeholder="Search name, email, phone…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="all">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={students.length === 0 ? 'No students yet' : 'No matches found'}
            desc={students.length === 0 ? 'Add your first student to start building the school roster.' : 'Try a different search or grade filter.'}
            icon={Users}
            action={canWrite && students.length === 0 ? <button className="btn btn-primary" onClick={openAdd}><Plus /> Add student</button> : null}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Grade</th>
                  <th>Phone</th>
                  <th>Date of birth</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <div className="cell-main">
                        <div className="avatar">{initials(s.name)}</div>
                        <div>
                          <div className="cell-name">{s.name}</div>
                          <div className="cell-sub">{s.email}</div>
                        </div>
                      </div>
                    </td>
                    <td><Badge variant="primary">Grade {s.grade}</Badge></td>
                    <td>{s.phone || '—'}</td>
                    <td>{s.date_of_birth || '—'}</td>
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
        <span className="pagination-info">Showing {filtered.length} of {students.length} students</span>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit student' : 'Add a new student'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add student'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full name<span className="required">*</span></label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ava Sharma" />
              </div>
              <div className="form-group">
                <label className="form-label">Email<span className="required">*</span></label>
                <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="ava@example.com" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 010 2030" />
              </div>
              <div className="form-group">
                <label className="form-label">Grade<span className="required">*</span></label>
                <input className="form-input" value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} placeholder="e.g. KG, 1, 2…" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Date of birth</label>
              <input type="date" className="form-input" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Address</label>
              <textarea className="form-textarea" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="Home address" />
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete student?"
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
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This will permanently remove the student record. This action cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Students
