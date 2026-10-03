import { Link } from 'react-router-dom'
import { ArrowRight, Megaphone } from 'lucide-react'
import EmptyState from '../EmptyState'

const stampFor = (c) => {
  if (c === 'emergency') return 'stamp stamp-red'
  if (c === 'event') return 'stamp stamp-amber'
  if (c === 'holiday') return 'stamp stamp-green'
  return 'stamp stamp-ink'
}
// Notices read as lines in a register with a category chip.
const NoticeList = ({ notices = [], onMarkRead, compact = false }) => {
  const list = (notices || []).slice(0, compact ? 5 : 8)
  if (list.length === 0) {
    return (
      <EmptyState
        title="Nothing on the board"
        desc="There are no announcements for you right now. Check back soon."
        icon={Megaphone}
      />
    )
  }
  return (
    <div>
      {list.map((n) => {
        const stamp = stampFor(n.category)
        const unread = n.is_read === false
        return (
          <div key={n.id} className="tt-row" style={{ alignItems: 'flex-start' }}>
            <span className={`${stamp}`} style={{ fontSize: 10, flexShrink: 0 }}>
              {n.category || 'general'}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 15,
                  marginBottom: 2,
                }}
              >
                {unread && <span className="notice-unread-dot" aria-hidden="true" />}
                {n.title}
              </div>
              <div
                className="text-muted"
                style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {n.content}
              </div>
              {unread && (
                <button
                  className="row-action"
                  style={{ fontSize: 12, marginTop: 6 }}
                  onClick={() => onMarkRead && onMarkRead(n.id)}
                >
                  Mark as read <ArrowRight size={12} />
                </button>
              )}
            </div>
          </div>
        )
      })}
      {!compact && (
        <Link to="/app/notices" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}>
          View all notices <ArrowRight />
        </Link>
      )}
    </div>
  )
}

export default NoticeList
