import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Search, Users as UsersIcon,
  Link2, ShieldCheck, UserCog, PowerOff,
} from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { usersAPI, staffAPI, parentLinksAPI, studentsAPI } from '../../api'

const ROLES = ['admin', 'staff', 'teacher', 'student', 'parent']
const MODULES = ['students', 'teachers', 'attendance', 'marks', 'fees', 'timetable', 'notices', 'assignments', 'calendar', 'reports']

const roleBadgeVariant = (role) => {
  switch (role) {
    case 'admin': return 'danger'
    case 'teacher': return 'info'
    case 'staff': return 'warning'
    case 'student': return 'success'
    case 'parent': return 'neutral'
    default: return 'neutral'
  }
}

const initials = (name = '?') =>
  name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()

const emptyUserForm = { name: '', email: '', password: '', role: 'staff', student_id: '', teacher_id: '' }
const emptyLinkForm = { parent_user_id: '', student_id: '', relation: '' }
const emptyPermForm = { staff_profile_id: '', module: MODULES[0], can_read: true, can_write: false, can_delete: false }

const Users = () => {
  const [tab, setTab] = useState('users')

  // ── Users state ──
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyUserForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // ── Parent links state ──
  const [links, setLinks] = useState([])
  const [linksLoading, setLinksLoading] = useState(false)
  const [linksError, setLinksError] = useState('')
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkForm, setLinkForm] = useState(emptyLinkForm)
  const [linkSaving, setLinkSaving] = useState(false)
  const [linkFormError, setLinkFormError] = useState('')
  const [deleteLinkId, setDeleteLinkId] = useState(null)
  const [students, setStudents] = useState([])

  // ── Staff state ──
  const [staff, setStaff] = useState([])
  const [staffLoading, setStaffLoading] = useState(false)
  const [staffError, setStaffError] = useState('')
  const [perms, setPerms] = useState([])
  const [permModalOpen, setPermModalOpen] = useState(false)
  const [permForm, setPermForm] = useState(emptyPermForm)
  const [permSaving, setPermSaving] = useState(false)
  const [permFormError, setPermFormError] = useState('')
  const [deletePermId, setDeletePermId] = useState(null)

  const fetchUsers = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await usersAPI.getAll({ limit: 1000 })
      setUsers(Array.isArray(res.data) ? res.data : [])
    } catch {
      setError('Could not load users. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const fetchLinks = async () => {
    setLinksLoading(true)
    setLinksError('')
    try {
      const [linksRes, studentsRes] = await Promise.all([
        parentLinksAPI.getAll(),
        studentsAPI.getAll({ limit: 1000 }).catch(() => ({ data: [] })),
      ])
      setLinks(Array.isArray(linksRes.data) ? linksRes.data : [])
      setStudents(Array.isArray(studentsRes.data) ? studentsRes.data : [])
    } catch {
      setLinksError('Could not load parent links. Please try again.')
    } finally {
      setLinksLoading(false)
    }
  }

  const fetchStaff = async () => {
    setStaffLoading(true)
    setStaffError('')
    try {
      const [staffRes, permsRes] = await Promise.all([
        staffAPI.getAll({ limit: 1000 }),
        staffAPI.listPermissions().catch(() => ({ data: [] })),
      ])
      setStaff(Array.isArray(staffRes.data) ? staffRes.data : [])
      setPerms(Array.isArray(permsRes.data) ? permsRes.data : [])
    } catch {
      setStaffError('Could not load staff profiles. Please try again.')
    } finally {
      setStaffLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  useEffect(() => {
    if (tab === 'links' && links.length === 0 && !linksLoading) fetchLinks()
    if (tab === 'staff' && staff.length === 0 && !staffLoading) fetchStaff()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  // ── Users handlers ──
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase()
    return users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false
      if (!q) return true
      return u.name?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)
    })
  }, [users, search, roleFilter])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyUserForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (u) => {
    setEditing(u)
    setForm({
      name: u.name || '',
      email: u.email || '',
      password: '',
      role: u.role || 'staff',
      student_id: u.student_id ?? '',
      teacher_id: u.teacher_id ?? '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.name.trim() || !form.email.trim()) {
      setFormError('Name and email are required.')
      return
    }
    if (!editing && !form.password) {
      setFormError('Password is required for a new user.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        const payload = {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          student_id: form.student_id === '' ? null : Number(form.student_id),
          teacher_id: form.teacher_id === '' ? null : Number(form.teacher_id),
        }
        if (form.password) payload.password = form.password
        await usersAPI.update(editing.id, payload)
      } else {
        await usersAPI.register({
          name: form.name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          ...(form.student_id !== '' ? { student_id: Number(form.student_id) } : {}),
          ...(form.teacher_id !== '' ? { teacher_id: Number(form.teacher_id) } : {}),
        })
      }
      setModalOpen(false)
      fetchUsers()
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Could not save the user. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeactivate = async (u) => {
    try {
      await usersAPI.update(u.id, { is_active: false })
      fetchUsers()
    } catch {
      setError('Could not deactivate the user.')
    }
  }

  const handleReactivate = async (u) => {
    try {
      await usersAPI.update(u.id, { is_active: true })
      fetchUsers()
    } catch {
      setError('Could not reactivate the user.')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await usersAPI.remove(deleteTarget.id)
      setDeleteTarget(null)
      fetchUsers()
    } catch {
      setError('Could not delete the user.')
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  // ── Parent link handlers ──
  const parentUsers = useMemo(() => users.filter((u) => u.role === 'parent'), [users])
  const studentName = (id) => students.find((s) => s.id === id)?.name || `Student #${id}`
  const parentLabel = (id) => {
    const u = users.find((x) => x.id === id)
    return u ? `${u.name} (${u.email})` : `User #${id}`
  }

  const openAddLink = () => {
    setLinkForm(emptyLinkForm)
    setLinkFormError('')
    setLinkModalOpen(true)
  }

  const handleSaveLink = async (e) => {
    e.preventDefault()
    setLinkFormError('')
    if (!linkForm.parent_user_id || !linkForm.student_id) {
      setLinkFormError('Parent user and student are required.')
      return
    }
    setLinkSaving(true)
    try {
      await parentLinksAPI.create({
        parent_user_id: Number(linkForm.parent_user_id),
        student_id: Number(linkForm.student_id),
        relation: linkForm.relation.trim() || null,
      })
      setLinkModalOpen(false)
      fetchLinks()
    } catch (err) {
      setLinkFormError(err.response?.data?.detail || 'Could not create the link. Please try again.')
    } finally {
      setLinkSaving(false)
    }
  }

  const handleDeleteLink = async () => {
    if (!deleteLinkId) return
    try {
      await parentLinksAPI.remove(deleteLinkId)
      setDeleteLinkId(null)
      fetchLinks()
    } catch {
      setLinksError('Could not delete the link.')
      setDeleteLinkId(null)
    }
  }

  // ── Staff permission handlers ──
  const permsFor = (profileId) => perms.filter((p) => p.staff_profile_id === profileId)
  const staffUserLabel = (userId) => {
    const u = users.find((x) => x.id === userId)
    return u ? `${u.name} (${u.email})` : `User #${userId}`
  }

  const openGrantPerm = (profileId) => {
    setPermForm({ ...emptyPermForm, staff_profile_id: String(profileId ?? '') })
    setPermFormError('')
    setPermModalOpen(true)
  }

  const handleTogglePerm = async (perm, field) => {
    try {
      const res = await staffAPI.updatePermission(perm.id, { [field]: !perm[field] })
      setPerms((prev) => prev.map((p) => (p.id === perm.id ? res.data : p)))
    } catch {
      setStaffError('Could not update the permission.')
    }
  }

  const handleSavePerm = async (e) => {
    e.preventDefault()
    setPermFormError('')
    if (!permForm.staff_profile_id || !permForm.module.trim()) {
      setPermFormError('Staff profile and module are required.')
      return
    }
    setPermSaving(true)
    try {
      const res = await staffAPI.grantPermission({
        staff_profile_id: Number(permForm.staff_profile_id),
        module: permForm.module.trim(),
        can_read: !!permForm.can_read,
        can_write: !!permForm.can_write,
        can_delete: !!permForm.can_delete,
      })
      setPerms((prev) => [...prev, res.data])
      setPermModalOpen(false)
    } catch (err) {
      setPermFormError(err.response?.data?.detail || 'Could not grant the permission. Please try again.')
    } finally {
      setPermSaving(false)
    }
  }

  const handleDeletePerm = async () => {
    if (!deletePermId) return
    try {
      await staffAPI.revokePermission(deletePermId)
      setPerms((prev) => prev.filter((p) => p.id !== deletePermId))
      setDeletePermId(null)
    } catch {
      setStaffError('Could not revoke the permission.')
      setDeletePermId(null)
    }
  }

  if (loading) return <LoadingSpinner message="Loading users…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            User <span className="accent-word">Management</span>
          </div>
          <div className="page-subtitle">Accounts, parent-child links and staff permissions.</div>
        </div>
      </div>

      <div className="tabs">
        {[
          { id: 'users', label: `Users (${users.length})` },
          { id: 'links', label: `Parent Links (${links.length})` },
          { id: 'staff', label: `Staff (${staff.length})` },
        ].map((t) => (
          <button key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' && (
        <>
          <div className="page-header" style={{ marginBottom: 16 }}>
            <div />
            <div className="page-actions">
              <button className="btn btn-primary" onClick={openAdd}>
                <Plus /> Add user
              </button>
            </div>
          </div>
          {error && <div className="form-error">{error}</div>}
          <div className="filter-bar">
            <div className="filter-search">
              <Search />
              <input placeholder="Search name, email…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <select className="filter-select" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All roles</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="card">
            {filteredUsers.length === 0 ? (
              <EmptyState
                title={users.length === 0 ? 'No users yet' : 'No matches found'}
                desc={users.length === 0 ? 'Create the first user account.' : 'Try a different search or role filter.'}
                icon={UsersIcon}
                action={users.length === 0 ? <button className="btn btn-primary" onClick={openAdd}><Plus /> Add user</button> : null}
              />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Linked IDs</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <div className="cell-main">
                            <div className="avatar">{initials(u.name)}</div>
                            <div>
                              <div className="cell-name">{u.name}</div>
                              <div className="cell-sub">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td><Badge variant={roleBadgeVariant(u.role)}>{u.role}</Badge></td>
                        <td>
                          {u.is_active === undefined ? (
                            <span style={{ color: 'var(--text-muted)' }}>—</span>
                          ) : u.is_active ? (
                            <Badge variant="success">active</Badge>
                          ) : (
                            <Badge variant="danger">inactive</Badge>
                          )}
                        </td>
                        <td style={{ fontSize: 13 }}>
                          {u.student_id ? <div>student_id: {u.student_id}</div> : null}
                          {u.teacher_id ? <div>teacher_id: {u.teacher_id}</div> : null}
                          {!u.student_id && !u.teacher_id ? '—' : null}
                        </td>
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openEdit(u)}>
                              Edit
                            </button>
                            {u.is_active === false ? (
                              <button className="row-action success" onClick={() => handleReactivate(u)}>
                                Reactivate
                              </button>
                            ) : (
                              <button className="row-action" onClick={() => handleDeactivate(u)}>
                                Deactivate
                              </button>
                            )}
                            <button className="row-action danger" onClick={() => setDeleteTarget(u)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          <div className="pagination">
            <span className="pagination-info">Showing {filteredUsers.length} of {users.length} users</span>
          </div>
        </>
      )}

      {tab === 'links' && (
        <>
          <div className="page-header" style={{ marginBottom: 16 }}>
            <div>
              <div className="page-subtitle">Link parent accounts to their children.</div>
            </div>
            <div className="page-actions">
              <button className="btn btn-primary" onClick={openAddLink}>
                <Link2 /> New link
              </button>
            </div>
          </div>
          {linksError && <div className="form-error">{linksError}</div>}
          <div className="card">
            {linksLoading ? (
              <LoadingSpinner message="Loading links…" />
            ) : links.length === 0 ? (
              <EmptyState
                title="No parent links yet"
                desc="Link a parent account to a student so the parent portal shows the right children."
                icon={Link2}
                action={<button className="btn btn-primary" onClick={openAddLink}><Plus /> New link</button>}
              />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Parent</th>
                      <th>Student</th>
                      <th>Relation</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {links.map((l) => (
                      <tr key={l.id}>
                        <td className="cell-name">{parentLabel(l.parent_user_id)}</td>
                        <td>{studentName(l.student_id)}</td>
                        <td>{l.relation ? <Badge variant="info">{l.relation}</Badge> : '—'}</td>
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action danger" onClick={() => setDeleteLinkId(l.id)}>
                              Unlink
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'staff' && (
        <>
          <div className="page-header" style={{ marginBottom: 16 }}>
            <div>
              <div className="page-subtitle">Staff profiles and their module permission matrix.</div>
            </div>
            <div className="page-actions">
              <button className="btn btn-secondary" onClick={() => openGrantPerm('')}>
                <ShieldCheck /> Grant permission
              </button>
            </div>
          </div>
          {staffError && <div className="form-error">{staffError}</div>}
          <div className="card">
            {staffLoading ? (
              <LoadingSpinner message="Loading staff…" />
            ) : staff.length === 0 ? (
              <EmptyState
                title="No staff profiles yet"
                desc="Staff profiles are created for users with the staff role."
                icon={UserCog}
              />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Staff</th>
                      <th>Designation</th>
                      <th>Department</th>
                      <th>Permissions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => {
                      const rows = permsFor(s.id)
                      return (
                        <tr key={s.id}>
                          <td>
                            <div className="cell-main">
                              <div className="avatar">
                                {initials(staffUserLabel(s.user_id))}
                              </div>
                              <div>
                                <div className="cell-name">{staffUserLabel(s.user_id)}</div>
                                <div className="cell-sub">profile #{s.id} · user #{s.user_id}</div>
                              </div>
                            </div>
                          </td>
                          <td>{s.designation || '—'}</td>
                          <td>{s.department || '—'}</td>
                          <td>
                            {rows.length === 0 ? (
                              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No grants</span>
                            ) : (
                              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {rows.map((p) => (
                                  <span key={p.id} className="summary-chip" style={{ padding: '4px 10px', fontSize: 12 }}>
                                    <strong>{p.module}</strong>
                                    {['can_read', 'can_write', 'can_delete'].map((f) => (
                                      <button
                                        key={f}
                                        type="button"
                                        title={`${f} — click to toggle`}
                                        onClick={() => handleTogglePerm(p, f)}
                                        style={{
                                          border: '1px solid var(--border)',
                                          borderRadius: 999,
                                          fontSize: 11,
                                          padding: '1px 8px',
                                          cursor: 'pointer',
                                          background: p[f] ? 'var(--primary)' : '#FFFFFF',
                                          color: p[f] ? '#FFFFFF' : 'var(--text-secondary)',
                                        }}
                                      >
                                        {f.replace('can_', '')[0].toUpperCase()}
                                      </button>
                                    ))}
                                    <button
                                      type="button"
                                      onClick={() => setDeletePermId(p.id)}
                                      title="Revoke"
                                      style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 13 }}
                                    >
                                      ×
                                    </button>
                                  </span>
                                ))}
                              </div>
                            )}
                            <div style={{ marginTop: 8 }}>
                              <button className="btn btn-secondary btn-sm" onClick={() => openGrantPerm(s.id)}>
                                <Plus /> Grant
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Edit user' : 'Add a new user'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create user'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Full name<span className="required">*</span></label>
                <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Jane Doe" />
              </div>
              <div className="form-group">
                <label className="form-label">Email<span className="required">*</span></label>
                <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="jane@school.com" />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Password{editing ? ' (leave blank to keep)' : <span className="required">*</span>}</label>
                <input type="password" className="form-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder={editing ? '••••••••' : 'Min 6 characters'} />
              </div>
              <div className="form-group">
                <label className="form-label">Role<span className="required">*</span></label>
                <select className="form-input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Linked student_id (optional)</label>
                <input className="form-input" value={form.student_id} onChange={(e) => setForm({ ...form, student_id: e.target.value })} placeholder="e.g. 3" />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Linked teacher_id (optional)</label>
                <input className="form-input" value={form.teacher_id} onChange={(e) => setForm({ ...form, teacher_id: e.target.value })} placeholder="e.g. 2" />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete user?"
          size="sm"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This will permanently remove <strong>{deleteTarget.name}</strong> ({deleteTarget.email}).
            Prefer deactivation to keep history — use the power button in the table to set the account inactive instead.
          </p>
          <button
            className="btn btn-secondary btn-sm"
            style={{ marginTop: 12 }}
            onClick={async () => { await handleDeactivate(deleteTarget); setDeleteTarget(null) }}
          >
            <PowerOff /> Deactivate instead
          </button>
        </Modal>
      )}

      {linkModalOpen && (
        <Modal
          title="Link parent to student"
          onClose={() => setLinkModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setLinkModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSaveLink} disabled={linkSaving}>
                {linkSaving ? 'Saving…' : 'Create link'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSaveLink}>
            {linkFormError && <div className="form-error">{linkFormError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Parent user<span className="required">*</span></label>
                <select className="form-input" value={linkForm.parent_user_id} onChange={(e) => setLinkForm({ ...linkForm, parent_user_id: e.target.value })}>
                  <option value="">Select parent…</option>
                  {(parentUsers.length > 0 ? parentUsers : users).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Student<span className="required">*</span></label>
                <select className="form-input" value={linkForm.student_id} onChange={(e) => setLinkForm({ ...linkForm, student_id: e.target.value })}>
                  <option value="">Select student…</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} (id {s.id})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Relation</label>
              <input className="form-input" value={linkForm.relation} onChange={(e) => setLinkForm({ ...linkForm, relation: e.target.value })} placeholder="e.g. father, mother, guardian" />
            </div>
          </form>
        </Modal>
      )}

      {deleteLinkId && (
        <Modal
          title="Delete link?"
          size="sm"
          onClose={() => setDeleteLinkId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteLinkId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeleteLink}>Delete</button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This will remove the parent-child link. The accounts themselves are kept.
          </p>
        </Modal>
      )}

      {permModalOpen && (
        <Modal
          title="Grant staff permission"
          onClose={() => setPermModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setPermModalOpen(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSavePerm} disabled={permSaving}>
                {permSaving ? 'Saving…' : 'Grant'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSavePerm}>
            {permFormError && <div className="form-error">{permFormError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Staff profile<span className="required">*</span></label>
                <select className="form-input" value={permForm.staff_profile_id} onChange={(e) => setPermForm({ ...permForm, staff_profile_id: e.target.value })}>
                  <option value="">Select profile…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>#{s.id} — {staffUserLabel(s.user_id)}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Module<span className="required">*</span></label>
                <select className="form-input" value={permForm.module} onChange={(e) => setPermForm({ ...permForm, module: e.target.value })}>
                  {MODULES.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-row" style={{ marginBottom: 0 }}>
              {['can_read', 'can_write', 'can_delete'].map((f) => (
                <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                  <input
                    type="checkbox"
                    checked={!!permForm[f]}
                    onChange={(e) => setPermForm({ ...permForm, [f]: e.target.checked })}
                  />
                  {f.replace('can_', '')}
                </label>
              ))}
            </div>
          </form>
        </Modal>
      )}

      {deletePermId && (
        <Modal
          title="Revoke permission?"
          size="sm"
          onClose={() => setDeletePermId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeletePermId(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={handleDeletePerm}>Revoke</button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This will revoke this module grant from the staff profile.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Users
