import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { GraduationCap, ArrowRight, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

// Shared login form for the 5 role portals
const STAMP_CLASS = {
  admin: 'stamp-ink',
  principal: 'stamp-ink',
  teacher: 'stamp-ink',
  student: 'stamp-ink',
  staff: 'stamp-ink',
}

const DEMO_PRESETS = {
  admin: { email: 'admin@babyland.com', pass: 'admin123' },
  principal: { email: 'principal@babyland.com', pass: 'principal123' },
  teacher: { email: 'teacher@babyland.com', pass: 'teacher123' },
  student: { email: 'student@babyland.com', pass: 'student123' },
  staff: { email: 'staff@babyland.com', pass: 'staff123' },
}

const PortalLogin = ({ role, title, subtitle, accent = '#4F46E5' }) => {
  const { loginWithPortal } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [belongsTo, setBelongsTo] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const demo = DEMO_PRESETS[role]

  const fillDemo = () => {
    if (demo) {
      setEmail(demo.email)
      setPassword(demo.pass)
      setError('')
      setBelongsTo('')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setBelongsTo('')
    setSubmitting(true)
    try {
      const userData = await loginWithPortal(email.trim(), password, role)
      const from = location.state?.from?.pathname
      navigate(from || `/app/${userData?.role || role}`, { replace: true })
    } catch (err) {
      const detail = err.detail || err.response?.data?.detail || ''
      if (err.response?.status === 403 && detail) {
        // "Use the {role} portal" -> tell the user which portal is theirs
        const m = String(detail).match(/Use the (\w+) portal/i)
        const other = m ? m[1] : ''
        setBelongsTo(other)
        setError(
          other
            ? `This slip belongs at the ${other} desk, not here.`
            : String(detail)
        )
      } else {
        setError(detail || 'Login failed. Please check your credentials.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="slip-page">
      <div>
        <form className="slip-card" onSubmit={handleSubmit}>
          <div className="slip-crest">
            <GraduationCap />
          </div>
          <div className="slip-school">Babyland Public School · Est. 2011</div>
          <h1 className="slip-title">{title} Sign In</h1>
          <div className="slip-stamp-row">
            <span className={`stamp ${STAMP_CLASS[role] || 'stamp-ink'}`}>{role} portal</span>
          </div>
          <p className="slip-sub" style={{ marginTop: 10 }}>
            {subtitle}
          </p>

          <div className="slip-perf" />

          {error && (
            <div className="form-error">
              {error}{' '}
              {belongsTo && (
                <Link
                  to={`/${belongsTo}/login`}
                  style={{ fontWeight: 700, textDecoration: 'underline' }}
                >
                  Go to the {belongsTo} desk →
                </Link>
              )}
            </div>
          )}

          <div className="form-group">
            <label className="form-label" htmlFor="email">
              Email address<span className="required">*</span>
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              placeholder="you@babyland.school"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password<span className="required">*</span>
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="Your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={submitting}>
            {submitting ? (
              <>
                <span className="spinner spinner-sm" style={{ borderTopColor: '#FFFFFF' }} /> Signing
                in…
              </>
            ) : (
              <>
                Sign in to {title} Desk <ArrowRight />
              </>
            )}
          </button>

          <div className="slip-links">
            <Link to="/portals" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ArrowLeft size={14} /> All 5 Portals
            </Link>
            <Link to="/login">General login</Link>
          </div>

          {demo && (
            <div className="slip-footnote">
              Trying the demo? Use <code>{demo.email}</code> · <code>{demo.pass}</code> —{' '}
              <button
                type="button"
                onClick={fillDemo}
                style={{
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                  fontWeight: 700,
                  background: 'none',
                  border: 'none',
                  color: 'var(--primary)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                fill it in for me
              </button>
            </div>
          )}
        </form>
        <Link to="/website" className="slip-back">
          ← Back to Babyland Public School Website
        </Link>
      </div>
    </div>
  )
}

export default PortalLogin
