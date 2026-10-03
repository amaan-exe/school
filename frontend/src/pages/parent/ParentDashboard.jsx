import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ClipboardCheck,
  Award,
  Wallet,
  Megaphone,
  BarChart3,
  ArrowRight,
} from 'lucide-react'
import LoadingSpinner from '../../components/LoadingSpinner'
import EmptyState from '../../components/EmptyState'
import NoticeList from '../../components/widgets/NoticeList'
import ChildSwitcher from '../../components/widgets/ChildSwitcher'
import { useAuth } from '../../context/AuthContext'
import { meAPI, reportsAPI, feesAPI } from '../../api'

const dateLine = () =>
  new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

const ParentDashboard = () => {
  const { user, permProfile } = useAuth()
  const [loading, setLoading] = useState(true)
  const [notices, setNotices] = useState([])
  const [fees, setFees] = useState([])
  const [perfByChild, setPerfByChild] = useState({})

  const children = useMemo(() => {
    const p = permProfile || {}
    const list = p.children || p.profile?.children || []
    return Array.isArray(list) ? list : []
  }, [permProfile])

  const [selectedId, setSelectedId] = useState(() => sessionStorage.getItem('bl_selected_child') || null)
  const activeId = selectedId || (children[0] ? (children[0].student_id ?? children[0].id) : null)
  const activeChild = children.find((c) => String(c.student_id ?? c.id) === String(activeId))

  useEffect(() => {
    if (!selectedId && children.length > 0) {
      setSelectedId(children[0].student_id ?? children[0].id)
    }
  }, [children, selectedId])

  // Keep in sync with the TopBar child switcher
  useEffect(() => {
    const onChildChange = (e) => setSelectedId(e.detail)
    window.addEventListener('babyland:child-change', onChildChange)
    return () => window.removeEventListener('babyland:child-change', onChildChange)
  }, [])

  const handleSelectChild = (id) => {
    setSelectedId(id)
    sessionStorage.setItem('bl_selected_child', String(id))
  }

  useEffect(() => {
    let mounted = true
    const load = async () => {
      setLoading(true)
      const [n, f] = await Promise.all([
        meAPI.myNotices().catch(() => ({ data: [] })),
        feesAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
      ])
      const perfMap = {}
      await Promise.all(
        children.map(async (c) => {
          const id = c.student_id ?? c.id
          try {
            const r = await reportsAPI.studentPerformance(id)
            perfMap[id] = r.data
          } catch {
            perfMap[id] = null
          }
        })
      )
      if (!mounted) return
      setNotices(Array.isArray(n.data) ? n.data : [])
      setFees(Array.isArray(f.data) ? f.data : [])
      setPerfByChild(perfMap)
      setLoading(false)
    }
    load()
    return () => {
      mounted = false
    }
  }, [children.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const markRead = async (id) => {
    try {
      await meAPI.markNoticeRead(id)
      setNotices((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)))
    } catch {
      /* non-blocking */
    }
  }

  const perf = activeId ? perfByChild[activeId] : null
  const attendancePct = useMemo(() => {
    const s = perf?.attendance_summary || perf?.attendance
    if (!s || !s.total) return null
    return Math.round((((s.present || 0) + (s.late || 0)) / s.total) * 100)
  }, [perf])

  const subjectData = useMemo(() => {
    const list = perf?.recent_marks || perf?.marks || []
    const bySubject = {}
    list.forEach((m) => {
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
  }, [perf])

  const childFees = useMemo(() => {
    if (!activeId) return []
    return fees.filter((f) => String(f.student_id || '') === String(activeId))
  }, [fees, activeId])

  const feesDue = useMemo(
    () => childFees.filter((f) => !f.paid).reduce((s, f) => s + (Number(f.amount) || 0), 0),
    [childFees]
  )

  if (loading) return <LoadingSpinner message="Loading your family dashboard…" />

  const firstName = user?.name?.split(' ')[0] || 'there'
  const childName = activeChild?.name?.split(' ')[0] || 'child'

  return (
    <div>
      {/* ── Family briefing masthead ── */}
      <div className="brief-hero">
        <div className="kicker">Family file <span className="rule">·</span> {dateLine()}</div>
        <h1 className="brief-greeting">
          Welcome, <em>{firstName}.</em>
        </h1>
        <p className="brief-sub">
          {children.length > 0
            ? `Following ${childName} today`
            : 'Your family file'}
          {children.length > 0
            ? ` — ${attendancePct === null ? 'attendance not yet recorded' : `${attendancePct}% attendance`}, ${subjectData.length} subject${subjectData.length === 1 ? '' : 's'} graded`
            : ''}
          {feesDue > 0 ? `, and $${Math.round(feesDue).toLocaleString()} outstanding at the office.` : '.'}
        </p>
      </div>

      <div style={{ marginBottom: 26 }}>
        <ChildSwitcher children={children} selectedId={activeId} onSelect={handleSelectChild} />
      </div>

      {children.length === 0 ? (
        <div className="card card-padded">
          <EmptyState
            title="No children linked"
            desc="We could not find any children linked to this account. Please contact the school office so they can link your children."
            icon={Megaphone}
          />
        </div>
      ) : (
        <>
          {/* ── Ledger strip ── */}
          <div className="ledger-strip">
            <div className="ledger-cell">
              <div className="k">{childName} · attendance</div>
              <div className="v">{attendancePct === null ? '—' : `${attendancePct}%`}</div>
              <div className="s">Present and late</div>
            </div>
            <div className="ledger-cell">
              <div className="k">Subjects graded</div>
              <div className="v">{subjectData.length}</div>
              <div className="s">Across recorded exams</div>
            </div>
            <div className="ledger-cell">
              <div className="k">Fees due</div>
              <div className="v">${Math.round(feesDue).toLocaleString()}</div>
              <div className="s">{feesDue > 0 ? `For ${childName}` : 'All clear'}</div>
            </div>
            <div className="ledger-cell">
              <div className="k">School notices</div>
              <div className="v">{notices.length}</div>
              <div className="s">Announcements for you</div>
            </div>
          </div>

          <div className="brief-columns">
            {/* ── Main column ── */}
            <div>
              <section className="brief-section">
                <div className="kicker" style={{ marginBottom: 4 }}>{activeChild?.name || 'Your child'} <span className="rule">·</span> average score by subject</div>
                <hr className="brief-rule" />
                {subjectData.length === 0 ? (
                  <EmptyState
                    title="No marks yet"
                    desc="Your child's exam results appear here once teachers publish them."
                    icon={Award}
                    action={<Link to="/app/reports" className="btn btn-secondary btn-sm">Open reports <ArrowRight /></Link>}
                  />
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
                      <Link to="/app/reports" className="btn btn-ghost btn-sm">Full report <ArrowRight /></Link>
                    </div>
                  </div>
                )}
              </section>

              <section className="brief-section">
                <div className="kicker" style={{ marginBottom: 4 }}>School notices <span className="rule">·</span> scoped to your family</div>
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
                <div className="kicker" style={{ marginBottom: 4 }}>Fee book <span className="rule">·</span> for {childName}</div>
                <hr className="brief-rule" />
                {childFees.length === 0 ? (
                  <EmptyState
                    title="No fee records"
                    desc="Fee invoices for this child will appear here."
                    icon={Wallet}
                  />
                ) : feesDue === 0 ? (
                  <p style={{ fontWeight: 700, fontSize: 17, color: 'var(--primary-dark)' }}>
                    Nothing outstanding. The fee book for {childName} is settled.
                  </p>
                ) : (
                  <div className="card">
                    <table className="fee-ledger">
                      <tbody>
                        {childFees.slice(0, 6).map((f) => (
                          <tr key={f.id}>
                            <td style={{ fontWeight: 600, paddingLeft: 16 }}>
                              {f.title || f.fee_type || 'Fee'}
                              {f.due_date ? (
                                <span className="text-muted" style={{ fontWeight: 400, fontSize: 12 }}>
                                  {' '}· due {f.due_date}
                                </span>
                              ) : null}
                            </td>
                            <td style={{ fontWeight: 700 }}>${Number(f.amount || 0).toLocaleString()}</td>
                            <td style={{ textAlign: 'right', paddingRight: 16 }}>
                              <span className={`stamp ${f.paid ? 'stamp-green' : 'stamp-red'}`} style={{ fontSize: 10 }}>
                                {f.paid ? 'Paid' : 'Due'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-light)' }}>
                      <span className="text-muted" style={{ fontSize: 12.5 }}>
                        ${Math.round(feesDue).toLocaleString()} outstanding ·{' '}
                      </span>
                      <Link to="/app/fees" className="btn btn-ghost btn-sm">Fee book <ArrowRight /></Link>
                    </div>
                  </div>
                )}
              </section>

              <section className="brief-section">
                <div className="kicker" style={{ marginBottom: 4 }}>Where to look next</div>
                <hr className="brief-rule" />
                <div className="quick-actions">
                  <Link to="/app/reports" className="quick-action-btn">
                    <BarChart3 /> <span>Full report</span> <span className="qa-go">→</span>
                  </Link>
                  <Link to="/app/fees" className="quick-action-btn">
                    <Wallet /> <span>Fee book</span> <span className="qa-go">→</span>
                  </Link>
                  <Link to="/app/timetable" className="quick-action-btn">
                    <ClipboardCheck /> <span>Class timetable</span> <span className="qa-go">→</span>
                  </Link>
                  <Link to="/app/notices" className="quick-action-btn">
                    <Megaphone /> <span>Notice board</span> <span className="qa-go">→</span>
                  </Link>
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default ParentDashboard
