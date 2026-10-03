"""Ad-hoc row-count reporter for verification (dev tool, not part of the API)."""
import sys
from sqlalchemy import text
from database import engine

SKIP = {"sqlite_sequence", "sqlite_master"}
ORDER = [
    "users", "students", "teachers", "attendance", "marks", "fees", "timetable",
    "notices", "academic_years", "class_sections", "staff_profiles",
    "staff_permissions", "parent_student_links", "teacher_assignments",
    "notice_reads", "assignments", "assignment_submissions", "calendar_events",
    "audit_logs", "fee_heads", "fee_structures", "fee_structure_items",
    "discounts", "scholarships", "student_scholarships", "invoices",
    "invoice_items", "payments", "fines", "refunds", "expense_categories",
    "expenses", "incomes", "grades",
]

label = sys.argv[1] if len(sys.argv) > 1 else "counts"
with engine.connect() as conn:
    names = [r[0] for r in conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"))]
    rows = {}
    for name in names:
        rows[name] = conn.execute(text(f"SELECT COUNT(*) FROM \"{name}\"")).scalar()
    print(f"===== {label} =====")
    for name in ORDER:
        if name in rows:
            print(f"{name:26s} {rows[name]}")
    extra = sorted(set(rows) - set(ORDER))
    for name in extra:
        print(f"{name:26s} {rows[name]}")
    print(f"total tables: {len(rows)}")
