import { useEffect, useMemo, useState } from 'react'
import { Award, Plus, Search } from 'lucide-react'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import Badge from '../components/Badge'
import { marksAPI, studentsAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const pctOf = (m) => (m.max_score ? (Number(m.score) / Number(m.max_score)) * 100 : 0)
const pctVariant = (p) => (p >= 75 ? 'success' : p >= 50 ? 'warning' : 'danger')

const Marks = () => {
  const { hasRole } = useAuth()
  const canWrite = hasRole(['admin', 'teacher'])
  const [marks, setMarks] = useState([])
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [studentFilter, setStudentFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ student_id: '', subject: '', exam_name: '', score: '', max_score: '100', date: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const studentName = (id) => students.find((s) => s.id === id)?.name || `#${id}`

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [m, s] = await Promise.all([
        marksAPI.getAll({ limit: 1000 }),
        studentsAPI.getAll({ limit: 1000 }),
      ])
      setMarks(Array.isArray(m.data) ? m.data : [])
      setStudents(Array.isArray(s.data) ? s.data : [])
    } catch {
      setError('Could not load marks. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const subjects = useMemo(
    () => [...new Set(marks.map((m) => m.subject).filter(Boolean))].sort(),
    [marks]
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return marks.filter((m) => {
      if (studentFilter !== 'all' && String(m.student_id) !== String(studentFilter)) return false
      if (subjectFilter !== 'all' && m.subject !== subjectFilter) return false
      if (!q) return true
      return (
        studentName(m.student_id).toLowerCase().includes(q) ||
        m.subject?.toLowerCase().includes(q) ||
        m.exam_name?.toLowerCase().includes(q)
      )
    })
  }, [marks, studentFilter, subjectFilter, search, students]) // eslint-disable-line react-hooks/exhaustive-deps

  const openAdd = () => {
    setEditing(null)
    setForm({ student_id: '', subject: '', exam_name: '', score: '', max_score: '100', date: '' })
    setFormError('')
    setModalOpen(true)
  }
  const openEdit = (m) => {
    setEditing(m)
    setForm({
      student_id: String(m.student_id),
      subject: m.subject || '',
      exam_name: m.exam_name || '',
      score: String(m.score ?? ''),
      max_score: String(m.max_score ?? '100'),
      date: m.date || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.student_id || !form.subject.trim() || !form.exam_name.trim() || form.score === '') {
      setFormError('Student, subject, exam name and score are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        student_id: Number(form.student_id),
        subject: form.subject.trim(),
        exam_name: form.exam_name.trim(),
        score: Number(form.score),
        max_score: Number(form.max_score) || 100,
        date: form.date || null,
      }
      if (editing) await marksAPI.update(editing.id, payload)
      else await marksAPI.create(payload)
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the mark. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await marksAPI.remove(deleteId)
      setDeleteId(null)
      fetchAll()
    } catch {
      setError('Could not delete the mark.')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading marks…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Marks <span className="accent-word">({marks.length})</span>
          </div>
          <div className="page-subtitle">Celebrate progress — every score tells a story.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Record mark
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input placeholder="Search student, subject, exam…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="filter-select" value={studentFilter} onChange={(e) => setStudentFilter(e.target.value)}>
          <option value="all">All students</option>
          {students.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
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
            title={marks.length === 0 ? 'No marks yet' : 'No matches found'}
            desc={marks.length === 0 ? 'Record your first exam score to start tracking progress.' : 'Try different filters.'}
            icon={Award}
            action={canWrite && marks.length === 0 ? <button className="btn btn-primary" onClick={openAdd}><Plus /> Record mark</button> : null}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Subject</th>
                  <th>Exam</th>
                  <th>Score</th>
                  <th>Result</th>
                  <th>Date</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => {
                  const pct = pctOf(m)
                  return (
                    <tr key={m.id}>
                      <td className="cell-name">{studentName(m.student_id)}</td>
                      <td><Badge variant="info">{m.subject}</Badge></td>
                      <td>{m.exam_name}</td>
                      <td style={{ fontWeight: 600 }}>{m.score} / {m.max_score}</td>
                      <td><Badge variant={pctVariant(pct)}>{Math.round(pct)}%</Badge></td>
                      <td>{m.date || '—'}</td>
                      {canWrite && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openEdit(m)}>
                              Edit
                            </button>
                            <button className="row-action danger" onClick={() => setDeleteId(m.id)}>
                              Remove
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
      <div className="pagination">
        <span className="pagination-info">Showing {filtered.length} of {marks.length} marks</span>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit mark' : 'Record a new mark'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Record mark'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">Student<span className="required">*</span></label>
              <select className="form-select" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })}>
                <option value="">Select a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} · Grade {s.grade}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Subject<span className="required">*</span></label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Maths" />
              </div>
              <div className="form-group">
                <label className="form-label">Exam name<span className="required">*</span></label>
                <input className="form-input" value={form.exam_name} onChange={(e) => setForm({ ...form, exam_name: e.target.value })} placeholder="e.g. Mid-term" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Score<span className="required">*</span></label>
                <input type="number" min="0" step="0.5" className="form-input" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} placeholder="85" />
              </div>
              <div className="form-group">
                <label className="form-label">Max score</label>
                <input type="number" min="1" step="1" className="form-input" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} placeholder="100" />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Exam date</label>
              <input type="date" className="form-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete mark?"
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
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>This mark record will be permanently removed.</p>
        </Modal>
      )}
    </div>
  )
}

export default Marks
