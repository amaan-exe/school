import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Link2 } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { classSubjectsAPI, subjectsAPI, structureAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, optInt } from '../../utils/format'

const emptyForm = {
  class_section_id: '',
  subject_id: '',
  academic_year_id: '',
  periods_per_week: '',
}

const ClassSubjects = () => {
  const { hasRole, hasPermission } = useAuth()
  const canWrite = hasRole(['admin']) && hasPermission('subjects', 'write')
  const [rows, setRows] = useState([])
  const [subjects, setSubjects] = useState([])
  const [classes, setClasses] = useState([])
  const [years, setYears] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [sectionFilter, setSectionFilter] = useState('all')
  const [subjectFilter, setSubjectFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { limit: 500 }
      if (sectionFilter !== 'all') params.class_section_id = sectionFilter
      if (subjectFilter !== 'all') params.subject_id = subjectFilter
      const [csRes, subRes, clsRes, yrRes] = await Promise.all([
        classSubjectsAPI.getAll(params),
        subjectsAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        structureAPI.classes({ limit: 500 }).catch(() => ({ data: [] })),
        structureAPI.academicYears({ limit: 100 }).catch(() => ({ data: [] })),
      ])
      setRows(Array.isArray(csRes.data) ? csRes.data : [])
      setSubjects(Array.isArray(subRes.data) ? subRes.data : [])
      setClasses(Array.isArray(clsRes.data) ? clsRes.data : [])
      setYears(Array.isArray(yrRes.data) ? yrRes.data : [])
    } catch {
      setError('Could not load class subjects. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionFilter, subjectFilter])

  const sectionName = (id) => classes.find((c) => c.id === id)?.class_name || `#${id}`
  const subjectOf = (id) => subjects.find((s) => s.id === id)
  const yearName = (id) => years.find((y) => y.id === id)?.name

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      const sub = subjectOf(r.subject_id)
      return (
        sectionName(r.class_section_id).toLowerCase().includes(q) ||
        (sub?.name || '').toLowerCase().includes(q) ||
        (sub?.code || '').toLowerCase().includes(q)
      )
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search, subjects, classes])

  const openAdd = () => {
    setEditing(null)
    setForm({
      ...emptyForm,
      class_section_id: sectionFilter !== 'all' ? sectionFilter : '',
      subject_id: subjectFilter !== 'all' ? subjectFilter : '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      class_section_id: String(r.class_section_id ?? ''),
      subject_id: String(r.subject_id ?? ''),
      academic_year_id: r.academic_year_id ? String(r.academic_year_id) : '',
      periods_per_week: r.periods_per_week ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.class_section_id || !form.subject_id) {
      setFormError('A class section and a subject are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        class_section_id: optInt(form.class_section_id),
        subject_id: optInt(form.subject_id),
        academic_year_id: optInt(form.academic_year_id),
        periods_per_week: optInt(form.periods_per_week) ?? 0,
      }
      if (editing) await classSubjectsAPI.update(editing.id, payload)
      else await classSubjectsAPI.create(payload)
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not save the class subject. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await classSubjectsAPI.remove(deleteId)
      setDeleteId(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the class subject.'))
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading class subjects…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Class Subjects <span className="accent-word">({rows.length})</span>
          </div>
          <div className="page-subtitle">
            Which subject runs in which class section, and for how many periods a week.
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Map subject
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search class or subject…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
        >
          <option value="all">All class sections</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.class_name}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
        >
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={rows.length === 0 ? 'Nothing mapped yet' : 'No matches found'}
            desc={
              rows.length === 0
                ? 'Map a subject to a class section so timetables and reports can find it.'
                : 'Try a different search or filter.'
            }
            icon={Link2}
            action={
              canWrite && rows.length === 0 ? (
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus /> Map subject
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Class section</th>
                  <th>Subject</th>
                  <th>Academic year</th>
                  <th className="num">Periods / week</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const sub = subjectOf(r.subject_id)
                  return (
                    <tr key={r.id}>
                      <td>
                        <div className="cell-name">{sectionName(r.class_section_id)}</div>
                      </td>
                      <td>
                        <div className="cell-main">
                          <Badge variant="primary">{sub?.code || '—'}</Badge>
                          <span>{sub?.name || `#${r.subject_id}`}</span>
                        </div>
                      </td>
                      <td>{yearName(r.academic_year_id) || <span className="muted-cell">All years</span>}</td>
                      <td className="num">{r.periods_per_week ?? 0}</td>
                      {canWrite && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openEdit(r)}>
                              Edit
                            </button>
                            <button className="row-action danger" onClick={() => setDeleteId(r.id)}>
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
        <span className="pagination-info">
          Showing {filtered.length} of {rows.length} mappings
        </span>
      </div>

      {modalOpen && (
        <Modal
          title={editing ? 'Edit class subject' : 'Map a subject to a class'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Map subject'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Class section<span className="required">*</span>
                </label>
                <select
                  className="form-select"
                  value={form.class_section_id}
                  onChange={(e) => setForm({ ...form, class_section_id: e.target.value })}
                >
                  <option value="">Select a class section…</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Subject<span className="required">*</span>
                </label>
                <select
                  className="form-select"
                  value={form.subject_id}
                  onChange={(e) => setForm({ ...form, subject_id: e.target.value })}
                >
                  <option value="">Select a subject…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Academic year</label>
                <select
                  className="form-select"
                  value={form.academic_year_id}
                  onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
                >
                  <option value="">All years</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Periods per week</label>
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  value={form.periods_per_week}
                  onChange={(e) => setForm({ ...form, periods_per_week: e.target.value })}
                  placeholder="5"
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Remove mapping?"
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
            This subject will no longer be mapped to the class section.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default ClassSubjects