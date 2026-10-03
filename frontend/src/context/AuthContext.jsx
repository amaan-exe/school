import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import api from '../api'

const AuthContext = createContext(null)

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('token'))
  const [loading, setLoading] = useState(true)
  const [permissions, setPermissions] = useState([])
  const [permProfile, setPermProfile] = useState(null)

  const fetchPermissions = useCallback(async () => {
    try {
      const res = await api.get('/auth/me/permissions')
      const data = res.data || {}
      setPermissions(Array.isArray(data.permissions) ? data.permissions : [])
      setPermProfile(data)
      return data
    } catch {
      setPermissions([])
      setPermProfile(null)
      return null
    }
  }, [])

  // Validate token on mount via GET /auth/me (+ permissions)
  useEffect(() => {
    const validateToken = async () => {
      const storedToken = localStorage.getItem('token')
      if (storedToken) {
        try {
          const response = await api.get('/auth/me')
          setUser(response.data)
          setToken(storedToken)
          await fetchPermissions()
        } catch {
          localStorage.removeItem('token')
          setToken(null)
          setUser(null)
          setPermissions([])
          setPermProfile(null)
        }
      }
      setLoading(false)
    }
    validateToken()
  }, [fetchPermissions])

  const persistSession = useCallback(
    async (newToken, userData) => {
      localStorage.setItem('token', newToken)
      setToken(newToken)
      setUser(userData)
      await fetchPermissions()
      return userData
    },
    [fetchPermissions]
  )

  const login = useCallback(
    async (email, password) => {
      const response = await api.post('/auth/login', { email, password })
      // Backend returns { access_token, token_type, user }
      const { access_token: newToken, user: userData } = response.data
      return persistSession(newToken, userData)
    },
    [persistSession]
  )

  const loginWithPortal = useCallback(
    async (email, password, portal) => {
      try {
        const response = await api.post('/auth/portal/login', { email, password, portal })
        const { access_token: newToken, user: userData } = response.data
        return persistSession(newToken, userData)
      } catch (err) {
        // Surface the server's detail message (e.g. "Use the teacher portal") on 403
        const detail = err.response?.data?.detail
        if (detail) {
          const e = new Error(typeof detail === 'string' ? detail : 'Login failed.')
          e.response = err.response
          e.detail = detail
          throw e
        }
        throw err
      }
    },
    [persistSession]
  )

  const logout = useCallback(() => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    setPermissions([])
    setPermProfile(null)
  }, [])

  const hasRole = useCallback(
    (roles) => {
      if (!user) return false
      if (!roles || roles.length === 0) return true
      return roles.includes(user.role)
    },
    [user]
  )

  // hasPermission(module, action): true when the permissions list grants it.
  // Admins implicitly hold every permission. Empty permissions list for a
  // non-admin means "no scoped grants" (deny write actions, allow reads).
  const hasPermission = useCallback(
    (module, action) => {
      if (!user) return false
      if (user.role === 'admin') return true
      if (!module) return true
      const act = action || 'view'
      return permissions.some((p) => {
        if (typeof p === 'string') {
          const [m, a] = p.split(':')
          return m === module && (!a || a === act || a === '*')
        }
        if (p && typeof p === 'object') {
          const m = p.module || p.resource || p.name
          const a = p.action || p.permission
          return m === module && (!a || a === act || a === '*')
        }
        return false
      })
    },
    [user, permissions]
  )

  const isAuthenticated = !!token && !!user

  const value = {
    user,
    token,
    login,
    loginWithPortal,
    logout,
    hasRole,
    hasPermission,
    permissions,
    permProfile,
    refreshPermissions: fetchPermissions,
    isAuthenticated,
    loading,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider
