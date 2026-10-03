import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import PortalGuard from './components/PortalGuard'
import PortalLogin from './components/PortalLogin'
import LoadingSpinner from './components/LoadingSpinner'
import { PORTAL_ROLES } from './components/ProtectedRoute'
import Dashboard from './pages/Dashboard'
import AdminDashboard from './pages/admin/AdminDashboard'
import Users from './pages/admin/Users'
import AuditLog from './pages/admin/AuditLog'
import StaffDashboard from './pages/staff/StaffDashboard'
import TeacherDashboard from './pages/teacher/TeacherDashboard'
import StudentDashboard from './pages/student/StudentDashboard'
import ParentDashboard from './pages/parent/ParentDashboard'
import Students from './pages/Students'
import Teachers from './pages/Teachers'
import Subjects from './pages/academics/Subjects'
import Grades from './pages/academics/Grades'
import ClassSubjects from './pages/academics/ClassSubjects'
import Employees from './pages/hr/Employees'
import Departments from './pages/hr/Departments'
import Roles from './pages/admin/Roles'
import Invoices from './pages/finance/Invoices'
import Payments from './pages/finance/Payments'
import FeeStructures from './pages/finance/FeeStructures'
import Expenses from './pages/finance/Expenses'
import FinanceSummary from './pages/finance/FinanceSummary'
import PrincipalDashboard from './pages/principal/PrincipalDashboard'
import VicePrincipalDashboard from './pages/vice_principal/VicePrincipalDashboard'
import AccountantDashboard from './pages/accountant/AccountantDashboard'
import LibrarianDashboard from './pages/librarian/LibrarianDashboard'
import ReceptionistDashboard from './pages/receptionist/ReceptionistDashboard'
import TransportManagerDashboard from './pages/transport/TransportManagerDashboard'
import Attendance from './pages/Attendance'
import Marks from './pages/Marks'
import Fees from './pages/Fees'
import Timetable from './pages/Timetable'
import Login from './pages/Login'
import Notices from './pages/Notices'
import Reports from './pages/Reports'
import Assignments from './pages/Assignments'
import Calendar from './pages/Calendar'
import Website from './pages/Website'
import Portals from './pages/Portals'

// Portal accent values stay on the prop contract (PortalLogin accepts
// `accent`); the indigo/violet system renders each portal's own chip colour
// from the token palette instead.
const PORTAL_META = {
  admin: {
    title: 'Administrator',
    subtitle: 'The whole school in view — people, classes, fees, reports and settings.',
    accent: '#2563EB',
  },
  principal: {
    title: 'Principal',
    subtitle: 'School-wide performance, academics and the numbers the board asks for.',
    accent: '#D97706',
  },
  teacher: {
    title: 'Teachers',
    subtitle: 'Your classes, timetable, register, grading and assignments.',
    accent: '#059669',
  },
  student: {
    title: 'Students',
    subtitle: 'Your register, marks, timetable, homework and school notices.',
    accent: '#4F46E5',
  },
  staff: {
    title: 'Staff',
    subtitle: 'Front-office work — admissions, fee collection, notices and the daily desk.',
    accent: '#7C3AED',
  },
}

// Roles that own a dedicated home route under /app/{role}.
const ROLE_HOME_ROUTES = [
  { role: 'principal', element: <PrincipalDashboard /> },
  { role: 'vice_principal', element: <VicePrincipalDashboard /> },
  { role: 'accountant', element: <AccountantDashboard /> },
  { role: 'librarian', element: <LibrarianDashboard /> },
  { role: 'receptionist', element: <ReceptionistDashboard /> },
  { role: 'transport_manager', element: <TransportManagerDashboard /> },
]

// /app index: send each role to its own home
function RoleRedirect() {
  const { user, loading } = useAuth()
  if (loading) return <LoadingSpinner message="Loading your dashboard…" />
  const role = user?.role
  if (role && PORTAL_ROLES.includes(role)) {
    return <Navigate to={`/app/${role}`} replace />
  }
  return <Navigate to="/login" replace />
}

