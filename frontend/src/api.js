import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor for adding auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// Response interceptor: clear token + redirect to portal-aware login on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      const path = window.location.pathname
      const roles = 'admin|principal|teacher|student|staff'
      const match = path.match(new RegExp(`^/app/(${roles})\\b`))
      const portalLogin = match ? `/${match[1]}/login` : null
      const portalPublic = path.match(new RegExp(`^/(${roles})/login/?$`))
      if (!portalPublic && path !== '/login' && path !== portalLogin) {
        window.location.href = portalLogin || '/login'
      }
    }
    return Promise.reject(error)
  }
)

// ─── Auth API ────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  me: () => api.get('/auth/me'),
}

// ─── Portal API ──────────────────────────────────────────────────────────────
export const portalAPI = {
  portalLogin: (email, password, portal) =>
    api.post('/auth/portal/login', { email, password, portal }),
}

// ─── Me / permissions / scoped notices ───────────────────────────────────────
export const meAPI = {
  permissions: () => api.get('/auth/me/permissions'),
  myNotices: () => api.get('/notices/mine'),
  markNoticeRead: (id) => api.post(`/notices/${id}/read`),
}

// ─── Students API ────────────────────────────────────────────────────────────
export const studentsAPI = {
  getAll: (params) => api.get('/students/', { params }),
  getById: (id) => api.get(`/students/${id}`),
  create: (data) => api.post('/students/', data),
  update: (id, data) => api.put(`/students/${id}`, data),
  remove: (id) => api.delete(`/students/${id}`),
}

// ─── Teachers API ────────────────────────────────────────────────────────────
export const teachersAPI = {
  getAll: (params) => api.get('/teachers/', { params }),
  getById: (id) => api.get(`/teachers/${id}`),
  create: (data) => api.post('/teachers/', data),
  update: (id, data) => api.put(`/teachers/${id}`, data),
  remove: (id) => api.delete(`/teachers/${id}`),
}

// ─── Attendance API ──────────────────────────────────────────────────────────
export const attendanceAPI = {
  getAll: (params) => api.get('/attendance/', { params }),
  getById: (id) => api.get(`/attendance/${id}`),
  create: (data) => api.post('/attendance/', data),
  update: (id, data) => api.put(`/attendance/${id}`, data),
  remove: (id) => api.delete(`/attendance/${id}`),
}

// ─── Marks API ───────────────────────────────────────────────────────────────
export const marksAPI = {
  getAll: (params) => api.get('/marks/', { params }),
  getById: (id) => api.get(`/marks/${id}`),
  create: (data) => api.post('/marks/', data),
  update: (id, data) => api.put(`/marks/${id}`, data),
  remove: (id) => api.delete(`/marks/${id}`),
}

// ─── Fees API ────────────────────────────────────────────────────────────────
export const feesAPI = {
  getAll: (params) => api.get('/fees/', { params }),
  getById: (id) => api.get(`/fees/${id}`),
  create: (data) => api.post('/fees/', data),
  update: (id, data) => api.put(`/fees/${id}`, data),
  remove: (id) => api.delete(`/fees/${id}`),
}

// ─── Timetable API ───────────────────────────────────────────────────────────
export const timetableAPI = {
  getAll: (params) => api.get('/timetable/', { params }),
  getById: (id) => api.get(`/timetable/${id}`),
  create: (data) => api.post('/timetable/', data),
  update: (id, data) => api.put(`/timetable/${id}`, data),
  remove: (id) => api.delete(`/timetable/${id}`),
}

// ─── Notices API ─────────────────────────────────────────────────────────────
export const noticesAPI = {
  getAll: (params) => api.get('/notices/', { params }),
  getById: (id) => api.get(`/notices/${id}`),
  create: (data) => api.post('/notices/', data),
  update: (id, data) => api.put(`/notices/${id}`, data),
  remove: (id) => api.delete(`/notices/${id}`),
}

export const NOTICE_CATEGORIES = ['general', 'event', 'exam', 'holiday', 'emergency']

// ─── Reports API ─────────────────────────────────────────────────────────────
export const reportsAPI = {
  attendanceSummary: (params) => api.get('/reports/attendance-summary', { params }),
  gradeSummary: (params) => api.get('/reports/grade-summary', { params }),
  feeSummary: (params) => api.get('/reports/fee-summary', { params }),
  studentPerformance: (id) => api.get(`/reports/student-performance/${id}`),
}

// ─── Assignments API ─────────────────────────────────────────────────────────
export const assignmentsAPI = {
  getAll: (params) => api.get('/assignments/', { params }),
  getById: (id) => api.get(`/assignments/${id}`),
  create: (data) => api.post('/assignments/', data),
  update: (id, data) => api.put(`/assignments/${id}`, data),
  remove: (id) => api.delete(`/assignments/${id}`),
}

