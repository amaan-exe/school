import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Plus } from 'lucide-react'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import { calendarAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const emptyForm = { title: '', description: '', event_date: '', event_type: 'event' }

const typeVariant = (t) =>
  t === 'holiday' ? 'success' : t === 'exam' ? 'info' : t === 'emergency' ? 'danger' : t === 'meeting' ? 'primary' : 'warning'

const Calendar = () => {
  const { hasPermission, hasRole } = useAuth()
  const canWrite = hasPermission('calendar', 'create') || hasRole(['admin', 'staff', 'teacher'])
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
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
      const res = await calendarAPI.getAll({ limit: 500 })
      const list = Array.isArray(res.data) ? res.data : []
      list.sort((a, b) => String(a.event_date || '9999').localeCompare(String(b.event_date || '9999')))
      setItems(list)
    } catch {
      setError('Could not load the calendar. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return items.filter((e) => !e.event_date || String(e.event_date).slice(0, 10) >= today)
  }, [items])

  const openAdd = () => {
    setEditing(null)
    setForm({ ...emptyForm, event_date: new Date().toISOString().slice(0, 10) })
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (e) => {
    setEditing(e)
    setForm({
      title: e.title || '',
      description: e.description || '',
      event_date: e.event_date ? String(e.event_date).slice(0, 10) : '',
      event_type: e.event_type || 'event',
    })
    setFormError('')
    setModalOpen(true)
  }

  const save = async (e) => {
    e.preventDefault()
    if (!form.title.trim() || !form.event_date) {
      setFormError('Title and date are required.')
      return
    }
    setSaving(true)
    setFormError('')
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        event_date: form.event_date,
        event_type: form.event_type,
      }
      if (editing) await calendarAPI.update(editing.id, payload)
      else await calendarAPI.create(payload)
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the event.')
    } finally {
      setSaving(false)
    }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await calendarAPI.remove(deleteId)
      setDeleteId(null)
      fetchAll()
    } catch {
      setDeleteId(null)
      setError('Could not delete the event.')
    }
  }

  if (loading) return <LoadingSpinner message="Loading calendar…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">School calendar</div>
          <div className="page-subtitle">Events, holidays, exams and meetings.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary btn-sm" onClick={openAdd}>
              <Plus /> New event
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      {upcoming.length === 0 ? (
        <div className="card">
          <EmptyState
            title="No upcoming events"
            desc={canWrite ? 'Add the first event to the school calendar.' : 'No events are scheduled right now.'}
            icon={CalendarDays}
            action={canWrite ? <button className="btn btn-primary btn-sm" onClick={openAdd}><Plus /> New event</button> : null}
          />
        </div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ paddingTop: 8 }}>
            {upcoming.map((e) => (
              <div key={e.id} style={{ display: 'flex', gap: 14, padding: '14px 0', borderBottom: '1px solid var(--border-light)', alignItems: 'flex-start' }}>
                <div className="cal-date">
                  <div className="cal-date-day">{e.event_date ? String(e.event_date).slice(8, 10) : '—'}</div>
                  <div className="cal-date-mon">
                    {e.event_date
                      ? new Date(`${String(e.event_date).slice(0, 10)}T00:00:00`).toLocaleDateString('en-US', { month: 'short' })
                      : ''}
                  </div>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{e.title}</div>
                  {e.description && (
                    <div className="text-muted" style={{ fontSize: 13 }}>{e.description}</div>
                  )}
                </div>
                <Badge variant={typeVariant(e.event_type)}>{e.event_type || 'event'}</Badge>
                {canWrite && (
                  <div className="table-actions">
                    <button className="row-action" onClick={() => openEdit(e)}>
                      Edit
                    </button>
                    <button className="row-action danger" onClick={() => setDeleteId(e.id)}>
                      Remove
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {modalOpen && (
        <Modal title={editing ? 'Edit event' : 'New event'} onClose={() => setModalOpen(false)}>
          <form onSubmit={save}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">Title<span className="required">*</span></label>
              <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Annual sports day" required />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Date<span className="required">*</span></label>
                <input type="date" className="form-input" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="form-select" value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
                  <option value="event">Event</option>
                  <option value="holiday">Holiday</option>
                  <option value="exam">Exam</option>
                  <option value="meeting">Meeting</option>
                  <option value="emergency">Emergency</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Details</label>
              <textarea className="form-textarea" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Time, venue, notes…" />
            </div>
            <div className="modal-footer" style={{ margin: '0 -24px -24px', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal title="Delete event?" onClose={() => setDeleteId(null)} size="sm">
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>This will permanently remove the event.</p>
          <div className="modal-footer" style={{ margin: '16px -24px -24px', borderRadius: '0 0 var(--radius-lg) var(--radius-lg)' }}>
            <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
            <button className="btn btn-danger" onClick={confirmDelete}>Delete</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

export default Calendar
