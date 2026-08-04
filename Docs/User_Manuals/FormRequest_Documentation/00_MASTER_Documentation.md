# FormRequest System — User Guide and Documentation

> **Master source file.** This is the single source of truth for all documentation.
> The in-app User Manual and the exported `.docx` / `.pdf` files are derived from it.
> Edit here first whenever the manual changes.
>
> Style: plain and formal — black, white, and gray only (not colorful). Written in
> clear English for a general audience.

Version: 1.0 · Date: July 2026 · Prepared for: internal use.

Screenshots: look for the blocks marked `SCREENSHOT` — that is where the actual
image is placed. A full checklist is provided at the end of this file.

---

## Table of Contents

1. What is the FormRequest System
2. Gate Pass Types
3. Roles and Who Uses Them
4. Approval Flow
5. System Architecture (how it works internally)
6. User Manual — Requester
7. User Manual — Approver (Superior and President)
8. User Manual — PAS / HRAD (Vehicle Scheduling)
9. User Manual — Security Guard
10. User Manual — System Administrator
11. Frequently Asked Questions and Troubleshooting
12. Glossary
13. Screenshot Checklist

---

## 1. What is the FormRequest System

The **FormRequest System** is an internal web application that digitizes the entire
**gate pass** process — from request, approval, and printing, to monitoring entry
and exit at the gate.

Paper forms were easy to lose, slow to sign, and hard to trace. Everything is now
online:

- Requests and approvals are digital (approvers sign with an **e-signature**).
- Every approved pass carries a **QR code**, so a single scan by the guard records
  **Time Out** and **Time In**.
- A **calendar** manages vehicle and driver schedules (HRAD/PAS).
- An **audit trail** shows who requested, who approved, and when.

**Purpose:** faster and simpler processing with better monitoring — no lost paper
and no queues for signatures.

---

## 2. Gate Pass Types

| Type | Purpose | Key details |
|------|---------|-------------|
| **Person / Personnel Gate Pass** | Personnel leaving the premises | Includes QR Time Out / Time In. May include a company vehicle. |
| **Material Gate Pass** | Releasing materials or items | Includes an itemized release list. |

**Trip type (for a company vehicle):** when a company vehicle is required, the
requester selects the trip type:

- **Hatid at Sundo** — drop-off and pick-up (round trip).
- **Hatid lang** — drop-off only.
- **Sundo lang** — pick-up only.

> Note: the requester's chosen trip type is final. It cannot be changed by HRAD at
> assignment — it is locked to the requester's selection.

---

## 3. Roles and Who Uses Them

| Role | Responsibility in the system |
|------|------------------------------|
| **Requester (Associate)** | Creates gate pass requests for themselves. |
| **Immediate Superior** | First to approve a subordinate's request. |
| **President** | Final physical signature on a printed company-vehicle form. |
| **PAS / HRAD Noter** | HRAD assigns the vehicle/schedule; PAS performs the final digital noting. |
| **Security Guard** | Scans the QR code; records Time Out / Time In. |
| **System Administrator** | Manages users, master lists, and audit logs. |
| **Driver** | May submit requests; can be assigned to a company vehicle. |

> A single person may hold more than one role (e.g., a Superior who is also a Requester).

---

## 4. Approval Flow

A request typically follows this path before it is approved:

```
  Requester
     │  (submit request)
     ▼
  Immediate Superior ──(approve)──►  HRAD Assignment  ──►  PAS Noting  ──►  APPROVED
     │                               (when a company       (final digital step)
     │                                vehicle is required)
     └──(reject)──►  REJECTED
```

- Not every step is always included. It depends on the request:
  - **HRAD Assignment** — appears only when a **company vehicle** is required.
  - **PAS Noting** — the final step before the request becomes **APPROVED**.
- For a company vehicle, print the approved form after the digital route. The
  **President signs that paper physically as the final approval**.
- **Pending → Approved:** while approval is still in progress, the status remains
  **Pending** (it appears on the calendar marked "Pending"). Once fully **Approved**,
  the "Pending" label disappears and the pass receives a QR code.

📷 **SCREENSHOT A1 — Approval Route Preview:** the small "Route" preview on the
request form showing the digital path (Immediate Superior → HRAD → PAS), followed
by the President's physical signature on the printed company-vehicle form.

---

## 5. System Architecture (how it works internally)

This section is written to be understood by non-technical readers, with a short
technical summary at the end.

### 5.1 Plain explanation

The system has **three components** that talk to one another:

```
  ┌────────────────┐        ┌────────────────┐        ┌────────────────┐
  │   BROWSER      │  ⇄     │   API SERVER   │  ⇄     │   DATABASE     │
  │ (front-end UI) │ HTTPS  │ (logic layer)  │  SQL   │   (storage)    │
  │  index.html    │        │  ASP.NET Core  │        │  MariaDB/XAMPP │
  └────────────────┘        └────────────────┘        └────────────────┘
```

- **Browser (front end):** what the user sees and interacts with — forms, buttons,
  the calendar, the scanner. A web page opened in Chrome/Edge.
