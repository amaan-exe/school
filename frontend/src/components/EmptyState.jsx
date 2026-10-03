import { Inbox } from 'lucide-react'

const EmptyState = ({ title = 'Nothing here yet', desc, icon: Icon = Inbox, action }) => (
  <div className="empty-state">
    <div className="empty-state-icon">
      <Icon />
    </div>
    <div className="empty-state-title">{title}</div>
    {desc && <div className="empty-state-desc">{desc}</div>}
    {action}
  </div>
)

export default EmptyState
