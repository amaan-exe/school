import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Award,
  CalendarDays,
  ClipboardList,
  Megaphone,
  ArrowRight,
} from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import NoticeList from '../../components/widgets/NoticeList'
import TimetableToday from '../../components/widgets/TimetableToday'
import AssignmentDueList from '../../components/widgets/AssignmentDueList'
import { useAuth } from '../../context/AuthContext'
import { meAPI, reportsAPI, timetableAPI, assignmentsAPI, feesAPI } from '../../api'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const dateLine = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const StudentDashboard = () => {
  const { user, permProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [perf, setPerf] = useState(null)
  const [timetable, setTimetable] = useState([])
  const [work, setWork] = useState([])
  const [fees, setFees] = useState([])
  const [notices, setNotices] = useState([])

  const ownStudentId = useMemo(() => {
    const p = permProfile || {}
    return (
      p.profile?.student_id ||
      p.student_id ||
      p.profile?.id ||
      user?.student_id ||
      null
    )
  }, [permProfile, user])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const [tt, aw, f, n] = await Promise.all([
        timetableAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        assignmentsAPI.getAll({ limit: 100 }).catch(() => ({ data: [] })),
        feesAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        meAPI.myNotices().catch(() => ({ data: [] })),
      ])
      let perfData = null
      if (ownStudentId) {
        try {
          const r = await reportsAPI.studentPerformance(ownStudentId)
          perfData = r.data
        } catch {
          perfData = null
        }
      }
      if (!mounted) return
      setTimetable(Array.isArray(tt.data) ? tt.data : [])
      setWork(Array.isArray(aw.data) ? aw.data : [])
      setFees(Array.isArray(f.data) ? f.data : [])
      setNotices(Array.isArray(n.data) ? n.data : [])
      setPerf(perfData)
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [ownStudentId])

  const markRead = async (id) => {
    try {
      await meAPI.markNoticeRead(id)
      setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch {
      /* non-blocking */
    }
  }

  const attendancePct = useMemo(() => {
    const s = perf?.attendance_summary || perf?.attendance
    if (!s || !s.total) return null
    return Math.round((((s.present || 0) + (s.late || 0)) / s.total) * 100)
  }, [perf])

  const recentMarks = useMemo(() => {
    const list = perf?.recent_marks || perf?.marks || []
    return Array.isArray(list) ? list.slice(0, 5) : []
  }, [perf])

  const myFees = useMemo(() => {
    if (!ownStudentId) return fees
    return fees.filter((f) => String(f.student_id || '') === String(ownStudentId))
  }, [fees, ownStudentId])

  const feesDue = useMemo(
    () => myFees.filter((f) => !f.paid).reduce((s, f) => s + (Number(f.amount) || 0), 0),
    [myFees]
  )

  if (loading) return <LoadingSpinner message="Loading your dashboard…" />

  const firstName = user?.name?.split(' ')[0] || 'there'
  const lessonsToday = timetable.filter(
    (t) => String(t.day || '').toLowerCase() === DAY_NAMES[new Date().getDay()]
  ).length
  const todayLabel = new Date().toLocaleDateString('en-US', { weekday: 'long' })

  return (
    <div>
      {/* ── Morning briefing masthead ── */}
      <div className="brief-hero">
        <div className="kicker">My day <span className="rule">·</span> {dateLine()}</div>
        <h1 className="brief-greeting">
          Hello, <em>{firstName}.</em>
        </h1>
        <p className="brief-sub">
          {lessonsToday > 0
            ? `${lessonsToday} lesson${lessonsToday === 1 ? '' : 's'} for ${todayLabel}`
            : `No lessons timetabled for ${todayLabel}`}
          {work.length > 0
            ? `, and ${work.length} assignment${work.length === 1 ? '' : 's'} to hand in`
            : ', with no assignments waiting'}
          {feesDue > 0 ? `, and $${Math.round(feesDue).toLocaleString()} still due at the office.` : '.'}
        </p>
      </div>

      {/* ── Ledger strip ── */}
      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">My attendance</div>
          <div className="v">{attendancePct === null ? '—' : `${attendancePct}%`}</div>
          <div className="s">
            {perf?.attendance_summary ? `${perf.attendance_summary.total} marks in the register` : 'No records yet'}
          </div>
        </div>
        <div className="ledger-cell">
          <div className="k">Recent marks</div>
          <div className="v">{recentMarks.length}</div>
          <div className="s">{recentMarks.length ? 'Latest exam results' : 'No marks yet'}</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Assignments due</div>
          <div className="v">{work.length}</div>
          <div className="s">Work from teachers</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Fees due</div>
          <div className="v">${Math.round(feesDue).toLocaleString()}</div>
          <div className="s">{feesDue > 0 ? 'Payable at office' : 'All clear'}</div>
        </div>
      </div>

      <div className="brief-columns">
        {/* ── Main column ── */}
        <div>
          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Recent marks <span className="rule">·</span> latest exam results</div>
            <hr className="brief-rule" />
            {recentMarks.length === 0 ? (
              <EmptyState
                title="No marks yet"
                desc={ownStudentId ? 'Your exam results appear here once teachers publish them.' : 'We could not link this login to a pupil record yet. Please ask the office to sort it out.'}
                icon={Award}
                action={<Link to="/app/marks" className="btn btn-secondary btn-sm">Open marks <ArrowRight /></Link>}
              />
            ) : (
              <div className="card">
                <table className="fee-ledger">
                  <tbody>
                    {recentMarks.map((m, i) => (
                      <tr key={m.id || i}>
                        <td style={{ fontWeight: 600, paddingLeft: 16 }}>
                          {m.subject || m.exam || 'Exam'}
                        </td>
                        <td className="text-muted">{m.exam || m.term || ''}</td>
                        <td style={{ fontWeight: 700, textAlign: 'right', paddingRight: 16 }}>
                          {m.score ?? '—'}
                          <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>
                            /{m.max_score || 100}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)' }}>
                  <Link to="/app/marks" className="btn btn-ghost btn-sm">All marks <ArrowRight /></Link>
                </div>
              </div>
            )}
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Assignments due <span className="rule">·</span> work to complete</div>
            <hr className="brief-rule" />
            <AssignmentDueList assignments={work} />
          </section>
        </div>

        {/* ── Side column ── */}
        <div>
          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Today at school <span className="rule">·</span> {todayLabel}</div>
            <hr className="brief-rule" />
            <TimetableToday entries={timetable} />
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Pinned to the board</div>
            <hr className="brief-rule" />
            <NoticeList notices={notices} onMarkRead={markRead} compact />
            <div style={{ marginTop: 12 }}>
              <Link to="/app/notices" className="btn btn-ghost btn-sm">All notices <ArrowRight /></Link>
            </div>
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>From the desk</div>
            <hr className="brief-rule" />
            <div className="quick-actions">
              <Link to="/app/timetable" className="quick-action-btn">
                <CalendarDays /> <span>Full timetable</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/assignments" className="quick-action-btn">
                <ClipboardList /> <span>All assignments</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/marks" className="quick-action-btn">
                <Award /> <span>My marks</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/calendar" className="quick-action-btn">
                <Megaphone /> <span>Calendar &amp; events</span> <span className="qa-go">→</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default StudentDashboard
