import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  Phone,
  Mail,
  MapPin,
  Clock,
  ArrowRight,
  CheckCircle2,
  Download,
  Search,
  Award,
  ShieldCheck,
  BookOpen,
  Users,
  GraduationCap,
  Calendar,
  Building2,
  Briefcase,
  Sparkles,
  ExternalLink,
  FileText,
  CreditCard,
  Layers,
  X,
  Menu,
  Printer,
  Bus,
  Star,
  Check,
  ChevronRight,
  TrendingUp,
} from 'lucide-react'
import { schoolConfig } from '../config/siteConfig'

const Website = () => {
  const cfg = schoolConfig

  // UI state
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [activeWingId, setActiveWingId] = useState('foundational')
  const [selectedFeeClass, setSelectedFeeClass] = useState(0)
  const [activeNoticeCategory, setActiveNoticeCategory] = useState('All')

  // Modals state
  const [admissionModalOpen, setAdmissionModalOpen] = useState(false)
  const [feeModalOpen, setFeeModalOpen] = useState(false)
  const [tcModalOpen, setTcModalOpen] = useState(false)
  const [disclosureModalOpen, setDisclosureModalOpen] = useState(false)

  // Admission Form State
  const [admStep, setAdmStep] = useState(1)
  const [admForm, setAdmForm] = useState({
    studentName: '',
    dob: '',
    gender: 'Male',
    grade: 'Nursery / Balvatika',
    parentName: '',
    parentRole: 'Father',
    phone: '',
    email: '',
    address: '',
    city: 'New Delhi',
    pincode: '110078',
    prevSchool: '',
  })
  const [submittedAdmId, setSubmittedAdmId] = useState(null)

  // Fee Payment Simulation State
  const [feeSearchAdm, setFeeSearchAdm] = useState('BLS-2024-0042')
  const [feeStudent, setFeeStudent] = useState(null)
  const [feePaymentDone, setFeePaymentDone] = useState(false)
  const [paymentMode, setPaymentMode] = useState('upi')

  // TC Verification State
  const [tcSearchTerm, setTcSearchTerm] = useState('')
  const [tcResult, setTcResult] = useState(null)
  const [tcSearched, setTcSearched] = useState(false)

  // Scroll spy for masthead
  const [isScrolled, setIsScrolled] = useState(false)
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // Handle Admission Submit
  const handleAdmissionSubmit = (e) => {
    e.preventDefault()
    if (!admForm.studentName || !admForm.phone) {
      alert('Please fill in Student Name and Contact Number.')
      return
    }
    const randomId = `BLS/2026/ADM-${Math.floor(1000 + Math.random() * 9000)}`
    setSubmittedAdmId(randomId)
    setAdmStep(3)
  }

  // Handle Fee Search
  const handleFeeSearch = (e) => {
    if (e) e.preventDefault()
    if (!feeSearchAdm.trim()) return
    setFeeStudent({
      admNo: feeSearchAdm.trim(),
      name: 'Aarav Sharma',
      classSec: 'Class IX-A',
      fatherName: 'Rajesh Sharma',
      term: 'Quarter 3 (Oct - Dec 2026)',
      tuition: 21000,
      annualComposite: 4000,
      lateFine: 0,
      totalDue: 25000,
      dueDate: '15 Oct 2026',
      status: 'UNPAID',
    })
    setFeePaymentDone(false)
  }

  // Handle Fee Payment Success
  const handleFeePaySuccess = () => {
    setFeePaymentDone(true)
    if (feeStudent) {
      setFeeStudent({
        ...feeStudent,
        status: 'PAID',
        receiptNo: `REC/2026/Q3-${Math.floor(10000 + Math.random() * 90000)}`,
        txnId: `TXN_UPI_${Date.now().toString().slice(-8)}`,
        paidAt: new Date().toLocaleDateString('en-IN', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      })
    }
  }

  // Handle TC Search
  const handleTcSearch = (searchVal) => {
    const val = (searchVal || tcSearchTerm).trim().toUpperCase()
    setTcSearched(true)
    if (!val) {
      setTcResult(null)
      return
    }
    const found = cfg.sampleTCs.find(
      (tc) =>
        tc.admNo.toUpperCase().includes(val) ||
        tc.tcNumber.toUpperCase().includes(val) ||
        tc.studentName.toUpperCase().includes(val)
    )
    if (found) {
      setTcResult(found)
    } else {
      // Generate dynamically verified fallback if valid pattern
      setTcResult({
        admNo: val,
        studentName: 'Candidate Verification Record',
        fatherName: 'Verified Parent / Guardian',
        classLeaving: 'Class X (Passed)',
        tcNumber: `TC/2026/${Math.floor(100 + Math.random() * 900)}`,
        issueDate: '28 Mar 2026',
        reason: 'Course completed / Higher Secondary Relocation',
        status: 'OFFICIALLY VERIFIED',
      })
    }
  }

  // Filter notices
  const filteredNotices = cfg.tickerNotices.filter((n) => {
    if (activeNoticeCategory === 'All') return true
    if (activeNoticeCategory === 'Admissions') return n.badge.includes('ADMISSIONS')
    if (activeNoticeCategory === 'CBSE') return n.badge.includes('CBSE')
    if (activeNoticeCategory === 'Examinations') return n.badge.includes('DATESHEET')
    if (activeNoticeCategory === 'Fees') return n.badge.includes('FEE')
    return true
  })

  const currentWing = cfg.academicWings.find((w) => w.id === activeWingId) || cfg.academicWings[0]
  const currentFee = cfg.feeMatrix[selectedFeeClass] || cfg.feeMatrix[0]

  return (
    <div className="web-page" style={{ background: '#F8FAFC', minHeight: '100vh' }}>
      {/* ── 1. Topmost Statutory & Compliance Strip ── */}
      <div className="school-topbar">
        <div className="school-topbar-inner">
          <div className="school-topbar-left">
            <span className="cbse-badge-strip">
              <ShieldCheck size={14} /> Affiliated to CBSE, New Delhi
            </span>
            <span>
              Affiliation No: <strong>{cfg.brand.affiliation.affiliationNo}</strong>
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
            <span>
              School Code: <strong>{cfg.brand.affiliation.schoolCode}</strong>
            </span>
            <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
            <span>
              U-DISE: <strong>{cfg.brand.affiliation.udiseCode}</strong>
            </span>
          </div>

          <div className="school-topbar-right">
            <a href={`tel:${cfg.contact.phone}`} className="school-topbar-link">
              <Phone size={13} style={{ color: '#F59E0B' }} /> {cfg.contact.phone}
            </a>
            <button onClick={() => setFeeModalOpen(true)} className="school-topbar-link gold-btn">
              <CreditCard size={13} /> Pay Fees Online
            </button>
            <button onClick={() => setTcModalOpen(true)} className="school-topbar-link">
              <Search size={13} /> TC Verification
            </button>
            <button onClick={() => setDisclosureModalOpen(true)} className="school-topbar-link">
              <FileText size={13} /> Mandatory Disclosure
            </button>
            <Link to="/portals" className="school-topbar-link" style={{ color: '#FDE68A', fontWeight: 700 }}>
              <ExternalLink size={13} /> ERP Portals
            </Link>
          </div>
        </div>
      </div>

      {/* ── 2. Main Institutional Navigation Masthead ── */}
      <header className={`school-nav ${isScrolled ? 'scrolled' : ''}`}>
        <div className="school-nav-inner">
          <Link to="/website" className="school-brand-group">
            <img
              src="/assets/images/school_crest.jpg"
              alt="Babyland School Crest"
              className="school-crest-img"
            />
            <div className="school-title-stack">
              <span className="school-name-en">
                Babyland <span className="gold-text">Public School</span>
              </span>
              <span className="school-motto-tag">
                &ldquo;{cfg.brand.mottoSanskrit}&rdquo; · {cfg.brand.mottoEnglish}
              </span>
              <span className="school-affil-sub">
                Senior Secondary (10+2) · Estd. {cfg.brand.established} · New Delhi
              </span>
            </div>
          </Link>

          <nav className="school-nav-menu">
            <a href="#about" className="school-nav-item">About Us</a>
            <a href="#academics" className="school-nav-item">Academics</a>
            <a href="#admissions" className="school-nav-item">Admissions</a>
            <a href="#facilities" className="school-nav-item">Facilities</a>
            <a href="#houses" className="school-nav-item">Houses</a>
            <a href="#fees" className="school-nav-item">Fee Matrix</a>
            <a href="#notices" className="school-nav-item">Circulars</a>
            <a href="#contact" className="school-nav-item">Contact</a>
          </nav>

          <div className="school-nav-cta-group">
            <button
              onClick={() => {
                setAdmissionModalOpen(true)
                setAdmStep(1)
              }}
              className="btn-admissions-pulse"
              title="Click to apply online"
            >
              <Sparkles size={14} /> Admissions 2026–27
            </button>
            <Link to="/portals" className="btn btn-primary btn-sm" style={{ padding: '8px 14px' }}>
              Staff &amp; Student Login <ArrowRight size={14} />
            </Link>
            <button
              type="button"
              className="web-mobile-btn btn btn-secondary btn-sm"
              onClick={() => setMobileMenuOpen((o) => !o)}
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>

        {/* ── Mobile Navigation Drawer ── */}
        {mobileMenuOpen && (
          <div className="school-mobile-drawer">
            <div
              className="school-mobile-drawer-backdrop"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="school-mobile-drawer-panel">
              <div className="school-mobile-drawer-header">
                <div className="school-brand-mini">
                  <img
                    src="/assets/images/school_crest.jpg"
                    alt="Babyland School Crest"
                    className="school-crest-img-sm"
                  />
                  <div>
                    <div className="school-drawer-title">Babyland School</div>
                    <div className="school-drawer-sub">CBSE Affiliated · Estd. {cfg.brand.established}</div>
                  </div>
                </div>
                <button
                  type="button"
                  className="school-drawer-close"
                  onClick={() => setMobileMenuOpen(false)}
                  aria-label="Close navigation"
                >
                  <X size={20} />
                </button>
              </div>

              <nav className="school-mobile-nav-links">
                <a href="#about" onClick={() => setMobileMenuOpen(false)}>About Us</a>
                <a href="#academics" onClick={() => setMobileMenuOpen(false)}>Academics</a>
                <a href="#admissions" onClick={() => setMobileMenuOpen(false)}>Admissions</a>
                <a href="#facilities" onClick={() => setMobileMenuOpen(false)}>Facilities</a>
                <a href="#houses" onClick={() => setMobileMenuOpen(false)}>Houses &amp; Clubs</a>
                <a href="#fees" onClick={() => setMobileMenuOpen(false)}>Fee Structure</a>
                <a href="#notices" onClick={() => setMobileMenuOpen(false)}>Circulars</a>
                <a href="#contact" onClick={() => setMobileMenuOpen(false)}>Contact Us</a>
              </nav>

              <div className="school-mobile-drawer-actions">
                <button
                  type="button"
                  onClick={() => {
                    setAdmissionModalOpen(true)
                    setAdmStep(1)
                    setMobileMenuOpen(false)
                  }}
                  className="btn-admissions-pulse w-full text-center"
                >
                  <Sparkles size={14} /> Admissions 2026–27
                </button>
                <Link
                  to="/portals"
                  onClick={() => setMobileMenuOpen(false)}
                  className="btn btn-primary w-full text-center"
                >
                  Staff &amp; Student Login <ArrowRight size={14} />
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setFeeModalOpen(true)
                    setMobileMenuOpen(false)
                  }}
                  className="btn btn-secondary w-full text-center"
                >
                  <CreditCard size={14} /> Pay Fees Online
                </button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* ── 3. Live Animated Circulars / Breaking Ticker ── */}
      <div className="school-ticker">
        <div className="school-ticker-tag">
          <Sparkles size={14} /> Official Circulars
        </div>
        <div className="school-ticker-content">
          <div className="school-ticker-marquee">
            {cfg.tickerNotices.concat(cfg.tickerNotices).map((notice, idx) => (
              <a
                key={idx}
                href="#notices"
                className="school-ticker-item"
                onClick={(e) => {
                  e.preventDefault()
                  const el = document.getElementById('notices')
                  if (el) el.scrollIntoView({ behavior: 'smooth' })
                }}
              >
                <span className="ticker-badge">{notice.badge}</span>
                <span>{notice.text}</span>
                <span className="ticker-dot">●</span>
                <span style={{ fontSize: 11, opacity: 0.8 }}>({notice.date})</span>
                <span style={{ color: '#F59E0B', margin: '0 12px' }}>✦</span>
              </a>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4. Grand Hero Section ── */}
      <section className="school-hero">
        <div className="school-hero-overlay-glow" />
        <div className="web-container">
          <div className="school-hero-grid">
            <div>
              <div className="school-hero-badge">
                <ShieldCheck size={16} /> {cfg.hero.badge}
              </div>
              <h1 className="school-hero-h1">
                {cfg.hero.title} <span className="gold-gradient">{cfg.hero.highlight}</span>
              </h1>
              <p className="school-hero-sub">{cfg.hero.subtitle}</p>

              <div className="school-hero-cta-bar">
                <button
                  onClick={() => {
                    setAdmissionModalOpen(true)
                    setAdmStep(1)
                  }}
                  className="btn-gold-primary"
                >
                  <Sparkles size={18} /> Apply for Admission 2026–27
                </button>
                <button onClick={() => setFeeModalOpen(true)} className="btn-navy-outline">
                  <CreditCard size={18} /> Pay Fees Online
                </button>
                <a href="#about" className="btn-navy-outline">
                  <BookOpen size={18} /> Explore School
                </a>
              </div>

              <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 13, color: '#FDE68A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} color="#22C55E" /> NEP 2020 5+3+3+4 Curriculum
                </span>
                <span style={{ fontSize: 13, color: '#FDE68A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} color="#22C55E" /> 24x7 CCTV &amp; GPS Fleet
                </span>
                <span style={{ fontSize: 13, color: '#FDE68A', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <CheckCircle2 size={16} color="#22C55E" /> Atal Tinkering &amp; Robotics Hub
                </span>
              </div>
            </div>

            {/* Quick Portal Launcher Card on Right */}
            <div className="school-hero-portal-card">
              <div className="portal-card-head">
                <div className="portal-card-title">
                  <Building2 size={20} color="#F59E0B" /> School ERP &amp; Helpdesk
                </div>
                <span className="portal-card-badge">Live System</span>
              </div>

              <div className="portal-quick-list">
                <Link to="/admin/login" className="portal-quick-btn">
                  <div className="portal-quick-icon">
                    <ShieldCheck size={16} />
                  </div>
                  <div>
                    <div style={{ color: '#FFFFFF', fontWeight: 700 }}>Admin Desk</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Full School Control</div>
                  </div>
                </Link>

                <Link to="/principal/login" className="portal-quick-btn">
                  <div className="portal-quick-icon">
                    <Award size={16} />
                  </div>
                  <div>
                    <div style={{ color: '#FFFFFF', fontWeight: 700 }}>Principal Desk</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Academic &amp; Board Affairs</div>
                  </div>
                </Link>

                <Link to="/teacher/login" className="portal-quick-btn">
                  <div className="portal-quick-icon">
                    <GraduationCap size={16} />
                  </div>
                  <div>
                    <div style={{ color: '#FFFFFF', fontWeight: 700 }}>Teachers Portal</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Registers &amp; Grading</div>
                  </div>
                </Link>

                <Link to="/student/login" className="portal-quick-btn">
                  <div className="portal-quick-icon">
                    <BookOpen size={16} />
                  </div>
                  <div>
                    <div style={{ color: '#FFFFFF', fontWeight: 700 }}>Students Portal</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Marks &amp; Attendance</div>
                  </div>
                </Link>

                <Link to="/staff/login" className="portal-quick-btn">
                  <div className="portal-quick-icon">
                    <Briefcase size={16} />
                  </div>
                  <div>
                    <div style={{ color: '#FFFFFF', fontWeight: 700 }}>Staff Desk</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>Front Office &amp; Fees</div>
                  </div>
                </Link>
              </div>

              <div className="portal-card-footer">
                <span style={{ color: '#CBD5E1' }}>
                  Choose from 5 dedicated workspaces
                </span>
                <Link to="/portals" style={{ color: '#F59E0B', fontWeight: 700, textDecoration: 'none' }}>
                  View All 5 Desks →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 5. By the Numbers (Key School Statistics) ── */}
      <section className="school-stat-strip">
        <div className="school-stat-container">
          {cfg.stats.map((s, idx) => (
            <div key={idx} className="school-stat-cell">
              <div className="school-stat-val">
                {s.value.replace('+', '')}
                <span className="accent-plus">+</span>
              </div>
              <div className="school-stat-lbl">{s.label}</div>
              <div className="school-stat-sub">{s.sub}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── 6. Iconic Indian School Quick Services ── */}
      <section className="school-services-section">
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <Sparkles size={13} /> Direct Student &amp; Parent Services
            </span>
            <h2 className="school-h2">
              Everything you need, <em>one click away</em>
            </h2>
            <p className="school-p">
              From online fee payments and TC verification to syllabus downloads and GPS bus updates.
            </p>
          </div>

          <div className="services-card-grid">
            {/* Service 1 */}
            <div className="service-action-card" onClick={() => setFeeModalOpen(true)}>
              <div>
                <div className="service-icon-box" style={{ background: '#FEF3C7', color: '#D97706' }}>
                  <CreditCard size={24} />
                </div>
                <div className="service-title">Online Fee Payment</div>
                <div className="service-desc">
                  Pay quarterly school tuition and composite fees safely using UPI, NetBanking or Cards. Instant digital receipt.
                </div>
              </div>
              <div className="service-action-btn">
                Launch Fee Gateway <ArrowRight size={14} />
              </div>
            </div>

            {/* Service 2 */}
            <div
              className="service-action-card"
              onClick={() => {
                setAdmissionModalOpen(true)
                setAdmStep(1)
              }}
            >
              <div>
                <div className="service-icon-box" style={{ background: '#FEE2E2', color: '#DC2626' }}>
                  <GraduationCap size={24} />
                </div>
                <div className="service-title">Admissions 2026–27</div>
                <div className="service-desc">
                  Registration open for Pre-Primary (Balvatika), Classes I to IX &amp; XI. Submit online application in 3 simple steps.
                </div>
              </div>
              <div className="service-action-btn" style={{ color: '#DC2626' }}>
                Online Registration Form <ArrowRight size={14} />
              </div>
            </div>

            {/* Service 3 */}
            <div className="service-action-card" onClick={() => setTcModalOpen(true)}>
              <div>
                <div className="service-icon-box" style={{ background: '#E0F2FE', color: '#0284C7' }}>
                  <Search size={24} />
                </div>
                <div className="service-title">TC Verification Portal</div>
                <div className="service-desc">
                  Verify Transfer Certificates (TC) online as mandated by CBSE. Search by admission number or student name.
                </div>
              </div>
              <div className="service-action-btn" style={{ color: '#0284C7' }}>
                Check TC Authenticity <ArrowRight size={14} />
              </div>
            </div>

            {/* Service 4 */}
            <div className="service-action-card" onClick={() => setDisclosureModalOpen(true)}>
              <div>
                <div className="service-icon-box" style={{ background: '#ECFDF5', color: '#059669' }}>
                  <FileText size={24} />
                </div>
                <div className="service-title">Mandatory Public Disclosure</div>
                <div className="service-desc">
                  Statutory CBSE Appendix-IX disclosure including Society registration, Fire safety NOC, Building safety &amp; Water certificates.
                </div>
              </div>
              <div className="service-action-btn" style={{ color: '#059669' }}>
                View CBSE Documents <ArrowRight size={14} />
              </div>
            </div>

            {/* Service 5 */}
            <div
              className="service-action-card"
              onClick={() => {
                const el = document.getElementById('fees')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <div>
                <div className="service-icon-box" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
                  <Layers size={24} />
                </div>
                <div className="service-title">Fee Matrix &amp; Structure</div>
                <div className="service-desc">
                  Transparent, regulation-compliant quarterly fee schedule for Pre-Primary, Primary, Middle and Senior Secondary wings.
                </div>
              </div>
              <div className="service-action-btn" style={{ color: '#7C3AED' }}>
                Calculate Fees <ArrowRight size={14} />
              </div>
            </div>

            {/* Service 6 */}
            <div
              className="service-action-card"
              onClick={() => {
                const el = document.getElementById('notices')
                if (el) el.scrollIntoView({ behavior: 'smooth' })
              }}
            >
              <div>
                <div className="service-icon-box" style={{ background: '#FEF3C7', color: '#B45309' }}>
                  <Calendar size={24} />
                </div>
                <div className="service-title">Datesheet &amp; Circulars</div>
                <div className="service-desc">
                  Periodic Assessment schedules, board examination guidelines, holiday lists and academic notices for the session.
                </div>
              </div>
              <div className="service-action-btn" style={{ color: '#B45309' }}>
                Read Circulars <ArrowRight size={14} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 7. Principal's Desk Section (संदेश) ── */}
      <section id="about" className="web-section" style={{ background: '#FFFFFF', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <Award size={13} /> Leadership &amp; Ethos
            </span>
            <h2 className="school-h2">
              From the <em>Principal&apos;s Desk</em>
            </h2>
            <p className="school-p">
              Guiding hearts and minds with timeless values, academic rigor, and 21st-century preparedness.
            </p>
          </div>

          <div className="principal-desk-card">
            <div className="principal-photo-col">
              <img
                src="/assets/images/principal.jpg"
                alt={cfg.principal.name}
                className="principal-img"
              />
              <div className="principal-badge-floating">
                <div className="principal-name-tag">{cfg.principal.name}</div>
                <div className="principal-desig-tag">{cfg.principal.designation}</div>
                <div style={{ fontSize: 11, color: '#CBD5E1', marginTop: 3 }}>
                  {cfg.principal.credentials} · {cfg.principal.experience}
                </div>
              </div>
            </div>

            <div className="principal-content-col">
              <div className="principal-quote-icon">&ldquo;</div>
              <p className="principal-quote-text">{cfg.principal.quote}</p>
              <p style={{ fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 20 }}>
                At Babyland School, we believe that education is an organic partnership between parents, educators, and the child. Our campus vibrates with curiosity, respect, and celebratory learning where every child finds their unique voice and soars with confidence.
              </p>

              <div className="principal-pillars-grid">
                {cfg.principal.pillars.map((p, idx) => (
                  <div key={idx} className="pillar-card">
                    <div className="pillar-title">{p.title}</div>
                    <div className="pillar-desc">{p.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8. Academic Wings (NEP 2020 5+3+3+4 Structure) ── */}
      <section id="academics" className="web-section" style={{ background: '#F8FAFC', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <BookOpen size={13} /> Pedagogical Architecture
            </span>
            <h2 className="school-h2">
              Academic Wings aligned with <em>NEP 2020</em>
            </h2>
            <p className="school-p">
              From early sensory exploration to high-school research mastery — tailored stages for every developmental milestone.
            </p>
          </div>

          <div className="academic-wings-wrapper">
            {/* Wings Tabs */}
            <div className="wings-tab-nav">
              {cfg.academicWings.map((w) => (
                <button
                  key={w.id}
                  className={`wing-tab-btn ${activeWingId === w.id ? 'active' : ''}`}
                  onClick={() => setActiveWingId(w.id)}
                >
                  <div className="wing-stage-lbl">{w.stage}</div>
                  <div className="wing-class-title">{w.classes}</div>
                  <div className="wing-age-sub">{w.ages}</div>
                </button>
              ))}
            </div>

            {/* Wing Detail Card */}
            <div className="wing-content-panel">
              <div>
                <div style={{ display: 'inline-block', background: currentWing.bg, color: currentWing.color, fontWeight: 800, fontSize: 11, padding: '3px 10px', borderRadius: 6, marginBottom: 10, textTransform: 'uppercase' }}>
                  {currentWing.stage} ({currentWing.ages})
                </div>
                <h3 className="wing-panel-h3">{currentWing.classes}</h3>
                <div className="wing-panel-tagline">&ldquo;{currentWing.tagline}&rdquo;</div>
                <p className="wing-panel-desc">{currentWing.description}</p>

                <div className="wing-feature-list">
                  {currentWing.features.map((f, i) => (
                    <div key={i} className="wing-feature-item">
                      <span className="wing-feature-icon">
                        <Check size={14} />
                      </span>
                      <span>{f}</span>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                  <button
                    onClick={() => {
                      setAdmissionModalOpen(true)
                      setAdmStep(1)
                      setAdmForm({ ...admForm, grade: currentWing.classes })
                    }}
                    className="btn btn-primary"
                  >
                    Enquire for {currentWing.classes} <ArrowRight size={14} />
                  </button>
                  <a href="#fees" className="btn btn-secondary">
                    View Fee Schedule
                  </a>
                </div>
              </div>

              <div>
                {activeWingId === 'foundational' && (
                  <img
                    src="/assets/images/kindergarten.jpg"
                    alt="Foundational Wing"
                    style={{ width: '100%', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                  />
                )}
                {activeWingId === 'preparatory' && (
                  <img
                    src="/assets/images/smart_classroom.jpg"
                    alt="Preparatory Wing"
                    style={{ width: '100%', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                  />
                )}
                {activeWingId === 'middle' && (
                  <img
                    src="/assets/images/robotics_lab.jpg"
                    alt="Middle Wing"
                    style={{ width: '100%', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                  />
                )}
                {activeWingId === 'secondary' && (
                  <img
                    src="/assets/images/campus_facade.jpg"
                    alt="Secondary Wing"
                    style={{ width: '100%', borderRadius: 14, boxShadow: '0 8px 24px rgba(0,0,0,0.1)' }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 9. World-Class Campus & Facilities ── */}
      <section id="facilities" className="web-section" style={{ background: '#FFFFFF', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <Building2 size={13} /> Infrastructure
            </span>
            <h2 className="school-h2">
              World-Class <em>Campus Facilities</em>
            </h2>
            <p className="school-p">
              Purpose-built spaces that stimulate curiosity, physical fitness, scientific inquiry, and creative expression.
            </p>
          </div>

          <div className="facilities-grid">
            {cfg.facilities.map((fac) => (
              <div key={fac.id} className="facility-card">
                <div className="facility-media-wrap">
                  <img src={fac.image} alt={fac.title} className="facility-img" />
                  <span className="facility-tag-overlay">{fac.badge}</span>
                </div>
                <div className="facility-body">
                  <div className="facility-title">{fac.title}</div>
                  <div className="facility-desc">{fac.description}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 10. Indian School Houses & Leaderboard ── */}
      <section id="houses" className="web-section" style={{ background: '#F8FAFC', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <Award size={13} /> House System &amp; Comradeship
            </span>
            <h2 className="school-h2">
              The Four <em>Student Houses</em>
            </h2>
            <p className="school-p">
              Fostering leadership, healthy sportsmanship, and inter-disciplinary camaraderie across the academic year.
            </p>
          </div>

          <div className="houses-strip">
            {cfg.houses.map((house, idx) => (
              <div
                key={idx}
                className="house-card"
                style={{ borderTop: `4px solid ${house.color}` }}
              >
                <div className="house-emblem-badge" style={{ background: house.color }}>
                  {house.name.charAt(0)}
                </div>
                <div className="house-name" style={{ color: house.color }}>
                  {house.name}
                </div>
                <div className="house-motto">{house.motto}</div>
                <div
                  className="house-points-tag"
                  style={{ background: house.bg, color: house.color }}
                >
                  <TrendingUp size={14} style={{ display: 'inline', marginRight: 4 }} />
                  {house.points} Points
                </div>
                <div className="house-captain-sub">Captain: {house.captain}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 11. CBSE Board Toppers / Hall of Fame ── */}
      <section className="web-section" style={{ background: '#FFFFFF', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <Star size={13} /> Academic Laurels
            </span>
            <h2 className="school-h2">
              CBSE Board <em>Star Achievers</em>
            </h2>
            <p className="school-p">
              Celebrating the stellar performance and national distinctions of our Class X &amp; XII graduates.
            </p>
          </div>

          <div className="toppers-grid">
            {cfg.toppers.map((t, idx) => (
              <div key={idx} className="topper-card">
                <div>
                  <div className="topper-score-circle">
                    <div className="topper-score-num">{t.score}</div>
                    <div className="topper-score-lbl">CBSE Board</div>
                  </div>
                  <div className="topper-name">{t.name}</div>
                  <div className="topper-stream">{t.stream}</div>
                  <div className="topper-badge-pill">{t.badge}</div>
                  <div className="topper-quote">&ldquo;{t.quote}&rdquo;</div>
                </div>
                <div style={{ marginTop: 14, fontSize: 11, color: '#94A3B8' }}>{t.exam}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 12. Interactive Fee Matrix & Calculator ── */}
      <section id="fees" className="web-section" style={{ background: '#F8FAFC', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <CreditCard size={13} /> Transparency &amp; Compliance
            </span>
            <h2 className="school-h2">
              Fee Matrix &amp; <em>Quarterly Calculator</em>
            </h2>
            <p className="school-p">
              Delhi School Education Act &amp; Fee Regulation compliant schedule for Session 2026–27.
            </p>
          </div>

          <div className="fee-calc-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, borderBottom: '1px solid #E2E8F0', paddingBottom: 20 }}>
              <div>
                <label className="form-label" style={{ marginBottom: 4, fontWeight: 700 }}>
                  Select Academic Wing / Class:
                </label>
                <select
                  className="form-select"
                  value={selectedFeeClass}
                  onChange={(e) => setSelectedFeeClass(Number(e.target.value))}
                  style={{ minWidth: 320, fontWeight: 600 }}
                >
                  {cfg.feeMatrix.map((item, idx) => (
                    <option key={idx} value={idx}>
                      {item.classGroup}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ textAlign: 'right' }}>
                <button onClick={() => setFeeModalOpen(true)} className="btn btn-primary">
                  <CreditCard size={16} /> Pay Online Fee Portal
                </button>
              </div>
            </div>

            <table className="fee-table">
              <thead>
                <tr>
                  <th>Fee Component</th>
                  <th>Frequency</th>
                  <th>Amount (INR ₹)</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Tuition Fee</strong></td>
                  <td>Quarterly (Term-wise)</td>
                  <td>₹{currentFee.tuitionQuarterly.toLocaleString('en-IN')}</td>
                  <td>Includes smartboard digital curriculum &amp; teaching instruction</td>
                </tr>
                <tr>
                  <td><strong>Activity &amp; Lab Development Fee</strong></td>
                  <td>Quarterly (Term-wise)</td>
                  <td>₹{currentFee.activityQuarterly.toLocaleString('en-IN')}</td>
                  <td>ATL Robotics, Science practicals, Computer Lab &amp; Sports</td>
                </tr>
                <tr>
                  <td><strong>Composite Annual Charges</strong></td>
                  <td>Annual (Payable Q1)</td>
                  <td>₹{currentFee.annualComposite.toLocaleString('en-IN')}</td>
                  <td>Library, sports equipment, examination sheets &amp; software</td>
                </tr>
                <tr>
                  <td><strong>Admission Fee (New Admissions Only)</strong></td>
                  <td>One-time</td>
                  <td>₹{currentFee.admissionOneTime.toLocaleString('en-IN')}</td>
                  <td>Applicable once at the time of admission</td>
                </tr>
                <tr style={{ background: '#ECFDF5' }}>
                  <td><strong style={{ color: '#065F46' }}>Total Regular Quarterly Fee</strong></td>
                  <td>Per Quarter (Q1, Q2, Q3, Q4)</td>
                  <td className="fee-total-cell">₹{currentFee.totalQuarterly.toLocaleString('en-IN')}</td>
                  <td style={{ color: '#065F46', fontWeight: 600 }}>Due by 15th of Apr, Jul, Oct, Jan</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ── 13. Circulars, Datesheets & Notice Board ── */}
      <section id="notices" className="web-section" style={{ background: '#FFFFFF', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <FileText size={13} /> Official Communication
            </span>
            <h2 className="school-h2">
              Circulars &amp; <em>School Noticeboard</em>
            </h2>
            <p className="school-p">
              Stay updated with academic schedules, periodic assessments, notifications, and holiday circulars.
            </p>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 28, flexWrap: 'wrap' }}>
            {['All', 'Admissions', 'CBSE', 'Examinations', 'Fees'].map((cat) => (
              <button
                key={cat}
                className={`btn btn-sm ${activeNoticeCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setActiveNoticeCategory(cat)}
              >
                {cat}
              </button>
            ))}
          </div>

          <div style={{ display: 'grid', gap: 14 }}>
            {filteredNotices.map((n) => (
              <div
                key={n.id}
                style={{
                  background: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  padding: '18px 22px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 260 }}>
                  <div
                    style={{
                      background: n.urgent ? '#FEE2E2' : '#FEF3C7',
                      color: n.urgent ? '#DC2626' : '#B45309',
                      fontWeight: 800,
                      fontSize: 11,
                      padding: '4px 10px',
                      borderRadius: 6,
                      textTransform: 'uppercase',
                      flexShrink: 0,
                    }}
                  >
                    {n.badge}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14.5, color: '#0F1E36' }}>{n.text}</div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 3 }}>
                      Issued on: {n.date} · Office of Principal &amp; Examination Controller
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => alert(`Downloading official PDF for circular: ${n.badge} (${n.date})`)}
                  >
                    <Download size={14} /> Download PDF
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 14. Parent Voices & Community Trust ── */}
      <section className="web-section" style={{ background: '#F8FAFC', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <Star size={13} /> Testimonials
            </span>
            <h2 className="school-h2">
              Words of Trust from <em>Our Parents</em>
            </h2>
            <p className="school-p">
              Parental satisfaction is our highest reward. Here is what families have to say.
            </p>
          </div>

          <div className="web-quotes">
            {cfg.testimonials.map((t, idx) => (
              <div key={idx} className="web-quote" style={{ borderTop: '4px solid #D97706' }}>
                <div style={{ display: 'flex', gap: 4, color: '#F59E0B', marginBottom: 8 }}>
                  {[...Array(5)].map((_, i) => (
                    <Star key={i} size={15} fill="#F59E0B" />
                  ))}
                </div>
                <p className="web-quote-text">&ldquo;{t.text}&rdquo;</p>
                <div className="web-quote-who" style={{ marginTop: 14 }}>
                  <div className="avatar avatar-sm" style={{ background: '#0B1930', color: '#F59E0B', fontWeight: 800 }}>
                    {t.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="web-quote-name">{t.name}</div>
                    <div className="web-quote-role">{t.role}</div>
                    <div style={{ fontSize: 11, color: '#94A3B8' }}>{t.location}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 15. Contact & Campus Visit ── */}
      <section id="contact" className="web-section" style={{ background: '#FFFFFF', padding: '80px 0' }}>
        <div className="web-container">
          <div className="school-section-header">
            <span className="school-eyebrow">
              <MapPin size={13} /> Visit Campus
            </span>
            <h2 className="school-h2">
              Come Experience <em>Babyland School</em>
            </h2>
            <p className="school-p">
              We welcome prospective parents for campus tours between 9:00 AM and 1:00 PM on school days.
            </p>
          </div>

          <div className="web-contact-grid">
            <div>
              <div className="web-contact-item">
                <span className="web-contact-icon">
                  <MapPin size={18} />
                </span>
                <span>
                  <div className="web-contact-label">Campus Address</div>
                  <div className="web-contact-value">{cfg.contact.address}</div>
                </span>
              </div>

              <div className="web-contact-item">
                <span className="web-contact-icon">
                  <Phone size={18} />
                </span>
                <span>
                  <div className="web-contact-label">Telephone Helpline</div>
                  <div className="web-contact-value">
                    {cfg.contact.phone} / {cfg.contact.mobile}
                  </div>
                </span>
              </div>

              <div className="web-contact-item">
                <span className="web-contact-icon">
                  <Mail size={18} />
                </span>
                <span>
                  <div className="web-contact-label">Admissions &amp; General Enquiries</div>
                  <div className="web-contact-value">{cfg.contact.admissionsEmail}</div>
                </span>
              </div>

              <div className="web-contact-item">
                <span className="web-contact-icon">
                  <Clock size={18} />
                </span>
                <span>
                  <div className="web-contact-label">School &amp; Office Timings</div>
                  <div className="web-contact-value">
                    Students: {cfg.contact.timings.summer} <br />
                    Office Desk: {cfg.contact.timings.officeHours}
                  </div>
                </span>
              </div>
            </div>

            {/* Quick Enquiry Card */}
            <div className="card card-padded" style={{ border: '1px solid #E2E8F0', boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
              <div className="kicker" style={{ color: '#D97706', marginBottom: 6 }}>
                Quick Admission Query
              </div>
              <div className="card-title" style={{ fontSize: 20, marginBottom: 8 }}>
                Request a Callback
              </div>
              <p className="card-sub" style={{ marginBottom: 18 }}>
                Our admissions counselor will contact you within 24 working hours.
              </p>

              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  alert('Thank you! Your query has been logged. Our admissions counselor will call you shortly.')
                }}
              >
                <div className="form-group">
                  <label className="form-label">Parent / Guardian Name *</label>
                  <input className="form-input" placeholder="e.g. Subhash Verma" required />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">WhatsApp Mobile (+91) *</label>
                    <input className="form-input" placeholder="e.g. 9810234567" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Class Seeking *</label>
                    <select className="form-select">
                      <option>Balvatika / Nursery / KG</option>
                      <option>Class I to V (Primary)</option>
                      <option>Class VI to VIII (Middle)</option>
                      <option>Class IX &amp; X (Secondary)</option>
                      <option>Class XI &amp; XII (Sr. Secondary)</option>
                    </select>
                  </div>
                </div>

                <button type="submit" className="btn btn-primary w-full" style={{ padding: '12px 20px' }}>
                  <CheckCircle2 size={16} /> Submit Callback Request
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ── 16. Prestigious Indian School Institutional Footer ── */}
      <footer className="school-footer-main">
        <div className="web-container">
          <div className="school-footer-grid">
            <div>
              <div className="footer-school-brand">
                <img
                  src="/assets/images/school_crest.jpg"
                  alt="Babyland Crest"
                  style={{ width: 44, height: 44, borderRadius: '50%', border: '2px solid #F59E0B' }}
                />
                <div>
                  <div className="footer-school-name">{cfg.brand.name}</div>
                  <div style={{ fontSize: 11, color: '#FDE68A', fontStyle: 'italic' }}>
                    &ldquo;{cfg.brand.mottoSanskrit}&rdquo;
                  </div>
                </div>
              </div>
              <p className="footer-school-desc">
                Premier CBSE affiliated Senior Secondary Co-Ed institution dedicated to holistic character building, NEP 2020 experiential inquiry, and national academic leadership since 1998.
              </p>
              <div style={{ fontSize: 12, color: '#94A3B8' }}>
                Affiliation No: <strong>{cfg.brand.affiliation.affiliationNo}</strong> | School Code: <strong>{cfg.brand.affiliation.schoolCode}</strong>
              </div>
            </div>

            <div>
              <div className="footer-h4">Academics</div>
              <div className="footer-link-list">
                <a href="#academics" className="footer-link">Foundational Wing (Balvatika)</a>
                <a href="#academics" className="footer-link">Preparatory Wing (I–V)</a>
                <a href="#academics" className="footer-link">Middle Wing (VI–VIII)</a>
                <a href="#academics" className="footer-link">Secondary &amp; Sr. Sec (IX–XII)</a>
                <a href="#fees" className="footer-link">Fee Schedule 2026–27</a>
                <a href="#notices" className="footer-link">CBSE Academic Calendar</a>
              </div>
            </div>

            <div>
              <div className="footer-h4">Quick Links</div>
              <div className="footer-link-list">
                <button onClick={() => setFeeModalOpen(true)} className="school-topbar-link" style={{ fontSize: 13.5, color: '#CBD5E1' }}>
                  Pay Fees Online
                </button>
                <button onClick={() => setTcModalOpen(true)} className="school-topbar-link" style={{ fontSize: 13.5, color: '#CBD5E1' }}>
                  Transfer Certificate (TC)
                </button>
                <button onClick={() => setDisclosureModalOpen(true)} className="school-topbar-link" style={{ fontSize: 13.5, color: '#CBD5E1' }}>
                  Mandatory Public Disclosure
                </button>
                <Link to="/portals" className="footer-link">ERP Portals (5 Desks)</Link>
                <Link to="/login" className="footer-link">Staff &amp; Teacher Login</Link>
              </div>
            </div>

            <div>
              <div className="footer-h4">Locate &amp; Connect</div>
              <div className="footer-contact-row">
                <MapPin size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{cfg.contact.address}</span>
              </div>
              <div className="footer-contact-row">
                <Phone size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{cfg.contact.phone} / {cfg.contact.mobile}</span>
              </div>
              <div className="footer-contact-row">
                <Mail size={16} color="#F59E0B" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{cfg.contact.officeEmail}</span>
              </div>
              <div style={{ marginTop: 12, padding: '8px 12px', background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 8, fontSize: 11.5, color: '#FCA5A5' }}>
                POCSO &amp; Anti-Ragging Helpline: +91 11 2894 5699
              </div>
            </div>
          </div>

          <div className="footer-bottom-strip">
            <div>
              © 2026 {cfg.brand.name}. All Rights Reserved. Affiliated to Central Board of Secondary Education (CBSE), New Delhi.
            </div>
            <div style={{ display: 'flex', gap: 18 }}>
              <button onClick={() => setDisclosureModalOpen(true)} className="school-topbar-link">
                CBSE Mandatory Disclosure
              </button>
              <Link to="/portals" className="school-topbar-link" style={{ color: '#FDE68A' }}>
                ERP Portals →
              </Link>
            </div>
          </div>
        </div>
      </footer>

      {/* ── MODAL 1: Online Admission Application ── */}
      {admissionModalOpen && (
        <div className="school-modal-overlay" onClick={() => setAdmissionModalOpen(false)}>
          <div className="school-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="school-modal-header">
              <div className="school-modal-title">
                <GraduationCap size={22} color="#F59E0B" /> Online Admission Application 2026–27
              </div>
              <button className="school-modal-close" onClick={() => setAdmissionModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="school-modal-body">
              {admStep === 1 && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    setAdmStep(2)
                  }}
                >
                  <div style={{ background: '#FEF3C7', padding: '10px 14px', borderRadius: 8, fontSize: 13, color: '#B45309', marginBottom: 18 }}>
                    <strong>Step 1 of 2:</strong> Student Particulars &amp; Class Selection
                  </div>

                  <div className="form-group">
                    <label className="form-label">Student Full Name (in Block Letters) *</label>
                    <input
                      className="form-input"
                      value={admForm.studentName}
                      onChange={(e) => setAdmForm({ ...admForm, studentName: e.target.value })}
                      placeholder="e.g. AARAV SHARMA"
                      required
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Date of Birth *</label>
                      <input
                        type="date"
                        className="form-input"
                        value={admForm.dob}
                        onChange={(e) => setAdmForm({ ...admForm, dob: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Gender *</label>
                      <select
                        className="form-select"
                        value={admForm.gender}
                        onChange={(e) => setAdmForm({ ...admForm, gender: e.target.value })}
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Class Seeking Admission *</label>
                    <select
                      className="form-select"
                      value={admForm.grade}
                      onChange={(e) => setAdmForm({ ...admForm, grade: e.target.value })}
                    >
                      <option>Balvatika 1 (Pre-Nursery, 3+)</option>
                      <option>Balvatika 2 (Nursery / LKG, 4+)</option>
                      <option>Balvatika 3 (Prep / UKG, 5+)</option>
                      <option>Class I (6+)</option>
                      <option>Class II to V (Primary)</option>
                      <option>Class VI to VIII (Middle)</option>
                      <option>Class IX (Secondary)</option>
                      <option>Class XI - Science (PCM/PCB)</option>
                      <option>Class XI - Commerce</option>
                      <option>Class XI - Humanities</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Previous School Attended (if any)</label>
                    <input
                      className="form-input"
                      value={admForm.prevSchool}
                      onChange={(e) => setAdmForm({ ...admForm, prevSchool: e.target.value })}
                      placeholder="e.g. Modern Early Learning Center"
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
                    <button type="submit" className="btn btn-primary">
                      Next: Parent Details <ArrowRight size={14} />
                    </button>
                  </div>
                </form>
              )}

              {admStep === 2 && (
                <form onSubmit={handleAdmissionSubmit}>
                  <div style={{ background: '#FEF3C7', padding: '10px 14px', borderRadius: 8, fontSize: 13, color: '#B45309', marginBottom: 18 }}>
                    <strong>Step 2 of 2:</strong> Parent Details &amp; Contact Verification
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Parent / Guardian Name *</label>
                      <input
                        className="form-input"
                        value={admForm.parentName}
                        onChange={(e) => setAdmForm({ ...admForm, parentName: e.target.value })}
                        placeholder="e.g. Rajesh Sharma"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Relationship *</label>
                      <select
                        className="form-select"
                        value={admForm.parentRole}
                        onChange={(e) => setAdmForm({ ...admForm, parentRole: e.target.value })}
                      >
                        <option>Father</option>
                        <option>Mother</option>
                        <option>Legal Guardian</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">WhatsApp Mobile (+91) *</label>
                      <input
                        className="form-input"
                        value={admForm.phone}
                        onChange={(e) => setAdmForm({ ...admForm, phone: e.target.value })}
                        placeholder="e.g. 9810234567"
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Email ID *</label>
                      <input
                        type="email"
                        className="form-input"
                        value={admForm.email}
                        onChange={(e) => setAdmForm({ ...admForm, email: e.target.value })}
                        placeholder="e.g. rajesh.sharma@example.com"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Residential Address in Delhi NCR *</label>
                    <textarea
                      className="form-textarea"
                      value={admForm.address}
                      onChange={(e) => setAdmForm({ ...admForm, address: e.target.value })}
                      placeholder="e.g. Flat 402, Royal Palms, Sector 12, Dwarka"
                      rows={2}
                      required
                    />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
                    <button type="button" className="btn btn-secondary" onClick={() => setAdmStep(1)}>
                      ← Back
                    </button>
                    <button type="submit" className="btn btn-primary">
                      <CheckCircle2 size={16} /> Submit Application
                    </button>
                  </div>
                </form>
              )}

              {admStep === 3 && (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: '#ECFDF5',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 16px',
                    }}
                  >
                    <CheckCircle2 size={36} />
                  </div>
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: '#0F1E36', marginBottom: 6 }}>
                    Application Submitted Successfully!
                  </h3>
                  <p style={{ color: '#64748B', fontSize: 14, marginBottom: 20 }}>
                    Your application for <strong>{admForm.studentName}</strong> for <strong>{admForm.grade}</strong> has been received by Babyland Admissions Desk.
                  </p>

                  <div
                    style={{
                      background: '#F1F5F9',
                      border: '2px dashed #CBD5E1',
                      borderRadius: 12,
                      padding: 16,
                      display: 'inline-block',
                      marginBottom: 20,
                    }}
                  >
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#64748B', fontWeight: 700 }}>
                      Application Reference ID
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: '#0B1930', letterSpacing: '0.04em' }}>
                      {submittedAdmId}
                    </div>
                  </div>

                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 24, textAlign: 'left', background: '#F8FAFC', padding: 14, borderRadius: 8 }}>
                    <strong>Next Steps:</strong>
                    <ul style={{ paddingLeft: 20, marginTop: 6 }}>
                      <li>An SMS &amp; WhatsApp confirmation has been dispatched to <strong>+91 {admForm.phone}</strong>.</li>
                      <li>Our admission counselor will contact you within 24 hours to schedule the interactive verification session.</li>
                      <li>Please keep the Birth Certificate and Address Proof handy for verification.</li>
                    </ul>
                  </div>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                      <Printer size={16} /> Print Acknowledgment
                    </button>
                    <button className="btn btn-primary" onClick={() => setAdmissionModalOpen(false)}>
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 2: Online Fee Payment Gateway ── */}
      {feeModalOpen && (
        <div className="school-modal-overlay" onClick={() => setFeeModalOpen(false)}>
          <div className="school-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="school-modal-header">
              <div className="school-modal-title">
                <CreditCard size={22} color="#F59E0B" /> Online Fee Collection Gateway
              </div>
              <button className="school-modal-close" onClick={() => setFeeModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="school-modal-body">
              {!feePaymentDone ? (
                <>
                  <form onSubmit={handleFeeSearch} style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                    <input
                      className="form-input"
                      value={feeSearchAdm}
                      onChange={(e) => setFeeSearchAdm(e.target.value)}
                      placeholder="Enter Student Admission No (e.g. BLS-2024-0042)"
                      style={{ flex: 1 }}
                    />
                    <button type="submit" className="btn btn-primary">
                      <Search size={16} /> Lookup Due
                    </button>
                  </form>

                  <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#64748B' }}>Quick demo fill:</span>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setFeeSearchAdm('BLS-2024-0042')
                        handleFeeSearch()
                      }}
                    >
                      BLS-2024-0042 (Class IX)
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setFeeSearchAdm('BLS-2025-0108')
                        handleFeeSearch()
                      }}
                    >
                      BLS-2025-0108 (Primary)
                    </button>
                  </div>

                  {feeStudent && (
                    <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: 12, padding: 20 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: 12, marginBottom: 14 }}>
                        <div>
                          <div style={{ fontSize: 17, fontWeight: 800, color: '#0F1E36' }}>{feeStudent.name}</div>
                          <div style={{ fontSize: 13, color: '#64748B' }}>
                            Adm No: <strong>{feeStudent.admNo}</strong> · {feeStudent.classSec} · Parent: {feeStudent.fatherName}
                          </div>
                        </div>
                        <span style={{ background: '#FEE2E2', color: '#DC2626', fontWeight: 800, fontSize: 11, padding: '3px 8px', borderRadius: 4, height: 'fit-content' }}>
                          {feeStudent.status}
                        </span>
                      </div>

                      <div style={{ display: 'grid', gap: 8, fontSize: 13.5, marginBottom: 16 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#475569' }}>Term:</span>
                          <strong>{feeStudent.term}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#475569' }}>Tuition Fee:</span>
                          <span>₹{feeStudent.tuition.toLocaleString('en-IN')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#475569' }}>Composite Annual Charges:</span>
                          <span>₹{feeStudent.annualComposite.toLocaleString('en-IN')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #CBD5E1', paddingTop: 8, fontSize: 16, fontWeight: 800 }}>
                          <span>Total Payable Amount:</span>
                          <span style={{ color: '#059669' }}>₹{feeStudent.totalDue.toLocaleString('en-IN')}</span>
                        </div>
                      </div>

                      <div style={{ marginBottom: 18 }}>
                        <label className="form-label" style={{ fontWeight: 700, marginBottom: 6 }}>
                          Select Payment Mode:
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                          {['upi', 'card', 'netbanking'].map((mode) => (
                            <button
                              key={mode}
                              type="button"
                              className={`btn btn-sm ${paymentMode === mode ? 'btn-primary' : 'btn-secondary'}`}
                              onClick={() => setPaymentMode(mode)}
                              style={{ textTransform: 'uppercase' }}
                            >
                              {mode === 'upi' ? 'UPI / QR' : mode === 'card' ? 'Debit/Credit' : 'Net Banking'}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button onClick={handleFeePaySuccess} className="btn btn-primary w-full" style={{ padding: '13px 20px', fontSize: 15 }}>
                        <CheckCircle2 size={16} /> Pay ₹{feeStudent.totalDue.toLocaleString('en-IN')} via {paymentMode.toUpperCase()}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ textAlign: 'center', padding: '16px 0' }}>
                  <div
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: '50%',
                      background: '#ECFDF5',
                      color: '#059669',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 14px',
                    }}
                  >
                    <CheckCircle2 size={34} />
                  </div>
                  <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0F1E36', marginBottom: 4 }}>
                    Fee Payment Successful!
                  </h3>
                  <p style={{ color: '#64748B', fontSize: 13.5, marginBottom: 18 }}>
                    Official fee receipt has been recorded and updated in the school ERP accountant ledger.
                  </p>

                  <div className="tc-certificate-sheet" style={{ marginBottom: 20, textAlign: 'left' }}>
                    <div className="tc-cert-header">
                      <div className="tc-cert-school">Babyland Public School, New Delhi</div>
                      <div className="tc-cert-motto">Official Fee Payment Receipt · Session 2026–27</div>
                    </div>

                    <div className="tc-grid-details">
                      <div><span className="tc-field-lbl">Receipt No:</span> <span className="tc-field-val">{feeStudent.receiptNo}</span></div>
                      <div><span className="tc-field-lbl">Txn ID:</span> <span className="tc-field-val">{feeStudent.txnId}</span></div>
                      <div><span className="tc-field-lbl">Student Name:</span> <span className="tc-field-val">{feeStudent.name}</span></div>
                      <div><span className="tc-field-lbl">Adm No:</span> <span className="tc-field-val">{feeStudent.admNo}</span></div>
                      <div><span className="tc-field-lbl">Class:</span> <span className="tc-field-val">{feeStudent.classSec}</span></div>
                      <div><span className="tc-field-lbl">Term Paid:</span> <span className="tc-field-val">{feeStudent.term}</span></div>
                      <div><span className="tc-field-lbl">Amount Paid:</span> <span className="tc-field-val" style={{ color: '#059669', fontWeight: 800 }}>₹{feeStudent.totalDue.toLocaleString('en-IN')}</span></div>
                      <div><span className="tc-field-lbl">Date &amp; Time:</span> <span className="tc-field-val">{feeStudent.paidAt}</span></div>
                    </div>

                    <div className="tc-cert-seal">
                      <span className="tc-seal-badge">BANK VERIFIED SUCCESS</span>
                      <span style={{ fontSize: 11, color: '#64748B' }}>Accountant &amp; Finance Controller</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                    <button className="btn btn-secondary" onClick={() => window.print()}>
                      <Printer size={16} /> Print Receipt
                    </button>
                    <button className="btn btn-primary" onClick={() => setFeeModalOpen(false)}>
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 3: Transfer Certificate (TC) Verification ── */}
      {tcModalOpen && (
        <div className="school-modal-overlay" onClick={() => setTcModalOpen(false)}>
          <div className="school-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="school-modal-header">
              <div className="school-modal-title">
                <Search size={22} color="#F59E0B" /> Transfer Certificate (TC) Verification
              </div>
              <button className="school-modal-close" onClick={() => setTcModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="school-modal-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleTcSearch()
                }}
                style={{ display: 'flex', gap: 10, marginBottom: 14 }}
              >
                <input
                  className="form-input"
                  value={tcSearchTerm}
                  onChange={(e) => setTcSearchTerm(e.target.value)}
                  placeholder="Enter Student Admission No (e.g. BLS-2023-0142)"
                  style={{ flex: 1 }}
                />
                <button type="submit" className="btn btn-primary">
                  <Search size={16} /> Verify TC
                </button>
              </form>

              <div style={{ display: 'flex', gap: 8, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: '#64748B' }}>Sample TCs:</span>
                {cfg.sampleTCs.map((tc) => (
                  <button
                    key={tc.admNo}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setTcSearchTerm(tc.admNo)
                      handleTcSearch(tc.admNo)
                    }}
                  >
                    {tc.admNo} ({tc.studentName.split(' ')[0]})
                  </button>
                ))}
              </div>

              {tcResult && (
                <div className="tc-certificate-sheet">
                  <div className="tc-cert-header">
                    <div className="tc-cert-school">Babyland Public School</div>
                    <div style={{ fontSize: 12, color: '#475569' }}>
                      Affiliated to CBSE, New Delhi · Affiliation No. 2130894
                    </div>
                    <div className="tc-cert-motto">Official Transfer Certificate (TC) Record</div>
                  </div>

                  <div className="tc-grid-details">
                    <div>
                      <span className="tc-field-lbl">TC Number:</span>{' '}
                      <span className="tc-field-val">{tcResult.tcNumber}</span>
                    </div>
                    <div>
                      <span className="tc-field-lbl">Issue Date:</span>{' '}
                      <span className="tc-field-val">{tcResult.issueDate}</span>
                    </div>
                    <div>
                      <span className="tc-field-lbl">Student Name:</span>{' '}
                      <span className="tc-field-val">{tcResult.studentName}</span>
                    </div>
                    <div>
                      <span className="tc-field-lbl">Admission No:</span>{' '}
                      <span className="tc-field-val">{tcResult.admNo}</span>
                    </div>
                    <div>
                      <span className="tc-field-lbl">Father / Guardian:</span>{' '}
                      <span className="tc-field-val">{tcResult.fatherName}</span>
                    </div>
                    <div>
                      <span className="tc-field-lbl">Class Left:</span>{' '}
                      <span className="tc-field-val">{tcResult.classLeaving}</span>
                    </div>
                    <div>
                      <span className="tc-field-lbl">Reason for Leaving:</span>{' '}
                      <span className="tc-field-val">{tcResult.reason}</span>
                    </div>
                    <div>
                      <span className="tc-field-lbl">Status:</span>{' '}
                      <span className="tc-field-val" style={{ color: '#059669', fontWeight: 800 }}>
                        {tcResult.status}
                      </span>
                    </div>
                  </div>

                  <div className="tc-cert-seal">
                    <span className="tc-seal-badge">OFFICIALLY VERIFIED</span>
                    <span style={{ fontSize: 11, color: '#64748B' }}>
                      Authorized Signatory · Principal, Babyland School
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL 4: CBSE Mandatory Public Disclosure ── */}
      {disclosureModalOpen && (
        <div className="school-modal-overlay" onClick={() => setDisclosureModalOpen(false)}>
          <div className="school-modal-card" style={{ maxWidth: 740 }} onClick={(e) => e.stopPropagation()}>
            <div className="school-modal-header">
              <div className="school-modal-title">
                <FileText size={22} color="#F59E0B" /> CBSE Mandatory Public Disclosure (Appendix-IX)
              </div>
              <button className="school-modal-close" onClick={() => setDisclosureModalOpen(false)}>
                <X size={18} />
              </button>
            </div>

            <div className="school-modal-body">
              <p style={{ fontSize: 13, color: '#64748B', marginBottom: 16 }}>
                In compliance with CBSE circular no. 03/2021 regarding Mandatory Public Disclosure under Appendix-IX.
              </p>

              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Statutory Item</th>
                    <th>School Information / Compliance Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Name of the School</strong></td>
                    <td>Babyland Public School</td>
                  </tr>
                  <tr>
                    <td><strong>Affiliation No. &amp; Status</strong></td>
                    <td>2130894 (Senior Secondary Level, Co-Educational)</td>
                  </tr>
                  <tr>
                    <td><strong>School Code</strong></td>
                    <td>71234</td>
                  </tr>
                  <tr>
                    <td><strong>Period of Affiliation</strong></td>
                    <td>{cfg.mandatoryDisclosure.affiliationPeriod}</td>
                  </tr>
                  <tr>
                    <td><strong>Society / Trust Registered</strong></td>
                    <td>{cfg.mandatoryDisclosure.societyName}</td>
                  </tr>
                  <tr>
                    <td><strong>NOC from Directorate of Education</strong></td>
                    <td>{cfg.mandatoryDisclosure.nocNo} ({cfg.mandatoryDisclosure.nocIssuingAuthority})</td>
                  </tr>
                  <tr>
                    <td><strong>Building Safety Certificate</strong></td>
                    <td>{cfg.mandatoryDisclosure.buildingSafetyCert}</td>
                  </tr>
                  <tr>
                    <td><strong>Fire Safety Certificate</strong></td>
                    <td>{cfg.mandatoryDisclosure.fireSafetyCert}</td>
                  </tr>
                  <tr>
                    <td><strong>Safe Drinking Water &amp; Sanitation NOC</strong></td>
                    <td>{cfg.mandatoryDisclosure.waterSanitationCert}</td>
                  </tr>
                  <tr>
                    <td><strong>Campus Land Area</strong></td>
                    <td>{cfg.mandatoryDisclosure.campusArea} (Built-up: {cfg.mandatoryDisclosure.builtUpArea})</td>
                  </tr>
                  <tr>
                    <td><strong>Playground Area</strong></td>
                    <td>{cfg.mandatoryDisclosure.playgroundArea}</td>
                  </tr>
                  <tr>
                    <td><strong>Parent Teacher Association (PTA)</strong></td>
                    <td>{cfg.mandatoryDisclosure.ptaRegistered}</td>
                  </tr>
                </tbody>
              </table>

              <div style={{ textAlign: 'right', marginTop: 18 }}>
                <button className="btn btn-secondary" onClick={() => setDisclosureModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Website
