import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Award,
  ClipboardList,
  ArrowRight,
} from 'lucide-react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import TimetableToday from '../../components/widgets/TimetableToday'
import { useAuth } from '../../context/AuthContext'
import { peopleAPI, timetableAPI, marksAPI, assignmentsAPI } from '../../api'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

const dateLine = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const TeacherDashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [assignments, setAssignments] = useState([])
  const [timetable, setTimetable] = useState([])
  const [marks, setMarks] = useState([])
  const [work, setWork] = useState([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const [ta, tt, m, aw] = await Promise.all([
        peopleAPI.myTeacherAssignments().catch(() => peopleAPI.teacherAssignments().catch(() => ({ data: [] }))),
        timetableAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        marksAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
        assignmentsAPI.getAll({ limit: 100 }).catch(() => ({ data: [] })),
      ])
      if (!mounted) return
      const taList = Array.isArray(ta.data) ? ta.data : ta.data?.items || []
      setAssignments(taList)
      setTimetable(Array.isArray(tt.data) ? tt.data : [])
      setMarks(Array.isArray(m.data) ? m.data : [])
      setWork(Array.isArray(aw.data) ? aw.data : [])
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const classNames = useMemo(() => {
    const names = new Set()
    assignments.forEach((a) => {
      const n = a.class_name || a.class_section_name || a.section || a.grade
      if (n) names.add(n)
    })
    return [...names]
  }, [assignments])

  // "Pending grading": marks rows missing a score
  const pendingGrading = useMemo(
    () => marks.filter((m) => m.score === null || m.score === undefined || m.score === '').length,
    [marks]
  )

  const perfData = useMemo(() => {
    const bySubject = {}
    marks.forEach((m) => {
      if (!m.subject) return
      const pct = m.max_score ? (Number(m.score) / Number(m.max_score)) * 100 : 0
      if (!Number.isFinite(pct)) return
      if (!bySubject[m.subject]) bySubject[m.subject] = { total: 0, count: 0 }
      bySubject[m.subject].total += pct
      bySubject[m.subject].count += 1
    })
    return Object.entries(bySubject)
      .map(([subject, v]) => ({ subject, avg: Math.round(v.total / v.count) }))
      .slice(0, 8)
  }, [marks])

  if (loading) return <LoadingSpinner message="Loading your classes…" />

  const firstName = user?.name?.split(' ')[0] || 'there'
  const todayKey = DAY_NAMES[new Date().getDay()]
  const lessonsToday = timetable.filter(
    (t) => String(t.day || '').toLowerCase() === todayKey
  ).length
  const todayLabel =
    new Date().toLocaleDateString('en-US', { weekday: 'long' })

  return (
    <div>
      {/* ── Staff-room masthead ── */}
      <div className="brief-hero">
        <div className="kicker">Staff room <span className="rule">·</span> {dateLine()}</div>
        <h1 className="brief-greeting">
          Good day, <em>{firstName}.</em>
        </h1>
        <p className="brief-sub">
          {lessonsToday > 0
            ? `${lessonsToday} lesson${lessonsToday === 1 ? '' : 's'} on your board for ${todayLabel}`
            : `No lessons timetabled for ${todayLabel}`}
          {pendingGrading > 0
            ? `, and ${pendingGrading} script${pendingGrading === 1 ? '' : 's'} still waiting for a mark`
            : ', with every mark entered'}.
        </p>
        <div className="page-actions" style={{ marginTop: 20 }}>
          <Link to="/app/attendance" className="btn btn-secondary btn-sm">
            <Users /> Take attendance
          </Link>
          <Link to="/app/marks" className="btn btn-primary btn-sm">
            <Award /> Grade marks
          </Link>
        </div>
      </div>

      {/* ── Ledger strip ── */}
      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">My classes</div>
          <div className="v">{classNames.length || assignments.length}</div>
          <div className="s">{classNames.length ? classNames.slice(0, 2).join(', ') : 'Assigned sections'}</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Lessons · today</div>
          <div className="v">{lessonsToday}</div>
          <div className="s">On your timetable</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Awaiting a mark</div>
          <div className="v">{pendingGrading}</div>
          <div className="s">Scripts ungraded</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Assignments set</div>
          <div className="v">{work.length}</div>
          <div className="s">Active across classes</div>
        </div>
      </div>

      <div className="brief-columns">
        {/* ── Main column ── */}
        <div>
          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>How each subject is faring</div>
            <hr className="brief-rule" />
            {perfData.length === 0 ? (
              <EmptyState
                title="No marks yet"
                desc="Record exam scores and subject averages will be chalked up here."
                icon={Award}
                action={<Link to="/app/marks" className="btn btn-secondary btn-sm">Open marks <ArrowRight /></Link>}
              />
            ) : (
              <>
                <div className="chart-container-sm">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={perfData} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="subject" fontSize={12} tick={{ fill: '#94A3B8' }} />
                      <YAxis fontSize={12} tick={{ fill: '#94A3B8' }} domain={[0, 100]} />
                      <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13 }} />
                      <Bar dataKey="avg" fill="#4F46E5" radius={[6, 6, 0, 0]} name="Avg %" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="attendance-ledger" style={{ marginTop: 14 }}>
                  {perfData.map((s) => (
                    <div key={s.subject} className="attendance-ledger-row">
                      <span className="n" style={{ minWidth: 110 }}>{s.subject}</span>
                      <div className="progress-bar" style={{ flex: 1 }}>
                        <span className="progress-bar-fill" style={{ width: `${s.avg}%`, background: 'var(--primary)', display: 'block' }} />
                      </div>
                      <span className="c">{s.avg}%</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/app/marks" className="btn btn-ghost btn-sm">All marks <ArrowRight /></Link>
            </div>
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Your classes <span className="rule">·</span> sections assigned to you</div>
            <hr className="brief-rule" />
            {assignments.length === 0 ? (
              <EmptyState
                title="No class assignments yet"
                desc="Your teaching assignments appear here once the office links you to class sections."
                icon={Users}
              />
            ) : (
              <div className="card">
                <table className="fee-ledger">
                  <tbody>
                    {assignments.slice(0, 8).map((a, i) => (
                      <tr key={a.id || i}>
                        <td style={{ fontWeight: 600, paddingLeft: 16 }}>
                          {a.class_name || a.class_section_name || a.section || `Assignment ${i + 1}`}
                        </td>
                        <td className="text-muted">
                          {[a.subject, a.role || a.assignment_type].filter(Boolean).join(' · ') || 'Class teacher'}
                        </td>
                        <td style={{ textAlign: 'right', paddingRight: 16 }}>
                          <Link to="/app/students" className="row-action">Roll <ArrowRight size={12} /></Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Link to="/app/students" className="btn btn-ghost btn-sm">Students <ArrowRight /></Link>
            </div>
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
            <div className="kicker" style={{ marginBottom: 4 }}>From the desk</div>
            <hr className="brief-rule" />
            <div className="quick-actions">
              <Link to="/app/attendance" className="quick-action-btn">
                <Users /> <span>Mark the register</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/marks" className="quick-action-btn">
                <Award /> <span>Enter exam marks</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/assignments" className="quick-action-btn">
                <ClipboardList /> <span>Set new assignments</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/students" className="quick-action-btn">
                <Users /> <span>Class roll</span> <span className="qa-go">→</span>
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default TeacherDashboard
