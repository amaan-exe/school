import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Search,
  Users,
  Globe,
  Megaphone,
  Wallet,
  CalendarDays,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import Badge from '../../components/Badge'
import { studentsAPI, noticesAPI, paymentsAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { fmtMoney, todayStr } from '../../utils/format'

const initials = (name = '?') =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

const dateLine = () =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const ReceptionistDashboard = () => {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [directoryError, setDirectoryError] = useState('')
  const [students, setStudents] = useState([])
  const [notices, setNotices] = useState([])
  const [todayPayments, setTodayPayments] = useState([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      setError('')
      setDirectoryError('')
      const [stuRes, noticeRes, payRes] = await Promise.all([
        studentsAPI.getAll({ limit: 1000 }).catch(() => {
          if (mounted) {
            setDirectoryError(
              'The student directory is not readable from this desk yet — ask an administrator to grant the students:read permission.'
            )
          }
          return { data: [] }
        }),
        noticesAPI.getAll({ active_only: true, limit: 20 }).catch(() => ({ data: [] })),
        paymentsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
      ])
      if (!mounted) return
      setStudents(Array.isArray(stuRes.data) ? stuRes.data : [])
      setNotices(Array.isArray(noticeRes.data) ? noticeRes.data : [])
      const rows = Array.isArray(payRes.data) ? payRes.data : []
      const today = todayStr()
      setTodayPayments(
        rows.filter((p) => p.status === 'successful' && String(p.paid_on || '').slice(0, 10) === today)
      )
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students.slice(0, 8)
    return students
      .filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.email?.toLowerCase().includes(q) ||
          s.admission_no?.toLowerCase().includes(q) ||
          s.phone?.toLowerCase().includes(q)
      )
      .slice(0, 12)
  }, [students, search])

  const collectedToday = todayPayments.reduce((s, p) => s + (Number(p.amount) || 0), 0)

  if (loading) return <LoadingSpinner message="Loading the reception desk…" />

  return (
    <div className="brief-hero">
      <div className="page-header">
        <div>
          <div className="page-kicker">{dateLine()}</div>
          <h1 className="brief-greeting">
            {greeting()}, <em>{user?.name?.split(' ')[0] || 'Reception'}</em>.
          </h1>
          <p className="brief-sub">
            The front desk — look up a family, point them at admissions, and keep the noticeboard
            honest.
          </p>
        </div>
        <div className="page-actions">
          <a className="btn btn-secondary" href="/website" target="_blank" rel="noreferrer">
            <Globe size={15} /> Apply online
          </a>
          {!directoryError && (
            <Link to="/app/students" className="btn btn-primary">
              Student directory <ArrowRight size={15} />
            </Link>
          )}
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="grid grid-cols-3" style={{ marginTop: 20 }}>
        <div className="stat-card">
          <div className="stat-label">Students on roll</div>
          <div className="stat-value">{students.length}</div>
          <div className="stat-sub">
            {directoryError ? 'Directory unavailable for this desk' : 'Confirmed enrolments'}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Fee collections today</div>
          <div className="stat-value">{fmtMoney(collectedToday, { decimals: 0 })}</div>
          <div className="stat-sub">
            {todayPayments.length} receipt{todayPayments.length === 1 ? '' : 's'} at the desk
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Live notices</div>
          <div className="stat-value">{notices.length}</div>
          <div className="stat-sub">Showing on the noticeboard</div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Student directory</div>
              <div className="card-sub">Name, admission number or phone</div>
            </div>
          </div>
          <div className="card-body">
            {directoryError ? (
              <EmptyState title="Directory unavailable" desc={directoryError} icon={AlertTriangle} />
            ) : (
              <>
                <div className="filter-search" style={{ maxWidth: '100%', marginBottom: 16 }}>
                  <Search />
                  <input
                    placeholder="Search a family at the desk…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                {results.length === 0 ? (
                  <EmptyState
                    title="No match"
                    desc="Nothing in the directory matches that search."
                    icon={Users}
                  />
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Grade</th>
                          <th>Admission no</th>
                          <th>Phone</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((s) => (
                          <tr key={s.id}>
                            <td>
                              <div className="cell-main">
                                <div className="avatar">{initials(s.name)}</div>
                                <div>
                                  <div className="cell-name">{s.name}</div>
                                  <div className="cell-sub">{s.email}</div>
                                </div>
                              </div>
                            </td>
                            <td>
                              <Badge variant="primary">Grade {s.grade}</Badge>
                            </td>
                            <td>{s.admission_no || <span className="muted-cell">—</span>}</td>
                            <td>{s.phone || <span className="muted-cell">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="pagination">
                  <span className="pagination-info">
                    {search.trim()
                      ? `${results.length} match${results.length === 1 ? '' : 'es'}`
                      : `Showing ${results.length} of ${students.length} students`}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div>
          <div className="card">
            <div className="card-header">
              <div>
                <div className="card-title">Admissions</div>
                <div className="card-sub">Where enquiries land</div>
              </div>
            </div>
            <div className="card-body">
              <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
                Applications are taken on the public website. Send enquiries there and the office
                will follow up with the family.
              </p>
              <div className="quick-actions" style={{ marginTop: 14 }}>
                <a className="quick-action-btn" href="/website" target="_blank" rel="noreferrer">
                  <Globe />
                  <span>Open the admissions site</span>
                  <span className="qa-go">↗</span>
                </a>
                <Link to="/app/students" className="quick-action-btn">
                  <Users />
                  <span>Check an admission number</span>
                  <span className="qa-go">›</span>
                </Link>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-header">
              <div>
                <div className="card-title">Today's collections</div>
                <div className="card-sub">Paid at the desk</div>
              </div>
              <Wallet size={18} color="var(--primary)" />
            </div>
            <div className="card-body">
              {todayPayments.length === 0 ? (
                <EmptyState
                  title="No payments yet today"
                  desc="Receipts taken at the counter show up here."
                  icon={Wallet}
                />
              ) : (
                <div className="kv-list">
                  {todayPayments.slice(0, 6).map((p) => (
                    <div className="kv-row" key={p.id}>
                      <span className="k">{p.receipt_no || `#${p.id}`}</span>
                      <span className="v">{fmtMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
              <Link to="/app/payments" className="row-action" style={{ marginTop: 14 }}>
                All payments
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Notices on the board</div>
            <div className="card-sub">What families can read right now</div>
          </div>
          <Link to="/app/notices" className="row-action">
            <Megaphone size={13} /> Manage
          </Link>
        </div>
        <div className="card-body">
          {notices.length === 0 ? (
            <EmptyState
              title="Nothing posted"
              desc="Notices published here appear on the website noticeboard."
              icon={Megaphone}
            />
          ) : (
            <div className="pinned-notes">
              {notices.slice(0, 5).map((n) => (
                <div className={`pinned-note ${n.category === 'emergency' ? 'notice-emergency' : ''}`} key={n.id}>
                  <div className="pinned-note-title">{n.title}</div>
                  <div className="pinned-note-body">{n.content}</div>
                  <div className="pinned-note-meta">
                    {n.category} · for {n.audience || 'all'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div className="card-title">Desk shortcuts</div>
        </div>
        <div className="card-body">
          <div className="quick-actions">
            <Link to="/app/calendar" className="quick-action-btn">
              <CalendarDays /> <span>School calendar</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/notices" className="quick-action-btn">
              <Megaphone /> <span>Post a notice</span>
              <span className="qa-go">›</span>
            </Link>
            <Link to="/app/payments" className="quick-action-btn">
              <Wallet /> <span>Fee collection register</span>
              <span className="qa-go">›</span>
            </Link>
          </div>
          {!directoryError && (
            <div className="form-hint" style={{ marginTop: 14 }}>
              The directory panel above mirrors the same register, so you can stay on this desk.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ReceptionistDashboard