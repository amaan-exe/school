import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ShieldCheck,
  Award,
  GraduationCap,
  BookOpen,
  Briefcase,
  ArrowRight,
  LogIn,
  School,
  Sparkles,
  CheckCircle2,
  Lock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export const PORTALS = [
  {
    role: 'admin',
    num: '01',
    badge: 'Central Control',
    title: 'Administrator',
    subtitle: 'Institutional Governance & Configuration',
    desc: 'Full school oversight — student admissions, faculty roster, fees structures, timetable generation, audit logs, and master settings.',
    icon: ShieldCheck,
    theme: {
      gradient: 'linear-gradient(135deg, #1E40AF 0%, #3B82F6 100%)',
      accent: '#2563EB',
      lightBg: 'rgba(37, 99, 235, 0.08)',
      badgeBg: 'rgba(37, 99, 235, 0.14)',
      badgeColor: '#1D4ED8',
      borderHover: 'rgba(37, 99, 235, 0.45)',
    },
    demoEmail: 'admin@babyland.com',
    demoPass: 'admin123',
    highlights: ['Full System Oversight', 'Staff & Student Directory', 'Fee & Audit Controls'],
  },
  {
    role: 'principal',
    num: '02',
    badge: 'Executive Head',
    title: 'Principal',
    subtitle: 'Academic Leadership & Board Affairs',
    desc: 'School-wide academic performance metrics, faculty evaluations, CBSE compliance registers, attendance analytics, and executive briefings.',
    icon: Award,
    theme: {
      gradient: 'linear-gradient(135deg, #B45309 0%, #F59E0B 100%)',
      accent: '#D97706',
      lightBg: 'rgba(217, 119, 6, 0.08)',
      badgeBg: 'rgba(217, 119, 6, 0.14)',
      badgeColor: '#B45309',
      borderHover: 'rgba(217, 119, 6, 0.45)',
    },
    demoEmail: 'principal@babyland.com',
    demoPass: 'principal123',
    highlights: ['Academic Health Dashboard', 'Staff Appraisal & Approvals', 'CBSE Board Reporting'],
  },
  {
    role: 'teacher',
    num: '03',
    badge: 'Faculty Desk',
    title: 'Teachers',
    subtitle: 'Classroom Delivery & Student Evaluation',
    desc: 'Daily class attendance registers, PA-1 / PA-2 and Term grade entries, timetable schedule, homework assignments, and student report generation.',
    icon: GraduationCap,
    theme: {
      gradient: 'linear-gradient(135deg, #047857 0%, #10B981 100%)',
      accent: '#059669',
      lightBg: 'rgba(5, 150, 105, 0.08)',
      badgeBg: 'rgba(5, 150, 105, 0.14)',
      badgeColor: '#047857',
      borderHover: 'rgba(5, 150, 105, 0.45)',
    },
    demoEmail: 'teacher@babyland.com',
    demoPass: 'teacher123',
    highlights: ['Marking & Progress Cards', 'Period Timetable', 'Daily Class Registers'],
  },
  {
    role: 'student',
    num: '04',
    badge: 'Scholars Portal',
    title: 'Students',
    subtitle: 'Learner Records & Academic Hub',
    desc: 'Personal attendance records, PA-1/PA-2 examination marks, digital term report cards, daily homework assignments, and official circular notices.',
    icon: BookOpen,
    theme: {
      gradient: 'linear-gradient(135deg, #4338CA 0%, #6366F1 100%)',
      accent: '#4F46E5',
      lightBg: 'rgba(79, 70, 229, 0.08)',
      badgeBg: 'rgba(79, 70, 229, 0.14)',
      badgeColor: '#4338CA',
      borderHover: 'rgba(79, 70, 229, 0.45)',
    },
    demoEmail: 'student@babyland.com',
    demoPass: 'student123',
    highlights: ['Marks & Grade Reports', 'Daily Homework Tracker', 'School Circulars & Datesheets'],
  },
  {
    role: 'staff',
    num: '05',
    badge: 'Front Office & Ops',
    title: 'Staff',
    subtitle: 'Administrative Services & Daily Desk',
    desc: 'Front-office operations, counter fee collections, admission inquiries, official circular dispatch, and daily operational management.',
    icon: Briefcase,
    theme: {
      gradient: 'linear-gradient(135deg, #6D28D9 0%, #8B5CF6 100%)',
      accent: '#7C3AED',
      lightBg: 'rgba(124, 58, 237, 0.08)',
      badgeBg: 'rgba(124, 58, 237, 0.14)',
      badgeColor: '#6D28D9',
      borderHover: 'rgba(124, 58, 237, 0.45)',
    },
    demoEmail: 'staff@babyland.com',
    demoPass: 'staff123',
    highlights: ['Counter Fee Invoicing', 'Admission Enquiries', 'Circulars & Front Desk'],
  },
]

const Portals = () => {
  const { loginWithPortal } = useAuth()
  const navigate = useNavigate()
  const [loggingInRole, setLoggingInRole] = useState(null)
  const [loginError, setLoginError] = useState('')

  const handleQuickLogin = async (e, portal) => {
    e.preventDefault()
    e.stopPropagation()
    setLoginError('')
    setLoggingInRole(portal.role)
    try {
      const userData = await loginWithPortal(portal.demoEmail, portal.demoPass, portal.role)
      navigate(`/app/${userData?.role || portal.role}`)
    } catch (err) {
      setLoginError(`Quick login failed for ${portal.title}: ${err.message || 'Error'}`)
      setLoggingInRole(null)
    }
  }

  return (
    <div className="portals-page-premium">
      <div className="portals-hub-container">
        {/* Top Institutional Crest & Badge */}
        <div className="portals-hub-header">
          <div className="portals-crest-pill">
            <School size={16} color="#F59E0B" />
            <span>Babyland Public School · New Delhi</span>
            <span className="portals-pill-divider">·</span>
            <span className="portals-pill-code">CBSE Affiliation #2730412</span>
          </div>

          <h1 className="portals-hub-title">
            Official ERP Portals &amp; <em>Staff Desks</em>
          </h1>
          <p className="portals-hub-subtitle">
            Five dedicated digital workspaces maintained for Babyland Public School.
            Select your desk below to access attendance, academics, administration, or student records.
          </p>

          {loginError && (
            <div className="portals-error-banner">
              {loginError}
            </div>
          )}
        </div>

        {/* 5 Portals Responsive Grid */}
        <div className="portals-hub-grid">
          {PORTALS.map((p) => {
            const Icon = p.icon
            const isLoggingIn = loggingInRole === p.role

            return (
              <div
                key={p.role}
                className="portal-desk-card"
                style={{ '--accent-color': p.theme.accent }}
              >
                {/* Top Glowing Accent Strip */}
                <div
                  className="portal-card-strip"
                  style={{ background: p.theme.gradient }}
                />

                <div className="portal-card-inner">
                  {/* Card Header */}
                  <div className="portal-card-top-row">
                    <div
                      className="portal-card-icon-wrap"
                      style={{ background: p.theme.gradient }}
                    >
                      <Icon size={22} color="#FFFFFF" strokeWidth={2} />
                    </div>

                    <div className="portal-card-meta">
                      <span
                        className="portal-card-badge"
                        style={{
                          background: p.theme.badgeBg,
                          color: p.theme.badgeColor,
                        }}
                      >
                        {p.badge}
                      </span>
                      <span className="portal-card-num">Desk {p.num}</span>
                    </div>
                  </div>

                  {/* Title & Subtitle */}
                  <div className="portal-card-headings">
                    <h2 className="portal-card-title">{p.title}</h2>
                    <p className="portal-card-role-sub">{p.subtitle}</p>
                  </div>

                  {/* Description */}
                  <p className="portal-card-desc">{p.desc}</p>

                  {/* Feature Highlights */}
                  <div className="portal-card-highlights">
                    {p.highlights.map((h, i) => (
                      <span key={i} className="portal-highlight-chip">
                        <CheckCircle2 size={12} color={p.theme.accent} />
                        {h}
                      </span>
                    ))}
                  </div>

                  {/* Demo Credential Box */}
                  <div className="portal-demo-box">
                    <div className="portal-demo-row">
                      <Lock size={12} color="#64748B" />
                      <span className="portal-demo-label">Demo Access:</span>
                      <code className="portal-demo-code">{p.demoEmail}</code>
                    </div>
                    <div className="portal-demo-row-sub">
                      Password: <code>{p.demoPass}</code>
                    </div>
                  </div>

                  {/* Card Actions */}
                  <div className="portal-card-actions">
                    <Link
                      to={`/${p.role}/login`}
                      className="btn-enter-portal"
                      style={{ background: p.theme.gradient }}
                    >
                      <span>Sign In to {p.title}</span>
                      <ArrowRight size={16} />
                    </Link>

                    <button
                      type="button"
                      onClick={(e) => handleQuickLogin(e, p)}
                      disabled={isLoggingIn}
                      className="btn-quick-demo"
                      title={`Instant demo sign-in as ${p.title}`}
                    >
                      {isLoggingIn ? (
                        <>
                          <span className="spinner spinner-xs" />
                          <span>Entering…</span>
                        </>
                      ) : (
                        <>
                          <Sparkles size={13} color={p.theme.accent} />
                          <span>1-Click Demo</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Footer Support & Navigation */}
        <div className="portals-hub-footer">
          <div className="portals-footer-links">
            <Link to="/login" className="portals-footer-btn">
              <LogIn size={15} />
              <span>General Admission Login</span>
            </Link>
            <span className="portals-footer-sep">•</span>
            <Link to="/website" className="portals-footer-btn back-site">
              <span>← Back to Babyland Public School Website</span>
            </Link>
          </div>

          <p className="portals-footer-note">
            Babyland Public School ERP System · For authorized access only · IT Helpdesk: itdesk@babyland.school
          </p>
        </div>
      </div>
    </div>
  )
}

export default Portals
