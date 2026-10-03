import { Link } from 'react-router-dom'
import { CalendarDays, ArrowRight } from 'lucide-react'
import EmptyState from '../EmptyState'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export const todayName = () => DAY_NAMES[new Date().getDay()]

const TimetableToday = ({ entries = [] }) => {
  const day = todayName()
  const todays = (entries || []).filter((t) => {
    if (!t.day) return false
    return String(t.day).toLowerCase() === day.toLowerCase()
  })
  const sorted = [...todays].sort((a, b) =>
    String(a.start_time || '').localeCompare(String(b.start_time || ''))
  )

  if (sorted.length === 0) {
    return (
      <EmptyState
        title={`No classes today (${day})`}
        desc="Nothing is scheduled for today. Enjoy the break!"
        icon={CalendarDays}
      />
    )
  }

  return (
    <div>
      {sorted.slice(0, 6).map((t, i) => (
        <div key={t.id || i} className="timeline-item">
          <div className="tt-time">{t.start_time || '—'}{t.end_time ? ` – ${t.end_time}` : ''}</div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            {t.subject || 'Lesson'}
            {t.class_name ? ` · ${t.class_name}` : ''}
          </div>
          <div className="text-muted" style={{ fontSize: 12.5 }}>
            {[t.room ? `Room ${t.room}` : '', t.teacher_name].filter(Boolean).join(' · ') || 'Details on the timetable'}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 14 }}>
        <Link to="/app/timetable" className="btn btn-ghost btn-sm">
          Full week <ArrowRight />
        </Link>
      </div>
    </div>
  )
}

export default TimetableToday
