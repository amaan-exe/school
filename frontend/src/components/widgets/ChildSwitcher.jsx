// Child switcher for the parent portal. Children come from
// GET /auth/me/permissions -> { children: [...] }.
// Reads as a row of soft chips — gradient avatar initials, indigo tint on
// the selected child.
const ChildSwitcher = ({ children = [], selectedId, onSelect }) => {
  if (!children || children.length === 0) {
    return (
      <div className="card card-padded text-muted" style={{ fontSize: 14 }}>
        No linked children found. Please contact the school office to link your
        children to this account.
      </div>
    )
  }
  return (
    <div className="child-switcher">
      {children.map((c) => {
        const id = c.student_id ?? c.id
        const name = c.name || `Student ${id}`
        const active = String(id) === String(selectedId)
        const initials = String(name)
          .split(' ')
          .map((p) => p[0])
          .slice(0, 2)
          .join('')
          .toUpperCase()
        return (
          <button
            key={id}
            className={`child-chip ${active ? 'active' : ''}`}
            onClick={() => onSelect && onSelect(id)}
          >
            <span className="child-chip-avatar">{initials}</span>
            <span>
              <span className="child-chip-name">{name}</span>
              <span className="child-chip-sub">
                {[c.class_name, c.section].filter(Boolean).join(' · ') || `Pupil ${id}`}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

export default ChildSwitcher
