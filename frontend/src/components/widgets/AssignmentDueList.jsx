import { Link } from 'react-router-dom'
import { ClipboardList, ArrowRight } from 'lucide-react'
import EmptyState from '../EmptyState'

const AssignmentDueList = ({ assignments = [] }) => {
  const today = new Date().toISOString().slice(0, 10)
  const sorted = [...(assignments || [])]
    .sort((a, b) => String(a.due_date || '9999').localeCompare(String(b.due_date || '9999')))
    .slice(0, 6)

  if (sorted.length === 0) {
    return (
      <EmptyState
        title="Nothing due"
        desc="No homework is waiting. New work from teachers will appear here."
        icon={ClipboardList}
      />
    )
  }

  // A register of work: soft rules, a status chip for the due date.
  return (
    <div className="attendance-ledger">
      {sorted.map((a) => {
        const overdue = a.due_date && a.due_date < today
        return (
          <div key={a.id} className="attendance-ledger-row" style={{ alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{a.title}</div>
              <div className="text-muted" style={{ fontSize: 12 }}>
                {[a.subject, a.class_name].filter(Boolean).join(' · ') || 'Classwork'}
              </div>
            </div>
            <span
              className={`stamp ${overdue ? 'stamp-red' : 'stamp-amber'}`}
              style={{ fontSize: 10, alignSelf: 'center' }}
            >
              {a.due_date ? `Due ${a.due_date}` : 'No date'}
            </span>
          </div>
        )
      })}
      <div style={{ padding: '10px 16px' }}>
        <Link to="/app/assignments" className="btn btn-ghost btn-sm">
          All assignments <ArrowRight />
        </Link>
      </div>
    </div>
  )
}

export default AssignmentDueList
