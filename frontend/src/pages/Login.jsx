import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { GraduationCap, ArrowRight } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

const Login = () => {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const userData = await login(email.trim(), password)
      const role = userData?.role
      navigate(role ? `/app/${role}` : '/app')
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  const fillDemo = () => {
    setEmail('admin@babyland.com')
    setPassword('admin123')
    setError('')
  }

  return (
    <div className="slip-page">
      <div>
        <form className="slip-card" onSubmit={handleSubmit}>
          <div className="slip-crest">
            <GraduationCap />
          </div>
          <div className="slip-school">BabyLand School · Est. 2011</div>
          <h1 className="slip-title">Sign the register</h1>
          <div className="slip-stamp-row">
            <span className="stamp stamp-ink">General admission</span>
          </div>
          <p className="slip-sub" style={{ marginTop: 10 }}>
            One slip for every member of staff — we&apos;ll walk you to the right desk.
          </p>

          <div className="slip-perf" />

          {error && <div className="form-error">{error}</div>}

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
                Sign in <ArrowRight />
              </>
            )}
          </button>

          <div className="slip-links">
            <Link to="/portals">Find my portal</Link>
            <Link to="/website">Visit the school</Link>
          </div>

          <div className="slip-footnote">
            Trying the demo register? Use <code>admin@babyland.com</code> ·{' '}
            <code>admin123</code> —{' '}
            <button
              type="button"
              onClick={fillDemo}
              style={{ textDecoration: 'underline', textUnderlineOffset: 3, fontWeight: 700 }}
            >
              fill it in for me
            </button>
          </div>
        </form>
        <Link to="/website" className="slip-back">
          ← Back to the school noticeboard
        </Link>
      </div>
    </div>
  )
}

export default Login
