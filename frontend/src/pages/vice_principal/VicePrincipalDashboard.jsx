import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardCheck,
  Award,
  CalendarDays,
  Megaphone,
  ArrowRight,
  Users,
  AlertTriangle,
  Table2,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import Badge from '../../components/Badge'
import { attendanceAPI, marksAPI, timetableAPI, noticesAPI, structureAPI, classSubjectsAPI, reportsAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { fmtPercent, ratioPercent, todayStr } from '../../utils/format'

const DAY_NAMES = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const todayName = () => DAY_NAMES[new Date().getDay()]

const dateLine = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const VicePrincipalDashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attendanceRows, setAttendanceRows] = useState([])
  const [marks, setMarks] = useState([])
  const [timetable, setTimetable] = useState([])
  const [notices, setNotices] = useState([])
  const [classes, setClasses] = useState([])
  const [classSubjects, setClassSubjects] = useState([])
  const [grades, setGrades] = useState(null)

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const [attRes, marksRes, ttRes, noticeRes, clsRes, csRes, gradeRes] = await Promise.all([
          attendanceAPI.getAll({ attendance_date: todayStr(), limit: 1000 }).catch(() => ({ data: [] })),
          marksAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
          timetableAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
          noticesAPI.getAll({ active_only: true, limit: 6 }).catch(() => ({ data: [] })),
          structureAPI.classes({ limit: 500 }).catch(() => ({ data: [] })),
          classSubjectsAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
          reportsAPI.gradeSummary().catch(() => null),
        ])
        if (!mounted) return
        setAttendanceRows(Array.isArray(attRes.data) ? attRes.data : [])
        setMarks(Array.isArray(marksRes.data) ? marksRes.data : [])
        setTimetable(Array.isArray(ttRes.data) ? ttRes.data : [])
        setNotices(Array.isArray(noticeRes.data) ? noticeRes.data : [])
        setClasses(Array.isArray(clsRes.data) ? clsRes.data : [])
        setClassSubjects(Array.isArray(csRes.data) ? csRes.data : [])
        setGrades(gradeRes?.data || null)
      } catch {
        if (mounted) setError('Could not load the academics desk. Please try again.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const todayAttendance = useMemo(() => {
    const present = attendanceRows.filter((a) => a.status === 'present' || a.status === 'late').length
    const absent = attendanceRows.filter((a) => a.status === 'absent').length
    const total = present + absent
    return { present, absent, total, rate: ratioPercent(present, total) }
  }, [attendanceRows])

  // Subjects that have marks on file vs. class sections with no marks at all —
  // the honest "pending marks entry" signal available from the API.
  const marksPending = useMemo(() => {
    const markedSubjects = new Set(marks.map((m) => m.subject).filter(Boolean))
    const mappedSubjects = classSubjects.length
      ? Array.from(new Set(classSubjects.map((cs) => cs.subject_id).filter(Boolean)))
      : []
    const pending = Math.max(mappedSubjects.length - markedSubjects.size, 0)
    return {
      pending,
      mappedSubjects: mappedSubjects.length,
      markedSubjects: markedSubjects.size,
    }
  }, [marks, classSubjects])

  // Subject-wise averages come from the grade-summary report — the only
  // class-level aggregate a vice principal can read without the student roster.
  const subjectPerformance = useMemo(() => {
    const bySubject = grades?.by_subject || {}
    return Object.entries(bySubject)
      .map(([subject, exams]) => {
        const rows = exams || []
        if (!rows.length) return null
        const avg =
          rows.reduce((s, e) => s + (Number(e.average_score) || 0), 0) / (rows.length || 1)
        return {
          subject: subject.length > 12 ? `${subject.slice(0, 12)}…` : subject,
          average: Number(avg.toFixed(1)) || 0,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.average - a.average)
      .slice(0, 8)
  }, [grades])

  // Timetable coverage for today: how many periods each class has filled.
  const todayTimetable = useMemo(() => timetable.filter((t) => t.day_of_week?.toLowerCase() === todayName()), [timetable])

  const coverage = useMemo(() => {
    const byClass = new Map()
    todayTimetable.forEach((t) => {
      const key = t.class_name
      const row = byClass.get(key) || { periods: 0, subjects: new Set() }
      row.periods += 1
      row.subjects.add(t.subject)
      byClass.set(key, row)
    })
    return [...byClass.entries()].map(([name, row]) => ({
      name,
      periods: row.periods,
      subjects: row.subjects.size,
    }))
  }, [todayTimetable])

  const alerts = useMemo(() => {
    const list = []
    if (todayAttendance.total === 0) {
      list.push({
        icon: ClipboardCheck,
        text: "Today's attendance register has not been filled in.",
        to: '/app/attendance',
      })
    } else if (todayAttendance.rate < 85) {
      list.push({
        icon: AlertTriangle,
        text: `Only ${fmtPercent(todayAttendance.present, todayAttendance.total)} of the register is marked present today.`,
        to: '/app/attendance',
      })
    }
    if (marksPending.pending > 0) {
      list.push({
        icon: Award,
        text: `${marksPending.pending} mapped subject${
          marksPending.pending === 1 ? '' : 's'
        } still waiting on marks entry.`,
        to: '/app/marks',
      })
    }
    if (coverage.length === 0) {
      list.push({
        icon: Table2,
        text: 'No timetable periods are scheduled for today.',
        to: '/app/timetable',
      })
    }
    return list
  }, [todayAttendance, marksPending, coverage])

  if (loading) return <LoadingSpinner message="Loading the academics desk…" />

  return (
    <div className="brief-hero">
      <div className="page-header">
        <div>
          <div className="page-kicker">{dateLine()}</div>
          <h1 className="brief-greeting">
            {greeting()}, <em>{user?.name?.split(' ')[0] || 'Vice Principal'}</em>.
          </h1>
          <p className="brief-sub">
            Academic operations — who is in today, what is still ungraded and how the timetable is
            covered.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/app/class-subjects" className="btn btn-secondary">
            Class mapping
          </Link>
          <Link to="/app/subjects" className="btn btn-primary">
            Subject catalogue <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="grid grid-cols-4" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Present today</div>
          <div className="stat-value">{todayAttendance.present}</div>
          <div className="stat-sub">of {todayAttendance.total} marked</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Attendance rate</div>
          <div className="stat-value">{fmtPercent(todayAttendance.present, todayAttendance.total)}</div>
          <div className="stat-sub">{todayAttendance.absent} absent today</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Marks pending</div>
          <div className="stat-value">{marksPending.pending}</div>
          <div className="stat-sub">
            {marksPending.markedSubjects} of {marksPending.mappedSubjects} mapped subjects graded
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Periods today</div>
          <div className="stat-value">{todayTimetable.length}</div>
          <div className="stat-sub">Across {coverage.length} classes</div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Subject-wise performance</div>
              <div className="card-sub">Average mark recorded per subject</div>
            </div>
          </div>
          <div className="card-body">
            {subjectPerformance.length === 0 ? (
              <EmptyState
                title="Not enough marks yet"
                desc="Enter marks to see how each subject is performing."
                icon={Award}
              />
            ) : (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={subjectPerformance}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                    <XAxis dataKey="subject" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="average" name="Average" fill="#7C3AED" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Today</div>
              <div className="card-sub">What needs chasing</div>
            </div>
          </div>
          <div className="card-body">
            {alerts.length === 0 ? (
              <EmptyState title="All clear" desc="Registers, marks and timetables are on track." icon={Award} />
            ) : (
              <div className="quick-actions">
                {alerts.map((a) => {
                  const Icon = a.icon
                  return (
                    <Link key={a.text} to={a.to} className="quick-action-btn">
                      <Icon />
                      <span>{a.text}</span>
                      <span className="qa-go">›</span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Timetable coverage</div>
              <div className="card-sub">{todayName()} · periods per class</div>
            </div>
            <Link to="/app/timetable" className="row-action">
              <CalendarDays size={13} /> Timetable
            </Link>
          </div>
          <div className="card-body">
            {coverage.length === 0 ? (
              <EmptyState
                title="Nothing scheduled today"
                desc="No periods are on the timetable for this weekday."
                icon={CalendarDays}
              />
            ) : (
              <div className="attendance-ledger">
                {coverage.map((row) => {
                  const max = coverage.reduce((m, r) => Math.max(m, r.periods), 0) || 1
                  const pct = ratioPercent(row.periods, max)
                  return (
                    <div key={row.name}>
                      <div className="attendance-ledger-row">
                        <span className="n">{row.name}</span>
                        <span className="cell-sub">
                          {row.subjects} subject{row.subjects === 1 ? '' : 's'}
                        </span>
                        <span className="c">{row.periods}</span>
                      </div>
                      <div className="attendance-ledger-bar">
                        <span style={{ width: `${pct}%`, background: 'linear-gradient(90deg, var(--primary), var(--violet))' }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Recent notices</div>
              <div className="card-sub">What families and staff see</div>
            </div>
            <Link to="/app/notices" className="row-action">
              <Megaphone size={13} /> All
            </Link>
          </div>
          <div className="card-body">
            {notices.length === 0 ? (
              <EmptyState title="No notices" desc="Nothing has been announced yet." icon={Megaphone} />
            ) : (
              <div className="pinned-notes">
                {notices.map((n) => (
                  <div className="pinned-note" key={n.id}>
                    <div className="pinned-note-title">{n.title}</div>
                    <div className="pinned-note-body">{n.content}</div>
                    <div className="pinned-note-meta">
                      <Badge variant="neutral">{n.category}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div className="card-title">Shortcuts</div>
        </div>
        <div className="card-body">
          <div className="quick-actions">
            <Link to="/app/subjects" className="quick-action-btn">
              <Award /> <span>Subject catalogue</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/class-subjects" className="quick-action-btn">
              <Users /> <span>Class &amp; subject mapping</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/grades" className="quick-action-btn">
              <Table2 /> <span>Grade ladder</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/timetable" className="quick-action-btn">
              <CalendarDays /> <span>Timetable</span>
              <span className="qa-go">›</span>
            </Link>
          </div>
          <div className="form-hint" style={{ marginTop: 14 }}>
            Registers and marks on this page are read straight from the attendance and marks APIs;
            the register and marks-entry screens stay with the desks that own them.
          </div>
        </div>
      </div>
    </div>
  )
}

export default VicePrincipalDashboard