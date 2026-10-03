import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users,
  Contact,
  Wallet,
  CalendarDays,
  Megaphone,
  Award,
  ArrowRight,
  AlertTriangle,
  BookOpen,
  Layers,
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
import { studentsAPI, teachersAPI, employeesAPI, reportsAPI, financeAPI, calendarAPI, noticesAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { fmtMoney, fmtPercent, ratioPercent, todayStr } from '../../utils/format'

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

const PrincipalDashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [students, setStudents] = useState([])
  const [teachers, setTeachers] = useState([])
  const [staff, setStaff] = useState([])
  const [attendance, setAttendance] = useState(null)
  const [grades, setGrades] = useState(null)
  const [finance, setFinance] = useState(null)
  const [events, setEvents] = useState([])
  const [notices, setNotices] = useState([])
  const [financeError, setFinanceError] = useState('')
  // The student / teacher / employee registers are role-gated on the backend,
  // so each card reports honestly instead of showing a misleading zero.
  const [directoryError, setDirectoryError] = useState('')
  const [teacherError, setTeacherError] = useState('')
  const [staffError, setStaffError] = useState('')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      try {
        const end = new Date()
        const start = new Date()
        start.setDate(start.getDate() - 30)
        const fmt = (d) => d.toISOString().slice(0, 10)
        const [sRes, tRes, eRes, attRes, gradeRes, finRes, evRes, noticeRes] = await Promise.all([
          studentsAPI.getAll({ limit: 1000 }).catch(() => {
            if (mounted) setDirectoryError('Student register not readable from this desk.')
            return { data: [] }
          }),
          teachersAPI.getAll({ limit: 500 }).catch(() => {
            if (mounted) setTeacherError('Teaching register not readable from this desk.')
            return { data: [] }
          }),
          employeesAPI.getAll({ limit: 500 }).catch(() => {
            if (mounted) setStaffError('HR register not readable from this desk.')
            return { data: [] }
          }),
          reportsAPI
            .attendanceSummary({ start_date: fmt(start), end_date: fmt(end) })
            .catch(() => null),
          reportsAPI.gradeSummary().catch(() => null),
          financeAPI.summary().catch(() => {
            if (mounted) setFinanceError('Finance summary not available for this desk.')
            return null
          }),
          calendarAPI.getAll({ limit: 20 }).catch(() => ({ data: [] })),
          noticesAPI.getAll({ active_only: true, limit: 5 }).catch(() => ({ data: [] })),
        ])
        if (!mounted) return
        setStudents(Array.isArray(sRes.data) ? sRes.data : [])
        setTeachers(Array.isArray(tRes.data) ? tRes.data : [])
        setStaff(Array.isArray(eRes.data) ? eRes.data.filter((e) => e.is_active !== false) : [])
        setAttendance(attRes?.data || null)
        setGrades(gradeRes?.data || null)
        setFinance(finRes?.data || null)
        setEvents(Array.isArray(evRes.data) ? evRes.data : [])
        setNotices(Array.isArray(noticeRes.data) ? noticeRes.data : [])
      } catch {
        if (mounted) setError('Could not load the principal overview. Please try again.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  // Attendance % from the 30-day report, guarded against an empty school.
  const attendanceStats = useMemo(() => {
    const summary = attendance?.summary || {}
    const present = Number(summary.present) || 0
    const absent = Number(summary.absent) || 0
    const late = Number(summary.late) || 0
    const total = Number(summary.total) || present + absent + late
    return { present, absent, late, total, rate: ratioPercent(present, total) }
  }, [attendance])

  const performanceData = useMemo(() => {
    const bySubject = grades?.by_subject || {}
    return Object.entries(bySubject)
      .map(([subject, exams]) => ({
        subject: subject.length > 12 ? `${subject.slice(0, 12)}…` : subject,
        average: Number(
          (exams || []).reduce((s, e) => s + (Number(e.average_score) || 0), 0) / ((exams || []).length || 1)
        ) || 0,
      }))
      .sort((a, b) => b.average - a.average)
      .slice(0, 8)
  }, [grades])

  const alerts = useMemo(() => {
    const list = []
    if (Number(finance?.overdue) > 0) {
      list.push({
        icon: Wallet,
        tone: 'danger',
        text: `${fmtMoney(finance.overdue)} of fee billing is past its due date.`,
        to: '/app/finance',
      })
    }
    if (attendanceStats.total === 0) {
      list.push({
        icon: AlertTriangle,
        tone: 'warning',
        text: 'No attendance was recorded in the last 30 days.',
        to: '/app/attendance',
      })
    } else if (attendanceStats.rate < 85) {
      list.push({
        icon: AlertTriangle,
        tone: 'warning',
        text: `Attendance is at ${fmtPercent(attendanceStats.present, attendanceStats.total)} over 30 days.`,
        to: '/app/attendance',
      })
    }
    if (students.filter((s) => s.is_active === false).length > 0) {
      list.push({
        icon: Users,
        tone: 'neutral',
        text: `${students.filter((s) => s.is_active === false).length} inactive student records need review.`,
        to: '/app/students',
      })
    }
    return list
  }, [finance, attendanceStats, students])

  const upcoming = useMemo(() => {
    const today = todayStr()
    return events
      .filter((e) => (e.start_datetime || '').slice(0, 10) >= today)
      .slice(0, 5)
  }, [events])

  if (loading) return <LoadingSpinner message="Loading the principal overview…" />

  return (
    <div className="brief-hero">
      <div className="page-header">
        <div>
          <div className="page-kicker">{dateLine()}</div>
          <h1 className="brief-greeting">
            {greeting()}, <em>{user?.name?.split(' ')[0] || 'Principal'}</em>.
          </h1>
          <p className="brief-sub">
            The whole school at a glance — enrolment, attendance, results and the state of the
            books.
          </p>
        </div>
        <div className="page-actions">
          <Link to="/app/timetable" className="btn btn-secondary">
            Timetable
          </Link>
          <Link to="/app/finance" className="btn btn-primary">
            Finance summary <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}
      {financeError && <div className="form-error">{financeError}</div>}

      <div className="grid grid-cols-4" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Students</div>
          <div className="stat-value">{directoryError ? '—' : students.length}</div>
          <div className="stat-sub">
            {directoryError
              ? directoryError
              : `${students.filter((s) => s.is_active === false).length} inactive records`}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Teachers</div>
          <div className="stat-value">{teacherError ? '—' : teachers.length}</div>
          <div className="stat-sub">
            {teacherError ? teacherError : 'On the teaching register'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Staff</div>
          <div className="stat-value">{staffError ? '—' : staff.length}</div>
          <div className="stat-sub">
            {staffError ? staffError : 'Active employees on record'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Attendance</div>
          <div className="stat-value">{fmtPercent(attendanceStats.present, attendanceStats.total)}</div>
          <div className="stat-sub">
            {attendanceStats.total > 0
              ? `${attendanceStats.total} marks in 30 days`
              : 'No attendance recorded'}
          </div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Academic performance</div>
              <div className="card-sub">Average score per subject</div>
            </div>
            <Link to="/app/marks" className="row-action">
              Marks
            </Link>
          </div>
          <div className="card-body">
            {performanceData.length === 0 ? (
              <EmptyState
                title="No marks recorded"
                desc="Grade summaries appear here as soon as marks are entered."
                icon={Award}
              />
            ) : (
              <div className="chart-container">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={performanceData}>
                    <CartesianGrid stroke="#E2E8F0" strokeDasharray="4 4" />
                    <XAxis dataKey="subject" stroke="#94A3B8" fontSize={12} />
                    <YAxis stroke="#94A3B8" fontSize={12} />
                    <Tooltip />
                    <Bar dataKey="average" name="Average score" fill="#4F46E5" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Needs attention</div>
              <div className="card-sub">Signals worth a look today</div>
            </div>
          </div>
          <div className="card-body">
            {alerts.length === 0 ? (
              <EmptyState title="All clear" desc="Nothing is flagging for attention right now." icon={Award} />
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

      <div className="grid grid-cols-3" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <div className="card-title">Admissions</div>
            <Badge variant="pink">Website</Badge>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Applications are taken on the public website. Enrolment totals here count confirmed
              students only.
            </p>
            <div className="kv-list" style={{ marginTop: 12 }}>
              <div className="kv-row">
                <span className="k">On roll</span>
                <span className="v">
                  {directoryError ? '—' : students.filter((s) => s.is_active !== false).length}
                </span>
              </div>
              <div className="kv-row">
                <span className="k">Grade levels</span>
                <span className="v">
                  {directoryError ? '—' : new Set(students.map((s) => s.grade).filter(Boolean)).size}
                </span>
              </div>
            </div>
            <Link to="/website" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
              Open the admissions site
            </Link>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Finance</div>
            <Link to="/app/finance" className="row-action">
              Open
            </Link>
          </div>
          <div className="card-body">
            {!finance ? (
              <EmptyState
                title="Finance unavailable"
                desc={financeError || 'The finance summary could not be loaded.'}
                icon={Wallet}
              />
            ) : (
              <div className="kv-list">
                <div className="kv-row">
                  <span className="k">Billed</span>
                  <span className="v">{fmtMoney(finance.net_billed, { decimals: 0 })}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Collected</span>
                  <span className="v money-pos">{fmtMoney(finance.collected, { decimals: 0 })}</span>
                </div>
                <div className="kv-row">
                  <span className="k">Outstanding</span>
                  <span className="v">{fmtMoney(finance.outstanding, { decimals: 0 })}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Upcoming events</div>
            <Link to="/app/calendar" className="row-action">
              Calendar
            </Link>
          </div>
          <div className="card-body">
            {upcoming.length === 0 ? (
              <EmptyState
                title="Nothing scheduled"
                desc="Add calendar events to see what is coming up."
                icon={CalendarDays}
              />
            ) : (
              <div className="timeline">
                {upcoming.map((e) => (
                  <div className="timeline-item" key={e.id}>
                    <div className="tt-time">
                      {(e.start_datetime || '').slice(0, 10) || 'Undated'}
                    </div>
                    <div className="pinned-note-title" style={{ fontSize: 14, margin: '4px 0 0' }}>
                      {e.title}
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
          <div className="card-title">Latest notices</div>
          <Link to="/app/notices" className="row-action">
            <Megaphone size={13} /> All notices
          </Link>
        </div>
        <div className="card-body">
          {notices.length === 0 ? (
            <EmptyState title="No notices posted" desc="Nothing has been announced yet." icon={Megaphone} />
          ) : (
            <div className="pinned-notes">
              {notices.map((n) => (
                <div className="pinned-note" key={n.id}>
                  <div className="pinned-note-title">{n.title}</div>
                  <div className="pinned-note-body">{n.content}</div>
                  <div className="pinned-note-meta">{n.category}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div className="card-title">Quick links</div>
        </div>
        <div className="card-body">
          <div className="quick-actions">
            <Link to="/app/subjects" className="quick-action-btn">
              <BookOpen /> <span>Subject catalogue</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/class-subjects" className="quick-action-btn">
              <Layers /> <span>Class &amp; subject mapping</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/employees" className="quick-action-btn">
              <Contact /> <span>HR register</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/notices" className="quick-action-btn">
              <Megaphone /> <span>Noticeboard</span>
              <span className="qa-go">›</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

export default PrincipalDashboard