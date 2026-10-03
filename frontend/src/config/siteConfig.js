/**
 * Babyland School — Institutional Configuration & Content Data
 * Premier Indian Senior Secondary Institution affiliated to CBSE, New Delhi
 */

export const schoolConfig = {
  brand: {
    name: 'Babyland Public School',
    shortName: 'Babyland School',
    hindiName: 'बेबीलैंड पब्लिक स्कूल',
    mottoSanskrit: 'तमसो मा ज्योतिर्गमय',
    mottoEnglish: 'From Darkness, Lead Us to Light',
    established: 1998,
    affiliation: {
      board: 'CBSE, New Delhi',
      affiliationNo: '2130894',
      schoolCode: '71234',
      udiseCode: '07010204512',
      status: 'Senior Secondary (Co-Educational, English Medium)',
    },
  },

  contact: {
    address: 'Plot No. 8, Institutional Area, Sector 12, Dwarka, New Delhi - 110078',
    city: 'New Delhi',
    state: 'Delhi NCR',
    pincode: '110078',
    phone: '+91 11 2894 5600',
    phoneAlt: '+91 11 2894 5601',
    mobile: '+91 98102 34567',
    whatsapp: '+91 98102 34567',
    admissionsEmail: 'admissions@babylandschool.edu.in',
    officeEmail: 'info@babylandschool.edu.in',
    principalEmail: 'principal@babylandschool.edu.in',
    timings: {
      summer: '7:45 AM – 2:15 PM (Monday to Saturday)',
      winter: '8:15 AM – 2:45 PM (Monday to Saturday)',
      officeHours: '8:00 AM – 4:00 PM',
      visitingPrincipal: '10:00 AM – 12:00 PM (By prior appointment)',
    },
  },

  tickerNotices: [
    {
      id: 1,
      badge: 'ADMISSIONS 2026-27',
      text: 'Registration Open for Nursery, Balvatika, Class I to IX & XI for Academic Session 2026–27. Apply online or visit school reception.',
      date: '02 Oct 2026',
      urgent: true,
    },
    {
      id: 2,
      badge: 'CBSE NOTIFICATION',
      text: 'CBSE Board Examination 2026 sample question papers and practical guidelines uploaded on academic portal.',
      date: '28 Sep 2026',
      urgent: false,
    },
    {
      id: 3,
      badge: 'DATESHEET',
      text: 'Periodic Assessment-2 (PA-2) Datesheet for Classes I to XII is now available in Student & Parent ERP portals.',
      date: '25 Sep 2026',
      urgent: false,
    },
    {
      id: 4,
      badge: 'ACHIEVEMENT',
      text: 'Congratulations! Babyland STEM & Robotics team wins 1st Prize at National Atal Tinkering Fest 2026.',
      date: '20 Sep 2026',
      urgent: false,
    },
    {
      id: 5,
      badge: 'FEE CIRCULAR',
      text: 'Quarter-3 fee submission last date is 15th October 2026. Use our instant Online Fee Portal to avoid late fine.',
      date: '18 Sep 2026',
      urgent: true,
    },
  ],

  hero: {
    badge: 'Affiliated to CBSE, New Delhi · Co-Ed English Medium',
    title: 'Nurturing Sanskar, Inspiring Innovation &',
    highlight: 'Academic Brilliance',
    subtitle:
      'Rooted in Indian ethos and aligned with the National Education Policy (NEP 2020), Babyland School fosters compassionate character, critical inquiry, and global competence from Foundational Balvatika to Senior Secondary Grade XII.',
    ctaPrimary: 'Apply for Admission 2026–27',
    ctaSecondary: 'School ERP Portals',
  },

  stats: [
    { value: '2,800+', label: 'Students Enrolled', sub: 'Nursery to XII' },
    { value: '140+', label: 'Qualified Educators', sub: 'TGT, PGT, PRT & Mentors' },
    { value: '100%', label: 'CBSE Board Pass Rate', sub: '42% Scored 90%+' },
    { value: '28+', label: 'Years of Legacy', sub: 'Excellence since 1998' },
    { value: '18:1', label: 'Student-Teacher Ratio', sub: 'Individualized Attention' },
  ],

  principal: {
    name: 'Dr. Sunita Mukherjee',
    designation: 'Principal & Director Academics',
    credentials: 'M.Sc. (Physics), M.Ed., Ph.D. (Educational Pedagogy)',
    experience: '24+ Years in Leading CBSE Institutions',
    quote:
      'Education is not merely the acquisition of facts, but the illumination of character, the awakening of curiosity, and the cultivation of timeless Indian values (Sanskar). At Babyland School, we empower every young soul to dream boldly, think critically, and lead with empathy.',
    pillars: [
      { title: 'Vidya & Sanskar', desc: 'Holistic character building blending traditional values with modern scientific temper.' },
      { title: 'NEP 2020 5+3+3+4', desc: 'Seamless experiential pedagogy prioritizing competency over rote memorization.' },
      { title: 'Safe & Inclusive Care', desc: 'Nurturing environment with round-the-clock CCTV, GPS transport, and mental wellness care.' },
    ],
  },

  academicWings: [
    {
      id: 'foundational',
      stage: 'Foundational Stage',
      classes: 'Balvatika 1, 2, 3 & Classes I – II',
      ages: 'Ages 3 to 8 Years',
      tagline: 'Play, Discover, Blossom',
      description:
        'Activity-centered, play-based learning emphasizing phonetics, early numeracy, emotional security, and sensory exploration in cheerful child-friendly classrooms.',
      features: [
        'Montessori & experiential play kits',
        'Phonics, storytelling & rhymes in English & Hindi',
        'Motor skill development, clay modeling & art',
        'Safe, colorful indoor play arena with zero sharp edges',
      ],
      color: '#0284C7',
      bg: '#E0F2FE',
    },
    {
      id: 'preparatory',
      stage: 'Preparatory Stage',
      classes: 'Classes III to V',
      ages: 'Ages 8 to 11 Years',
      tagline: 'Building Strong Conceptual Foundations',
      description:
        'Gradual transition to structured learning through interactive discussions, experiential science experiments, mathematical reasoning, and creative writing.',
      features: [
        'Smart interactive digital board classrooms',
        'Environmental Studies (EVS), Vedic Math & Computing',
        'Music, Indian classical dance, theatre & yoga',
        'Library reading hours & public speaking workshops',
      ],
      color: '#059669',
      bg: '#D1FAE5',
    },
    {
      id: 'middle',
      stage: 'Middle Stage',
      classes: 'Classes VI to VIII',
      ages: 'Ages 11 to 14 Years',
      tagline: 'Inquiry, Innovation & Skill Building',
      description:
        'Deep conceptual exploration in Sciences, Mathematics, Social Sciences, and Languages. Hands-on coding, robotics tinkering, and co-curricular leadership.',
      features: [
        'Atal Tinkering Lab (ATL) AI & Robotics projects',
        'Three-Language Formula (English, Hindi, Sanskrit/French)',
        'Composite Science laboratories & hands-on practicals',
        'Inter-house debates, quiz competitions & Olympiad coaching',
      ],
      color: '#D97706',
      bg: '#FEF3C7',
    },
    {
      id: 'secondary',
      stage: 'Secondary & Senior Secondary',
      classes: 'Classes IX to XII',
      ages: 'Ages 14 to 18 Years',
      tagline: 'Academic Mastery, Career Mentorship & Board Excellence',
      description:
        'Rigorous CBSE board curriculum with customized career guidance, JEE/NEET/CUET foundation workshops, and streams in Science, Commerce, and Humanities.',
      features: [
        'Streams: Science (PCM/PCB), Commerce & Humanities',
        'Specialized Physics, Chemistry, Biology & Computer Labs',
        'Dedicated Career Counselling & Competitive Exam cell',
        'Consistent 100% CBSE Board Results with top national percentiles',
      ],
      color: '#4F46E5',
      bg: '#EEF2FF',
    },
  ],

  facilities: [
    {
      id: 'smart-class',
      title: 'Smart Digital Classrooms',
      badge: 'Interactive Learning',
      image: '/assets/images/smart_classroom.jpg',
      description:
        'Acoustically treated, air-conditioned classrooms equipped with interactive 75-inch 4K touch displays, digital curriculum modules, and ergonomic student seating.',
    },
    {
      id: 'robotics',
      title: 'Atal Tinkering & Robotics Lab',
      badge: 'STEM & AI Hub',
      image: '/assets/images/robotics_lab.jpg',
      description:
        'NITI Aayog-aligned Atal Tinkering Lab equipped with 3D printers, Arduino & Raspberry Pi kits, drone assembly stations, and artificial intelligence workstations.',
    },
    {
      id: 'sports',
      title: '5-Acre Sports & Athletic Arena',
      badge: 'Physical Excellence',
      image: '/assets/images/sports_activities.jpg',
      description:
        'Floodlit basketball and tennis courts, 200m synthetic running track, full-size football/cricket pitch, indoor badminton pavilion, and dedicated yoga hall.',
    },
    {
      id: 'kindergarten',
      title: 'Vibrant Balvatika Nursery Arena',
      badge: 'Early Years Wonderland',
      image: '/assets/images/kindergarten.jpg',
      description:
        'Warm, soft-floored indoor play zone with Montessori learning toys, ball pool, puppet theatre, and storytelling amphitheater designed specially for toddlers.',
    },
  ],

  houses: [
    {
      name: 'Ashoka House',
      emperor: 'Emperor Ashoka',
      motto: 'Truth & Righteousness (सत्यमेव जयते)',
      color: '#15803D',
      bg: '#DCFCE7',
      points: 1240,
      captain: 'Arjun Singhal (XII-A)',
    },
    {
      name: 'Shivaji House',
      emperor: 'Chhatrapati Shivaji Maharaj',
      motto: 'Valour & Selfless Duty (कर्मण्येवाधिकारस्ते)',
      color: '#EA580C',
      bg: '#FFEDD5',
      points: 1310,
      captain: 'Meera Deshmukh (XII-B)',
    },
    {
      name: 'Tagore House',
      emperor: 'Rabindranath Tagore',
      motto: 'Wisdom & Creative Light (ज्ञानं परमं बलम्)',
      color: '#2563EB',
      bg: '#DBEAFE',
      points: 1285,
      captain: 'Devansh Roy (XII-C)',
    },
    {
      name: 'Raman House',
      emperor: 'Sir C.V. Raman',
      motto: 'Scientific Inquiry & Innovation',
      color: '#DC2626',
      bg: '#FEE2E2',
      points: 1195,
      captain: 'Shreya Iyer (XII-A)',
    },
  ],

  toppers: [
    {
      name: 'Aarav Sharma',
      exam: 'CBSE Class XII Board 2026',
      stream: 'Science Stream (PCM)',
      score: '99.4%',
      badge: 'School Topper · AIR 42',
      quote: 'The rigorous conceptual tests and dedicated faculty guidance at Babyland made all the difference.',
    },
    {
      name: 'Ananya Verma',
      exam: 'CBSE Class XII Board 2026',
      stream: 'Commerce Stream',
      score: '98.8%',
      badge: '100 in Accountancy & Economics',
      quote: 'Babyland instilled the discipline and analytical mindset needed for top national ranking.',
    },
    {
      name: 'Rohan Gupta',
      exam: 'CBSE Class X Board 2026',
      stream: 'All India Secondary Exam',
      score: '99.0%',
      badge: 'Perfect 100 in Maths & Science',
      quote: 'Hands-on practicals in the Atal Tinkering Lab helped me grasp complex topics effortlessly.',
    },
    {
      name: 'Kavya Pillai',
      exam: 'CBSE Class XII Board 2026',
      stream: 'Humanities Stream',
      score: '98.4%',
      badge: 'Centum in History & Pol Science',
      quote: 'The library resources and debate clubs helped me express historical analyses with confidence.',
    },
  ],

  feeMatrix: [
    {
      classGroup: 'Foundational (Balvatika 1, 2, 3 / Nursery, KG)',
      tuitionQuarterly: 14500,
      annualComposite: 12000,
      admissionOneTime: 25000,
      activityQuarterly: 2500,
      totalQuarterly: 17000,
    },
    {
      classGroup: 'Primary (Classes I to V)',
      tuitionQuarterly: 16500,
      annualComposite: 14000,
      admissionOneTime: 25000,
      activityQuarterly: 3000,
      totalQuarterly: 19500,
    },
    {
      classGroup: 'Middle School (Classes VI to VIII)',
      tuitionQuarterly: 18500,
      annualComposite: 16000,
      admissionOneTime: 25000,
      activityQuarterly: 3500,
      totalQuarterly: 22000,
    },
    {
      classGroup: 'Secondary (Classes IX & X)',
      tuitionQuarterly: 21000,
      annualComposite: 18000,
      admissionOneTime: 25000,
      activityQuarterly: 4000,
      totalQuarterly: 25000,
    },
    {
      classGroup: 'Senior Secondary (Classes XI & XII - Science / Comm / Arts)',
      tuitionQuarterly: 24500,
      annualComposite: 20000,
      admissionOneTime: 25000,
      activityQuarterly: 4500,
      totalQuarterly: 29000,
    },
  ],

  testimonials: [
    {
      name: 'Rajesh & Suman Gupta',
      role: 'Parents of Arnav (Class IV-A)',
      location: 'Dwarka Sector 19, New Delhi',
      rating: 5,
      text: 'Enrolling our son at Babyland School has been the most fulfilling decision. The blend of cultural values with robotics and sports has helped him grow into an inquisitive and well-mannered child.',
    },
    {
      name: 'Col. Vikramaditya Singh (Retd.)',
      role: 'Parent of Tanvi (Class IX-B)',
      location: 'Janakpuri, New Delhi',
      rating: 5,
      text: 'The discipline, safety protocols, and personalized teacher attention at Babyland are exemplary. The school bus GPS tracking app provides complete peace of mind to working parents.',
    },
    {
      name: 'Dr. Neha Malhotra',
      role: 'Parent of Kabir (Balvatika 2 / KG)',
      location: 'Palam Vihar, Gurugram',
      rating: 5,
      text: 'The foundational wing is truly a wonderland for early learners. My son literally looks forward to going to school every morning! The teachers treat each little child with motherly care.',
    },
  ],

  sampleTCs: [
    {
      admNo: 'BLS-2023-0142',
      studentName: 'Aarush Bhattacharya',
      fatherName: 'Subhash Bhattacharya',
      classLeaving: 'Class VIII-A',
      tcNumber: 'TC/2026/048',
      issueDate: '24 Mar 2026',
      reason: 'Parent transfer to Bengaluru',
      status: 'VERIFIED & ISSUED',
    },
    {
      admNo: 'BLS-2024-0089',
      studentName: 'Rhea Sengupta',
      fatherName: 'Amitava Sengupta',
      classLeaving: 'Class X-B',
      tcNumber: 'TC/2026/059',
      issueDate: '15 Apr 2026',
      reason: 'Relocating to Mumbai',
      status: 'VERIFIED & ISSUED',
    },
    {
      admNo: 'BLS-2022-0311',
      studentName: 'Manavpreet Singh',
      fatherName: 'Gurmeet Singh',
      classLeaving: 'Class V-C',
      tcNumber: 'TC/2026/072',
      issueDate: '02 May 2026',
      reason: 'Higher studies admission',
      status: 'VERIFIED & ISSUED',
    },
  ],

  mandatoryDisclosure: {
    affiliationPeriod: '01.04.2023 to 31.03.2028 (Extended)',
    societyName: 'Babyland Educational & Welfare Society (Reg. No. S/28491)',
    nocIssuingAuthority: 'Directorate of Education, Govt. of NCT of Delhi',
    nocNo: 'DE.15(Act-I)/NOC/2021/4812',
    buildingSafetyCert: 'PWD Delhi Municipal Corp (Valid up to 2028)',
    fireSafetyCert: 'Delhi Fire Service (DFS/HQ/2025/MS/789)',
    waterSanitationCert: 'Delhi Jal Board (DJB/ZRO/2025/3124)',
    campusArea: '18,210 sq. meters (4.5 Acres)',
    builtUpArea: '9,450 sq. meters',
    playgroundArea: '8,760 sq. meters',
    ptaRegistered: 'Yes · Active Parent Teacher Association',
  },
}

export default schoolConfig