function App() {
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<Navigate to="/website" replace />} />
      <Route path="/website" element={<Website />} />
      <Route path="/login" element={<Login />} />
      <Route path="/portals" element={<Portals />} />
      {Object.entries(PORTAL_META).map(([role, meta]) => (
        <Route
          key={role}
          path={`/${role}/login`}
          element={
            <PortalLogin role={role} title={meta.title} subtitle={meta.subtitle} accent={meta.accent} />
          }
        />
      ))}

      {/* Protected App Routes */}
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleRedirect />} />
        {/* Role homes (admin may preview other role homes) */}
        <Route
          path="admin"
          element={
            <PortalGuard role="admin">
              <AdminDashboard />
            </PortalGuard>
          }
        />
        <Route
          path="staff"
          element={
            <PortalGuard role="staff">
              <StaffDashboard />
            </PortalGuard>
          }
        />
        <Route
          path="teacher"
          element={
            <PortalGuard role="teacher">
              <TeacherDashboard />
            </PortalGuard>
          }
        />
        <Route
          path="student"
          element={
            <PortalGuard role="student">
              <StudentDashboard />
            </PortalGuard>
          }
        />
        <Route
          path="parent"
          element={
            <PortalGuard role="parent">
              <ParentDashboard />
            </PortalGuard>
          }
        />
        {/* Phase 1–3 role homes (one per new desk) */}
        {ROLE_HOME_ROUTES.map(({ role, element }) => (
          <Route
            key={role}
            path={role}
            element={
              <PortalGuard role={role}>
                {element}
              </PortalGuard>
            }
          />
        ))}
        {/* Academics · curriculum structure */}
        <Route
          path="subjects"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'staff', 'teacher', 'accountant']}>
              <Subjects />
            </ProtectedRoute>
          }
        />
        <Route
          path="grades"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'staff']}>
              <Grades />
            </ProtectedRoute>
          }
        />
        <Route
          path="class-subjects"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'staff', 'teacher']}>
              <ClassSubjects />
            </ProtectedRoute>
          }
        />
        {/* People · HR */}
        <Route
          path="employees"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'staff']}>
              <Employees />
            </ProtectedRoute>
          }
        />
        <Route
          path="departments"
          element={
            <ProtectedRoute roles={['admin', 'principal']}>
              <Departments />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/roles"
          element={
            <ProtectedRoute roles={['admin']}>
              <Roles />
            </ProtectedRoute>
          }
        />
        {/* Finance · Phase 3 */}
        <Route
          path="invoices"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'accountant', 'staff']}>
              <Invoices />
            </ProtectedRoute>
          }
        />
        <Route
          path="payments"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'accountant', 'staff']}>
              <Payments />
            </ProtectedRoute>
          }
        />
        <Route
          path="fee-structures"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'accountant']}>
              <FeeStructures />
            </ProtectedRoute>
          }
        />
        <Route
          path="expenses"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'accountant']}>
              <Expenses />
            </ProtectedRoute>
          }
        />
        <Route
          path="finance"
          element={
            <ProtectedRoute roles={['admin', 'principal', 'vice_principal', 'accountant']}>
              <FinanceSummary />
            </ProtectedRoute>
          }
        />
        {/* Shared modules (backend returns role-scoped data) */}
        <Route
          path="students"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'staff']}>
              <Students />
            </ProtectedRoute>
          }
        />
        <Route
          path="teachers"
          element={
            <ProtectedRoute roles={['admin']}>
              <Teachers />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/users"
          element={
            <ProtectedRoute roles={['admin']}>
              <Users />
            </ProtectedRoute>
          }
        />
        <Route
          path="admin/audit"
          element={
            <ProtectedRoute roles={['admin']}>
              <AuditLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="attendance"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'staff']}>
              <Attendance />
            </ProtectedRoute>
          }
        />
        <Route
          path="marks"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'student']}>
              <Marks />
            </ProtectedRoute>
          }
        />
        <Route
          path="fees"
          element={
            <ProtectedRoute roles={['admin', 'staff', 'parent']}>
              <Fees />
            </ProtectedRoute>
          }
        />
        <Route
          path="timetable"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'staff', 'student', 'parent']}>
              <Timetable />
            </ProtectedRoute>
          }
        />
        <Route
          path="notices"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'staff', 'student', 'parent']}>
              <Notices />
            </ProtectedRoute>
          }
        />
        <Route
          path="reports"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'parent']}>
              <Reports />
            </ProtectedRoute>
          }
        />
        <Route
          path="assignments"
          element={
            <ProtectedRoute roles={['admin', 'teacher', 'staff', 'student', 'parent']}>
              <Assignments />
            </ProtectedRoute>
          }
        />
        <Route
          path="calendar"
          element={
            <ProtectedRoute>
              <Calendar />
            </ProtectedRoute>
          }
        />
        {/* Legacy dashboard path still works */}
        <Route
          path="dashboard"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
      </Route>

      {/* Catch all - redirect to website */}
      <Route path="*" element={<Navigate to="/website" replace />} />
    </Routes>
  )
}

export default App
