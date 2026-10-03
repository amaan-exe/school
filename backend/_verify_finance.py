"""Phase-3 finance verification round trip (dev-only script, not part of the API).

Run from the backend directory:  python _verify_finance.py
Leaves NO temp rows behind: every object created here is deleted in `finally`.
"""
import json
import sys
from datetime import date, timedelta

from fastapi.testclient import TestClient

import main
from auth import get_password_hash
from database import SessionLocal
from models import User

client = TestClient(main.app)

PASS, FAIL = [], []


def check(label, cond, extra=""):
    (PASS if cond else FAIL).append(label)
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f"  {extra}" if extra else ""))


def section(name):
    print(f"\n=== {name} ===")


def token_for(email, password="admin123"):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


ADMIN = {"Authorization": "Bearer " + client.post(
    "/api/auth/login", json={"email": "admin@babyland.com", "password": "admin123"}
).json()["access_token"]}

temp = {}   # tracked ids for cleanup
db = SessionLocal()

try:
    # ── 1. EMPTY-DB summary (must be all zeros, must not 500) ────────────────
    section("1. Empty-DB /finance/summary/ (all zeros)")
    r = client.get("/api/finance/summary/", headers=ADMIN)
    check("summary returns 200", r.status_code == 200, f"status={r.status_code}")
    s = r.json()
    for k in ("total_billed", "collected", "outstanding", "overdue",
              "today_collection", "month_collection", "expenses_total"):
        check(f"{k} == 0", s.get(k) == 0, f"got {s.get(k)!r}")
    for k in ("by_fee_head", "expense_by_category", "income_by_source"):
        check(f"{k} == []", s.get(k) == [], f"got {s.get(k)!r}")
    r2 = client.get("/api/finance/income-statement/", headers=ADMIN)
    check("income-statement 200 + net 0", r2.status_code == 200 and r2.json()["net_surplus"] == 0)
    r3 = client.get("/api/finance/outstanding/", headers=ADMIN)
    check("outstanding 200 + []", r3.status_code == 200 and r3.json() == [], f"got {r3.json()!r}")

    # legacy endpoint must be untouched
    rf = client.get("/api/fees/", headers=ADMIN)
    check("legacy /api/fees/ still 200 + original shape",
          rf.status_code == 200 and isinstance(rf.json(), list),
          f"status={rf.status_code} body={rf.json()!r}")

    # ── 2. Fee head + fee structure (+1 item) ────────────────────────────────
    section("2. Fee head + fee structure (nested item)")
    r = client.post("/api/fee-heads/", headers=ADMIN,
                    json={"name": "ZZ Temp Tuition", "description": "temp"})
    check("create fee head 201", r.status_code == 201, r.text[:200])
    head = r.json()["id"]
    temp["fee_heads"] = [head]

    r = client.post("/api/fee-heads/", headers=ADMIN,
                    json={"name": "ZZ Temp Tuition"})
    check("duplicate fee head -> 400", r.status_code == 400, f"status={r.status_code}")

    year = db.query(__import__("models").AcademicYear).filter(
        __import__("models").AcademicYear.is_current == True).first()
    year_id = year.id if year else None
    r = client.post("/api/fee-structures/", headers=ADMIN, json={
        "name": "ZZ Temp Structure", "academic_year_id": year_id, "grade_id": None,
        "items": [{"fee_head_id": head, "amount": 1000.0,
                   "periodicity": "annual", "due_date": str(date.today() + timedelta(days=30)),
                   "is_mandatory": True}],
    })
    check("create fee structure + nested item 201", r.status_code == 201, r.text[:300])
    struct = r.json()
    temp["fee_structures"] = [struct["id"]]
    check("nested item persisted", len(struct.get("items", [])) == 1, json.dumps(struct)[:200])

    r = client.get(f"/api/fee-structures/{struct['id']}/items/", headers=ADMIN)
    check("GET /fee-structures/{id}/items/ 200", r.status_code == 200, r.text[:200])

    # ── 3. Discount + invoice for student 1 ─────────────────────────────────
    section("3. Discount + invoice for student 1")
    r = client.post("/api/discounts/", headers=ADMIN,
                    json={"name": "ZZ Temp 10pct", "type": "percentage", "value": 10})
    check("create discount 201", r.status_code == 201, r.text[:200])
    disc = r.json()["id"]
    temp["discounts"] = [disc]

    student_id = 1
    r = client.post("/api/invoices/", headers=ADMIN, json={
        "student_id": student_id, "discount_id": disc, "due_date": str(date.today() + timedelta(days=15)),
        "items": [{"fee_head_id": head, "description": "Temp tuition", "amount": 1000.0, "quantity": 1}],
    })
    check("create invoice 201", r.status_code == 201, r.text[:300])
    inv = r.json()
    inv_id = inv["id"]
    temp["invoices"] = [inv_id]
    check("invoice_no format INV-YYYY-NNNN",
          inv["invoice_no"].startswith(f"INV-{date.today().year}-"), inv["invoice_no"])
    check("gross total 1000.00", abs(inv["total_amount"] - 1000.0) < 0.01, str(inv["total_amount"]))
    check("10% discount applied = 100.00",
          abs(inv["discount_amount"] - 100.0) < 0.01, str(inv["discount_amount"]))
    check("balance = 900.00", abs(inv["balance"] - 900.0) < 0.01, str(inv["balance"]))

    # ── 4. Partial payment -> webhook confirm -> remaining payment ───────────
    section("4. Payment lifecycle")
    r = client.post("/api/payments/", headers=ADMIN,
                    json={"invoice_id": inv_id, "amount": 400.0, "method": "gateway",
                          "status": "pending", "provider": "razorpay"})
    check("create pending payment 201", r.status_code == 201, r.text[:300])
    p1 = r.json()
    temp["payments"] = [p1["id"]]
    check("pending payment has no receipt_no", p1["receipt_no"] is None, str(p1["receipt_no"]))
    gi = client.get(f"/api/invoices/{inv_id}", headers=ADMIN).json()
    check("pending does NOT count toward paid (balance still 900)",
          abs(gi["balance"] - 900.0) < 0.01, str(gi["balance"]))

    r = client.post(f"/api/payments/{p1['id']}/confirm-webhook", headers=ADMIN,
                    json={"provider": "razorpay", "reference_no": "pay_ref_abc"})
    check("confirm-webhook 200", r.status_code == 200, r.text[:300])
    p1 = r.json()
    check("payment now successful", p1["status"] == "successful", p1["status"])
    check("receipt_no generated", bool(p1["receipt_no"]), str(p1["receipt_no"]))
    gi = client.get(f"/api/invoices/{inv_id}", headers=ADMIN).json()
    check("invoice partially_paid, balance 500",
          gi["status"] == "partially_paid" and abs(gi["balance"] - 500.0) < 0.01,
          f"{gi['status']} bal={gi['balance']}")

    # idempotency
    r = client.post(f"/api/payments/{p1['id']}/confirm-webhook", headers=ADMIN, json={})
    check("confirm-webhook idempotent (2nd call 200)",
          r.status_code == 200 and r.json()["status"] == "successful", r.text[:200])
    gi = client.get(f"/api/invoices/{inv_id}", headers=ADMIN).json()
    check("no double-count after repeat webhook (balance 500)",
          abs(gi["balance"] - 500.0) < 0.01, str(gi["balance"]))

    r = client.post("/api/payments/", headers=ADMIN,
                    json={"invoice_id": inv_id, "amount": 500.0, "method": "cash"})
    check("record remaining payment 201", r.status_code == 201, r.text[:300])
    p2 = r.json()
    temp["payments"].append(p2["id"])
    gi = client.get(f"/api/invoices/{inv_id}", headers=ADMIN).json()
    check("invoice status == 'paid'", gi["status"] == "paid", gi["status"])
    check("invoice balance == 0", abs(gi["balance"]) < 0.01, str(gi["balance"]))

    # ── 5. Summary non-zero after collection ────────────────────────────────
    section("5. Summary reflects collected money")
    s = client.get("/api/finance/summary/", headers=ADMIN).json()
    check("collected == 900", abs(s["collected"] - 900.0) < 0.01, str(s["collected"]))
    check("total_billed == 1000 (gross)", abs(s["total_billed"] - 1000.0) < 0.01, str(s["total_billed"]))
    check("net_billed == 900 (after 100 discount)", abs(s["net_billed"] - 900.0) < 0.01,
          str(s["net_billed"]))
    # The discount genuinely reduces what is owed, so the invoice is fully settled.
    check("outstanding == 0 (net_billed - collected)", abs(s["outstanding"]) < 0.01,
          str(s["outstanding"]))
    check("today_collection == 900", abs(s["today_collection"] - 900.0) < 0.01,
          str(s["today_collection"]))
    check("month_collection == 900", abs(s["month_collection"] - 900.0) < 0.01,
          str(s["month_collection"]))
    check("by_fee_head non-empty", len(s["by_fee_head"]) >= 1, json.dumps(s["by_fee_head"]))
    check("income_by_source has fees", any(i["source"] == "fees" for i in s["income_by_source"]),
          json.dumps(s["income_by_source"]))

    st = client.get("/api/finance/income-statement/", headers=ADMIN,
                    params={"start_date": str(date.today() - timedelta(days=1)),
                            "end_date": str(date.today() + timedelta(days=1))}).json()
    check("income-statement net_surplus == 900", abs(st["net_surplus"] - 900.0) < 0.01,
          str(st["net_surplus"]))

    # ── 6. Cancel a second invoice ──────────────────────────────────────────
    section("6. Cancel a second invoice")
    r = client.post("/api/invoices/", headers=ADMIN, json={
        "student_id": student_id, "items": [{"fee_head_id": head, "description": "To cancel",
                                             "amount": 250.0, "quantity": 1}]})
    check("create 2nd invoice 201", r.status_code == 201, r.text[:200])
    inv2 = r.json()["id"]
    temp["invoices"].append(inv2)
    r = client.post(f"/api/invoices/{inv2}/cancel", headers=ADMIN, json={"reason": "temp test"})
    check("cancel invoice 200", r.status_code == 200, r.text[:200])
    check("status == 'cancelled'", r.json()["status"] == "cancelled", r.json()["status"])

    # ── 7. Guards / error codes ────────────────────────────────────────────
    section("7. Guard + error-code checks")
    # teacher token
    teacher_email = "zz.tmp.teacher@babyland.com"
    teacher = User(name="ZZ Temp Teacher", email=teacher_email,
                   password_hash=get_password_hash("admin123"), role="teacher", is_active=True)
    db.add(teacher)
    db.commit()
    db.refresh(teacher)
    TCH = token_for(teacher_email)
    r = client.post("/api/payments/", headers=TCH,
                    json={"invoice_id": inv_id, "amount": 10.0, "method": "cash"})
    check("teacher POST /payments/ -> 403", r.status_code == 403, f"status={r.status_code}")
    r = client.get("/api/invoices/", headers=TCH)
    check("teacher GET /invoices/ -> 403", r.status_code == 403, f"status={r.status_code}")
    r = client.get("/api/fee-heads/", headers=TCH)
    check("teacher GET /fee-heads/ -> 403", r.status_code == 403, f"status={r.status_code}")
    temp["users"] = [teacher.id]

    # overpayment / negative amount / 404 / 403-not-owned
    r = client.post("/api/payments/", headers=ADMIN,
                    json={"invoice_id": inv_id, "amount": 50.0, "method": "cash"})
    check("overpayment -> 400", r.status_code == 400, f"status={r.status_code} {r.text[:150]}")
    r = client.post("/api/payments/", headers=ADMIN,
                    json={"invoice_id": inv_id, "amount": -25.0, "method": "cash"})
    check("negative amount -> 400", r.status_code == 400, f"status={r.status_code} {r.text[:150]}")
    r = client.post("/api/payments/", headers=ADMIN,
                    json={"invoice_id": inv_id, "amount": 0, "method": "cash"})
    check("zero amount -> 400", r.status_code == 400, f"status={r.status_code}")
    r = client.get("/api/invoices/999999", headers=ADMIN)
    check("GET /invoices/999999 -> 404", r.status_code == 404, f"status={r.status_code}")
    r = client.post("/api/invoices/999999/cancel", headers=ADMIN, json={})
    check("cancel missing invoice -> 404", r.status_code == 404, f"status={r.status_code}")

    # student scoped user linked to student 2 (does not own invoice for student 1)
    stu_email = "zz.tmp.student@babyland.com"
    stu = User(name="ZZ Temp Student", email=stu_email,
               password_hash=get_password_hash("admin123"), role="student",
               student_id=2, is_active=True)
    db.add(stu)
    db.commit()
    db.refresh(stu)
    temp["users"].append(stu.id)
    STU = token_for(stu_email)
    r = client.get(f"/api/invoices/{inv_id}", headers=STU)
    check("student reading another student's invoice -> 403",
          r.status_code == 403, f"status={r.status_code}")
    r = client.get("/api/invoices/", headers=STU)
    check("student list is scoped (no foreign invoices)",
          r.status_code == 200 and all(i["student_id"] == 2 for i in r.json()),
          f"{[i['student_id'] for i in r.json()]}")
    r = client.post("/api/payments/", headers=STU,
                    json={"student_id": 2, "amount": 10.0, "method": "cash"})
    check("student POST /payments/ -> 403", r.status_code == 403, f"status={r.status_code}")

    # ── 8. Accounting: expense + income round trip ─────────────────────────
    section("8. Expenses / incomes")
    r = client.post("/api/expense-categories/", headers=ADMIN,
                    json={"name": "ZZ Temp Category", "description": "temp"})
    check("create expense category 201", r.status_code == 201, r.text[:200])
    cat = r.json()["id"]
    temp["expense_categories"] = [cat]
    r = client.post("/api/expenses/", headers=ADMIN,
                    json={"category_id": cat, "amount": 250.0, "payee": "ZZ Vendor",
                          "description": "temp", "status": "pending"})
    check("create expense 201 (pending)", r.status_code == 201 and r.json()["status"] == "pending",
          r.text[:200])
    exp = r.json()["id"]
    temp["expenses"] = [exp]
    r = client.post(f"/api/expenses/{exp}/mark-paid", headers=ADMIN)
    check("mark-paid before approve -> 400", r.status_code == 400, f"status={r.status_code}")
    r = client.post(f"/api/expenses/{exp}/approve", headers=ADMIN)
    check("approve expense 200", r.status_code == 200 and r.json()["status"] == "approved",
          r.text[:200])
    r = client.post(f"/api/expenses/{exp}/mark-paid", headers=ADMIN)
    check("mark-paid after approve 200", r.status_code == 200 and r.json()["status"] == "paid",
          r.text[:200])
    s = client.get("/api/finance/summary/", headers=ADMIN).json()
    check("summary expenses_total == 250", abs(s["expenses_total"] - 250.0) < 0.01,
          str(s["expenses_total"]))
    check("summary expense_by_category non-empty", len(s["expense_by_category"]) >= 1,
          json.dumps(s["expense_by_category"]))
    st = client.get("/api/finance/income-statement/", headers=ADMIN).json()
    check("net_surplus == 900 - 250 = 650", abs(st["net_surplus"] - 650.0) < 0.01,
          str(st["net_surplus"]))

    r = client.post("/api/incomes/", headers=ADMIN,
                    json={"source": "donation", "amount": 50.0, "mode": "cash", "note": "temp"})
    check("create income 201", r.status_code == 201, r.text[:200])
    inc = r.json()["id"]
    temp["incomes"] = [inc]

    # ── 9. Fines + scholarship + refund ────────────────────────────────────
    section("9. Fines / scholarships / refunds / outstanding")
    r = client.post("/api/fines/", headers=ADMIN,
                    json={"student_id": student_id, "amount": 15.0, "reason": "temp"})
    check("create fine 201", r.status_code == 201, r.text[:200])
    fine = r.json()["id"]
    temp["fines"] = [fine]
    r = client.post(f"/api/fines/{fine}/waive", headers=ADMIN)
    check("waive fine 200", r.status_code == 200 and r.json()["is_waived"] is True, r.text[:200])

    r = client.post("/api/scholarships/", headers=ADMIN,
                    json={"name": "ZZ Temp Scholarship", "amount": 100.0, "max_recipients": 1})
    check("create scholarship 201", r.status_code == 201, r.text[:200])
    sch = r.json()["id"]
    temp["scholarships"] = [sch]
    r = client.post("/api/student-scholarships/", headers=ADMIN,
                    json={"student_id": student_id, "scholarship_id": sch, "amount": 100.0})
    check("award scholarship 201", r.status_code == 201, r.text[:200])
    award = r.json()["id"]
    temp["student_scholarships"] = [award]
    r = client.post("/api/student-scholarships/", headers=ADMIN,
                    json={"student_id": student_id, "scholarship_id": sch, "amount": 100.0})
    check("duplicate award (max_recipients) -> 400", r.status_code == 400, f"status={r.status_code}")

    # outstanding report should list student 2 with 0 balance -> empty; add an unpaid invoice
    r = client.post("/api/invoices/", headers=ADMIN, json={
        "student_id": student_id,
        "items": [{"fee_head_id": head, "description": "Unpaid temp", "amount": 300.0}]})
    inv3 = r.json()["id"]
    temp["invoices"].append(inv3)
    orows = client.get("/api/finance/outstanding/", headers=ADMIN).json()
    row = next((o for o in orows if o["student_id"] == student_id), None)
    check("outstanding lists student 1", row is not None, json.dumps(orows)[:250])
    if row:
        check("outstanding == 300", abs(row["outstanding"] - 300.0) < 0.01, str(row["outstanding"]))
        check("days_overdue == 0 (no due date)", row["days_overdue"] == 0, str(row["days_overdue"]))

    # refund the cash payment p2 (500) -> invoice goes back to partially_paid
    r = client.post(f"/api/payments/{p2['id']}/refund", headers=ADMIN,
                    json={"amount": 100.0, "reason": "temp partial refund"})
    check("refund payment 201", r.status_code == 201, r.text[:200])
    refund = r.json()["id"]
    temp["refunds"] = [refund]
    gi = client.get(f"/api/invoices/{inv_id}", headers=ADMIN).json()
    check("after partial refund invoice not paid again",
          gi["status"] == "partially_paid" and abs(gi["balance"] - 100.0) < 0.01,
          f"{gi['status']} bal={gi['balance']}")

