import { useEffect, useState } from 'react'
import { BarChart3, Download, Search } from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import LoadingSpinner from '../components/LoadingSpinner'
import EmptyState from '../components/EmptyState'

import { reportsAPI } from '../api'

const fmtDate = (d) => d.toISOString().slice(0, 10)
const defaultStart = () => {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return fmtDate(d)
}

const toCSV = (rows) => {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n')
}
const downloadCSV = (filename, rows) => {
  const blob = new Blob([toCSV(rows)], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

const Reports = () => {
  const [tab, setTab] = useState('attendance')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Attendance filters
  const [attStart, setAttStart] = useState(defaultStart())
  const [attEnd, setAttEnd] = useState(fmtDate(new Date()))
  const [attGrade, setAttGrade] = useState('')
  const [attData, setAttData] = useState(null)

  // Grade filters
  const [gSubject, setGSubject] = useState('')
  const [gStudent, setGStudent] = useState('')
  const [gExam, setGExam] = useState('')
  const [gradeData, setGradeData] = useState(null)

  // Fee filters
  const [fGrade, setFGrade] = useState('')
  const [feeData, setFeeData] = useState(null)

  // Student lookup
  const [lookupId, setLookupId] = useState('')
  const [perfData, setPerfData] = useState(null)
  const [perfLoading, setPerfLoading] = useState(false)
  const [perfError, setPerfError] = useState('')

  const loadAttendance = async () => {
    if (!attStart || !attEnd) {
      setError('Start and end dates are required for the attendance report.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const params = { start_date: attStart, end_date: attEnd }
      if (attGrade.trim()) params.grade = attGrade.trim()
      const res = await reportsAPI.attendanceSummary(params)
      setAttData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load the attendance report.')
    } finally {
      setLoading(false)
    }
  }

  const loadGrades = async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (gSubject.trim()) params.subject = gSubject.trim()
      if (gStudent.trim()) params.student_id = Number(gStudent.trim())
      if (gExam.trim()) params.exam_name = gExam.trim()
      const res = await reportsAPI.gradeSummary(params)
      setGradeData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load the grade report.')
    } finally {
      setLoading(false)
    }
  }

  const loadFees = async () => {
    setLoading(true)
    setError('')
    try {
      const params = {}
      if (fGrade.trim()) params.grade = fGrade.trim()
      const res = await reportsAPI.feeSummary(params)
      setFeeData(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not load the fee report.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (tab === 'attendance' && !attData) loadAttendance()
    if (tab === 'grades' && !gradeData) loadGrades()
    if (tab === 'fees' && !feeData) loadFees()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const lookupStudent = async (e) => {
    e?.preventDefault()
    if (!lookupId.trim()) return
    setPerfLoading(true)
    setPerfError('')
    try {
      const res = await reportsAPI.studentPerformance(lookupId.trim())
      setPerfData(res.data)
    } catch {
      setPerfError('No performance record found for that student ID.')
      setPerfData(null)
    } finally {
      setPerfLoading(false)
    }
  }

  const attGradeRows = attData?.by_grade
    ? Object.entries(attData.by_grade).map(([grade, v]) => ({
        grade, present: v.present, absent: v.absent, late: v.late, total: v.total,
      }))
    : []
  const attChart = [
    { name: 'Present', value: attData?.summary?.present || 0, fill: '#10B981' },
    { name: 'Absent', value: attData?.summary?.absent || 0, fill: '#EF4444' },
    { name: 'Late', value: attData?.summary?.late || 0, fill: '#F59E0B' },
  ]
  const gradeRows = gradeData?.by_subject
    ? Object.entries(gradeData.by_subject).flatMap(([subject, exams]) =>
        exams.map((x) => ({ subject, ...x }))
      )
    : []
  const feeGradeRows = feeData?.by_grade
    ? Object.entries(feeData.by_grade).map(([grade, v]) => ({ grade, ...v }))
    : []

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Reports <span className="accent-word">& Analytics</span>
          </div>
          <div className="page-subtitle">Understand attendance, learning and fees at a glance.</div>
        </div>
      </div>

      <div className="tabs">
        {[
          { id: 'attendance', label: 'Attendance' },
          { id: 'grades', label: 'Grades' },
          { id: 'fees', label: 'Fees' },
          { id: 'student', label: 'Student lookup' },
        ].map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => { setTab(t.id); setError('') }}>
            {t.label}
          </button>
        ))}
      </div>

      {error && <div className="form-error">{error}</div>}
      {loading && <LoadingSpinner message=" crunching the numbers…" />}

      {tab === 'attendance' && (
        <div>
          <div className="card card-padded" style={{ marginBottom: 20 }}>
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Start date</label>
                <input type="date" className="filter-select" value={attStart} onChange={(e) => setAttStart(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">End date</label>
                <input type="date" className="filter-select" value={attEnd} onChange={(e) => setAttEnd(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Grade (optional)</label>
                <input className="form-input" style={{ width: 140 }} placeholder="e.g. 2" value={attGrade} onChange={(e) => setAttGrade(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, alignSelf: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={loadAttendance} disabled={loading}>
                  <Search /> Run report
                </button>
              </div>
            </div>
          </div>

          {!attData ? (
            <div className="card"><EmptyState title="No report yet" desc="Pick a date range and run the report." icon={BarChart3} /></div>
          ) : (
            <>
              <div className="ledger-strip">
                <div className="ledger-cell">
                  <div className="k">Total records</div>
                  <div className="v">{attData.summary.total}</div>
                  <div className="s">{attData.period.start_date} → {attData.period.end_date}</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Present</div>
                  <div className="v">{attData.summary.present}</div>
                  <div className="s">{attData.summary.present_percentage}% in class</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Absent</div>
                  <div className="v">{attData.summary.absent}</div>
                  <div className="s">{attData.summary.absent_percentage}% missed</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Late</div>
                  <div className="v">{attData.summary.late}</div>
                  <div className="s">{attData.summary.late_percentage}% arrived late</div>
                </div>
              </div>
              <div className="grid grid-cols-2" style={{ marginBottom: 20 }}>
                <div className="card">
                  <div className="card-header"><div className="card-title">Attendance breakdown</div></div>
                  <div className="card-body">
                    <div className="chart-container-sm">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={attChart} margin={{ top: 5, right: 20, left: -10, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="name" fontSize={12} tick={{ fill: '#94A3B8' }} />
                          <YAxis fontSize={12} tick={{ fill: '#94A3B8' }} />
                          <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, fontSize: 13 }} />
                          <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                            {attChart.map((c) => (
                              <Cell key={c.name} fill={c.fill} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
                <div className="card">
                  <div className="card-header">
                    <div className="card-title">By grade</div>
                    {attGradeRows.length > 0 && (
                      <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV('attendance-by-grade.csv', attGradeRows)}>
                        <Download /> CSV
                      </button>
                    )}
                  </div>
                  {attGradeRows.length === 0 ? (
                    <EmptyState title="No grade breakdown" desc="No attendance records in this period." icon={BarChart3} />
                  ) : (
                    <div className="table-container">
                      <table className="table">
                        <thead><tr><th>Grade</th><th>Present</th><th>Absent</th><th>Late</th><th>Total</th></tr></thead>
                        <tbody>
                          {attGradeRows.map((r) => (
                            <tr key={r.grade}><td style={{ fontWeight: 700 }}>{r.grade}</td><td>{r.present}</td><td>{r.absent}</td><td>{r.late}</td><td>{r.total}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'grades' && (
        <div>
          <div className="card card-padded" style={{ marginBottom: 20 }}>
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Subject</label>
                <input className="form-input" style={{ width: 150 }} placeholder="e.g. Maths" value={gSubject} onChange={(e) => setGSubject(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Student ID</label>
                <input className="form-input" style={{ width: 130 }} placeholder="e.g. 3" value={gStudent} onChange={(e) => setGStudent(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Exam</label>
                <input className="form-input" style={{ width: 150 }} placeholder="e.g. Mid-term" value={gExam} onChange={(e) => setGExam(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, alignSelf: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={loadGrades} disabled={loading}>
                  <Search /> Run report
                </button>
              </div>
            </div>
          </div>

          {!gradeData ? (
            <div className="card"><EmptyState title="No report yet" desc="Run the grade report to see subject performance." icon={BarChart3} /></div>
          ) : (
            <>
              <div className="ledger-strip">
                <div className="ledger-cell">
                  <div className="k">Overall average</div>
                  <div className="v">{gradeData.overall.average_score}</div>
                  <div className="s">Across the filters above</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Highest score</div>
                  <div className="v">{gradeData.overall.highest_score}</div>
                  <div className="s">Top mark recorded</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Lowest score</div>
                  <div className="v">{gradeData.overall.lowest_score}</div>
                  <div className="s">Needs support</div>
                </div>
              </div>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Performance by subject & exam</div>
                  {gradeRows.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV('grade-summary.csv', gradeRows)}>
                      <Download /> CSV
                    </button>
                  )}
                </div>
                {gradeRows.length === 0 ? (
                  <EmptyState title="No marks found" desc="No marks match these filters." icon={BarChart3} />
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>Subject</th><th>Exam</th><th>Average</th><th>Highest</th><th>Lowest</th><th>Students</th></tr></thead>
                      <tbody>
                        {gradeRows.map((r, i) => (
                          <tr key={i}><td style={{ fontWeight: 700 }}>{r.subject}</td><td>{r.exam_name}</td><td>{r.average_score}</td><td>{r.highest_score}</td><td>{r.lowest_score}</td><td>{r.total_students}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'fees' && (
        <div>
          <div className="card card-padded" style={{ marginBottom: 20 }}>
            <div className="filter-bar" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Grade (optional)</label>
                <input className="form-input" style={{ width: 140 }} placeholder="e.g. 2" value={fGrade} onChange={(e) => setFGrade(e.target.value)} />
              </div>
              <div className="form-group" style={{ marginBottom: 0, alignSelf: 'flex-end' }}>
                <button className="btn btn-primary btn-sm" onClick={loadFees} disabled={loading}>
                  <Search /> Run report
                </button>
              </div>
            </div>
          </div>

          {!feeData ? (
            <div className="card"><EmptyState title="No report yet" desc="Run the fee report to see collection stats." icon={BarChart3} /></div>
          ) : (
            <>
              <div className="ledger-strip">
                <div className="ledger-cell">
                  <div className="k">Total billed</div>
                  <div className="v">${Number(feeData.overall.total_amount).toLocaleString()}</div>
                  <div className="s">{feeData.overall.total_fees} invoices</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Collected</div>
                  <div className="v">${Number(feeData.overall.collected_amount).toLocaleString()}</div>
                  <div className="s">{feeData.overall.paid_count} paid</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Pending</div>
                  <div className="v">${Number(feeData.overall.pending_amount).toLocaleString()}</div>
                  <div className="s">{feeData.overall.pending_count} unpaid</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Collection rate</div>
                  <div className="v">{feeData.overall.total_amount ? `${Math.round((feeData.overall.collected_amount / feeData.overall.total_amount) * 100)}%` : '—'}</div>
                  <div className="s">Collected share</div>
                </div>
              </div>
              <div className="card" style={{ marginBottom: 20 }}>
                <div className="card-header">
                  <div className="card-title">Collection by grade</div>
                  {feeGradeRows.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV('fees-by-grade.csv', feeGradeRows)}>
                      <Download /> CSV
                    </button>
                  )}
                </div>
                {feeGradeRows.length === 0 ? (
                  <EmptyState title="No fee data" desc="No fees recorded yet." icon={BarChart3} />
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>Grade</th><th>Invoices</th><th>Billed</th><th>Collected</th><th>Pending</th></tr></thead>
                      <tbody>
                        {feeGradeRows.map((r) => (
                          <tr key={r.grade}><td style={{ fontWeight: 700 }}>{r.grade}</td><td>{r.total_fees}</td><td>${r.total_amount}</td><td>${r.collected_amount}</td><td>${r.pending_amount}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="card">
                <div className="card-header">
                  <div className="card-title">Pending fees ({feeData.pending_fees?.length || 0})</div>
                  {(feeData.pending_fees?.length || 0) > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => downloadCSV('pending-fees.csv', feeData.pending_fees)}>
                      <Download /> CSV
                    </button>
                  )}
                </div>
                {(!feeData.pending_fees || feeData.pending_fees.length === 0) ? (
                  <EmptyState title="All clear" desc="No pending fees — wonderful!" icon={BarChart3} />
                ) : (
                  <div className="table-container">
                    <table className="table">
                      <thead><tr><th>Student</th><th>Grade</th><th>Amount</th><th>Due date</th></tr></thead>
                      <tbody>
                        {feeData.pending_fees.map((p) => (
                          <tr key={p.fee_id}><td style={{ fontWeight: 600 }}>{p.student_name}</td><td>{p.grade}</td><td>${p.amount}</td><td>{p.due_date}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {tab === 'student' && (
        <div>
          <div className="card card-padded" style={{ marginBottom: 20 }}>
            <form onSubmit={lookupStudent} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ marginBottom: 0, minWidth: 220 }}>
                <label className="form-label">Student ID</label>
                <input className="form-input" placeholder="e.g. 1" value={lookupId} onChange={(e) => setLookupId(e.target.value)} />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={perfLoading}>
                <Search /> {perfLoading ? 'Looking up…' : 'View performance'}
              </button>
            </form>
            {perfError && <div className="form-error" style={{ marginTop: 14, marginBottom: 0 }}>{perfError}</div>}
          </div>

          {perfLoading ? (
            <LoadingSpinner message="Loading student performance…" />
          ) : !perfData ? (
            <div className="card"><EmptyState title="Look up a student" desc="Enter a student ID to see attendance, marks and fee summary in one place." icon={Search} /></div>
          ) : (
            <>
              <div className="card card-padded" style={{ marginBottom: 20 }}>
                <div className="kicker" style={{ marginBottom: 6 }}>Pupil record</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{perfData.student.name}</div>
                <div className="text-muted" style={{ fontSize: 13 }}>ID {perfData.student.id} · {perfData.student.email} · Grade {perfData.student.grade}</div>
                {perfData.marks_detail?.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button className="btn btn-secondary btn-sm" onClick={() => downloadCSV(`student-${perfData.student.id}-marks.csv`, perfData.marks_detail)}>
                      <Download /> Export marks CSV
                    </button>
                  </div>
                )}
              </div>
              <div className="ledger-strip">
                <div className="ledger-cell">
                  <div className="k">Attendance rate</div>
                  <div className="v">{perfData.attendance.attendance_rate}%</div>
                  <div className="s">{perfData.attendance.present} present · {perfData.attendance.absent} absent · {perfData.attendance.late} late</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Exams taken</div>
                  <div className="v">{perfData.marks_detail?.length || 0}</div>
                  <div className="s">{perfData.marks_by_subject?.length || 0} subjects</div>
                </div>
                <div className="ledger-cell">
                  <div className="k">Fees pending</div>
                  <div className="v">${Number(perfData.fees.pending_amount).toLocaleString()}</div>
                  <div className="s">${Number(perfData.fees.paid_amount).toLocaleString()} paid</div>
                </div>
              </div>
              <div className="grid grid-cols-2">
                <div className="card">
                  <div className="card-header"><div className="card-title">Marks by subject</div></div>
                  {(!perfData.marks_by_subject || perfData.marks_by_subject.length === 0) ? (
                    <EmptyState title="No marks" desc="No exam records for this student yet." icon={BarChart3} />
                  ) : (
                    <>
                      <div className="card-body">
                        <div className="chart-container-sm">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={perfData.marks_by_subject} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                              <XAxis dataKey="subject" fontSize={12} tick={{ fill: '#94A3B8' }} />
                              <YAxis fontSize={12} tick={{ fill: '#94A3B8' }} />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="average_score" fill="#4F46E5" radius={[6, 6, 0, 0]} name="Avg score" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>
                      <div className="table-container">
                        <table className="table">
                          <thead><tr><th>Subject</th><th>Avg</th><th>Best</th><th>Exams</th></tr></thead>
                          <tbody>
                            {perfData.marks_by_subject.map((s) => (
                              <tr key={s.subject}><td style={{ fontWeight: 700 }}>{s.subject}</td><td>{s.average_score}</td><td>{s.highest_score}</td><td>{s.exams_count}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
                <div className="card">
                  <div className="card-header"><div className="card-title">Exam history</div></div>
                  {(!perfData.marks_detail || perfData.marks_detail.length === 0) ? (
                    <EmptyState title="No exams" desc="No detailed exam records yet." icon={BarChart3} />
                  ) : (
                    <div className="table-container">
                      <table className="table">
                        <thead><tr><th>Subject</th><th>Exam</th><th>Score</th><th>Date</th></tr></thead>
                        <tbody>
                          {perfData.marks_detail.slice(0, 12).map((m) => (
                            <tr key={m.id}><td>{m.subject}</td><td>{m.exam_name}</td><td style={{ fontWeight: 700 }}>{m.score}/{m.max_score} · {m.percentage}%</td><td>{m.date}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default Reports
