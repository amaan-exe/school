import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, ShieldCheck, Lock, KeyRound } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { rolesAPI, permissionsAPI, rolePermissionsAPI } from '../../api'
import { errDetail, trimOrNull } from '../../utils/format'

const ACTIONS = ['read', 'write', 'create', 'delete', 'export']

const emptyRoleForm = { name: '', description: '', is_system: false }

const Roles = () => {
  const [tab, setTab] = useState('roles')

  const [roles, setRoles] = useState([])
  const [permissions, setPermissions] = useState([])
  const [grants, setGrants] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [search, setSearch] = useState('')
  const [matrixRoleId, setMatrixRoleId] = useState('')
  const [busyCell, setBusyCell] = useState('')
  const [matrixError, setMatrixError] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyRoleForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [rRes, pRes, rpRes] = await Promise.all([
        rolesAPI.getAll({ limit: 200 }),
        permissionsAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
        rolePermissionsAPI.getAll({ limit: 500 }).catch(() => ({ data: [] })),
      ])
      const roleList = Array.isArray(rRes.data) ? rRes.data : []
      setRoles(roleList)
      setPermissions(Array.isArray(pRes.data) ? pRes.data : [])
      setGrants(Array.isArray(rpRes.data) ? rpRes.data : [])
      setMatrixRoleId((prev) => {
        if (prev && roleList.some((r) => r.id === Number(prev))) return prev
        const firstNonAdmin = roleList.find((r) => r.name !== 'admin')
        return String((firstNonAdmin || roleList[0])?.id ?? '')
      })
    } catch {
      setError('Could not load roles and permissions. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const roleBadgeVariant = (name) => {
    switch (name) {
      case 'admin':
        return 'danger'
      case 'principal':
      case 'vice_principal':
        return 'primary'
      case 'teacher':
        return 'info'
      case 'staff':
      case 'accountant':
      case 'librarian':
      case 'receptionist':
      case 'transport_manager':
        return 'warning'
      case 'student':
        return 'success'
      default:
        return 'neutral'
    }
  }

  // Permission catalogue grouped into modules x actions for the matrix.
  const matrix = useMemo(() => {
    const byModule = new Map()
    permissions.forEach((p) => {
      if (!p?.module || !p?.action) return
      if (!byModule.has(p.module)) byModule.set(p.module, new Map())
      byModule.get(p.module).set(p.action, p)
    })
    const actionCols = ACTIONS.filter((a) => permissions.some((p) => p.action === a))
    const modules = [...byModule.keys()].sort()
    return { byModule, actionCols, modules }
  }, [permissions])

  const grantedIds = useMemo(() => {
    const set = new Set()
    grants.forEach((g) => set.add(`${g.role_id}:${g.permission_id}`))
    return set
  }, [grants])

  const grantIdFor = (roleId, permissionId) => {
    const hit = grants.find((g) => g.role_id === roleId && g.permission_id === permissionId)
    return hit?.id ?? null
  }

  const matrixRole = roles.find((r) => String(r.id) === String(matrixRoleId))
  const matrixRoleLocked = matrixRole?.name === 'admin'

  const grantCountFor = (roleId) => grants.filter((g) => g.role_id === roleId).length

  const toggleGrant = async (permission, granted) => {
    if (matrixRoleLocked || !matrixRole) return
    const roleId = matrixRole.id
    const cellKey = `${roleId}:${permission.id}`
    setBusyCell(cellKey)
    setMatrixError('')
    try {
      if (granted) {
        const grantId = grantIdFor(roleId, permission.id)
        if (grantId == null) return
        await rolePermissionsAPI.remove(grantId)
      } else {
        await rolePermissionsAPI.create({ role_id: roleId, permission_id: permission.id })
      }
      const rpRes = await rolePermissionsAPI.getAll({ role_id: roleId, limit: 500 })
      const refreshed = Array.isArray(rpRes.data) ? rpRes.data : []
      setGrants((prev) => [
        ...prev.filter((g) => g.role_id !== roleId),
        ...refreshed,
      ])
    } catch (err) {
      setMatrixError(errDetail(err, 'Could not update that permission. Please try again.'))
    } finally {
      setBusyCell('')
    }
  }

  const filteredRoles = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return roles
    return roles.filter(
      (r) => r.name?.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q)
    )
  }, [roles, search])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyRoleForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      name: r.name || '',
      description: r.description || '',
      is_system: !!r.is_system,
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e?.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Role name is required.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim().toLowerCase().replace(/\s+/g, '_'),
        description: trimOrNull(form.description),
        is_system: !!form.is_system,
      }
      if (editing) await rolesAPI.update(editing.id, payload)
      else await rolesAPI.create(payload)
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not save the role. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    if (deleteTarget.is_system) {
      setError('System roles cannot be deleted.')
      setDeleteTarget(null)
      return
    }
    setDeleting(true)
    try {
      await rolesAPI.remove(deleteTarget.id)
      setDeleteTarget(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the role.'))
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading roles and permissions…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Roles &amp; Permissions</div>
          <div className="page-subtitle">
            Who can do what — the role list and the module × action matrix behind every desk.
          </div>
        </div>
        {tab === 'roles' && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Add role
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'roles' ? 'active' : ''}`} onClick={() => setTab('roles')}>
          Roles ({roles.length})
        </button>
        <button className={`tab ${tab === 'matrix' ? 'active' : ''}`} onClick={() => setTab('matrix')}>
          Permission matrix
        </button>
      </div>

      {tab === 'roles' ? (
        <>
          <div className="filter-bar">
            <div className="filter-search">
              <Search />
              <input
                placeholder="Search roles…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="card">
            {filteredRoles.length === 0 ? (
              <EmptyState
                title={roles.length === 0 ? 'No roles yet' : 'No matches found'}
                desc={
                  roles.length === 0
                    ? 'Create a custom role to grant a specific desk its own access.'
                    : 'Try a different search.'
                }
                icon={ShieldCheck}
                action={
                  roles.length === 0 ? (
                    <button className="btn btn-primary" onClick={openAdd}>
                      <Plus /> Add role
                    </button>
                  ) : null
                }
              />
            ) : (
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Description</th>
                      <th>Type</th>
                      <th className="num">Permissions</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRoles.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <div className="cell-main">
                            <Badge variant={roleBadgeVariant(r.name)}>{r.name}</Badge>
                          </div>
                        </td>
                        <td>{r.description || <span className="muted-cell">—</span>}</td>
                        <td>
                          {r.is_system ? (
                            <Badge variant="neutral">
                              <Lock size={11} /> System
                            </Badge>
                          ) : (
                            <Badge variant="pink">Custom</Badge>
                          )}
                        </td>
                        <td className="num">
                          {r.name === 'admin' ? 'All' : grantCountFor(r.id)}
                        </td>
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openEdit(r)}>
                              Edit
                            </button>
                            <button
                              className="row-action"
                              onClick={() => {
                                setMatrixRoleId(String(r.id))
                                setTab('matrix')
                              }}
                            >
                              Permissions
                            </button>
                            <button
                              className="row-action danger"
                              onClick={() => setDeleteTarget(r)}
                              disabled={!!r.is_system}
                              title={r.is_system ? 'System roles cannot be deleted' : 'Delete role'}
                            >
                              {r.is_system ? 'Locked' : 'Remove'}
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
            <span className="pagination-info">
              Showing {filteredRoles.length} of {roles.length} roles · {permissions.length} permissions
              in the catalogue
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="filter-bar">
            <select
              className="filter-select"
              value={matrixRoleId}
              onChange={(e) => setMatrixRoleId(e.target.value)}
              style={{ minWidth: 220 }}
            >
              {roles.length === 0 && <option value="">No roles available</option>}
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            {matrixRole && (
              <span className={`stamp ${matrixRoleLocked ? 'stamp-chalk' : 'stamp-ink'}`}>
                {matrixRoleLocked ? 'Always everything' : `${grantCountFor(matrixRole.id)} granted`}
              </span>
            )}
            <div className="chip-tabs">
              {roles.slice(0, 6).map((r) => (
                <button
                  key={r.id}
                  className={`chip-tab ${String(r.id) === String(matrixRoleId) ? 'active' : ''}`}
                  onClick={() => setMatrixRoleId(String(r.id))}
                >
                  {r.name}
                </button>
              ))}
            </div>
          </div>

          {matrixError && <div className="form-error">{matrixError}</div>}

          {matrix.modules.length === 0 ? (
            <div className="card">
              <EmptyState
                title="No permissions in the catalogue"
                desc="The permission catalogue is empty, so there is nothing to grant yet."
                icon={KeyRound}
              />
            </div>
          ) : (
            <div className="perm-matrix">
              <div className="perm-matrix-scroll">
                <table>
                  <thead>
                    <tr>
                      <th style={{ minWidth: 190 }}>Module</th>
                      {matrix.actionCols.map((a) => (
                        <th key={a} style={{ textAlign: 'center' }}>
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.modules.map((module) => {
                      const rowActions = matrix.actionCols.filter((a) => matrix.byModule.get(module).has(a))
                      return (
                        <tr key={module}>
                          <td className="perm-module">{module}</td>
                          {matrix.actionCols.map((action) => {
                            const permission = matrix.byModule.get(module).get(action)
                            if (!permission) {
                              return (
                                <td key={action} style={{ textAlign: 'center' }}>
                                  <span className="muted-cell">—</span>
                                </td>
                              )
                            }
                            const granted = grantedIds.has(`${matrixRole?.id}:${permission.id}`)
                            const cellKey = `${matrixRole?.id}:${permission.id}`
                            return (
                              <td key={action} style={{ textAlign: 'center' }}>
                                <span className="perm-check">
                                  <input
                                    type="checkbox"
                                    checked={matrixRoleLocked ? true : granted}
                                    disabled={matrixRoleLocked || busyCell === cellKey || rowActions.length === 0}
                                    onChange={() => toggleGrant(permission, granted)}
                                    aria-label={`${action} ${module}`}
                                  />
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <div className="pagination">
            <span className="pagination-info">
              {matrix.modules.length} modules × {matrix.actionCols.length} actions
              {matrixRoleLocked
                ? ' · the administrator role holds every permission implicitly and cannot be edited here.'
                : ` · editing “${matrixRole?.name || '—'}”`}
            </span>
          </div>
        </>
      )}

      {modalOpen && (
        <Modal
          title={editing ? 'Edit role' : 'Add a new role'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add role'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-group">
              <label className="form-label">
                Role name<span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="librarian"
              />
              <div className="form-hint">
                Use a short lowercase slug — this is the value stored on each user account.
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="What this desk is responsible for…"
              />
            </div>
            <label className="status-toggle active-present" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.is_system}
                disabled={!!editing?.is_system}
                onChange={(e) => setForm({ ...form, is_system: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              System role (cannot be deleted)
            </label>
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete role?"
          size="sm"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            The “{deleteTarget.name}” role and its {grantCountFor(deleteTarget.id)} grants will be
            removed. Users still holding this role will fall back to their default access.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Roles