import { useEffect, useMemo, useState } from 'react'
import { Plus, Search, Coins, Trash2, Pencil } from 'lucide-react'
import Modal from '../../components/Modal'
import EmptyState from '../../components/EmptyState'
import LoadingSpinner from '../../components/LoadingSpinner'
import Badge from '../../components/Badge'
import {
  feeStructuresAPI,
  feeHeadsAPI,
  discountsAPI,
  scholarshipsAPI,
  gradesAPI,
  structureAPI,
} from '../../api'
import { useAuth } from '../../context/AuthContext'
import { errDetail, fmtMoney, inputNumber, optInt, optNum, trimOrNull } from '../../utils/format'

const PERIODICITIES = ['one-time', 'term', 'monthly', 'quarterly', 'annual']

const emptyItem = () => ({
  fee_head_id: '',
  amount: '',
  periodicity: 'one-time',
  due_date: '',
  is_mandatory: true,
})

const emptyHead = { name: '', description: '', is_active: true }
const emptyDiscount = { name: '', type: 'fixed', value: '', description: '', is_active: true }
const emptyScholarship = {
  name: '',
  description: '',
  amount: '',
  percentage: '',
  academic_year_id: '',
  max_recipients: '',
  is_active: true,
}

const FeeStructures = () => {
  const { hasRole } = useAuth()
  // Fee heads, structures, discounts and scholarships are admin-only writes on
  // the backend; the finance desks get read-only visibility of the catalogue.
  const canWrite = hasRole(['admin'])

  const [tab, setTab] = useState('structures')
  const [structures, setStructures] = useState([])
  const [heads, setHeads] = useState([])
  const [discounts, setDiscounts] = useState([])
  const [scholarships, setScholarships] = useState([])
  const [grades, setGrades] = useState([])
  const [years, setYears] = useState([])
  const [classes, setClasses] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [busyId, setBusyId] = useState(null)

  // structure modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)

  // heads modal
  const [headModal, setHeadModal] = useState(false)
  const [editingHead, setEditingHead] = useState(null)
  const [headForm, setHeadForm] = useState(emptyHead)
  const [headSaving, setHeadSaving] = useState(false)
  const [headError, setHeadError] = useState('')
  const [deleteHeadId, setDeleteHeadId] = useState(null)

  // discounts modal
  const [discModal, setDiscModal] = useState(false)
  const [editingDisc, setEditingDisc] = useState(null)
  const [discForm, setDiscForm] = useState(emptyDiscount)
  const [discSaving, setDiscSaving] = useState(false)
  const [discError, setDiscError] = useState('')
  const [deleteDiscId, setDeleteDiscId] = useState(null)

  // scholarships modal
  const [schModal, setSchModal] = useState(false)
  const [editingSch, setEditingSch] = useState(null)
  const [schForm, setSchForm] = useState(emptyScholarship)
  const [schSaving, setSchSaving] = useState(false)
  const [schError, setSchError] = useState('')
  const [deleteSchId, setDeleteSchId] = useState(null)

  const fetchAll = async () => {
    setLoading(true)
    setError('')
    try {
      const [stRes, headRes, discRes, schRes, gradeRes, yrRes, clsRes] = await Promise.all([
        feeStructuresAPI.getAll({ include_inactive: true, limit: 200 }).catch(() => ({ data: [] })),
        feeHeadsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
        discountsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
        scholarshipsAPI.getAll({ limit: 200 }).catch(() => ({ data: [] })),
        gradesAPI.getAll({ limit: 100 }).catch(() => ({ data: [] })),
        structureAPI.academicYears({ limit: 100 }).catch(() => ({ data: [] })),
        structureAPI.classes({ limit: 500 }).catch(() => ({ data: [] })),
      ])
      setStructures(Array.isArray(stRes.data) ? stRes.data : [])
      setHeads(Array.isArray(headRes.data) ? headRes.data : [])
      setDiscounts(Array.isArray(discRes.data) ? discRes.data : [])
      setScholarships(Array.isArray(schRes.data) ? schRes.data : [])
      setGrades(Array.isArray(gradeRes.data) ? gradeRes.data : [])
      setYears(Array.isArray(yrRes.data) ? yrRes.data : [])
      setClasses(Array.isArray(clsRes.data) ? clsRes.data : [])
    } catch {
      setError('Could not load fee structures. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
  }, [])

  const headName = (id) => heads.find((h) => h.id === id)?.name || '—'
  const gradeName = (id) => grades.find((g) => g.id === id)?.name
  const yearName = (id) => years.find((y) => y.id === id)?.name
  const className = (id) => classes.find((c) => c.id === id)?.class_name

  const matches = (q, ...fields) => {
    if (!q) return true
    return fields.some((f) => (f || '').toString().toLowerCase().includes(q))
  }

  const filteredStructures = useMemo(() => {
    const q = search.trim().toLowerCase()
    return structures.filter((s) => matches(q, s.name, s.description))
  }, [structures, search])

  const filteredHeads = useMemo(() => {
    const q = search.trim().toLowerCase()
    return heads.filter((h) => matches(q, h.name, h.description))
  }, [heads, search])

  const filteredDiscounts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return discounts.filter((d) => matches(q, d.name, d.description))
  }, [discounts, search])

  const filteredScholarships = useMemo(() => {
    const q = search.trim().toLowerCase()
    return scholarships.filter((s) => matches(q, s.name, s.description))
  }, [scholarships, search])

  const formTotal = useMemo(
    () =>
      (form.items || []).reduce((sum, it) => {
        const amount = Number(it.amount)
        return sum + (Number.isFinite(amount) ? amount : 0)
      }, 0),
    [form.items]
  )

  // ── Structures ──
  const openAddStructure = () => {
    setEditing(null)
    setForm({
      name: '',
      academic_year_id: '',
      grade_id: '',
      class_section_id: '',
      description: '',
      is_active: true,
      items: [emptyItem()],
    })
    setFormError('')
    setModalOpen(true)
  }

  const openEditStructure = (s) => {
    setEditing(s)
    setForm({
      name: s.name || '',
      academic_year_id: s.academic_year_id ? String(s.academic_year_id) : '',
      grade_id: s.grade_id ? String(s.grade_id) : '',
      class_section_id: s.class_section_id ? String(s.class_section_id) : '',
      description: s.description || '',
      is_active: s.is_active !== false,
      items: (s.items || []).map((it) => ({
        id: it.id,
        fee_head_id: String(it.fee_head_id ?? ''),
        amount: inputNumber(it.amount),
        periodicity: it.periodicity || 'one-time',
        due_date: it.due_date || '',
        is_mandatory: it.is_mandatory !== false,
      })),
    })
    setFormError('')
    setModalOpen(true)
  }

  const setItem = (index, key, value) =>
    setForm((f) => ({
      ...f,
      items: f.items.map((it, i) => (i === index ? { ...it, [key]: value } : it)),
    }))

  const saveStructure = async (e) => {
    e?.preventDefault()
    setFormError('')
    if (!form.name.trim()) {
      setFormError('Structure name is required.')
      return
    }
    if (!editing && !(form.items || []).some((it) => Number(it.amount) > 0)) {
      setFormError('Add at least one fee line with an amount.')
      return
    }
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        academic_year_id: optInt(form.academic_year_id),
        grade_id: optInt(form.grade_id),
        class_section_id: optInt(form.class_section_id),
        description: trimOrNull(form.description),
        is_active: !!form.is_active,
      }
      if (editing) {
        await feeStructuresAPI.update(editing.id, payload)
      } else {
        await feeStructuresAPI.create({
          ...payload,
          items: form.items
            .filter((it) => Number.isFinite(Number(it.amount)) && Number(it.amount) >= 0)
            .map((it) => ({
              fee_head_id: optInt(it.fee_head_id),
              amount: Number(it.amount),
              periodicity: it.periodicity,
              due_date: it.due_date || null,
              is_mandatory: !!it.is_mandatory,
            })),
        })
      }
      setModalOpen(false)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not save the fee structure. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  // Editing lines of a saved structure goes through the item endpoints.
  const addItemRow = async () => {
    if (!editing) {
      setForm((f) => ({ ...f, items: [...f.items, emptyItem()] }))
      return
    }
    // Every item needs a real fee head — fall back to the first one on file.
    const fallbackHead = heads[0]?.id
    if (!fallbackHead) {
      setFormError('Create a fee head before adding fee lines.')
      return
    }
    setBusyId('new-item')
    try {
      await feeStructuresAPI.createItem(editing.id, {
        fee_head_id: fallbackHead,
        amount: 0,
        periodicity: 'one-time',
        is_mandatory: true,
      })
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not add a fee line.'))
    } finally {
      setBusyId(null)
    }
  }

  const removeItemRow = async (item) => {
    if (!editing) {
      setForm((f) => ({ ...f, items: f.items.filter((it) => it !== item) }))
      return
    }
    if (!item?.id) return
    setBusyId(item.id)
    try {
      await feeStructuresAPI.removeItem(item.id)
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not remove that fee line.'))
    } finally {
      setBusyId(null)
    }
  }

  const saveItemRow = async (item) => {
    if (!item?.id) return
    setBusyId(item.id)
    try {
      await feeStructuresAPI.updateItem(item.id, {
        fee_head_id: optInt(item.fee_head_id),
        amount: Number(item.amount) || 0,
        periodicity: item.periodicity,
        due_date: item.due_date || null,
        is_mandatory: !!item.is_mandatory,
      })
      fetchAll()
    } catch (err) {
      setFormError(errDetail(err, 'Could not save that fee line.'))
    } finally {
      setBusyId(null)
    }
  }

  const handleDeleteStructure = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await feeStructuresAPI.remove(deleteTarget.id)
      setDeleteTarget(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the fee structure.'))
      setDeleteTarget(null)
    } finally {
      setDeleting(false)
    }
  }

  // ── Fee heads ──
  const openHead = (h) => {
    setEditingHead(h || null)
    setHeadForm(h ? { name: h.name || '', description: h.description || '', is_active: h.is_active !== false } : emptyHead)
    setHeadError('')
    setHeadModal(true)
  }

  const saveHead = async (e) => {
    e?.preventDefault()
    setHeadError('')
    if (!headForm.name.trim()) {
      setHeadError('Fee head name is required.')
      return
    }
    setHeadSaving(true)
    try {
      const payload = {
        name: headForm.name.trim(),
        description: trimOrNull(headForm.description),
        is_active: !!headForm.is_active,
      }
      if (editingHead) await feeHeadsAPI.update(editingHead.id, payload)
      else await feeHeadsAPI.create(payload)
      setHeadModal(false)
      fetchAll()
    } catch (err) {
      setHeadError(errDetail(err, 'Could not save the fee head.'))
    } finally {
      setHeadSaving(false)
    }
  }

  const deleteHead = async () => {
    if (!deleteHeadId) return
    setDeleting(true)
    try {
      await feeHeadsAPI.remove(deleteHeadId)
      setDeleteHeadId(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the fee head.'))
      setDeleteHeadId(null)
    } finally {
      setDeleting(false)
    }
  }

  // ── Discounts ──
  const openDisc = (d) => {
    setEditingDisc(d || null)
    setDiscForm(
      d
        ? {
            name: d.name || '',
            type: d.type || 'fixed',
            value: inputNumber(d.value),
            description: d.description || '',
            is_active: d.is_active !== false,
          }
        : emptyDiscount
    )
    setDiscError('')
    setDiscModal(true)
  }

  const saveDisc = async (e) => {
    e?.preventDefault()
    setDiscError('')
    if (!discForm.name.trim()) {
      setDiscError('Discount name is required.')
      return
    }
    const value = Number(discForm.value)
    if (!Number.isFinite(value) || value < 0) {
      setDiscError('Enter a valid value.')
      return
    }
    if (discForm.type === 'percentage' && value > 100) {
      setDiscError('A percentage discount cannot exceed 100.')
      return
    }
    setDiscSaving(true)
    try {
      const payload = {
        name: discForm.name.trim(),
        type: discForm.type,
        value,
        description: trimOrNull(discForm.description),
        is_active: !!discForm.is_active,
      }
      if (editingDisc) await discountsAPI.update(editingDisc.id, payload)
      else await discountsAPI.create(payload)
      setDiscModal(false)
      fetchAll()
    } catch (err) {
      setDiscError(errDetail(err, 'Could not save the discount.'))
    } finally {
      setDiscSaving(false)
    }
  }

  const deleteDisc = async () => {
    if (!deleteDiscId) return
    setDeleting(true)
    try {
      await discountsAPI.remove(deleteDiscId)
      setDeleteDiscId(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the discount.'))
      setDeleteDiscId(null)
    } finally {
      setDeleting(false)
    }
  }

  // ── Scholarships ──
  const openSch = (s) => {
    setEditingSch(s || null)
    setSchForm(
      s
        ? {
            name: s.name || '',
            description: s.description || '',
            amount: inputNumber(s.amount),
            percentage: inputNumber(s.percentage),
            academic_year_id: s.academic_year_id ? String(s.academic_year_id) : '',
            max_recipients: inputNumber(s.max_recipients),
            is_active: s.is_active !== false,
          }
        : emptyScholarship
    )
    setSchError('')
    setSchModal(true)
  }

  const saveSch = async (e) => {
    e?.preventDefault()
    setSchError('')
    if (!schForm.name.trim()) {
      setSchError('Scholarship name is required.')
      return
    }
    setSchSaving(true)
    try {
      const payload = {
        name: schForm.name.trim(),
        description: trimOrNull(schForm.description),
        amount: optNum(schForm.amount),
        percentage: optNum(schForm.percentage),
        academic_year_id: optInt(schForm.academic_year_id),
        max_recipients: optInt(schForm.max_recipients),
        is_active: !!schForm.is_active,
      }
      if (editingSch) await scholarshipsAPI.update(editingSch.id, payload)
      else await scholarshipsAPI.create(payload)
      setSchModal(false)
      fetchAll()
    } catch (err) {
      setSchError(errDetail(err, 'Could not save the scholarship.'))
    } finally {
      setSchSaving(false)
    }
  }

  const deleteSch = async () => {
    if (!deleteSchId) return
    setDeleting(true)
    try {
      await scholarshipsAPI.remove(deleteSchId)
      setDeleteSchId(null)
      fetchAll()
    } catch (err) {
      setError(errDetail(err, 'Could not delete the scholarship.'))
      setDeleteSchId(null)
    } finally {
      setDeleting(false)
    }
  }

  const structureCount = filteredStructures.length
  const tabMeta = {
    structures: { label: `Fee structures (${structures.length})`, total: structureCount, of: structures.length },
    heads: { label: `Fee heads (${heads.length})`, total: filteredHeads.length, of: heads.length },
    discounts: {
      label: `Discounts (${discounts.length})`,
      total: filteredDiscounts.length,
      of: discounts.length,
    },
    scholarships: {
      label: `Scholarships (${scholarships.length})`,
      total: filteredScholarships.length,
      of: scholarships.length,
    },
  }

  if (loading) return <LoadingSpinner message="Loading fee structures…" />

  return (
    <div>
      <div className="page-header">
        <div>
          <div className="page-title">Fee Structures</div>
          <div className="page-subtitle">
            What a family owes — structures, fee heads, discounts and scholarships.
          </div>
        </div>
        {canWrite && (
          <div className="page-actions">
            <button
              className="btn btn-primary"
              onClick={
                tab === 'structures'
                  ? openAddStructure
                  : tab === 'heads'
                  ? () => openHead(null)
                  : tab === 'discounts'
                  ? () => openDisc(null)
                  : () => openSch(null)
              }
            >
              <Plus />
              {tab === 'structures'
                ? 'New structure'
                : tab === 'heads'
                ? 'New fee head'
                : tab === 'discounts'
                ? 'New discount'
                : 'New scholarship'}
            </button>
          </div>
        )}
      </div>

      {error && <div className="form-error">{error}</div>}

      <div className="tabs">
        {['structures', 'heads', 'discounts', 'scholarships'].map((key) => (
          <button key={key} className={`tab ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>
            {tabMeta[key].label}
          </button>
        ))}
      </div>

      <div className="filter-bar">
        <div className="filter-search">
          <Search />
          <input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* ── Structures ── */}
      {tab === 'structures' && (
        <div className="card">
          {filteredStructures.length === 0 ? (
            <EmptyState
              title={structures.length === 0 ? 'No fee structures yet' : 'No matches found'}
              desc={
                structures.length === 0
                  ? 'Build a structure with its fee lines so invoices can be raised from it.'
                  : 'Try a different search.'
              }
              icon={Coins}
              action={
                canWrite && structures.length === 0 ? (
                  <button className="btn btn-primary" onClick={openAddStructure}>
                    <Plus /> New structure
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Structure</th>
                    <th>Year</th>
                    <th>Grade / section</th>
                    <th className="num">Lines</th>
                    <th className="num">Total</th>
                    <th>Status</th>
                    {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredStructures.map((s) => {
                    const lines = s.items || []
                    const total = lines.reduce(
                      (sum, it) => sum + (Number(it.amount) || 0),
                      0
                    )
                    return (
                      <tr key={s.id}>
                        <td>
                          <div className="cell-name">{s.name}</div>
                          {s.description && <div className="cell-sub">{s.description}</div>}
                        </td>
                        <td>{yearName(s.academic_year_id) || <span className="muted-cell">—</span>}</td>
                        <td>
                          {gradeName(s.grade_id) || 'All grades'}
                          {s.class_section_id ? ` · ${className(s.class_section_id) || `#${s.class_section_id}`}` : ''}
                        </td>
                        <td className="num">{lines.length}</td>
                        <td className="num">{fmtMoney(total)}</td>
                        <td>
                          {s.is_active === false ? (
                            <Badge variant="neutral">Inactive</Badge>
                          ) : (
                            <Badge variant="success">Active</Badge>
                          )}
                        </td>
                        {canWrite && (
                          <td>
                            <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                              <button className="row-action" onClick={() => openEditStructure(s)}>
                                Edit
                              </button>
                              <button
                                className="row-action danger"
                                onClick={() => setDeleteTarget(s)}
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Fee heads ── */}
      {tab === 'heads' && (
        <div className="card">
          {filteredHeads.length === 0 ? (
            <EmptyState
              title={heads.length === 0 ? 'No fee heads yet' : 'No matches found'}
              desc={
                heads.length === 0
                  ? 'Fee heads are the buckets an invoice line falls into — tuition, transport, lab.'
                  : 'Try a different search.'
              }
              icon={Coins}
              action={
                canWrite && heads.length === 0 ? (
                  <button className="btn btn-primary" onClick={() => openHead(null)}>
                    <Plus /> New fee head
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fee head</th>
                    <th>Description</th>
                    <th>Status</th>
                    {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredHeads.map((h) => (
                    <tr key={h.id}>
                      <td className="cell-name">{h.name}</td>
                      <td>{h.description || <span className="muted-cell">—</span>}</td>
                      <td>
                        {h.is_active === false ? (
                          <Badge variant="neutral">Inactive</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      {canWrite && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openHead(h)}>
                              Edit
                            </button>
                            <button className="row-action danger" onClick={() => setDeleteHeadId(h.id)}>
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

      {/* ── Discounts ── */}
      {tab === 'discounts' && (
        <div className="card">
          {filteredDiscounts.length === 0 ? (
            <EmptyState
              title={discounts.length === 0 ? 'No discounts yet' : 'No matches found'}
              desc={
                discounts.length === 0
                  ? 'Add a sibling, merit or early-bird discount to apply on invoices.'
                  : 'Try a different search.'
              }
              icon={Coins}
              action={
                canWrite && discounts.length === 0 ? (
                  <button className="btn btn-primary" onClick={() => openDisc(null)}>
                    <Plus /> New discount
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Discount</th>
                    <th>Type</th>
                    <th className="num">Value</th>
                    <th>Status</th>
                    {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredDiscounts.map((d) => (
                    <tr key={d.id}>
                      <td>
                        <div className="cell-name">{d.name}</div>
                        {d.description && <div className="cell-sub">{d.description}</div>}
                      </td>
                      <td>
                        <Badge variant="pink">{d.type}</Badge>
                      </td>
                      <td className="num">
                        {d.type === 'percentage' ? `${Number(d.value) || 0}%` : fmtMoney(d.value)}
                      </td>
                      <td>
                        {d.is_active === false ? (
                          <Badge variant="neutral">Inactive</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      {canWrite && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openDisc(d)}>
                              Edit
                            </button>
                            <button className="row-action danger" onClick={() => setDeleteDiscId(d.id)}>
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

      {/* ── Scholarships ── */}
      {tab === 'scholarships' && (
        <div className="card">
          {filteredScholarships.length === 0 ? (
            <EmptyState
              title={scholarships.length === 0 ? 'No scholarships yet' : 'No matches found'}
              desc={
                scholarships.length === 0
                  ? 'Define a merit or need-based scholarship the office can award.'
                  : 'Try a different search.'
              }
              icon={Coins}
              action={
                canWrite && scholarships.length === 0 ? (
                  <button className="btn btn-primary" onClick={() => openSch(null)}>
                    <Plus /> New scholarship
                  </button>
                ) : null
              }
            />
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Scholarship</th>
                    <th className="num">Amount</th>
                    <th className="num">Percent</th>
                    <th className="num">Recipients</th>
                    <th>Status</th>
                    {canWrite && <th style={{ textAlign: 'right' }}>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredScholarships.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div className="cell-name">{s.name}</div>
                        {s.description && <div className="cell-sub">{s.description}</div>}
                      </td>
                      <td className="num">{s.amount != null ? fmtMoney(s.amount) : '—'}</td>
                      <td className="num">{s.percentage != null ? `${Number(s.percentage) || 0}%` : '—'}</td>
                      <td className="num">{s.max_recipients ?? '—'}</td>
                      <td>
                        {s.is_active === false ? (
                          <Badge variant="neutral">Inactive</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </td>
                      {canWrite && (
                        <td>
                          <div className="table-actions" style={{ justifyContent: 'flex-end' }}>
                            <button className="row-action" onClick={() => openSch(s)}>
                              Edit
                            </button>
                            <button className="row-action danger" onClick={() => setDeleteSchId(s.id)}>
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
          Showing {tabMeta[tab].total} of {tabMeta[tab].of} records
        </span>
      </div>

      {/* ── Structure modal ── */}
      {modalOpen && (
        <Modal
          size="lg"
          title={editing ? `Edit ${editing.name}` : 'New fee structure'}
          onClose={() => setModalOpen(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveStructure} disabled={saving}>
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create structure'}
              </button>
            </>
          }
        >
          <form onSubmit={saveStructure}>
            {formError && <div className="form-error">{formError}</div>}
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">
                  Name<span className="required">*</span>
                </label>
                <input
                  className="form-input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Grade 10 · 2026-27"
                />
              </div>
              <div className="form-group">
                <label className="form-label">Academic year</label>
                <select
                  className="form-select"
                  value={form.academic_year_id}
                  onChange={(e) => setForm({ ...form, academic_year_id: e.target.value })}
                >
                  <option value="">Any year</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Grade</label>
                <select
                  className="form-select"
                  value={form.grade_id}
                  onChange={(e) => setForm({ ...form, grade_id: e.target.value })}
                >
                  <option value="">All grades</option>
                  {grades.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Class section</label>
                <select
                  className="form-select"
                  value={form.class_section_id}
                  onChange={(e) => setForm({ ...form, class_section_id: e.target.value })}
                >
                  <option value="">All sections</option>
                  {classes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.class_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>

            <div className="item-editor">
              <div className="item-editor-head">
                <span className="kicker">Fee lines</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={addItemRow} disabled={busyId === 'new-item'}>
                  <Plus size={14} /> Add line
                </button>
              </div>
              {(form.items || []).length === 0 && (
                <p className="form-hint" style={{ margin: 0 }}>
                  No fee lines yet — add tuition, transport or lab to build the structure.
                </p>
              )}
              {(form.items || []).map((item, index) => (
                <div className="item-row" key={item.id ?? `new-${index}`}>
                  <div className="form-group" style={{ gridColumn: 'span 3' }}>
                    <label className="form-label">Fee head</label>
                    <select
                      className="form-select"
                      value={item.fee_head_id}
                      onChange={(e) => setItem(index, 'fee_head_id', e.target.value)}
                    >
                      <option value="">Select…</option>
                      {heads.map((h) => (
                        <option key={h.id} value={h.id}>
                          {h.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Amount</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="form-input"
                      value={item.amount}
                      onChange={(e) => setItem(index, 'amount', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Periodicity</label>
                    <select
                      className="form-select"
                      value={item.periodicity}
                      onChange={(e) => setItem(index, 'periodicity', e.target.value)}
                    >
                      {PERIODICITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Due date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={item.due_date || ''}
                      onChange={(e) => setItem(index, 'due_date', e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 2' }}>
                    <label className="form-label">Mandatory</label>
                    <select
                      className="form-select"
                      value={item.is_mandatory ? '1' : '0'}
                      onChange={(e) => setItem(index, 'is_mandatory', e.target.value === '1')}
                    >
                      <option value="1">Mandatory</option>
                      <option value="0">Optional</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 1' }}>
                    <label className="form-label">&nbsp;</label>
                    {editing && item.id ? (
                      <button
                        type="button"
                        className="row-action success"
                        onClick={() => saveItemRow(item)}
                        disabled={busyId === item.id}
                      >
                        <Pencil size={13} /> Save
                      </button>
                    ) : (
                      <span className="muted-cell" style={{ fontSize: 12 }}>
                        saved on create
                      </span>
                    )}
                  </div>
                  <div className="form-group" style={{ gridColumn: 'span 1' }}>
                    <label className="form-label">&nbsp;</label>
                    <button
                      type="button"
                      className="row-action danger"
                      onClick={() => removeItemRow(item)}
                      disabled={busyId === item.id}
                    >
                      <Trash2 size={13} /> Remove
                    </button>
                  </div>
                </div>
              ))}
              <div className="item-row-total">
                <span>Structure total</span>
                <span>{fmtMoney(formTotal)}</span>
              </div>
            </div>
            {editing && (
              <div className="form-hint">
                Lines are written individually once the structure exists — use Save on a line to push
                its changes, or Remove to drop it.
              </div>
            )}
          </form>
        </Modal>
      )}

      {deleteTarget && (
        <Modal
          title="Delete fee structure?"
          size="sm"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={handleDeleteStructure} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            “{deleteTarget.name}” and its fee lines will be permanently removed. Invoices already raised
            keep their own snapshot of lines.
          </p>
        </Modal>
      )}

      {headModal && (
        <Modal
          title={editingHead ? 'Edit fee head' : 'New fee head'}
          onClose={() => setHeadModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setHeadModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveHead} disabled={headSaving}>
                {headSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form onSubmit={saveHead}>
            {headError && <div className="form-error">{headError}</div>}
            <div className="form-group">
              <label className="form-label">
                Name<span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={headForm.name}
                onChange={(e) => setHeadForm({ ...headForm, name: e.target.value })}
                placeholder="Tuition"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={headForm.description}
                onChange={(e) => setHeadForm({ ...headForm, description: e.target.value })}
              />
            </div>
            <label className="status-toggle active-present" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!headForm.is_active}
                onChange={(e) => setHeadForm({ ...headForm, is_active: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Active
            </label>
          </form>
        </Modal>
      )}

      {deleteHeadId && (
        <Modal
          title="Delete fee head?"
          size="sm"
          onClose={() => setDeleteHeadId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteHeadId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={deleteHead} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Fee structures and invoices that use this head keep their amount, but lose the category.
          </p>
        </Modal>
      )}

      {discModal && (
        <Modal
          title={editingDisc ? 'Edit discount' : 'New discount'}
          onClose={() => setDiscModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDiscModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveDisc} disabled={discSaving}>
                {discSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form onSubmit={saveDisc}>
            {discError && <div className="form-error">{discError}</div>}
            <div className="form-group">
              <label className="form-label">
                Name<span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={discForm.name}
                onChange={(e) => setDiscForm({ ...discForm, name: e.target.value })}
                placeholder="Sibling discount"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Type</label>
                <select
                  className="form-select"
                  value={discForm.type}
                  onChange={(e) => setDiscForm({ ...discForm, type: e.target.value })}
                >
                  <option value="fixed">fixed</option>
                  <option value="percentage">percentage</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">
                  Value<span className="required">*</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={discForm.value}
                  onChange={(e) => setDiscForm({ ...discForm, value: e.target.value })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={discForm.description}
                onChange={(e) => setDiscForm({ ...discForm, description: e.target.value })}
              />
            </div>
            <label className="status-toggle active-present" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!discForm.is_active}
                onChange={(e) => setDiscForm({ ...discForm, is_active: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Active
            </label>
          </form>
        </Modal>
      )}

      {deleteDiscId && (
        <Modal
          title="Delete discount?"
          size="sm"
          onClose={() => setDeleteDiscId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteDiscId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={deleteDisc} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            Invoices already billed keep the discount amount that was applied.
          </p>
        </Modal>
      )}

      {schModal && (
        <Modal
          title={editingSch ? 'Edit scholarship' : 'New scholarship'}
          onClose={() => setSchModal(false)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setSchModal(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveSch} disabled={schSaving}>
                {schSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          }
        >
          <form onSubmit={saveSch}>
            {schError && <div className="form-error">{schError}</div>}
            <div className="form-group">
              <label className="form-label">
                Name<span className="required">*</span>
              </label>
              <input
                className="form-input"
                value={schForm.name}
                onChange={(e) => setSchForm({ ...schForm, name: e.target.value })}
                placeholder="Merit scholarship"
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Amount</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="form-input"
                  value={schForm.amount}
                  onChange={(e) => setSchForm({ ...schForm, amount: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Percentage</label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className="form-input"
                  value={schForm.percentage}
                  onChange={(e) => setSchForm({ ...schForm, percentage: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Max recipients</label>
                <input
                  type="number"
                  min="0"
                  className="form-input"
                  value={schForm.max_recipients}
                  onChange={(e) => setSchForm({ ...schForm, max_recipients: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Academic year</label>
                <select
                  className="form-select"
                  value={schForm.academic_year_id}
                  onChange={(e) => setSchForm({ ...schForm, academic_year_id: e.target.value })}
                >
                  <option value="">Any year</option>
                  {years.map((y) => (
                    <option key={y.id} value={y.id}>
                      {y.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <input
                className="form-input"
                value={schForm.description}
                onChange={(e) => setSchForm({ ...schForm, description: e.target.value })}
              />
            </div>
            <label className="status-toggle active-present" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!schForm.is_active}
                onChange={(e) => setSchForm({ ...schForm, is_active: e.target.checked })}
                style={{ marginRight: 8 }}
              />
              Active
            </label>
          </form>
        </Modal>
      )}

      {deleteSchId && (
        <Modal
          title="Delete scholarship?"
          size="sm"
          onClose={() => setDeleteSchId(null)}
          footer={
            <>
              <button className="btn btn-secondary" onClick={() => setDeleteSchId(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={deleteSch} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          }
        >
          <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>
            This scholarship will be permanently removed from the catalogue.
          </p>
        </Modal>
      )}
    </div>
  )
}

export default FeeStructures