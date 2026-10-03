import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Bell, ChevronDown, LogOut, Menu, PanelLeft, Search, User } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { noticesAPI } from '../api'

const TITLES = {
  '/app': 'Dashboard',
  '/app/dashboard': 'Dashboard',
  '/app/admin/users': 'User Management',
  '/app/admin/audit': 'Audit Logs',
  '/app/admin': 'Admin Dashboard',
  '/app/principal': 'Principal Overview',
  '/app/vice_principal': 'Academics Desk',
  '/app/accountant': 'Accounts Desk',
  '/app/librarian': 'Library Desk',
  '/app/receptionist': 'Reception Desk',
  '/app/transport_manager': 'Transport Desk',
  '/app/staff': 'Staff Workspace',
  '/app/teacher': 'Teacher Dashboard',
  '/app/student': 'Student Dashboard',
  '/app/parent': 'Parent Dashboard',
  '/app/students': 'Students',
  '/app/teachers': 'Teachers',
  '/app/subjects': 'Subjects',
  '/app/grades': 'Grades',
  '/app/class-subjects': 'Class Subjects',
  '/app/employees': 'Employees',
  '/app/departments': 'Departments & Designations',
  '/app/admin/roles': 'Roles & Permissions',
  '/app/invoices': 'Fee Invoices',
  '/app/payments': 'Payments',
  '/app/fee-structures': 'Fee Structures',
  '/app/expenses': 'Expenses',
  '/app/finance': 'Finance Summary',
  '/app/attendance': 'Attendance',
  '/app/marks': 'Marks & Grades',
  '/app/fees': 'Fee Management',
  '/app/timetable': 'Class Timetable',
  '/app/notices': 'Notices & Announcements',
  '/app/reports': 'Reports & Analytics',
  '/app/assignments': 'Assignments',
  '/app/calendar': 'School Calendar',
}

const ROLE_LABEL = {
  admin: 'Admin Portal',
  principal: 'Principal Portal',
  vice_principal: 'Vice Principal Portal',
  staff: 'Staff Portal',
  teacher: 'Teacher Portal',
  accountant: 'Accountant Portal',
  librarian: 'Librarian Portal',
  receptionist: 'Reception Desk',
  transport_manager: 'Transport Portal',
  student: 'Student Portal',
  parent: 'Parent Portal',
}

export const SELECTED_CHILD_KEY = 'bl_selected_child'

const initials = (name = '?') =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

const TopBar = ({ user, onToggleSidebar, onOpenMobile }) => {
  const { logout, permProfile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [noticeCount, setNoticeCount] = useState(0)
  const menuRef = useRef(null)

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const parentChildren = useMemo(() => {
    if (user?.role !== 'parent') return []
    const list = permProfile?.children || permProfile?.profile?.children || []
    return Array.isArray(list) ? list : []
  }, [user, permProfile])

  const [selectedChild, setSelectedChild] = useState(() => sessionStorage.getItem(SELECTED_CHILD_KEY) || '')

  useEffect(() => {
    if (parentChildren.length > 0 && !selectedChild) {
      const first = String(parentChildren[0].student_id ?? parentChildren[0].id)
      setSelectedChild(first)
      sessionStorage.setItem(SELECTED_CHILD_KEY, first)
    }
  }, [parentChildren, selectedChild])

  const handleChildChange = (e) => {
    const id = e.target.value
    setSelectedChild(id)
    sessionStorage.setItem(SELECTED_CHILD_KEY, id)
    window.dispatchEvent(new CustomEvent('babyland:child-change', { detail: id }))
  }

  useEffect(() => {
    let mounted = true
    noticesAPI
      .getAll({ active_only: true, limit: 100 })
      .then((res) => {
        if (mounted && Array.isArray(res.data)) setNoticeCount(res.data.length)
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [location.pathname])

  useEffect(() => {
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-hamburger" onClick={onOpenMobile} aria-label="Open menu">
          <Menu size={20} />
        </button>
        <button
          className="topbar-hamburger topbar-collapse"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
        >
          <PanelLeft size={20} />
        </button>
        <div>
          <div className="topbar-heading">
            {TITLES[location.pathname] || 'BabyLand School'}
            {user?.role && (
              <span className="portal-chip">{ROLE_LABEL[user.role] || `${user.role} Portal`}</span>
            )}
          </div>
          <div className="topbar-date">{today}</div>
        </div>
      </div>

      <div className="topbar-right">
        {parentChildren.length > 0 && (
          <select
            className="filter-select topbar-child-select"
            value={selectedChild}
            onChange={handleChildChange}
            title="Switch child"
          >
            {parentChildren.map((c) => {
              const id = String(c.student_id ?? c.id)
              return (
                <option key={id} value={id}>
                  {c.name || `Student ${id}`}
                </option>
              )
            })}
          </select>
        )}
        <div className="topbar-search">
          <Search />
          <input placeholder="Search students, teachers…" disabled />
        </div>
        <Link to="/app/notices" className="topbar-icon-btn" title="Notices">
          <Bell size={19} />
          {noticeCount > 0 && (
            <span className="topbar-badge">{noticeCount > 9 ? '9+' : noticeCount}</span>
          )}
        </Link>
        <div className="topbar-user" ref={menuRef} onClick={() => setMenuOpen((o) => !o)}>
          <div className="topbar-avatar">{initials(user?.name)}</div>
          <div className="topbar-user-meta">
            <div className="topbar-user-name">{user?.name || 'User'}</div>
            <div className="topbar-user-role">
              {ROLE_LABEL[user?.role] || user?.role || ''}
            </div>
          </div>
          <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />
          {menuOpen && (
            <div className="dropdown">
              <div className="dropdown-header">
                <div style={{ fontWeight: 700 }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                  {user?.email}
                </div>
              </div>
              <button className="dropdown-item" onClick={() => navigate(`/app/${user?.role || ''}`)}>
                <User /> My Dashboard
              </button>
              <div className="dropdown-divider" />
              <button className="dropdown-item" onClick={handleLogout}>
                <LogOut /> Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export default TopBar
