import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Contact } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import { employeesAPI, departmentsAPI, designationsAPI } from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, optInt, trimOrNull } from '../../utils/format'

const EMPLOYEE_TYPES = ['teacher', 'administrative', 'support', 'driver', 'security', 'other']

const typeVariant = (t) => {
  switch (t) {
    case 'teacher': return 'info'
    case 'administrative': return 'primary'
    case 'support': return 'neutral'
    case 'driver': return 'pink'
    case 'security': return 'warning'
    default: return 'neutral'
  }
}

const initials = (first = '', last = '') =>
  `${(first || '?')[0]}${(last || '')[0] || ''}`.toUpperCase()

const emptyForm = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  employee_code: '',
  department_id: '',
  designation_id: '',
  employee_type: 'teacher',
  date_of_joining: '',
  date_of_birth: '',
  gender: '',
  address: '',
  is_active: true,
  emergency_contact_name: '',
  emergency_contact_phone: '',
}

const Employees = () => {
  const { hasRole, hasPermission } = useAuth()
  const canWrite = hasRole(['admin']) && hasPermission('hr', 'write')
  const [employees, setEmployees] = useState([])
  const [departments, setDepartments] = useState([])
  const [designations, setDesignations] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const params = { limit: 500 }
      if (search.trim()) params.q = search.trim()
      if (deptFilter !== 'all') params.department_id = deptFilter
      if (typeFilter !== 'all') params.employee_type = typeFilter
      const [empRes, deptRes, desRes] = await Promise.all([
        employeesAPI.getAll(params),
        departmentsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
        designationsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
      ])
      setEmployees(Array.isArray(empRes.data) ? empRes.data : [])
      setDepartments(Array.isArray(deptRes.data) ? deptRes.data : [])
      setDesignations(Array.isArray(desRes.data) ? desRes.data : [])
    } catch {
      setError('Could not load employees. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // Fetch once, then filter again on the client so typing stays instant.
  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deptFilter, typeFilter])

  const deptName = (id) => departments.find((d) => d.id === id)?.name
  const designationName = (id) => designations.find((d) => d.id === id)?.name

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return employees.filter((e) => {
      if (!q) return true
      return (
        e.first_name?.toLowerCase().includes(q) ||
        e.last_name?.toLowerCase().includes(q) ||
        e.email?.toLowerCase().includes(q) ||
        e.employee_code?.toLowerCase().includes(q)
      )
    })
  }, [employees, search])

  const openAdd = () => {
    setEditing(null)
    setForm(emptyForm)
    setFormError('')
    setModalOpen(true)
  }

  const openEdit = (e) => {
    setEditing(e)
    setForm({
      first_name: e.first_name || '',
      last_name: e.last_name || '',
      email: e.email || '',
      phone: e.phone || '',
      employee_code: e.employee_code || '',
      department_id: e.department_id ? String(e.department_id) : '',
      designation_id: e.designation_id ? String(e.designation_id) : '',
      employee_type: e.employee_type || 'teacher',
      date_of_joining: e.date_of_joining || '',
      date_of_birth: e.date_of_birth || '',
      gender: e.gender || '',
      address: e.address || '',
      is_active: e.is_active !== false,
      emergency_contact_name: e.emergency_contact_name || '',
      emergency_contact_phone: e.emergency_contact_phone || '',
    })
    setFormError('')
    setModalOpen(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!form.first_name.trim()) {
      setFormError('First name is required.')
      return
    }
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setFormError('Please enter a valid email address.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: trimOrNull(form.last_name),
        email: trimOrNull(form.email),
        phone: trimOrNull(form.phone),
        employee_code: trimOrNull(form.employee_code),
        department_id: optInt(form.department_id),
        designation_id: optInt(form.designation_id),
        employee_type: form.employee_type || null,
        date_of_joining: form.date_of_joining || null,
        date_of_birth: form.date_of_birth || null,
        gender: trimOrNull(form.gender),
        address: trimOrNull(form.address),
        is_active: !!form.is_active,
        emergency_contact_name: trimOrNull(form.emergency_contact_name),
        emergency_contact_phone: trimOrNull(form.emergency_contact_phone),
      }
      if (editing) await employeesAPI.update(editing.id, payload)
      else await employeesAPI.create(payload)
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not save the employee. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await employeesAPI.remove(deleteId)
      setDeleteId(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the employee.'))
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  const setField = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  if (loading) return <LoadingSpinner message="Loading employees…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">
            Employees <span className="accent-word">({employees.length})</span>
          </div>
          <div className="page-subtitle">
            Every member of staff on the register — teaching, admin, support and drivers.
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button className="btn btn-primary" onClick={openAdd}>
              <Plus /> Add employee
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input
            placeholder="Search name, email or code…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="filter-select"
          value={deptFilter}
          onChange={(e) => setDeptFilter(e.target.value)}
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select
          className="filter-select"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          {EMPLOYEE_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {filtered.length === 0 ? (
          <EmptyState
            title={employees.length === 0 ? 'No employees yet' : 'No matches found'}
            desc={
              employees.length === 0
                ? 'Add your first employee record to start the HR register.'
                : 'Try a different search or filter.'
            }
            icon={Contact}
            action={
              canWrite && employees.length === 0 ? (
                <button className="btn btn-primary" onClick={openAdd}>
                  <Plus /> Add employee
                </button>
              ) : null
            }
          />
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Type</th>
                  <th>Department</th>
                  <th>Designation</th>
                  <th>Joined</th>
                  <th>Status</th>
                  {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <div className="cell-main">
                        <div className="avatar">{initials(emp.first_name, emp.last_name)}</div>
                        <div>
                          <div className="cell-name">
                            {[emp.first_name, emp.last_name].filter(Boolean).join(' ')}
                          </div>
                          <div className="cell-sub">
                            {emp.email || emp.employee_code || '—'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {emp.employee_type ? (
                        <Badge variant={typeVariant(emp.employee_type)}>{emp.employee_type}</Badge>
                      ) : (
                        <span className="muted-cell">—</span>
                      )}
                    </td>
                    <td>{deptName(emp.department_id) || <span className="muted-cell">—</span>}</td>
                    <td>
                      {designationName(emp.designation_id) || <span className="muted-cell">—</span>}
                    </td>
                    <td>{emp.date_of_joining || <span className="muted-cell">—</span>}</td>
                    <td>
                      {emp.is_active === false ? (
                        <Badge variant="neutral">Inactive</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </td>
                    {canWrite && (
                      <td>
                        <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                          <button className="row-action" onClick={() => openEdit(emp)}>
                            Edit
                          </button>
                          <button className="row-action danger" onClick={() => setDeleteId(emp.id)}>
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
      <div className="pagination">
        <span className="pagination-info">
          Showing {filtered.length} of {employees.length} employees
        </span>
      </div>

      {modalOpen && (
        <Modal
          size="lg"
          title={editing ? 'Edit employee' : 'Add a new employee'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Add employee'}
              </button>
            </>
          }
        >
          <form onSubmit={handleSave}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-grid-2">
              <div className="form-group">
                <label className="form-label">
                  First name<span className="required">*</span>
                </label>
                <input className="form-input" value={form.first_name} onChange={setField('first_name')} />
              </div>
              <div className="form-group">
                <label className="form-label">Last name</label>
                <input className="form-input" value={form.last_name} onChange={setField('last_name')} />
              </div>
              <div className="form-group">
                <label className="form-label">Email</label>
                <input type="email" className="form-input" value={form.email} onChange={setField('email')} />
              </div>
              <div className="form-group">
                <label className="form-label">Phone</label>
                <input className="form-input" value={form.phone} onChange={setField('phone')} />
              </div>
              <div className="form-group">
                <label className="form-label">Employee code</label>
                <input
                  className="form-input"
                  value={form.employee_code}
                  onChange={setField('employee_code')}
                  placeholder="EMP-014"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Employee type</label>
                <select className="form-select" value={form.employee_type} onChange={setField('employee_type')}>
                  {EMPLOYEE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select
                  className="form-select"
                  value={form.department_id}
                  onChange={(e) => setForm({ ...form, department_id: e.target.value, designation_id: '' })}
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
                <label className="form-label">Designation</label>
                <select
                  className="form-select"
                  value={form.designation_id}
                  onChange={setField('designation_id')}
                >
                  <option value="">No designation</option>
                  {designations
                    .filter(
                      (d) => !form.department_id || !d.department_id || String(d.department_id) === form.department_id
                    )
                    .map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Date of joining</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.date_of_joining}
                  onChange={setField('date_of_joining')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Date of birth</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.date_of_birth}
                  onChange={setField('date_of_birth')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Gender</label>
                <input className="form-input" value={form.gender} onChange={setField('gender')} placeholder="female" />
              </div>
              <div className="form-group">
                <label className="form-label">Emergency contact</label>
                <input
                  className="form-input"
                  value={form.emergency_contact_name}
                  onChange={setField('emergency_contact_name')}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Emergency phone</label>
                <input
                  className="form-input"
                  value={form.emergency_contact_phone}
                  onChange={setField('emergency_contact_phone')}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Address</label>
              <textarea
                className="form-textarea"
                value={form.address}
                onChange={setField('address')}
                placeholder="Residential address…"
              />
            </div>
            <label className="status-toggle active-present" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!form.is_active}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Currently employed
            </label>
          </form>
        </Modal>
      )}

      {deleteId && (
        <Modal
          title="Delete employee?"
          size="sm"
          onClose={() => setDeleteId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This employee record will be permanently removed.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default Employees