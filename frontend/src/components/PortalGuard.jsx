import ProtectedRoute from './ProtectedRoute'

// Alias used by role home routes: enforces that only the owning role
// (or an admin previewing) can view the dashboard.
const PortalGuard = ({ role, children }) => (
  <ProtectedRoute roles={[role]} portal={role}>
    {children}
  </ProtectedRoute>
)

export default PortalGuard
