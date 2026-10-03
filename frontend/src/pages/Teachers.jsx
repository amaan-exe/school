import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, GraduationCap, BookOpen } from 'lucide-react'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import Badge from '../components/Badge'
import { teachersAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const initials = (name = '?') =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

const emptyForm = { name: '', email: '', phone: '', subject: '', qualification: '' }

const Teachers = () => {
  const { hasRole } = useAuth()
  const canWrite = hasRole(['admin'])
  const [teachers, setTeachers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchTeachers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await teachersAPI.getAll({ limit: 1000 })
      setTeachers(Array.isArray(res.data) ? res.data : [])
    } catch {
      setError('Could not load teachers. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchTeachers()
  }, [])

  const subjects = useMemo(
    () => [...new Set(teachers.map((t) => t.subject).filter(Boolean))].sort(),
    [teachers]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return teachers.filter((t) => {
      if (subjectFilter !== 'all' && t.subject !== subjectFilter) return false
      if (!q) return true
      return (
        t.name?.toLowerCase().includes(q) ||
        t.email?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q)
      )
    })
  }, [teachers, search, subjectFilter])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }
  const openEdit = (t) => {
    setEditing(t)
    setForm({
      name: t.name || '',
      email: t.email || '',
      phone: t.phone || '',
      subject: t.subject || '',
      qualification: t.qualification || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.email.trim() || !form.subject.trim()) {
      setFormError('Name, email and subject are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim() || null,
        subject: form.subject.trim(),
        qualification: form.qualification.trim() || null,
      }
      if (editing) await teachersAPI.update(editing.id, payload)
      else await teachersAPI.create(payload)
      setModalOpen(false)
      fetchTeachers()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the teacher. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await teachersAPI.remove(deleteId)
      setDeleteId(null)
      fetchTeachers()
    } catch {
      setError('Could not delete the teacher.')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading teachers…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Teachers <span className="accent-word">({teachers.length})</span>
          </div>
          <div className="page-subtitle">The caring educators who make BabyLand shine.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Add teacher
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input placeholder="Search name, email, subject…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={teachers.length === 0 ? 'No teachers yet' : 'No matches found'}
            desc={teachers.length === 0 ? 'Add your first teacher to start building the faculty.' : 'Try a different search or subject filter.'}
            icon={GraduationCap}
            action={canWrite && teachers.length === 0 ? <button className="btn btn-primary" onClick={openAdd}><Plus /> Add teacher</button> : null}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Subject</th>
                  <th>Phone</th>
                  <th>Qualification</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <div className="cell-main">
                        <div className="avatar">{initials(t.name)}</div>
                        <div>
                          <div className="cell-name">{t.name}</div>
                          <div className="cell-sub">{t.email}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <BookOpen size={14} style={{ color: 'var(--primary)' }} />
                        <Badge variant="info">{t.subject}</Badge>
                      </span>
                    </td>
                    <td>{t.phone || '—'}</td>
                    <td>{t.qualification || '—'}</td>
                    {canWrite && (
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="row-action" onClick={() => openEdit(t)}>
                            Edit
                          </button>
                          <button className="row-action danger" onClick={() => setDeleteId(t.id)}>
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
        <span className="pagination-info">Showing {filtered.length} of {teachers.length} teachers</span>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit teacher' : 'Add a new teacher'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add teacher'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full name<span className="required">*</span></label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ms. Rivera" />
              </div>
              <div className="form-group">
                <label className="form-label">Email<span className="required">*</span></label>
                <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="rivera@babyland.com" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+1 555 010 2030" />
              </div>
              <div className="form-group">
                <label className="form-label">Subject<span className="required">*</span></label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Phonics, Maths, Art" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Qualification</label>
              <input className="form-input" value={form.qualification} onChange={(e) => setForm({ ...form, qualification: e.target.value })} placeholder="e.g. B.Ed, Montessori Diploma" />
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete teacher?"
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
            This will permanently remove the teacher record. This action cannot be undone.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Teachers
