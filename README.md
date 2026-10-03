# 🏫 Babyland English Medium High School Management System

A modern, full-featured, full-stack school ERP and management system built with **FastAPI (Python)** and **React 18 + Vite**. Features 11 specialized role-based portals, full RBAC, comprehensive academic planning, fee/finance invoicing, timetable scheduling, examinations, and grade reporting.

---

## 🚀 Key Highlights & Portals

The application provides dedicated dashboards and workflows for **11 distinct user roles**:

| Portal / Role | Demo Email | Default Password | Key Features |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@babyland.com` | `admin123` | Full system control, RBAC, users, audit logs, global settings |
| **Principal** | `principal@babyland.com` | `principal123` | Institutional KPIs, teacher oversight, announcements, academic audit |
| **Vice Principal**| `viceprincipal@babyland.com` | `vp123` | Timetables, substitutions, discipline, daily operations |
| **Teacher** | `teacher@babyland.com` | `teacher123` | Attendance marking, marks entry, assignments, student performance |
| **Student** | `student@babyland.com` | `student123` | Timetable, assignments, homework submissions, report cards, fees |
| **Parent** | `parent@babyland.com` | `parent123` | Multi-child switcher, fee payments, attendance tracking, notices |
| **Accountant** | `accountant@babyland.com` | `accountant123` | Fee structures, invoices, payment collection, expenses, finance summary |
| **Librarian** | `librarian@babyland.com` | `librarian123` | Book catalogue, issuing, returns, overdue tracking |
| **Receptionist** | `receptionist@babyland.com` | `receptionist123` | Visitor logs, inquiries, admission leads, parent queries |
| **Staff** | `staff@babyland.com` | `staff123` | Internal notices, department workflow, personal profile |
| **Transport** | `transport@babyland.com` | `transport123` | Bus routes, vehicle fleet, driver records, student allocations |

---

## 🛠️ Tech Stack

- **Backend**: Python 3.10+, FastAPI, SQLAlchemy, SQLite / PostgreSQL, JWT Authentication (bcrypt), Pydantic v2.
- **Frontend**: React 18, Vite 5, React Router 6, Axios, Recharts, Lucide Icons, Modern CSS Design System.
- **Database**: SQLite (pre-seeded with demo data; supports PostgreSQL via `DATABASE_URL`).

---

## 💻 Local Development Setup

### 1. Backend

```bash
cd backend

# Create virtual environment (optional but recommended)
python -m venv venv
# Windows:
venv\Scripts\activate
# Linux/macOS:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run backend development server (starts on http://localhost:8000)
uvicorn main:app --reload --port 8000
```
Interactive Swagger API documentation will be available at: `http://localhost:8000/docs`

### 2. Frontend

```bash
cd frontend

# Install node dependencies
npm install

# Start Vite dev server (runs on http://localhost:3000)
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## 🌐 Where to Host & How (Deployment Guide)

### 🥇 Recommended Approach (Fastest, Free & Most Reliable)
Deploy the **Frontend on Vercel** and the **Backend on Render**.

```
[User Browser]
      │
      ├───► Vercel (Frontend React SPA)
      │        │
      │        ▼  API Requests
      └────► Render.com (Backend FastAPI Service)
```

---

### Step 1: Deploy Backend to Render.com (Free)

1. Sign up / Log in to [Render.com](https://render.com).
2. Click **New +** > **Web Service**.
3. Connect your GitHub repository: `https://github.com/amaan-exe/school`.
4. Configure the Web Service settings:
   - **Name**: `school-management-api`
   - **Root Directory**: `backend`
   - **Environment**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. **Environment Variables**:
   - `ALLOWED_ORIGIN_REGEX`: `https?://.*`
6. Click **Create Web Service**.
7. Once deployed, copy your Render backend URL (e.g. `https://school-management-api.onrender.com`).

---

### Step 2: Deploy Frontend to Vercel (Free)

1. Sign up / Log in to [Vercel](https://vercel.com).
2. Click **Add New...** > **Project**.
3. Import your GitHub repository: `amaan-exe/school`.
4. Configure Project settings:
   - **Root Directory**: Click `Edit` and select `frontend`.
   - **Framework Preset**: `Vite` (automatically detected).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
5. **Environment Variables**:
   - Add `VITE_API_URL` = `https://<YOUR-RENDER-BACKEND-URL>/api`
   *(Example: `https://school-management-api.onrender.com/api`)*
6. Click **Deploy**.
7. Your app is live with SSL, global CDN, and automated Git deploys!

---

### Alternative Hosting Options

| Platform | Best For | How to Deploy |
| :--- | :--- | :--- |
| **Railway.app** | Full-stack in one place | Link repo, add backend service (Root: `backend`, command `uvicorn main:app --host 0.0.0.0 --port $PORT`), add frontend static service. |
| **Netlify** | Frontend alternative | Select `frontend` root, build command `npm run build`, publish directory `frontend/dist`, set `VITE_API_URL`. |
| **DigitalOcean / Hetzner / AWS VPS** | Dedicated custom server | Run using Docker Compose or Nginx reverse proxy + Gunicorn/Uvicorn systemd service. |

---

## 📁 Repository Structure

```
├── backend/
│   ├── main.py                    # FastAPI root application & CORS configuration
│   ├── database.py                # Database connection & session setup
│   ├── models.py                  # SQLAlchemy ORM models (Portals, RBAC, Fees, Exams)
│   ├── schemas.py                 # Pydantic validation schemas
│   ├── auth.py                    # JWT token handling & password hashing
│   ├── routers/                   # Modular route controllers
│   │   ├── auth.py, students.py, teachers.py, attendance.py,
│   │   ├── marks.py, fees.py, timetable.py, notices.py, reports.py,
│   │   ├── structure.py, people.py, engagement.py, finance.py,
│   │   ├── academics.py, exams.py
│   ├── seed_comprehensive_data.py # Demo data generator
│   └── requirements.txt           # Python dependencies
│
├── frontend/
│   ├── src/
│   │   ├── api.js                 # Unified Axios client with JWT interceptor
│   │   ├── App.jsx                # Route definitions & guards
│   │   ├── pages/                 # Portal dashboards & module pages
│   │   ├── components/            # Layout, Navigation, Widgets & UI elements
│   │   └── context/               # AuthContext & state providers
│   ├── vercel.json                # SPA routing configuration for Vercel
│   ├── package.json               # Node dependencies & build scripts
│   └── vite.config.js             # Vite configuration & dev proxy
│
├── .gitignore                     # Production-ready git ignore rules
└── README.md                      # Documentation & deployment instructions
```

---

## 🛡️ License

This project is licensed under the MIT License.
