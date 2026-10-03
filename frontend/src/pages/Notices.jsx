import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Megaphone, Pin, Plus, Search } from 'lucide-react'
import Modal from '../components/Modal'
import EmptyState from '../components/EmptyState'
import LoadingSpinner from '../components/LoadingSpinner'
import Badge from '../components/Badge'
import { noticesAPI, NOTICE_CATEGORIES } from '../api'
import { useAuth } from '../context/AuthContext'

const catVariant = (c) =>
  c === 'emergency' ? 'danger' : c === 'event' ? 'warning' : c === 'exam' ? 'info' : c === 'holiday' ? 'success' : 'primary'

const Notices = () => {
  const { hasRole, hasPermission } = useAuth()
  const canWrite =
    hasRole(['admin', 'teacher']) ||
    hasPermission('notices', 'create') ||
    hasPermission('notices', 'manage')
  const isAdmin = hasRole(['admin'])
  const [notices, setNotices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({ title: '', content: '', category: 'general', expires_at: '' })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [counts, setCounts] = useState(null)

  const fetchNotices = async (cat) => {
    setLoading(true)
    setError('')
    try {
      const params = { active_only: false, limit: 500 }
      if (cat && cat !== 'all') params.category = cat
      const res = await noticesAPI.getAll(params)
      const list = Array.isArray(res.data) ? res.data : []
      list.sort((a, b) => {
        if (a.category === 'emergency' && b.category !== 'emergency') return -1
        if (b.category === 'emergency' && a.category !== 'emergency') return 1
        return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      })
      setNotices(list)
    } catch {
      setError('Could not load notices. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotices(category)
  }, [category])

  // Tab counts: one extra read of the board so each tab carries its tally.
  useEffect(() => {
    let mounted = true
    noticesAPI
      .getAll({ active_only: false, limit: 500 })
      .then((res) => {
        if (!mounted || !Array.isArray(res.data)) return
        const tally = { all: res.data.length }
        NOTICE_CATEGORIES.forEach((c) => {
          tally[c] = res.data.filter((n) => n.category === c).length
        })
        setCounts(tally)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return notices
    return notices.filter(
      (n) => n.title?.toLowerCase().includes(q) || n.content?.toLowerCase().includes(q)
    )
  }, [notices, search])

  const openAdd = () => {
    setEditing(null)
    setForm({ title: '', content: '', category: 'general', expires_at: '' })
    setFormError('')
    setModalOpen(true)
  }
  const openEdit = (n) => {
    setEditing(n)
    setForm({
      title: n.title || '',
      content: n.content || '',
      category: n.category || 'general',
      expires_at: n.expires_at ? String(n.expires_at).slice(0, 10) : '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.title.trim() || !form.content.trim()) {
      setFormError('Title and content are required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        category: form.category,
        expires_at: form.expires_at || null,
      }
      if (editing) await noticesAPI.update(editing.id, payload)
      else await noticesAPI.create(payload)
      setModalOpen(false)
      fetchNotices(category)
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the notice.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await noticesAPI.remove(deleteId)
      setDeleteId(null)
      fetchNotices(category)
    } catch {
      setError('Could not delete the notice.')
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading notices…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Notice <span className="accent-word">Board</span>
          </div>
          <div className="page-subtitle">Announcements, events and important updates.</div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Post notice
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="chip-tabs">
          <button className={`chip-tab ${category === 'all' ? 'active' : ''}`} onClick={() => setCategory('all')}>All{counts ? <span className="count">{counts.all}</span> : ''}</button>
          {NOTICE_CATEGORIES.map((c) => (
            <span key={c} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span className="chip-sep">·</span>
              <button className={`chip-tab ${category === c ? 'active' : ''}`} onClick={() => setCategory(c)} style={{ textTransform: 'uppercase' }}>
                {c}{counts ? <span className="count">{counts[c] ?? 0}</span> : ''}
              </button>
            </span>
          ))}
        </div>
        <div className="filter-search">
          <Search />
          <input placeholder="Search notices…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card">
          <EmptyState
            title={notices.length === 0 ? 'No notices yet' : 'No matches found'}
            desc={notices.length === 0 ? 'Post the first announcement to keep the school in the loop.' : 'Try a different category or search.'}
            icon={Megaphone}
            action={canWrite && notices.length === 0 ? <button className="btn btn-primary" onClick={openAdd}><Plus /> Post notice</button> : null}
          />
        </div>
      ) : (
        <div className="grid grid-cols-2">
          {filtered.map((n) => {
            const emergency = n.category === 'emergency'
            return (
              <div key={n.id} className={`card card-padded notice-card ${emergency ? 'notice-emergency' : ''}`}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Badge variant={catVariant(n.category)}>{n.category}</Badge>
                    {emergency && (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--danger-dark)' }}>
                        <Pin size={13} /> Pinned urgent
                      </span>
                    )}
                    {!n.is_active && <Badge variant="neutral">Inactive</Badge>}
                  </div>
                  {canWrite && (
                    <div className="table-actions">
                      <button className="row-action" onClick={() => openEdit(n)}>Edit</button>
                      {isAdmin && (
                        <button className="row-action danger" onClick={() => setDeleteId(n.id)}>Remove</button>
                      )}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  {emergency && <AlertTriangle size={18} style={{ color: 'var(--danger)', flexShrink: 0, marginTop: 2 }} />}
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{n.title}</div>
                    <p style={{ fontSize: 14, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{n.content}</p>
                    <div className="text-muted" style={{ fontSize: 12, marginTop: 10 }}>
                      {n.created_at ? new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''}
                      {n.expires_at ? ` · Expires ${String(n.expires_at).slice(0, 10)}` : ''}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Edit notice' : 'Post a new notice'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Post notice'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">Title<span className="required">*</span></label>
              <input className="form-input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Sports Day on Friday" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Category</label>
                <select className="form-select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  {NOTICE_CATEGORIES.map((c) => (
                    <option key={c} value={c} style={{ textTransform: 'capitalize' }}>{c}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Expires on</label>
                <input type="date" className="form-input" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Content<span className="required">*</span></label>
              <textarea className="form-textarea" style={{ minHeight: 130 }} value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} placeholder="Write the announcement…" />
            </div>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete notice?"
          size="sm"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>This notice will be permanently removed from the board.</p>
        </Modal>
      )}
    </div>
  )
}

export default Notices
