import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCheck, ClipboardCheck, Save } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import { studentsAPI, attendanceAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const todayStr = () => new Date().toISOString().slice(0, 10)
const initials = (name = '?') =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

const Attendance = () => {
  const { hasRole } = useAuth()
  const canWrite = hasRole(['admin', 'teacher'])
  const [date, setDate] = useState(todayStr())
  const [gradeFilter, setGradeFilter] = useState('all')
  const [students, setStudents] = useState([])
  const [existing, setExisting] = useState([])
  const [marks, setMarks] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let mounted = true
    studentsAPI
      .getAll({ limit: 1000 })
      .then((res) => {
        if (mounted) setStudents(Array.isArray(res.data) ? res.data : [])
      })
      .catch(() => mounted && setError('Could not load students.'))
      .finally(() => mounted && setLoading(false))
    return () => {
      mounted = false
    }
  }, [])

  useEffect(() => {
    let mounted = true
    setError('')
    setNotice('')
    attendanceAPI
      .getAll({ attendance_date: date, limit: 1000 })
      .then((res) => {
        if (!mounted) return
        const records = Array.isArray(res.data) ? res.data : []
        setExisting(records)
        const map = {}
        records.forEach((r) => {
          map[r.student_id] = { status: r.status, recordId: r.id }
        })
        setMarks(map)
      })
      .catch(() => mounted && setExisting([]))
    return () => {
      mounted = false
    }
  }, [date])

  const grades = useMemo(
    () => [...new Set(students.map((s) => s.grade).filter(Boolean))].sort(),
    [students]
  )

  const visible = useMemo(
    () => students.filter((s) => gradeFilter === 'all' || s.grade === gradeFilter),
    [students, gradeFilter]
  )

  const summary = useMemo(() => {
    let present = 0,
      absent = 0,
      late = 0,
      unmarked = 0
    visible.forEach((s) => {
      const st = marks[s.id]?.status
      if (st === 'present') present += 1
      else if (st === 'absent') absent += 1
      else if (st === 'late') late += 1
      else unmarked += 1
    })
    const marked = present + absent + late
    const pct = marked ? Math.round(((present + late) / marked) * 100) : 0
    return { present, absent, late, unmarked, marked, total: visible.length, pct }
  }, [visible, marks])

  const setStatus = (id, status) => {
    const entry = marks[id] || {}
    setMarks({ ...marks, [id]: { ...entry, status: status } })
  }

  const markAllPresent = () => {
    const next = { ...marks }
    visible.forEach((s) => {
      next[s.id] = { ...next[s.id], status: 'present' }
    })
    setMarks(next)
  }

  const handleSave = async () => {
    if (!canWrite) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      const jobs = visible
        .filter((s) => marks[s.id]?.status)
        .map((s) => {
          const entry = marks[s.id]
          const payload = { student_id: s.id, date, status: entry.status }
          if (entry.recordId) return attendanceAPI.update(entry.recordId, { status: entry.status, date })
          return attendanceAPI
            .create(payload)
            .catch((err) => {
              // Record may already exist (400/409) — try to find + update it
              if ([400, 409, 422].includes(err.response?.status)) {
                const found = existing.find((r) => r.student_id === s.id)
                if (found) return attendanceAPI.update(found.id, { status: entry.status, date })
              }
              throw err
            })
        })
      await Promise.all(jobs)
      const res = await attendanceAPI.getAll({ attendance_date: date, limit: 1000 })
      const records = Array.isArray(res.data) ? res.data : []
      setExisting(records)
      const map = {}
      records.forEach((r) => {
        map[r.student_id] = { status: r.status, recordId: r.id }
      })
      setMarks(map)
      setNotice(`Attendance saved for ${jobs.length} student${jobs.length === 1 ? '' : 's'} on ${date}.`)
    } catch {
      setError('Could not save attendance. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading attendance…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Attendance <span className="accent-word">· {date}</span>
          </div>
          <div className="page-subtitle">Mark who&apos;s present, absent or late today.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-secondary btn-sm" onClick={markAllPresent}>
              <CheckCheck /> All present
            </button>
            <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || summary.marked === 0}>
              <Save /> {saving ? 'Saving…' : 'Save attendance'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}
      {notice && (
        <div className="form-error" style={{ background: 'var(--success-light)', color: 'var(--success-dark)', borderColor: 'var(--success)' }}>
          {notice}
        </div>
      )}

      <div className="filter-bar">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600 }}>
          <CalendarDays size={17} style={{ color: 'var(--primary)' }} />
          <input type="date" className="filter-select" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)} />
        </span>
        <select className="filter-select" value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}>
          <option value="all">All grades</option>
          {grades.map((g) => (
            <option key={g} value={g}>Grade {g}</option>
          ))}
        </select>
      </div>

      <div className="card card-padded" style={{ marginBottom: 20 }}>
        <div className="summary-chip-row" style={{ marginBottom: 12 }}>
          <span className="summary-chip">Present · {summary.present}</span>
          <span className="summary-chip">Absent · {summary.absent}</span>
          <span className="summary-chip">Late · {summary.late}</span>
          <span className="summary-chip">Unmarked · {summary.unmarked}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="progress-bar" style={{ flex: 1 }}>
            <div className="progress-bar-fill" style={{ width: `${summary.pct}%`, background: 'var(--success)' }} />
          </div>
          <strong style={{ fontSize: 15 }}>{summary.pct}%</strong>
        </div>
        <div className="form-hint">Attendance rate counts present + late across marked students.</div>
      </div>

      <div className="card">
        {visible.length === 0 ? (
          <EmptyState title="No students found" desc="Add students first, or try a different grade filter." icon={ClipboardCheck} />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Grade</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((s) => {
                  const st = marks[s.id]?.status
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="cell-main">
                          <div className="avatar avatar-sm">{initials(s.name)}</div>
                          <div>
                            <div className="cell-name">{s.name}</div>
                            <div className="cell-sub">{s.email}</div>
                          </div>
                        </div>
                      </td>
                      <td>Grade {s.grade}</td>
                      <td>
                        {canWrite ? (
                          <div className="status-toggle-group">
                            {['present', 'absent', 'late'].map((opt) => (
                              <button
                                key={opt}
                                className={`status-toggle ${st === opt ? `active-${opt}` : ''}`}
                                onClick={() => setStatus(s.id, opt)}
                              >
                                {opt[0].toUpperCase() + opt.slice(1)}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <span style={{ textTransform: 'capitalize', fontWeight: 600 }}>{st || 'Unmarked'}</span>
                        )}
                      </td>
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
          {summary.marked} of {summary.total} marked
        </span>
      </div>
    </div>
  )
}

export default Attendance
