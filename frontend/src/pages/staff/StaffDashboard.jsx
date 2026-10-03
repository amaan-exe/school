import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Wallet, Megaphone, ClipboardList, ArrowRight, Lock, UserPlus, CalendarRange } from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import NoticeList from '../../components/widgets/NoticeList'
import { useAuth } from '../../context/AuthContext'
import { studentsAPI, feesAPI, meAPI } from '../../api'

const dateLine = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const StaffDashboard = () => {
  const { user, hasPermission } = useAuth()
  const [loading, setLoading] = useState(true)
  const [students, setStudents] = useState([])
  const [fees, setFees] = useState([])
  const [notices, setNotices] = useState([])

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const [s, f, n] = await Promise.all([
        studentsAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
        feesAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
        meAPI.myNotices().catch(() => ({ data: [] })),
      ])
      if (!mounted) return
      setStudents(Array.isArray(s.data) ? s.data : [])
      setFees(Array.isArray(f.data) ? f.data : [])
      setNotices(Array.isArray(n.data) ? n.data : [])
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const markRead = async (id) => {
    try {
      await meAPI.markNoticeRead(id)
      setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch {
      /* non-blocking */
    }
  }

  if (loading) return <LoadingSpinner message="Opening the front-office register…" />

  const pendingFees = fees.filter((f) => !f.paid)
  const pendingTotal = pendingFees.reduce((s, f) => s + (Number(f.amount) || 0), 0)
  const collectedTotal = fees
    .filter((f) => f.paid)
    .reduce((s, f) => s + (Number(f.amount) || 0), 0)
  const unread = notices.filter((n) => n.is_read === false).length
  const tasks = pendingFees.length + unread

  const canAdmissions = hasPermission('students', 'create')
  const canFees = hasPermission('fees', 'view')
  const canNotices = hasPermission('notices', 'create')

  const firstName = user?.name?.split(' ')[0] || 'there'

  return (
    <div>
      {/* ── Front-office masthead ── */}
      <div className="brief-hero">
        <div className="kicker">Front office <span className="rule">·</span> {dateLine()}</div>
        <h1 className="brief-greeting">
          Good day, <em>{firstName}.</em>
        </h1>
        <p className="brief-sub">
          {students.length} pupils on roll,{' '}
          {pendingFees.length > 0
            ? `${pendingFees.length} fee ${pendingFees.length === 1 ? 'entry' : 'entries'} still to collect`
            : 'the fee book is square'}
          {unread > 0 ? `, and ${unread} notice${unread === 1 ? '' : 's'} you have not read` : ', and you are caught up on notices'}.
        </p>
      </div>

      {/* ── Ledger strip ── */}
      <div className="ledger-strip">
        <div className="ledger-cell">
          <div className="k">On roll</div>
          <div className="v">{students.length}</div>
          <div className="s">Enrolled pupils</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Pending fees</div>
          <div className="v">${Math.round(pendingTotal).toLocaleString()}</div>
          <div className="s">{pendingFees.length} unpaid records</div>
        </div>
        <div className="ledger-cell">
          <div className="k">Notices for you</div>
          <div className="v">{notices.length}</div>
          <div className="s">{unread > 0 ? `${unread} still unread` : 'All caught up'}</div>
        </div>
        <div className="ledger-cell">
          <div className="k">To clear today</div>
          <div className="v">{tasks}</div>
          <div className="s">Follow-ups on your desk</div>
        </div>
      </div>

      <div className="brief-columns">
        {/* ── Main column ── */}
        <div>
          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Fee book <span className="rule">·</span> awaiting payment</div>
            <hr className="brief-rule" />
            {fees.length === 0 ? (
              <EmptyState
                title="No fee records yet"
                desc="Fee entries appear here as soon as the office starts billing."
                icon={Wallet}
                action={canFees ? <Link to="/app/fees" className="btn btn-primary btn-sm">Open the fee book <ArrowRight /></Link> : null}
              />
            ) : pendingFees.length === 0 ? (
              <p style={{ fontWeight: 700, fontSize: 18, color: 'var(--primary-dark)' }}>
                Every invoice is settled. ${Math.round(collectedTotal).toLocaleString()} collected, nothing outstanding.{' '}
                <Link to="/app/fees" className="btn btn-ghost btn-sm">See all</Link>
              </p>
            ) : (
              <div className="card">
                <table className="fee-ledger">
                  <tbody>
                    {pendingFees.slice(0, 6).map((f) => {
                      const overdue = f.due_date && f.due_date < new Date().toISOString().slice(0, 10)
                      return (
                        <tr key={f.id}>
                          <td style={{ fontWeight: 600, paddingLeft: 16 }}>
                            {f.student_name || (f.student_id ? `Pupil #${f.student_id}` : 'Fee entry')}
                          </td>
                          <td className="text-muted">{f.due_date ? `due ${f.due_date}` : 'no due date'}</td>
                          <td style={{ fontWeight: 700 }}>${Number(f.amount || 0).toLocaleString()}</td>
                          <td style={{ textAlign: 'right', paddingRight: 16 }}>
                            <span className={`stamp ${overdue ? 'stamp-red' : 'stamp-amber'}`} style={{ fontSize: 10 }}>
                              {overdue ? 'Overdue' : 'Due'}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)' }}>
                  <span className="text-muted" style={{ fontSize: 12.5 }}>
                    ${Math.round(collectedTotal).toLocaleString()} collected to date ·{' '}
                  </span>
                  {canFees ? (
                    <Link to="/app/fees" className="btn btn-ghost btn-sm">Fee book <ArrowRight /></Link>
                  ) : (
                    <span className="text-muted" style={{ fontSize: 12.5, fontWeight: 500 }}>
                      you do not have fee access
                    </span>
                  )}
                </div>
              </div>
            )}
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Notices for your desk</div>
            <hr className="brief-rule" />
            <NoticeList notices={notices} onMarkRead={markRead} compact />
            <div style={{ marginTop: 12 }}>
              <Link to="/app/notices" className="btn btn-ghost btn-sm">All notices <ArrowRight /></Link>
            </div>
          </section>
        </div>

        {/* ── Side column ── */}
        <div>
          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>At the counter</div>
            <hr className="brief-rule" />
            <div className="quick-actions">
              {canAdmissions ? (
                <Link to="/app/students" className="quick-action-btn">
                  <UserPlus /> <span>New admission</span> <span className="qa-go">→</span>
                </Link>
              ) : (
                <div className="quick-action-btn" style={{ opacity: 0.45, cursor: 'not-allowed' }}>
                  <Lock /> <span>Admissions — no permission</span>
                </div>
              )}
              {canFees ? (
                <Link to="/app/fees" className="quick-action-btn">
                  <Wallet /> <span>Collect a fee</span> <span className="qa-go">→</span>
                </Link>
              ) : (
                <div className="quick-action-btn" style={{ opacity: 0.45, cursor: 'not-allowed' }}>
                  <Lock /> <span>Fees — no permission</span>
                </div>
              )}
              <Link to="/app/notices" className="quick-action-btn">
                <Megaphone /> <span>{canNotices ? 'Post a notice' : 'Read notices'}</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/calendar" className="quick-action-btn">
                <CalendarRange /> <span>Calendar &amp; events</span> <span className="qa-go">→</span>
              </Link>
              <Link to="/app/students" className="quick-action-btn">
                <ClipboardList /> <span>Roll of pupils</span> <span className="qa-go">→</span>
              </Link>
            </div>
          </section>

          <section className="brief-section">
            <div className="kicker" style={{ marginBottom: 4 }}>Desk note</div>
            <hr className="brief-rule" />
            <div className="card card-padded">
              <p style={{ fontWeight: 600, fontSize: 17, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
                The register is the school&apos;s memory. Mark what you see, not what you assume —
                the office signs off at the end of every week.
              </p>
              <p className="text-muted" style={{ fontSize: 12.5, marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-light)' }}>
                Front office · BabyLand School
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

export default StaffDashboard