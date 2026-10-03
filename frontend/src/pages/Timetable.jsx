import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Clock, MapPin, Plus, User } from 'lucide-react'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import { timetableAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const SHORT = { Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun' }

const SUBJECT_COLORS = ['#4F46E5', '#F59E0B', '#10B981', '#EF4444', '#7C3AED', '#3B82F6', '#0EA5E9', '#94A3B8']
const colorFor = (subject = '') => {
  let h = 0
  for (let i = 0; i < subject.length; i++) h = (h * 31 + subject.charCodeAt(i)) % 997
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length]
}
const toMinutes = (t) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

const Timetable = () => {
  const { hasRole } = useAuth()
  const canWrite = hasRole(['admin', 'teacher'])
  const todayIdx = (new Date().getDay() + 6) % 7
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeDay, setActiveDay] = useState(DAYS[todayIdx] || 'Monday')
  const [view, setView] = useState('day')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ class_name: '', subject: '', teacher_name: '', day_of_week: 'Monday', start_time: '', end_time: '', room: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchEntries = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await timetableAPI.getAll({ limit: 1000 })
      setEntries(Array.isArray(res.data) ? res.data : [])
    } catch {
      setError('Could not load the timetable. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEntries()
  }, [])

  const dayEntries = useMemo(
    () =>
      entries
        .filter((e) => e.day_of_week === activeDay)
        .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time)),
    [entries, activeDay]
  )

  const openAdd = (day) => {
    setEditing(null)
    setForm({ class_name: '', subject: '', teacher_name: '', day_of_week: day || activeDay, start_time: '', end_time: '', room: '' })
    setFormError('')
    setModalOpen(true)
  }
  const openEdit = (e) => {
    setEditing(e)
    setForm({
      class_name: e.class_name || '',
      subject: e.subject || '',
      teacher_name: e.teacher_name || '',
      day_of_week: e.day_of_week || 'Monday',
      start_time: e.start_time || '',
      end_time: e.end_time || '',
      room: e.room || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (ev) => {
    ev.preventDefault()
    setFormError('')
    if (!form.class_name.trim() || !form.subject.trim() || !form.teacher_name.trim() || !form.day_of_week || !form.start_time || !form.end_time) {
      setFormError('Class, subject, teacher, day, start and end time are required.')
      return
    }
    if (toMinutes(form.end_time) <= toMinutes(form.start_time)) {
      setFormError('End time must be after start time.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        class_name: form.class_name.trim(),
        subject: form.subject.trim(),
        teacher_name: form.teacher_name.trim(),
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
        room: form.room.trim() || null,
      }
      if (editing) await timetableAPI.update(editing.id, payload)
      else await timetableAPI.create(payload)
      setModalOpen(false)
      fetchEntries()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the timetable entry.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await timetableAPI.remove(deleteId)
      setDeleteId(null)
      fetchEntries()
    } catch {
      setError('Could not delete the entry.')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading timetable…" />

  const entryCard = (e) => {
    const c = colorFor(e.subject)
    return (
      <div
        key={e.id}
        className="card card-padded notice-card"
        style={{ borderLeft: `3px solid ${c}`, cursor: canWrite ? 'pointer' : 'default' }}
        onClick={() => canWrite && openEdit(e)}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>{e.subject}</div>
            <div className="text-muted" style={{ fontSize: 13 }}>{e.class_name}</div>
          </div>
          <span className="tt-time">
            {e.start_time} – {e.end_time}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 10, fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><User size={14} /> {e.teacher_name}</span>
          {e.room && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><MapPin size={14} /> {e.room}</span>}
        </div>
        {canWrite && (
          <div className="table-actions" style={{ marginTop: 10 }}>
            <button className="row-action" onClick={(ev) => { ev.stopPropagation(); openEdit(e) }}>Edit</button>
            <button className="row-action danger" onClick={(ev) => { ev.stopPropagation(); setDeleteId(e.id) }}>Remove</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Class <span className="accent-word">Timetable</span></div>
          <div className="page-subtitle">The week at BabyLand, beautifully organized.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={() => openAdd()}>
              <Plus /> Add class
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' }}>
        <div className="chip-tabs">
          <button className={`chip-tab ${view === 'day' ? 'active' : ''}`} onClick={() => setView('day')}>Day view</button>
          <button className={`chip-tab ${view === 'week' ? 'active' : ''}`} onClick={() => setView('week')}>Week view</button>
        </div>
      </div>

      <div className="day-tabs">
        {DAYS.map((d) => (
          <button key={d} className={`day-tab ${activeDay === d ? 'active' : ''}`} onClick={() => { setActiveDay(d); setView('day') }}>
            {SHORT[d]}
            <span style={{ display: 'block', fontSize: 11, fontWeight: 500, opacity: 0.85 }}>
              {entries.filter((e) => e.day_of_week === d).length} classes
            </span>
          </button>
        ))}
      </div>

      {view === 'day' ? (
        dayEntries.length === 0 ? (
          <div className="card">
            <EmptyState
              title={`No classes on ${activeDay}`}
              desc="Enjoy the breather — or schedule a class for this day."
              icon={CalendarDays}
              action={canWrite ? <button className="btn btn-primary" onClick={() => openAdd(activeDay)}><Plus /> Add class</button> : null}
            />
          </div>
        ) : (
          <div className="grid grid-cols-2">{dayEntries.map(entryCard)}</div>
        )
      ) : (
        <div className="grid grid-cols-3">
          {DAYS.map((d) => {
            const list = entries.filter((e) => e.day_of_week === d).sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
            return (
              <div key={d} className="card">
                <div className="card-header">
                  <div className="card-title">{d}</div>
                  <span className="text-muted" style={{ fontSize: 13 }}>{list.length} classes</span>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {list.length === 0 ? (
                    <div className="text-muted" style={{ fontSize: 13 }}>No classes</div>
                  ) : (
                    list.map((e) => {
                      const c = colorFor(e.subject)
                      return (
                        <div
                          key={e.id}
                          onClick={() => canWrite && openEdit(e)}
                          style={{ background: `${c}12`, borderLeft: `4px solid ${c}`, borderRadius: 10, padding: '10px 12px', cursor: canWrite ? 'pointer' : 'default' }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 13.5 }}>{e.subject} · {e.class_name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                            <Clock size={12} /> {e.start_time} – {e.end_time} · {e.teacher_name}
                            {e.room ? ` · ${e.room}` : ''}
                          </div>
                        </div>
                      )
                    })
                  )}
                  {canWrite && (
                    <button className="btn btn-ghost btn-sm" onClick={() => openAdd(d)}>
                      <Plus /> Add
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Edit class' : 'Schedule a new class'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add class'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Class<span className="required">*</span></label>
                <input className="form-input" value={form.class_name} onChange={(e) => setForm({ ...form, class_name: e.target.value })} placeholder="e.g. KG-A, 2-B" />
              </div>
              <div className="form-group">
                <label className="form-label">Subject<span className="required">*</span></label>
                <input className="form-input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Phonics" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Teacher<span className="required">*</span></label>
                <input className="form-input" value={form.teacher_name} onChange={(e) => setForm({ ...form, teacher_name: e.target.value })} placeholder="Teacher name" />
              </div>
              <div className="form-group">
                <label className="form-label">Room</label>
                <input className="form-input" value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} placeholder="e.g. Room 4" />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Day<span className="required">*</span></label>
              <select className="form-select" value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: e.target.value })}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Start time<span className="required">*</span></label>
                <input type="time" className="form-input" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">End time<span className="required">*</span></label>
                <input type="time" className="form-input" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete class?"
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
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>This timetable entry will be permanently removed.</p>
        </Modal>
      )}
    </div>
  )
}

export default Timetable
