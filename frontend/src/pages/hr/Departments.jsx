import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Building2 } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import { departmentsAPI, designationsAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, optInt, trimOrNull } from '../../utils/format'

const emptyDept = { name: '', description: '' }
const emptyDesignation = { name: '', department_id: '', grade_of_employment: '' }

const Departments = () => {
  const { hasRole, hasPermission } = useAuth()
  const canWrite = hasRole(['admin']) && hasPermission('hr', 'write')

  const [tab, setTab] = useState('departments')
  const [departments, setDepartments] = useState([])
  const [designations, setDesignations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')

  const [deptModal, setDeptModal] = useState(false)
  const [editingDept, setEditingDept] = useState(null)
  const [deptForm, setDeptForm] = useState(emptyDept)
  const [deptSaving, setDeptSaving] = useState(false)
  const [deptFormError, setDeptFormError] = useState('')
  const [deleteDeptId, setDeleteDeptId] = useState(null)

  const [desModal, setDesModal] = useState(false)
  const [editingDes, setEditingDes] = useState(null)
  const [desForm, setDesForm] = useState(emptyDesignation)
  const [desSaving, setDesSaving] = useState(false)
  const [desFormError, setDesFormError] = useState('')
  const [deleteDesId, setDeleteDesId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [dRes, desRes] = await Promise.all([
        departmentsAPI.getAll({ limit: 200 }),
        designationsAPI.getAll({ limit: 200 }),
      ])
      setDepartments(Array.isArray(dRes.data) ? dRes.data : [])
      setDesignations(Array.isArray(desRes.data) ? desRes.data : [])
    } catch {
      setError('Could not load departments. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const deptName = (id) => departments.find((d) => d.id === id)?.name

  const filteredDepts = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return departments
    return departments.filter(
      (d) => d.name?.toLowerCase().includes(q) || d.description?.toLowerCase().includes(q)
    )
  }, [departments, search])

  const filteredDesignations = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return designations
    return designations.filter(
      (d) => d.name?.toLowerCase().includes(q) || d.grade_of_employment?.toLowerCase().includes(q)
    )
  }, [designations, search])

  // ── Departments ──
  const openAddDept = () => {
    setEditingDept(null)
    setDeptForm(emptyDept)
    setDeptFormError('')
    setDeptModal(true)
  }

  const openEditDept = (d) => {
    setEditingDept(d)
    setDeptForm({ name: d.name || '', description: d.description || '' })
    setDeptFormError('')
    setDeptModal(true)
  }

  const saveDept = async (e) => {
    e?.preventDefault()
    setDeptFormError('')
    if (!deptForm.name.trim()) {
      setDeptFormError('Department name is required.')
      return
    }
    setDeptSaving(true)
    try {
      const payload = {
        name: deptForm.name.trim(),
        description: trimOrNull(deptForm.description),
      }
      if (editingDept) await departmentsAPI.update(editingDept.id, payload)
      else await departmentsAPI.create(payload)
      setDeptModal(false)
      fetchAll()
    } catch (err) {
      setDeptFormError(errDetail(err, 'Could not save the department. Please try again.'))
    } finally {
      setDeptSaving(false)
    }
  }

  // ── Designations ──
  const openAddDes = () => {
    setEditingDes(null)
    setDesForm(emptyDesignation)
    setDesFormError('')
    setDesModal(true)
  }

  const openEditDes = (d) => {
    setEditingDes(d)
    setDesForm({
      name: d.name || '',
      department_id: d.department_id ? String(d.department_id) : '',
      grade_of_employment: d.grade_of_employment || '',
    })
    setDesFormError('')
    setDesModal(true)
  }

  const saveDes = async (e) => {
    e?.preventDefault()
    setDesFormError('')
    if (!desForm.name.trim()) {
      setDesFormError('Designation name is required.')
      return
    }
    setDesSaving(true)
    try {
      const payload = {
        name: desForm.name.trim(),
        department_id: optInt(desForm.department_id),
        grade_of_employment: trimOrNull(desForm.grade_of_employment),
      }
      if (editingDes) await designationsAPI.update(editingDes.id, payload)
      else await designationsAPI.create(payload)
      setDesModal(false)
      fetchAll()
    } catch (err) {
      setDesFormError(errDetail(err, 'Could not save the designation. Please try again.'))
    } finally {
      setDesSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteDeptId && !deleteDesId) return
    setDeleting(true)
    try {
      if (deleteDeptId) await departmentsAPI.remove(deleteDeptId)
      else await designationsAPI.remove(deleteDesId)
      setDeleteDeptId(null)
      setDeleteDesId(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete this record.'))
      setDeleteDeptId(null)
      setDeleteDesId(null)
    } finally {
      setDeleting(false)
    }
  }

  if (loading) return <LoadingSpinner message="Loading departments…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Departments</div>
          <div className="page-subtitle">
            The org chart behind every employee — departments and the designations inside them.
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={tab === 'departments' ? openAddDept : openAddDes}>
              <Plus /> {tab === 'departments' ? 'Add department' : 'Add designation'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="tabs">
        <button className={`tab ${tab === 'departments' ? 'active' : ''}`} onClick={() => setTab('departments')}>
          Departments ({departments.length})
        </button>
        <button
          className={`tab ${tab === 'designations' ? 'active' : ''}`}
          onClick={() => setTab('designations')}
        >
          Designations ({designations.length})
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder={tab === 'departments' ? 'Search departments…' : 'Search designations…'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {tab === 'departments' ? (
        <div className="card">
          {filteredDepts.length === 0 ? (
            <EmptyState
              title={departments.length === 0 ? 'No departments yet' : 'No matches found'}
              desc={
                departments.length === 0
                  ? 'Start with the departments your school is divided into.'
                  : 'Try a different search.'
              }
              icon={Building2}
              action={
                canWrite && departments.length === 0 ? (
                  <button className="btn btn-primary" onClick={openAddDept}>
                    <Plus /> Add department
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Description</th>
                    <th className="num">Designations</th>
                    {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredDepts.map((d) => (
                    <tr key={d.id}>
                      <td className="cell-name">{d.name}</td>
                      <td>{d.description || <span className="muted-cell">—</span>}</td>
                      <td className="num">
                        {designations.filter((x) => x.department_id === d.id).length}
                      </td>
                      {canWrite && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openEditDept(d)}>
                              Edit
                            </button>
                            <button className="row-action danger" onClick={() => setDeleteDeptId(d.id)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="card">
          {filteredDesignations.length === 0 ? (
            <EmptyState
              title={designations.length === 0 ? 'No designations yet' : 'No matches found'}
              desc={
                designations.length === 0
                  ? 'Add the job titles staff can hold inside each department.'
                  : 'Try a different search.'
              }
              icon={Building2}
              action={
                canWrite && designations.length === 0 ? (
                  <button className="btn btn-primary" onClick={openAddDes}>
                    <Plus /> Add designation
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Designation</th>
                    <th>Department</th>
                    <th>Grade of employment</th>
                    {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredDesignations.map((d) => (
                    <tr key={d.id}>
                      <td className="cell-name">{d.name}</td>
                      <td>{deptName(d.department_id) || <span className="muted-cell">—</span>}</td>
                      <td>{d.grade_of_employment || <span className="muted-cell">—</span>}</td>
                      {canWrite && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openEditDes(d)}>
                              Edit
                            </button>
                            <button className="row-action danger" onClick={() => setDeleteDesId(d.id)}>
                              Remove
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="pagination">
        <span className="pagination-info">
          {tab === 'departments'
            ? `Showing ${filteredDepts.length} of ${departments.length} departments`
            : `Showing ${filteredDesignations.length} of ${designations.length} designations`}
        </span>
      </div>

      {deptModal && (
        <Modal
          title={editingDept ? 'Edit department' : 'Add a new department'}
          onClose={() => setDeptModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeptModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveDept} disabled={deptSaving}>
                {deptSaving ? 'Saving…' : editingDept ? 'Save changes' : 'Add department'}
              </button>
            </>
          }
        >
          <form onSubmit={saveDept}>
            {deptFormError && <div className="form-error">{deptFormError}</div>}
            <div className="form-group">
              <label className="form-label">
                Name<span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                placeholder="Mathematics"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea
                className="form-textarea"
                value={deptForm.description}
                onChange={(e) => setDeptForm({ ...deptForm, description: e.target.value })}
              />
            </div>
          </form>
        </Modal>
      )}

      {desModal && (
        <Modal
          title={editingDes ? 'Edit designation' : 'Add a new designation'}
          onClose={() => setDesModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDesModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveDes} disabled={desSaving}>
                {desSaving ? 'Saving…' : editingDes ? 'Save changes' : 'Add designation'}
              </button>
            </>
          }
        >
          <form onSubmit={saveDes}>
            {desFormError && <div className="form-error">{desFormError}</div>}
            <div className="form-group">
              <label className="form-label">
                Name<span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={desForm.name}
                onChange={(e) => setDesForm({ ...desForm, name: e.target.value })}
                placeholder="Head of Department"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Department</label>
                <select
                  className="form-select"
                  value={desForm.department_id}
                  onChange={(e) => setDesForm({ ...desForm, department_id: e.target.value })}
                >
                  <option value="">No department</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Grade of employment</label>
                <input
                  className="form-input"
                  value={desForm.grade_of_employment}
                  onChange={(e) => setDesForm({ ...desForm, grade_of_employment: e.target.value })}
                  placeholder="A-3"
                />
              </div>
            </div>
          </form>
        </Modal>
      )}

      {(deleteDeptId || deleteDesId) && (
        <Modal
          title={deleteDeptId ? 'Delete department?' : 'Delete designation?'}
          size="sm"
          onClose={() => {
            setDeleteDeptId(null)
            setDeleteDesId(null)
          }}
          footer={
            <>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setDeleteDeptId(null)
                  setDeleteDesId(null)
                }}
              >
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            {deleteDeptId
              ? 'Employees in this department keep their record but lose the department link.'
              : 'This designation will be permanently removed.'}
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Departments