- **API server (logic layer):** where the real decisions happen — who may approve,
  whether a QR code is valid, when to allow exit. It also generates QR codes and
  validates logins.
- **Database (storage):** where all records are kept — requests, users, signatures,
  vehicle schedules, and audit logs.

When you log in, the browser talks to the API, and the API checks the database to
verify your password. Every action follows the same path: browser → API → database
→ back to the browser.

📷 **SCREENSHOT A2 — System Architecture Diagram:** (optional) the diagram above may
be used directly as the image.

### 5.2 Technical details (for IT)

| Component | Technology |
|-----------|------------|
| Front end | Vanilla JavaScript (`index.html` + `Frontend/Functions/`), Tailwind CSS |
| Back-end API | ASP.NET Core 8 (C#), Dapper, stored procedures |
| Database | MariaDB (via XAMPP); schema + migrations under `Database/` |
| Authentication | Case-insensitive name (or legacy Employee ID) + password → JWT access token |
| QR | Generated by the API on approval; scanned by the guard (jsQR in the browser) |
| Signatures | E-signatures stored as images; includes a background-removal helper |
| Scheduling | Vehicle reservations + fixed weekly schedules; monthly calendar view |

- **Roles and permissions** are stored in the database (`tbl_roles`,
  `tbl_permissions`, `tbl_user_roles`), controlling who has access to what.
- **The digital approval workflow** is step-based (`SUPERIOR` → `HRAD_ASSIGN` →
  `PAS`), with each step recorded in the audit history. The President's final
  company-vehicle approval is a physical signature on the printed form.
- **Deployment:** local (XAMPP + API on port 5087 + FRS front end on 5502) or on the
  LAN (e.g., `http://192.168.x.x/FormRequestSystem/`).

---

## 6. User Manual — Requester

**Who you are:** a regular employee who needs to leave the premises, use a vehicle,
or release items.

### 6.1 Creating a request

1. **Log in** with your **first name** and **password**. For a multi-part given
   name, the full phrase or any individual part works and capitalization does
   not matter. The legacy Employee ID also remains accepted.

   📷 **SCREENSHOT R1 — Login Screen**

2. On the dashboard, choose the gate pass type: **Person**, **Vehicle**, or
   **Material**.

   📷 **SCREENSHOT R2 — Dashboard with Gate Pass buttons**

3. Fill in the details: name, date, time, **purpose**, and **destination**. If a
   company vehicle is required, tick "Need Vehicle" and select the **trip type**
   (Hatid at Sundo / Hatid lang / Sundo lang).

   📷 **SCREENSHOT R3 — Request Form (filled in)**

4. Click **Submit** and wait for approval from your superior or the person in charge.

### 6.2 Checking status and printing

1. Go to the **My Requests** tab.

   📷 **SCREENSHOT R4 — My Requests List (Pending/Approved/Rejected)**

2. Check whether the request is **Pending**, **Approved**, or **Rejected**.
3. Once **Approved**, a **Print** button appears. Click it to produce the formal
   gate pass form with the **QR code** and signatures.

   📷 **SCREENSHOT R5 — Printable Gate Pass Form (with QR + signature)**

> **Tip:** print only once the request is Approved. The QR code on the form is what
> the guard scans, so make sure the print is clear.

---

## 7. User Manual — Digital Approver (Immediate Superior)

**Who you are:** the person with the authority to permit an employee's request.

1. Log in and go to the **Approval Dashboard**.

   📷 **SCREENSHOT AP1 — Approval Dashboard (Pending requests)**

2. Click **Review** beside the requester's name.
3. Read the details — destination, purpose, and (if a vehicle is involved) the
   schedule.

   📷 **SCREENSHOT AP2 — Document Review Modal**

4. To approve, apply your **e-signature** on the digital canvas. You may sign with a
   mouse or a touchscreen.

   📷 **SCREENSHOT AP3 — Signature Pad**

5. Click **Approve**. If it cannot be approved, click **Reject** and provide a clear
   reason.

> Once you approve, the request moves to the next applicable digital step (HRAD/PAS).
> A company-vehicle form is printed after PAS and signed physically by the President.

---

## 8. User Manual — PAS / HRAD (Vehicle Scheduling)

**Who you are:** the person who controls the vehicle, driver, and schedule.

1. Log in and open the **Vehicle Schedule** / **Calendar** view.

   📷 **SCREENSHOT H1 — Calendar View (monthly)**

2. When a vehicle request requiring a company vehicle comes in, it appears on the
   calendar as a **Pending Schedule**.

   📷 **SCREENSHOT H2 — Pending Schedule on the calendar / day view**

3. Click the request, then select the available **vehicle** and **driver**. The
   **trip type is locked** to the requester's choice — follow it; you may still
   choose whether the schedule is **straight** or **split** for a round trip.

   📷 **SCREENSHOT H3 — HRAD Assignment Modal (vehicle, driver, trip type locked)**

4. Save to update the calendar. Everyone can then see that the vehicle is occupied at
   that time. It remains **Pending** until fully approved; the "Pending" label
   disappears once Approved.

### 8.1 Fixed / Permanent Schedules

For recurring trips (e.g., every Monday):

1. Click **Manage Fixed Schedules**.

   📷 **SCREENSHOT H4 — Manage Fixed Schedules Modal**

2. Set a trip for each day (Monday, Tuesday, etc.) so it does not need to be entered
   daily.

> **Truck schedules (Logistics/PPC):** Logistics/PPC staff have separate access
> limited to **truck schedules only** — regular vehicles are not included. For them,
> only **trucks** appear in Manage Fixed Schedules.

---

## 9. User Manual — Security Guard

**Who you are:** the person who ensures only authorized people enter and exit.

1. Open the **Guard Scanner** page on a tablet or computer.

   📷 **SCREENSHOT G1 — Guard Scanner Page**

2. Present the printed gate pass (with QR code) to the camera.
3. After scanning, the pass details appear:
   - **GREEN** if valid and Approved.
   - **RED** if Rejected, expired, or not allowed.

   📷 **SCREENSHOT G2 — Scan Result (valid = green / invalid = red)**

4. Click **Mark as OUT** when the person/vehicle exits.
5. Click **Mark as IN** upon return. It is saved automatically — no logbook entry is
   needed.

> If the QR code cannot be read, type the **Control No.** on the form for a manual
> lookup.

---

## 10. User Manual — System Administrator

**Who you are:** the person who maintains users and master data.

1. Go to the **Admin Panel**.

   📷 **SCREENSHOT AD1 — Admin Panel Dashboard**

2. In **User Management**, add a new employee, reset a password, or deactivate a
   resigned user.

   📷 **SCREENSHOT AD2 — User Management Page**

3. In **Master Lists**, update the list of **Trucks**, **Drivers**, and
   **Destinations** so the choices in the forms stay current.

   📷 **SCREENSHOT AD3 — Master List Settings**

4. The full **Audit Trail** is also available to trace who approved or changed
   records.

   📷 **SCREENSHOT AD4 — Audit Trail / System Logs**

---

## 11. Frequently Asked Questions and Troubleshooting

**Why can't I log in?**
Check that your name and password are correct. A new account's default password is
the date hired in `MMDDYYYY` format. If you already changed it, use the changed
password instead. The legacy Employee ID remains accepted. If the problem persists,
contact the Administrator / IT.

**How do I change my password?**
After signing in, choose **Change Password** at the bottom of the menu. Enter the
current password and the new password twice. After the system confirms that it was
saved, sign in again using the new password. Passwords are case-sensitive.

**Why is there no Print button on my request?**
The Print button appears only once the request is **Approved**. If it is still
Pending, wait for approval.

**Why does my schedule still show "Pending" on the calendar?**
This is normal — it remains Pending until every approval step is complete (through
the final PAS noting). Once fully Approved, the "Pending" label disappears.

**The guard cannot read the QR code.**
Type the **Control No.** from the form for a manual lookup. Make sure the printed
form is clear and not creased.

**The assigned vehicle/driver is wrong.**
HRAD/PAS can adjust the assignment on the calendar before the request is fully
approved.

---

## 12. Glossary

- **Gate Pass** — formal authorization to leave the premises or release items.
- **QR Code** — the code on an approved form that the guard scans.
- **Time Out / Time In** — the recorded times of exit and return.
- **Trip Type** — Hatid at Sundo (round trip) / Hatid lang (drop-off) / Sundo lang
  (pick-up).
- **HRAD / PAS** — the group that manages vehicles and performs the final noting.
- **Reservation** — a vehicle reserved for a specific date and time.
- **Fixed Schedule** — a recurring weekly trip.
- **Audit Trail** — a record of all actions (who, what, when).
- **Control No.** — the unique number of each pass (used for manual lookup).

---

## 13. Screenshot Checklist

Capture these while logged in under the correct role. One clean screenshot per item
(mask real personal data where possible — test data is acceptable).

**Overview / Architecture**
- [ ] A1 — Approval Route Preview (on the request form)
- [ ] A2 — System Architecture Diagram (optional; the diagram above may be used)

**Requester**
- [ ] R1 — Login Screen
- [ ] R2 — Dashboard with Gate Pass buttons
- [ ] R3 — Request Form (filled in)
- [ ] R4 — My Requests List
- [ ] R5 — Printable Gate Pass Form (with QR + signature)

**Approver**
- [ ] AP1 — Approval Dashboard (Pending)
- [ ] AP2 — Document Review Modal
- [ ] AP3 — Signature Pad

**PAS / HRAD**
- [ ] H1 — Calendar View (monthly)
- [ ] H2 — Pending Schedule on the calendar
- [ ] H3 — HRAD Assignment Modal (trip type locked)
- [ ] H4 — Manage Fixed Schedules Modal

**Guard**
- [ ] G1 — Guard Scanner Page
- [ ] G2 — Scan Result (valid/invalid)

**Admin**
- [ ] AD1 — Admin Panel Dashboard
- [ ] AD2 — User Management Page
- [ ] AD3 — Master List Settings
- [ ] AD4 — Audit Trail / System Logs

Total: **18 screenshots** (2 optional in the A section).
