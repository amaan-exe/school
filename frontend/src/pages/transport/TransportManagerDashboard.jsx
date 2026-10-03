import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Bus, KeyRound, MapPin, ArrowRight, Route } from 'lucide-react'
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

const TransportManagerDashboard = () => {
  const { user, permProfile, permissions } = useAuth()

  // Transport is a Phase 5 module: no backend endpoints exist, so this desk
  // states that plainly and shows the grants that will gate it when it lands.
  const granted = useMemo(() => {
    const map = permProfile?.all_permissions || {}
    const fromMap = Object.entries(map).map(([module, actions]) => ({
      module,
      actions: Array.isArray(actions) ? actions : [],
    }))
    if (fromMap.length) return fromMap
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
            {greeting()}, <em>{user?.name?.split(' ')[0] || 'Transport Manager'}</em>.
          </h1>
          <p className="brief-sub">
            Routes, vehicles and drivers. The module itself arrives in a later phase — this desk
            shows your access and where route planning will live.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div>
            <div className="card-title">Transport management</div>
            <div className="card-sub">Module status</div>
          </div>
          <span className="coming-soon-phase">Phase 5</span>
        </div>
        <div className="card-body">
          <div className="coming-soon">
            <div className="coming-soon-icon">
              <Bus />
            </div>
            <div className="coming-soon-title">Not built yet — and deliberately so</div>
            <div className="coming-soon-desc">
              There is no transport backend yet: no vehicles, no routes, no per-student allocation
              and no driver records to read. Rendering empty tables here would only produce broken
              screens, so the module is marked honestly instead. When it ships it will bring its own
              API group, and route allocation will be planned against the student register you can
              open today.
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
                {totalActions} permission{totalActions === 1 ? '' : 's'} across {granted.length} module
                {granted.length === 1 ? '' : 's'}
              </div>
            </div>
            <KeyRound size={18} color="var(--primary)" />
          </div>
          <div className="card-body">
            {granted.length === 0 ? (
              <EmptyState
                title="No scoped permissions yet"
                desc="An administrator can grant transport and students modules to this role from Roles & Permissions."
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
            <div className="card-title">Route planning starts here</div>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
              Vehicle and route records do not exist yet, so the work available today is preparing
              the passenger list: who rides, from which class and where they live.
            </p>
            <div className="quick-actions" style={{ marginTop: 14 }}>
              <Link to="/app/notices" className="quick-action-btn">
                <Route />
                <span>Operational notices</span>
                <span className="qa-go">›</span>
              </Link>
              <Link to="/app/calendar" className="quick-action-btn">
                <MapPin />
                <span>Term dates for route planning</span>
                <span className="qa-go">›</span>
              </Link>
            </div>
            <div className="form-hint" style={{ marginTop: 14 }}>
              The student register and the HR register open once your role holds the matching read
              grants — the grants shown on the left decide what you can open.
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
                Academics, HR and finance
              </div>
              <div className="pinned-note-body">
                Subjects, grades, class mapping, employees, invoices, payments, fee structures,
                expenses and the finance summary.
              </div>
            </div>
            <div className="timeline-item">
              <div className="tt-time">Phase 5 · next</div>
              <div className="pinned-note-title" style={{ fontSize: 14 }}>
                Library and transport modules
              </div>
              <div className="pinned-note-body">
                Vehicles, routes, stops, drivers and per-student allocation — plus catalogue and
                circulation.
              </div>
            </div>
          </div>
          <Link to="/app/notices" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
            Read operational notices <ArrowRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  )
}

export default TransportManagerDashboard