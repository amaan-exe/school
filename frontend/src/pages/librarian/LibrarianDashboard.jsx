import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Library, KeyRound, ArrowRight, BookOpen, Megaphone } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import { useAuth } from '../../context/AuthContext'

const dateLine = () =>
  new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

const LibrarianDashboard = () => {
  const { user, permProfile, permissions } = useAuth()

  // The library module ships in Phase 5. Until then the librarian sees exactly
  // what their role grants today — nothing invented, nothing broken.
  const granted = useMemo(() => {
    const map = permProfile?.all_permissions || {}
    const fromMap = Object.entries(map).map(([module, actions]) => ({
      module,
      actions: Array.isArray(actions) ? actions : [],
    }))
    if (fromMap.length) return fromMap
    // Fall back to the flat permissions list when all_permissions is absent.
    const flat = (permissions || []).map((p) => {
      if (typeof p === 'string') {
        const [module, action] = p.split(':')
        return { module, action: action || 'view' }
      }
      return { module: p?.module || p?.resource, action: p?.action || p?.permission || 'view' }
    })
    const grouped = new Map()
    flat.forEach((row) => {
      if (!row.module) return
      if (!grouped.has(row.module)) grouped.set(row.module, new Set())
      grouped.get(row.module).add(row.action)
    })
    return [...grouped.entries()].map(([module, actions]) => ({ module, actions: [...actions] }))
  }, [permProfile, permissions])

  const totalActions = granted.reduce((s, g) => s + g.actions.length, 0)

  return (
    <div className="brief-hero">
      <div className="page-header">
        <div>
          <div className="page-kicker">{dateLine()}</div>
          <h1 className="brief-greeting">
            {greeting()}, <em>{user?.name?.split(' ')[0] || 'Librarian'}</em>.
          </h1>
          <p className="brief-sub">
            The library desk. Circulation, the catalogue and holds arrive in a later phase — here is
            exactly what your desk can do today.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Library management</div>
            <div className="card-sub">Module status</div>
          </div>
          <span className="coming-soon-phase">Phase 5</span>
        </div>
        <div className="card-body">
          <div className="coming-soon">
            <div className="coming-soon-icon">
              <Library />
            </div>
            <div className="coming-soon-title">Not built yet — and deliberately so</div>
            <div className="coming-soon-desc">
              There is no library backend yet, so there is nothing honest to show here: no book
              catalogue, no issue register, no reservations. Rather than fake tables that would break
              the moment you clicked them, this desk ships as a placeholder. The module will land
              with its own API group, and this page will fill in at that point.
            </div>
            <div className="coming-soon-phase">No endpoints invented · nothing to break</div>
          </div>
        </div>
      </div>

      <div className="editorial-2col" style={{ marginTop: 24 }}>
        <div className="card">
          <div className="card-header">
            <div>
              <div className="card-title">Your grants</div>
              <div className="card-sub">
                {totalActions} permission{totalActions === 1 ? '' : 's'} across{' '}
                {granted.length} module{granted.length === 1 ? '' : 's'}
              </div>
            </div>
            <KeyRound size={18} color="var(--primary)" />
          </div>
          <div className="card-body">
            {granted.length === 0 ? (
              <EmptyState
                title="No scoped permissions yet"
                desc="An administrator can grant modules to the librarian role from Roles & Permissions."
                icon={KeyRound}
              />
            ) : (
              <div className="pinned-notes">
                {granted.map((g) => (
                  <div className="pinned-note" key={g.module}>
                    <div className="pinned-note-title">{g.module}</div>
                    <div className="perm-chips" style={{ marginTop: 8 }}>
                      {g.actions.map((a) => (
                        <span className="perm-chip" key={`${g.module}-${a}`}>
                          {a}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Useful links</div>
          </div>
          <div className="card-body">
            <div className="quick-actions">
              <Link to="/app/subjects" className="quick-action-btn">
                <BookOpen /> <span>Subject catalogue</span>
                <span className="qa-go">›</span>
              </Link>
              <Link to="/app/notices" className="quick-action-btn">
                <Megaphone /> <span>School notices</span>
                <span className="qa-go">›</span>
              </Link>
            </div>
            <div className="form-hint" style={{ marginTop: 14 }}>
              The student register link appears once your role holds a students read grant — the
              same grants shown above decide what you can open.
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 24 }}>
        <div className="card-header">
          <div className="card-title">What is coming</div>
        </div>
        <div className="card-body">
          <div className="timeline">
            <div className="timeline-item now">
              <div className="tt-time">Phase 3 · now</div>
              <div className="pinned-note-title" style={{ fontSize: 14 }}>
                Academics, HR and finance modules
              </div>
              <div className="pinned-note-body">
                Subjects, grades, employees, invoices, payments, fee structures and expenses are all
                live.
              </div>
            </div>
            <div className="timeline-item">
              <div className="tt-time">Phase 5 · next</div>
              <div className="pinned-note-title" style={{ fontSize: 14 }}>
                Library and transport modules
              </div>
              <div className="pinned-note-body">
                Catalogue, circulation, holds — plus routes, vehicles and drivers.
              </div>
            </div>
          </div>
          <Link to="/app/notices" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
            Read the school notices <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default LibrarianDashboard