// ─── Calendar API ────────────────────────────────────────────────────────────
export const calendarAPI = {
  getAll: (params) => api.get('/calendar/', { params }),
  getById: (id) => api.get(`/calendar/${id}`),
  create: (data) => api.post('/calendar/', data),
  update: (id, data) => api.put(`/calendar/${id}`, data),
  remove: (id) => api.delete(`/calendar/${id}`),
}

// ─── Structure API (academic years, classes / sections) ──────────────────────
export const structureAPI = {
  academicYears: (params) => api.get('/academic-years/', { params }),
  classes: (params) => api.get('/classes/', { params }),
}

// ─── People API (staff, teacher assignments, parent links) ───────────────────
export const peopleAPI = {
  staff: (params) => api.get('/staff/', { params }),
  teacherAssignments: (params) => api.get('/teacher-assignments/', { params }),
  myTeacherAssignments: () => api.get('/teacher-assignments/', { params: { mine: true } }),
  parentLinks: (params) => api.get('/parent-links/', { params }),
}

// ─── Users API (admin only) ──────────────────────────────────────────────────
export const usersAPI = {
  getAll: (params) => api.get('/auth/users', { params }),
  register: (data) => api.post('/auth/register', data),
  update: (id, data) => api.put(`/auth/users/${id}`, data),
  remove: (id) => api.delete(`/auth/users/${id}`),
}

// ─── Staff API (admin only) ──────────────────────────────────────────────────
export const staffAPI = {
  getAll: (params) => api.get('/staff/', { params }),
  getById: (id) => api.get(`/staff/${id}`),
  create: (data) => api.post('/staff/', data),
  update: (id, data) => api.put(`/staff/${id}`, data),
  remove: (id) => api.delete(`/staff/${id}`),
  listPermissions: (params) => api.get('/staff/permissions/', { params }),
  grantPermission: (data) => api.post('/staff/permissions/', data),
  updatePermission: (id, data) => api.put(`/staff/permissions/${id}`, data),
  revokePermission: (id) => api.delete(`/staff/permissions/${id}`),
}

// ─── Parent Links API (admin only for write) ─────────────────────────────────
export const parentLinksAPI = {
  getAll: (params) => api.get('/parent-links/', { params }),
  create: (data) => api.post('/parent-links/', data),
  update: (id, data) => api.put(`/parent-links/${id}`, data),
  remove: (id) => api.delete(`/parent-links/${id}`),
}

// ─── Audit Log API (admin only) ──────────────────────────────────────────────
export const auditAPI = {
  getAll: (params) => api.get('/audit/', { params }),
}

// ═══════════════════════════════════════════════════════════════════════════
// PHASE 1–3 ERP modules (academics / hr / finance). Paths mirror the backend
// routers exactly — every collection is mounted at /api with a TRAILING SLASH.
// ═══════════════════════════════════════════════════════════════════════════

// ─── Academics · subjects ────────────────────────────────────────────────────
export const subjectsAPI = {
  getAll: (params) => api.get('/subjects/', { params }),
  getById: (id) => api.get(`/subjects/${id}`),
  create: (data) => api.post('/subjects/', data),
  update: (id, data) => api.put(`/subjects/${id}`, data),
  remove: (id) => api.delete(`/subjects/${id}`),
}

// ─── Academics · grades ──────────────────────────────────────────────────────
export const gradesAPI = {
  getAll: (params) => api.get('/grades/', { params }),
  getById: (id) => api.get(`/grades/${id}`),
  create: (data) => api.post('/grades/', data),
  update: (id, data) => api.put(`/grades/${id}`, data),
  remove: (id) => api.delete(`/grades/${id}`),
}

// ─── Academics · class-subject mapping ───────────────────────────────────────
export const classSubjectsAPI = {
  getAll: (params) => api.get('/class-subjects/', { params }),
  create: (data) => api.post('/class-subjects/', data),
  update: (id, data) => api.put(`/class-subjects/${id}`, data),
  remove: (id) => api.delete(`/class-subjects/${id}`),
}