finally:
    # ── Cleanup: remove every temp row (audit_logs intentionally keeps growing)
    section("CLEANUP")
    from models import (Discount, Expense, ExpenseCategory, FeeHead, FeeStructure,
                        FeeStructureItem, Fine, Income, Invoice, InvoiceItem, Payment,
                        Refund, Scholarship, StudentScholarship)
    db.rollback()
    # Payment-generated Income rows (source_ref "payment:<id>" / "refund:<id>") are
    # not tracked explicitly, so sweep them by the tracked payment ids.
    if temp.get("payments"):
        refs = [f"payment:{pid}" for pid in temp["payments"]]
        refs += [f"refund:{rid}" for rid in temp.get("refunds", [])]
        for ref in refs:
            for row in db.query(Income).filter(Income.source_ref == ref).all():
                db.delete(row)
        db.commit()
    order = [
        (Refund, "id", temp.get("refunds")),
        (Payment, "id", temp.get("payments")),
        (Income, "id", temp.get("incomes")),
        (Fine, "id", temp.get("fines")),
        (StudentScholarship, "id", temp.get("student_scholarships")),
        (Scholarship, "id", temp.get("scholarships")),
        (Expense, "id", temp.get("expenses")),
        (ExpenseCategory, "id", temp.get("expense_categories")),
        (InvoiceItem, "invoice_id", temp.get("invoices")),
        (Invoice, "id", temp.get("invoices")),
        (FeeStructureItem, "fee_structure_id", temp.get("fee_structures")),
        (FeeStructure, "id", temp.get("fee_structures")),
        (Discount, "id", temp.get("discounts")),
        (FeeHead, "id", temp.get("fee_heads")),
        (User, "id", temp.get("users")),
    ]
    for model, col, ids in order:
        if not ids:
            continue
        rows = db.query(model).filter(getattr(model, col).in_(ids)).all()
        n = len(rows)
        for row in rows:
            db.delete(row)
        db.commit()
        print(f"  deleted {n} {model.__tablename__} row(s)")
    db.close()

print(f"\n===== RESULT: {len(PASS)} passed, {len(FAIL)} failed =====")
if FAIL:
    for f in FAIL:
        print("  FAILED:", f)
    sys.exit(1)
