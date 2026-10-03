import { Link, Navigate, useLocation } from 'react-router-dom'
import { ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

// 5 canonical school portals (Admin, Principal, Teachers, Students, Staff)
export const PORTAL_ROLES = [
  'admin',
  'principal',
  'teacher',
  'student',
  'staff',
]

const ROLE_ALT = PORTAL_ROLES.join('|')
const PORTAL_PATH_RE = new RegExp(`^/(app/(${ROLE_ALT})|(${ROLE_ALT}))(/|$)`)
const ROLE_HOME_RE = new RegExp(`^/app/(${ROLE_ALT})/?$`)

const portalLoginForPath = (pathname) => {
  const match = pathname.match(PORTAL_PATH_RE)
  if (match) {
    const role = match[2] || match[3]
    return `/${role}/login`
  }
  return '/login'
}

const ProtectedRoute = ({ children, roles, permissions, portal }) => {
  const { isAuthenticated, hasRole, hasPermission, loading, user } = useAuth()
  const location = useLocation()

  if (loading) {
    return <LoadingSpinner message="Checking authentication..." />
  }

  if (!isAuthenticated) {
    const loginPath = portal ? `/${portal}/login` : portalLoginForPath(location.pathname)
    return <Navigate to={loginPath} state={{ from: location }} replace />
  }

  const requiredRoles = roles || (portal ? [portal] : null)
  if (requiredRoles && requiredRoles.length > 0) {
    // Admins may preview other role homes/dashboards
    const isRoleHome = ROLE_HOME_RE.test(location.pathname)
    const adminPreview = user?.role === 'admin' && isRoleHome
    if (!adminPreview && !hasRole(requiredRoles)) {
      return (
        <div className="loading-container">
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShieldAlert size={28} />
            </div>
            <div className="empty-state-title">Access Denied</div>
            <div className="empty-state-desc">
              You don&apos;t have permission to access this page. You are signed in as{' '}
              <strong>{user?.role}</strong>. Please go to your own dashboard.
            </div>
            <Link to={`/app/${user?.role}`} className="btn btn-primary btn-sm">
              Go to my dashboard
            </Link>
          </div>
        </div>
      )
    }
  }

  if (permissions && permissions.length > 0) {
    const denied = permissions.some(({ module, action }) => !hasPermission(module, action))
    if (denied) {
      return (
        <div className="loading-container">
          <div className="empty-state">
            <div className="empty-state-icon">
              <ShieldAlert size={28} />
            </div>
            <div className="empty-state-title">Access Denied</div>
            <div className="empty-state-desc">
              Your account doesn&apos;t include the required permissions for this page.
            </div>
            <Link to={`/app/${user?.role}`} className="btn btn-primary btn-sm">
              Go to my dashboard
            </Link>
          </div>
        </div>
      )
    }
  }

  return children
}

export default ProtectedRoute
