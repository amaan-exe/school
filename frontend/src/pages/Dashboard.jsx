import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  ClipboardCheck,
  Wallet,
  Plus,
  ArrowRight,
  Megaphone,
  CalendarDays,
  Award,
} from 'lucide-react'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import { studentsAPI, teachersAPI, feesAPI, marksAPI, noticesAPI, reportsAPI, timetableAPI } from '../api'
import { useAuth } from '../context/AuthContext'

const fmtDate = (d) => d.toISOString().slice(0, 10)
const todayStr = () => fmtDate(new Date())
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const todayName = () => DAY_NAMES[new Date().getDay()]

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const dateLine = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const Dashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [fees, setFees] = useState([])
  const [marks, setMarks] = useState([])
  const [notices, setNotices] = useState([])
  const [timetable, setTimetable] = useState([])
  const [attendanceSummary, setAttendanceSummary] = useState(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - 30)
        const [s, t, f, m, n, tt, att] = await Promise.all([
          studentsAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
          teachersAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
          feesAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
          marksAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
          noticesAPI.getAll({ active_only: true, limit: 5 }).catch(() => ({ data: [] })),
          timetableAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
          reportsAPI
            .attendanceSummary({ start_date: fmtDate(start), end_date: fmtDate(end) })
            .catch(() => null),
        ])
        if (!mounted) return
        setStudents(Array.isArray(s.data) ? s.data : [])
        setTeachers(Array.isArray(t.data) ? t.data : [])
        setFees(Array.isArray(f.data) ? f.data : [])
        setMarks(Array.isArray(m.data) ? m.data : [])
        setNotices(Array.isArray(n.data) ? n.data : [])
        setTimetable(Array.isArray(tt.data) ? tt.data : [])
        setAttendanceSummary(att?.data?.summary || null)
      } catch {
        if (mounted) setError('Could not load dashboard data. Please try again.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const studentName = useMemo(() => {
    const map = {}
    students.forEach((s) => {
      map[s.id] = s.name || `Student ${s.id}`
    })
    return (id) => map[id] || (id ? `Student ${id}` : '—')
  }, [students])

  const feeStats = useMemo(() => {
    const collected = fees.filter((f) => f.paid).reduce((s, f) => s + (Number(f.amount) || 0), 0)
    const pending = fees.filter((f) => !f.paid).reduce((s, f) => s + (Number(f.amount) || 0), 0)
    const unpaid = fees.filter((f) => !f.paid)
    const overdue = unpaid.filter((f) => f.due_date && f.due_date < todayStr()).length
    return { collected, pending, overdue, unpaid }
  }, [fees])

  const attendancePct = useMemo(() => {
    if (!attendanceSummary || !attendanceSummary.total) return null
    const { present = 0, late = 0, total = 0 } = attendanceSummary
    return Math.round(((present + late) / total) * 100)
  }, [attendanceSummary])

  const attRows = useMemo(() => {
    if (!attendanceSummary) return []
    const total = attendanceSummary.total || 1
    return [
      { n: 'Present', c: attendanceSummary.present || 0, pct: Math.round(((attendanceSummary.present || 0) / total) * 100), color: 'var(--success)' },
      { n: 'Absent', c: attendanceSummary.absent || 0, pct: Math.round(((attendanceSummary.absent || 0) / total) * 100), color: 'var(--danger)' },
      { n: 'Late', c: attendanceSummary.late || 0, pct: Math.round(((attendanceSummary.late || 0) / total) * 100), color: 'var(--accent)' },
    ]
  }, [attendanceSummary])

  const subjectData = useMemo(() => {
    const bySubject = {}
    marks.forEach((m) => {
      if (!m.subject) return
      const pct = m.max_score ? (Number(m.score) / Number(m.max_score)) * 100 : 0
      if (!bySubject[m.subject]) bySubject[m.subject] = { total: 0, count: 0 }
      bySubject[m.subject].total += pct
      bySubject[m.subject].count += 1
    })
    return Object.entries(bySubject)
      .map(([subject, v]) => ({ subject, avg: Math.round(v.total / v.count) }))
      .slice(0, 8)
  }, [marks])

  const todayLessons = useMemo(() => {
    const toMin = (t) => {
      if (!t) return 0
      const [h, m] = String(t).split(':').map(Number)
      return (h || 0) * 60 + (m || 0)
    }
    return timetable
      .filter((e) => String(e.day_of_week || '').toLowerCase() === todayName().toLowerCase())
      .sort((a, b) => toMin(a.start_time) - toMin(b.start_time))
      .slice(0, 6)
  }, [timetable])

  const firstName = user?.name?.split(' ')[0] || 'there'

  if (loading) return <LoadingSpinner message="Opening the morning register…" />

  return (
    <div>
      {/* ── Morning briefing masthead ── */}
      <div className="brief-hero">
        <div className="kicker">Morning briefing <span className="rule">·</span> {dateLine()}</div>
        <h1 className="brief-greeting">
          {greeting()}, <em>{firstName}.</em>
        </h1>
        <p className="brief-sub">
          The school at a glance — {students.length} pupils on roll, {todayLessons.length > 0 ? `${todayLessons.length} lessons on the board today` : 'no lessons timetabled today'}
          {feeStats.overdue > 0 ? `, and ${feeStats.overdue} fee${feeStats.overdue === 1 ? '' : 's'} past due` : ', and the fee book is tidy'}.
        </p>
      </div>

      {error && <div className="form-error">{error}</div>}

      {/* ── Ledger strip ── */}
      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">On roll</div>
          <div className="v">{students.length}</div>
          <div className="s">Enrolled pupils</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Teaching staff</div>
          <div className="v">{teachers.length}</div>
          <div className="s">Across all classes</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Attendance · 30 days</div>
          <div className="v">{attendancePct === null ? '—' : `${attendancePct}%`}</div>
          <div className="s">{attendanceSummary ? `${attendanceSummary.total} marks in the register` : 'Nothing marked yet'}</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Still to collect</div>
          <div className="v">${Math.round(feeStats.pending).toLocaleString()}</div>
          <div className="s">{feeStats.overdue > 0 ? `${feeStats.overdue} past due` : 'All on track'}</div>
        </div>
      </div>

      <div className="brief-columns">
        {/* ── Main column ── */}
        <div>
          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Today at school <span className="rule">·</span> {todayName()}</div>
            <hr className="brief-rule" />
            {todayLessons.length === 0 ? (
              <EmptyState title="A quiet day on the board" desc="No lessons are timetabled for today. The classrooms rest — see the full week on the timetable page." icon={CalendarDays} action={<Link to="/app/timetable" className="btn btn-secondary btn-sm">Open timetable <ArrowRight /></Link>} />
            ) : (
              <div className="timeline">
                {todayLessons.map((l) => (
                  <div key={l.id} className="timeline-item">
                    <div className="tt-time">{l.start_time || '—'}{l.end_time ? ` – ${l.end_time}` : ''}</div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{l.subject || 'Lesson'}{l.class_name ? ` · ${l.class_name}` : ''}</div>
                    <div className="text-muted" style={{ fontSize: 12.5 }}>
                      {[l.teacher_name, l.room ? `Room ${l.room}` : ''].filter(Boolean).join(' · ') || 'Details on the timetable'}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/app/timetable" className="btn btn-ghost btn-sm">Full week <ArrowRight /></Link>
              <span style={{ color: 'var(--border)', margin: '0 8px' }}>·</span>
              <Link to="/app/attendance" className="btn btn-ghost btn-sm"><Plus /> Take attendance</Link>
            </div>
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Attendance <span className="rule">·</span> last 30 days</div>
            <hr className="brief-rule" />
            {attRows.length === 0 || !attendanceSummary ? (
              <EmptyState title="The register is empty" desc="Take attendance to see present, absent and late tallies here." icon={ClipboardCheck} action={<Link to="/app/attendance" className="btn btn-primary btn-sm"><Plus /> Take attendance</Link>} />
            ) : (
              <div className="attendance-ledger">
                {attRows.map((r) => (
                  <div key={r.n}>
                    <div className="attendance-ledger-row">
                      <span className="n">{r.n}</span>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <span className="progress-bar-fill" style={{ width: `${r.pct}%`, background: r.color, display: 'block' }} />
                      </div>
                      <span className="c">{r.c} · {r.pct}%</span>
                    </div>
                  </div>
                ))}
                <div style={{ padding: '10px 16px' }}>
                  <Link to="/app/reports" className="btn btn-ghost btn-sm">Full report <ArrowRight /></Link>
                </div>
              </div>
            )}
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Fee ledger <span className="rule">·</span> awaiting payment</div>
            <hr className="brief-rule" />
            {fees.length === 0 ? (
              <EmptyState title="No fee records" desc="Open the fee book to start tracking payments." icon={Wallet} action={<Link to="/app/fees" className="btn btn-primary btn-sm">Open fee book</Link>} />
            ) : feeStats.unpaid.length === 0 ? (
              <p style={{ fontWeight: 700, fontSize: 17, color: 'var(--primary-dark)' }}>Every rupee accounted for — the fee book balances. <Link to="/app/fees" style={{ textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>See all</Link></p>
            ) : (
              <div className="card">
                <table className="fee-ledger">
                  <tbody>
                    {feeStats.unpaid.slice(0, 5).map((f) => {
                      const overdue = f.due_date && f.due_date < todayStr()
                      return (
                        <tr key={f.id}>
                          <td style={{ fontWeight: 600, paddingLeft: 16 }}>{studentName(f.student_id)}</td>
                          <td className="text-muted">due {f.due_date || '—'}</td>
                          <td style={{ fontWeight: 700 }}>${Number(f.amount || 0).toLocaleString()}</td>
                          <td style={{ textAlign: 'right', paddingRight: 16 }}>
                            <span className={`stamp ${overdue ? 'stamp-red' : 'stamp-amber'}`} style={{ fontSize: 10 }}>{overdue ? 'Overdue' : 'Due'}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)' }}>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>${Math.round(feeStats.collected).toLocaleString()} collected to date · </span>
                  <Link to="/app/fees" className="btn btn-ghost btn-sm">Fee book <ArrowRight /></Link>
                </div>
              </div>
            )}
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>How each subject is faring</div>
            <hr className="brief-rule" />
            {subjectData.length === 0 ? (
              <EmptyState title="No marks yet" desc="Record exam scores and subject averages will be chalked up here." icon={Award} action={<Link to="/app/marks" className="btn btn-secondary btn-sm">Open marks <ArrowRight /></Link>} />
            ) : (
              <div className="attendance-ledger">
                {subjectData.map((s) => (
                  <div key={s.subject} className="attendance-ledger-row">
                    <span className="n" style={{ minWidth: 110 }}>{s.subject}</span>
                    <div className="progress-bar" style={{ flex: 1 }}>
                      <span className="progress-bar-fill" style={{ width: `${s.avg}%`, background: 'var(--primary)', display: 'block' }} />
                    </div>
                    <span className="c">{s.avg}%</span>
                  </div>
                ))}
                <div style={{ padding: '10px 16px' }}>
                  <Link to="/app/marks" className="btn btn-ghost btn-sm">All marks <ArrowRight /></Link>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* ── Side column ── */}
        <div>
          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Pinned to the board</div>
            <hr className="brief-rule" />
            {notices.length === 0 ? (
              <EmptyState title="Nothing pinned up" desc="New announcements from the office will appear here." icon={Megaphone} />
            ) : (
              <div className="pinned-notes">
                {notices.slice(0, 4).map((n) => (
                  <div key={n.id} className="pinned-note">
                    <span className={`stamp ${n.category === 'emergency' ? 'stamp-red' : 'stamp-ink'}`} style={{ fontSize: 10 }}>{n.category}</span>
                    <div className="pinned-note-title">{n.title}</div>
                    <div className="pinned-note-body">{n.content}</div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/app/notices" className="btn btn-ghost btn-sm">All notices <ArrowRight /></Link>
            </div>
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>From the office</div>
            <hr className="brief-rule" />
            <div className="quick-actions">
              <Link to="/app/students" className="quick-action-btn">
                <Users /> <span>Admit a pupil</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/attendance" className="quick-action-btn">
                <ClipboardCheck /> <span>Mark the register</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/marks" className="quick-action-btn">
                <Award /> <span>Enter exam marks</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/timetable" className="quick-action-btn">
                <CalendarDays /> <span>Arrange the week</span> <span className="qa-go">→</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default Dashboard
