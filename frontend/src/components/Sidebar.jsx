import { NavLink, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard,
  Users,
  UserCog,
  ScrollText,
  GraduationCap,
  ClipboardCheck,
  Award,
  Wallet,
  CalendarDays,
  Megaphone,
  BarChart3,
  Globe,
  LogOut,
  ClipboardList,
  CalendarRange,
  BookOpen,
  Layers,
  Link2,
  Contact,
  Building2,
  ShieldCheck,
  FileText,
  CreditCard,
  Coins,
  Receipt,
  PieChart,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const HOME_LABEL = {
  admin: 'Admin Dashboard',
  principal: 'Principal Overview',
  vice_principal: 'Academics Desk',
  staff: 'Staff Workspace',
  teacher: 'Teacher Dashboard',
  accountant: 'Accounts Desk',
  librarian: 'Library Desk',
  receptionist: 'Reception Desk',
  transport_manager: 'Transport Desk',
  student: 'Student Dashboard',
  parent: 'Parent Dashboard',
}

// Per-role navigation. Only links to pages that exist.
// `roles` gates the desk; `perm: [module, action]` additionally requires a
// scoped grant (staff without an explicit permission set sees nothing).
const NAV_ITEMS = [
  { to: '/app/reports', label: 'Reports', icon: BarChart3, roles: ['admin', 'teacher', 'parent'] },
  { to: '/app/students', label: 'Students', icon: Users, roles: ['admin', 'teacher', 'staff'] },
  { to: '/app/teachers', label: 'Teachers', icon: GraduationCap, roles: ['admin'] },
  { to: '/app/admin/users', label: 'Users', icon: UserCog, roles: ['admin'] },
  { to: '/app/admin/audit', label: 'Audit Logs', icon: ScrollText, roles: ['admin'] },
  { to: '/app/attendance', label: 'Attendance', icon: ClipboardCheck, roles: ['admin', 'teacher', 'staff'] },
  { to: '/app/marks', label: 'Marks', icon: Award, roles: ['admin', 'teacher', 'student'] },
  { to: '/app/timetable', label: 'Timetable', icon: CalendarDays, roles: ['admin', 'teacher', 'staff', 'student', 'parent'] },
  { to: '/app/assignments', label: 'Assignments', icon: ClipboardList, roles: ['admin', 'teacher', 'staff', 'student', 'parent'] },
  { to: '/app/fees', label: 'Fees', icon: Wallet, roles: ['admin', 'staff', 'parent'] },
  { to: '/app/notices', label: 'Notices', icon: Megaphone, roles: ['admin', 'teacher', 'staff', 'student', 'parent'] },
  { to: '/app/calendar', label: 'Calendar', icon: CalendarRange, roles: ['admin', 'teacher', 'staff', 'student', 'parent'] },
  // ── Academics ──
  { to: '/app/subjects', label: 'Subjects', icon: BookOpen, roles: ['admin', 'principal', 'vice_principal', 'staff', 'teacher', 'accountant'] },
  { to: '/app/grades', label: 'Grades', icon: Layers, roles: ['admin', 'principal', 'vice_principal', 'staff'] },
  { to: '/app/class-subjects', label: 'Class Subjects', icon: Link2, roles: ['admin', 'principal', 'vice_principal', 'staff', 'teacher'] },
  // ── People ──
  { to: '/app/employees', label: 'Employees', icon: Contact, roles: ['admin', 'principal', 'staff'] },
  { to: '/app/departments', label: 'Departments', icon: Building2, roles: ['admin', 'principal'] },
  { to: '/app/admin/roles', label: 'Roles & Permissions', icon: ShieldCheck, roles: ['admin'] },
  // ── Finance ──
  { to: '/app/invoices', label: 'Invoices', icon: FileText, roles: ['admin', 'principal', 'vice_principal', 'accountant', 'staff'], perm: ['fees', 'read'] },
  { to: '/app/payments', label: 'Payments', icon: CreditCard, roles: ['admin', 'principal', 'vice_principal', 'accountant', 'staff'], perm: ['fees', 'read'] },
  { to: '/app/fee-structures', label: 'Fee Structures', icon: Coins, roles: ['admin', 'principal', 'vice_principal', 'accountant', 'staff'], perm: ['fees', 'read'] },
  { to: '/app/expenses', label: 'Expenses', icon: Receipt, roles: ['admin', 'principal', 'vice_principal', 'accountant'] },
  { to: '/app/finance', label: 'Finance Summary', icon: PieChart, roles: ['admin', 'principal', 'vice_principal', 'accountant'] },
]

const sectionFor = (to) => {
  if (to === '/app/reports') return 'Register'
  if (['/app/students', '/app/teachers', '/app/attendance', '/app/marks', '/app/timetable', '/app/assignments'].includes(to)) return 'Classroom'
  if (['/app/subjects', '/app/grades', '/app/class-subjects'].includes(to)) return 'Academics'
  if (['/app/employees', '/app/departments', '/app/admin/roles'].includes(to)) return 'People'
  if (['/app/invoices', '/app/payments', '/app/fee-structures', '/app/expenses', '/app/finance'].includes(to)) return 'Finance'
  return 'Office'
}

const initials = (name = '?') =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

const ROLE_DESK = {
  admin: 'Administrator desk',
  principal: "Principal's office",
  vice_principal: 'Academics desk',
  staff: 'Front office',
  teacher: 'Staff room',
  accountant: 'Accounts office',
  librarian: 'Library desk',
  receptionist: 'Reception desk',
  transport_manager: 'Transport desk',
  student: 'Classroom',
  parent: "Parent's desk",
}

const Sidebar = ({ user, collapsed, mobileOpen, onCloseMobile }) => {
  const { logout, hasRole, hasPermission } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const role = user?.role || 'admin'
  const homeTo = `/app/${role}`
  const visible = NAV_ITEMS.filter((item) => {
    if (item.roles && !hasRole(item.roles)) return false
    if (!item.perm) return true
    // Scoped grants only bind the staff desk; the finance desks are gated by role.
    if (!hasRole(item.permRoles || ['staff'])) return true
    return hasPermission(item.perm[0], item.perm[1])
  })

  let lastSection = null

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="sidebar-logo">B</div>
        <div className="sidebar-label">
          <div className="sidebar-title">BabyLand</div>
          <div className="sidebar-subtitle">{ROLE_DESK[role] || 'School register'}</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section">Register</div>
        <NavLink
          to={homeTo}
          end
          onClick={onCloseMobile}
          className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
        >
          <LayoutDashboard />
          <span className="sidebar-label">{HOME_LABEL[role] || 'Dashboard'}</span>
        </NavLink>
        {visible.map((item) => {
          const section = sectionFor(item.to)
          const header = section !== lastSection ? (
            <div key={`sec-${section}`} className="sidebar-section">
              {section}
            </div>
          ) : null
          lastSection = section
          const Icon = item.icon
          return (
            <span key={item.to}>
              {header}
              <NavLink
                to={item.to}
                onClick={onCloseMobile}
                className={({ isActive }) => `sidebar-link ${isActive ? 'active' : ''}`}
              >
                <Icon />
                <span className="sidebar-label">{item.label}</span>
              </NavLink>
            </span>
          )
        })}
      </nav>

      <div className="sidebar-footer">
        <NavLink to="/website" className="sidebar-web-link" onClick={onCloseMobile}>
          <Globe />
          <span className="sidebar-label">View Website</span>
        </NavLink>
        {user && (
          <div className="sidebar-user">
            <div className="sidebar-user-avatar">{initials(user.name)}</div>
            <div className="sidebar-user-meta sidebar-label">
              <div className="sidebar-user-name">{user.name}</div>
              <div className="sidebar-user-role">{user.role}</div>
            </div>
          </div>
        )}
        <button className="sidebar-logout" onClick={handleLogout}>
          <LogOut />
          <span className="sidebar-label">Logout</span>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
