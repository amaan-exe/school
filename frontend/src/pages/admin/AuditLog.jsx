import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search, RefreshCw, ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { auditAPI } from '../../api'

const PAGE_SIZE = 50

const actionVariant = (action = '') => {
  if (/delete|revoke|remove/.test(action)) return 'danger'
  if (/create|register|grant|grade|submit/.test(action)) return 'success'
  if (/update|login/.test(action)) return 'info'
  return 'neutral'
}

const AuditLog = () => {
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState('')
  const [entityType, setEntityType] = useState('')
  const [action, setAction] = useState('')
  const [actorSearch, setActorSearch] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(false)

  const fetchEntries = useCallback(async (opts = {}) => {
    const { silent = false, pageOverride = null } = opts
    if (silent) setRefreshing(true)
    else setLoading(true)
    setError('')
    try {
      const p = pageOverride ?? page
      const params = { skip: p * PAGE_SIZE, limit: PAGE_SIZE + 1 }
      if (entityType.trim()) params.entity_type = entityType.trim()
      if (action.trim()) params.action = action.trim()
      const res = await auditAPI.getAll(params)
      const rows = Array.isArray(res.data) ? res.data : []
      setHasMore(rows.length > PAGE_SIZE)
      setEntries(rows.slice(0, PAGE_SIZE))
    } catch {
      setError('Could not load the audit log. Please try again.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [page, entityType, action])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  useEffect(() => {
    if (!autoRefresh) return
    const t = setInterval(() => fetchEntries({ silent: true }), 15000)
    return () => clearInterval(t)
  }, [autoRefresh, fetchEntries])

  const applyFilters = () => {
    setPage(0)
    fetchEntries({ pageOverride: 0 })
  }

  const filtered = useMemo(() => {
    const q = actorSearch.trim().toLowerCase()
    if (!q) return entries
    // Backend has no actor filter param — filter client-side on actor id / action / entity
    return entries.filter((e) =>
      String(e.actor_user_id ?? '').toLowerCase().includes(q) ||
      e.action?.toLowerCase().includes(q) ||
      e.entity_type?.toLowerCase().includes(q) ||
      (e.meta_json || '').toLowerCase().includes(q)
    )
  }, [entries, actorSearch])

  const fmtTime = (ts) => {
    if (!ts) return '—'
    try {
      return new Date(ts).toLocaleString()
    } catch {
      return String(ts)
    }
  }

  if (loading) return <LoadingSpinner message="Loading audit log…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Audit <span className="accent-word">Log</span>
          </div>
          <div className="page-subtitle">Who did what, and when. Newest first.</div>
        </div>
        <div className="page-actions">
          <button
            className={`btn ${autoRefresh ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setAutoRefresh((v) => !v)}
            title="Auto-refresh every 15s"
          >
            <RefreshCw /> {autoRefresh ? 'Auto-refresh on' : 'Auto-refresh'}
          </button>
          <button className="btn btn-secondary" onClick={() => fetchEntries({ silent: true })} disabled={refreshing}>
            <RefreshCw /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search actor id, action, details…"
            value={actorSearch}
            onChange={(e) => setActorSearch(e.target.value)}
          />
        </div>
        <input
          className="form-input"
          style={{ maxWidth: 200 }}
          placeholder="entity_type e.g. users"
          value={entityType}
          onChange={(e) => setEntityType(e.target.value)}
        />
        <input
          className="form-input"
          style={{ maxWidth: 220 }}
          placeholder="action e.g. user.register"
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
        <button className="btn btn-primary btn-sm" onClick={applyFilters}>Apply</button>
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => { setEntityType(''); setAction(''); setActorSearch(''); setPage(0); }}
        >
          Clear
        </button>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title="No audit entries"
            desc="Nothing matches these filters yet. Actions like logins, registrations and grading are recorded here."
            icon={ScrollText}
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Entity ID</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id}>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{fmtTime(e.timestamp)}</td>
                    <td>{e.actor_user_id != null ? `#${e.actor_user_id}` : '—'}</td>
                    <td><Badge variant={actionVariant(e.action)}>{e.action}</Badge></td>
                    <td style={{ fontSize: 13 }}>{e.entity_type}</td>
                    <td>{e.entity_id ?? '—'}</td>
                    <td style={{ fontSize: 12.5, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {e.meta_json || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="pagination">
        <span className="pagination-info">
          Page {page + 1} · {filtered.length} entr{filtered.length === 1 ? 'y' : 'ies'}
          {actorSearch.trim() ? ' (client-side search)' : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
            <ChevronLeft /> Prev
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!hasMore}
            onClick={() => setPage((p) => p + 1)}
          >
            Next <ChevronRight />
          </button>
        </div>
      </div>
    </div>
  )
}

export default AuditLog