// ─── HR · departments & designations ─────────────────────────────────────────
export const departmentsAPI = {
  getAll: (params) => api.get('/departments/', { params }),
  getById: (id) => api.get(`/departments/${id}`),
  create: (data) => api.post('/departments/', data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  remove: (id) => api.delete(`/departments/${id}`),
}

export const designationsAPI = {
  getAll: (params) => api.get('/designations/', { params }),
  getById: (id) => api.get(`/designations/${id}`),
  create: (data) => api.post('/designations/', data),
  update: (id, data) => api.put(`/designations/${id}`, data),
  remove: (id) => api.delete(`/designations/${id}`),
}

// ─── HR · employees ──────────────────────────────────────────────────────────
export const employeesAPI = {
  getAll: (params) => api.get('/employees/', { params }),
  getById: (id) => api.get(`/employees/${id}`),
  create: (data) => api.post('/employees/', data),
  update: (id, data) => api.put(`/employees/${id}`, data),
  remove: (id) => api.delete(`/employees/${id}`),
}

// ─── RBAC · roles, permissions, grants (admin only) ──────────────────────────
export const rolesAPI = {
  getAll: (params) => api.get('/roles/', { params }),
  getById: (id) => api.get(`/roles/${id}`),
  create: (data) => api.post('/roles/', data),
  update: (id, data) => api.put(`/roles/${id}`, data),
  remove: (id) => api.delete(`/roles/${id}`),
}

export const permissionsAPI = {
  getAll: (params) => api.get('/permissions/', { params }),
}

export const rolePermissionsAPI = {
  getAll: (params) => api.get('/role-permissions/', { params }),
  create: (data) => api.post('/role-permissions/', data),
  remove: (id) => api.delete(`/role-permissions/${id}`),
}

// ─── Finance · fee heads ─────────────────────────────────────────────────────
export const feeHeadsAPI = {
  getAll: (params) => api.get('/fee-heads/', { params }),
  create: (data) => api.post('/fee-heads/', data),
  update: (id, data) => api.put(`/fee-heads/${id}`, data),
  remove: (id) => api.delete(`/fee-heads/${id}`),
}

// ─── Finance · fee structures (with nested items) ────────────────────────────
export const feeStructuresAPI = {
  getAll: (params) => api.get('/fee-structures/', { params }),
  getById: (id) => api.get(`/fee-structures/${id}`),
  create: (data) => api.post('/fee-structures/', data),
  update: (id, data) => api.put(`/fee-structures/${id}`, data),
  remove: (id) => api.delete(`/fee-structures/${id}`),
  listItems: (id, params) => api.get(`/fee-structures/${id}/items/`, { params }),
  createItem: (id, data) => api.post(`/fee-structures/${id}/items/`, data),
  updateItem: (itemId, data) => api.put(`/fee-structure-items/${itemId}`, data),
  removeItem: (itemId) => api.delete(`/fee-structure-items/${itemId}`),
}

// ─── Finance · discounts & scholarships ──────────────────────────────────────
export const discountsAPI = {
  getAll: (params) => api.get('/discounts/', { params }),
  create: (data) => api.post('/discounts/', data),
  update: (id, data) => api.put(`/discounts/${id}`, data),
  remove: (id) => api.delete(`/discounts/${id}`),
}

export const scholarshipsAPI = {
  getAll: (params) => api.get('/scholarships/', { params }),
  create: (data) => api.post('/scholarships/', data),
  update: (id, data) => api.put(`/scholarships/${id}`, data),
  remove: (id) => api.delete(`/scholarships/${id}`),
}

// ─── Finance · invoices ──────────────────────────────────────────────────────
export const invoicesAPI = {
  getAll: (params) => api.get('/invoices/', { params }),
  getById: (id) => api.get(`/invoices/${id}`),
  create: (data) => api.post('/invoices/', data),
  cancel: (id, data) => api.post(`/invoices/${id}/cancel`, data || {}),
  listItems: (id, params) => api.get(`/invoices/${id}/items/`, { params }),
  createItem: (id, data) => api.post(`/invoices/${id}/items/`, data),
  updateItem: (itemId, data) => api.put(`/invoice-items/${itemId}`, data),
  removeItem: (itemId) => api.delete(`/invoice-items/${itemId}`),
}

// ─── Finance · payments ──────────────────────────────────────────────────────
export const paymentsAPI = {
  getAll: (params) => api.get('/payments/', { params }),
  getById: (id) => api.get(`/payments/${id}`),
  create: (data) => api.post('/payments/', data),
  confirm: (id, data) => api.post(`/payments/${id}/confirm`, data || {}),
  confirmWebhook: (id, data) => api.post(`/payments/${id}/confirm-webhook`, data || {}),
  fail: (id) => api.post(`/payments/${id}/fail`),
  refund: (id, data) => api.post(`/payments/${id}/refund`, data || {}),
}

// ─── Finance · expenses ──────────────────────────────────────────────────────
export const expenseCategoriesAPI = {
  getAll: (params) => api.get('/expense-categories/', { params }),
  create: (data) => api.post('/expense-categories/', data),
  update: (id, data) => api.put(`/expense-categories/${id}`, data),
  remove: (id) => api.delete(`/expense-categories/${id}`),
}

// The approve / reject / mark-paid endpoints take no request body on the backend.
export const expensesAPI = {
  getAll: (params) => api.get('/expenses/', { params }),
  create: (data) => api.post('/expenses/', data),
  update: (id, data) => api.put(`/expenses/${id}`, data),
  approve: (id) => api.post(`/expenses/${id}/approve`),
  reject: (id) => api.post(`/expenses/${id}/reject`),
  markPaid: (id) => api.post(`/expenses/${id}/mark-paid`),
}

// ─── Finance · reporting ─────────────────────────────────────────────────────
export const financeAPI = {
  summary: (params) => api.get('/finance/summary/', { params }),
  incomeStatement: (params) => api.get('/finance/income-statement/', { params }),
  outstanding: (params) => api.get('/finance/outstanding/', { params }),
}

export default api
