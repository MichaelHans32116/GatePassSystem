# FormRequest System: User Guide and Documentation

> **Master source file.** This is the single source of truth for all documentation.
> The in-app User Manual and the exported `.docx` / `.pdf` files are derived from it.
> Edit here first whenever the manual changes.
>
> Style: plain and formal. Black text on white only, bold black titles, plain
> black-bordered tables. Written in clear English for a general audience.

Version 1.1. Date: August 2026. Prepared for internal use.

Screenshots: look for the blocks marked `SCREENSHOT`. That is where the actual
image is placed. A full checklist is provided at the end of this file.

## Table of Contents

1. What is the FormRequest System
2. Gate Pass Types
3. Roles and Who Uses Them
4. Approval Flow
5. System Architecture (how it works internally)
6. User Manual: Requester
7. User Manual: Approver (Immediate Superior)
8. User Manual: PAS and HRAD (Vehicle Scheduling)
9. User Manual: Security Guard
10. User Manual: System Administrator
11. Frequently Asked Questions and Troubleshooting
12. Glossary
13. Screenshot Checklist

## 1. What is the FormRequest System

The **FormRequest System** is an internal web application that digitizes the entire
**gate pass** process, from request, approval, and printing, to monitoring entry
and exit at the gate.

Paper forms were easy to lose, slow to sign, and hard to trace. Everything is now
online:

1. Requests and approvals are digital. Approvers sign with an **e-signature**.
2. Every approved pass carries a **QR code**, so a single scan by the guard records
   **Time Out** and **Time In**.
3. A **calendar** manages vehicle and driver schedules (HRAD).
4. An **audit trail** shows who requested, who approved, and when.

**Purpose:** faster and simpler processing with better monitoring. No lost paper
and no queues for signatures.

## 2. Gate Pass Types

| Type | Purpose | Key details |
|------|---------|-------------|
| **Person / Personnel Gate Pass** | Personnel leaving the premises | Includes QR Time Out / Time In. May include associates and a company vehicle. |
| **Material Gate Pass** | Releasing materials or items | Includes an itemized release list. |

**Trip type (for a company vehicle):** when a company vehicle is required, the
requester selects the trip type:

1. **Hatid at Sundo**: drop off and pick up (round trip).
2. **Hatid lang**: drop off only.
3. **Sundo lang**: pick up only.

> Note: the requester's chosen trip type is final. It cannot be changed by HRAD at
> assignment. It is locked to the requester's selection.

**Who the request is for (Person Gate Pass):** the Associates section of the
request form asks who the request covers.

1. **Kasama ako** (default): the requester goes out together with any listed
   associates.
2. **Para sa iba lang**: the requester stays inside the premises and the pass
   covers only the listed associates. At least one associate is then required.

**Companions (associates):** each companion row has an **Employee** checkbox.

1. When the checkbox is ticked, the companion is picked from the employee
   directory. The suggestion list shows up to six matches.
2. When the checkbox is not ticked, the companion is an outside person such as a
   visitor or an OJT. The name is typed directly and is saved exactly as typed.
3. Pressing Enter on a finished row automatically adds and focuses the next
   companion row. The Add companion button does the same.

## 3. Roles and Who Uses Them

| Role | Responsibility in the system |
|------|------------------------------|
| **Requester (Associate)** | Creates gate pass requests. |
| **Immediate Superior** | First digital approver of a subordinate's request. This step is skipped when the requester is an immediate superior. |
| **HRAD (Vehicle Assignment)** | Assigns the vehicle, driver, and schedule for company vehicle requests. The HRAD vehicle assigners are Joy (GA120), Roxanne Encinada (GA139), and Myla Mae Abarquez (GA412). |
| **PAS Noter** | Performs the final digital noting step of every request. |
| **President** | Final approver of a printed company vehicle form, by physical signature on paper. The PRESIDENT signature line carries the printed name TOMOAKI MAEKAWA. |
| **Security Guard** | Scans the QR code and records Time Out / Time In. |
| **System Administrator** | Manages users, master lists, and audit logs. |
| **Driver** | May submit requests and can be assigned to a company vehicle. |

> A single person may hold more than one role (for example, a Superior who is also
> a Requester).

## 4. Approval Flow

A Person Gate Pass follows these steps before it is approved:

1. The requester submits the request.
2. The **Immediate Superior** reviews and approves. This step is skipped when the
   requester is an immediate superior.
3. **HRAD Assignment** follows, for company vehicle requests only. HRAD assigns
   the vehicle, the driver, and the schedule.
4. **PAS Noting** is the final digital step. After PAS notes the request, the
   status becomes **APPROVED** and the QR code is issued.
5. For a company vehicle, the approved form is printed and the **President signs
   the paper physically as the final approval**. There is no digital President
   approval step.

A rejection by any digital approver ends the request as **REJECTED**, with a
written reason.

**Pending then Approved:** while approval is still in progress, the status remains
**Pending** (it appears on the calendar marked "Pending"). Once fully **Approved**,
the "Pending" label disappears and the pass receives a QR code.

**SCREENSHOT A1: Approval Route Preview.** The small "Route" preview on the
request form showing the digital path (Immediate Superior, then HRAD Assignment,
then PAS), followed by the President's physical signature on the printed company
vehicle form.

## 5. System Architecture (how it works internally)

This section is written to be understood by non-technical readers, with a short
technical summary at the end.

### 5.1 Plain explanation

The system has **three components** that talk to one another:

1. **Browser (front end):** what the user sees and interacts with. Forms, buttons,
   the calendar, and the scanner, in a web page opened in Chrome or Edge.
2. **API server (logic layer):** where the real decisions happen. It determines
   who may approve, whether a QR code is valid, and when to allow exit. It also
   generates QR codes and validates logins.
3. **Database (storage):** where all records are kept. Requests, users,
   signatures, vehicle schedules, and audit logs.

When you log in, the browser talks to the API, and the API checks the database to
verify your password. Every action follows the same path: first the browser, then
the API, then the database, and then back to the browser.

**SCREENSHOT A2: System Architecture Diagram** (optional).

### 5.2 Technical details (for IT)

| Component | Technology |
|-----------|------------|
| Front end | Vanilla JavaScript (`index.html` plus `Frontend/Functions/`), Tailwind CSS |
| Back-end API | ASP.NET Core 8 (C#), Dapper, stored procedures |
| Database | MariaDB (via XAMPP); schema plus migrations under `Database/` |
| Authentication | Case-insensitive name or Employee ID plus password, returning a JWT access token |
| QR | Generated by the API on approval; scanned by the guard (jsQR in the browser) |
| Signatures | E-signatures stored as images; includes a background removal helper |
| Scheduling | Vehicle reservations plus fixed weekly schedules; monthly calendar view |

1. **Roles and permissions** are stored in the database (`tbl_roles`,
   `tbl_permissions`, `tbl_user_roles`), controlling who has access to what.
2. **The digital approval workflow** is step based (`SUPERIOR`, then
   `HRAD_ASSIGN`, then `PAS`), with each step recorded in the audit history. The
   President's final company vehicle approval is a physical signature on the
   printed form.
3. **Scheduling:** a split schedule (for example 10:00 to 11:00 in the morning
   and 1:00 to 2:00 in the afternoon) is stored as two separate reservation
   windows, so the calendar keeps the gap vacant. The system refuses to forward
   an HRAD assignment when the selected vehicle or the selected driver is already
   booked in any requested window, including recurring fixed runs.
4. **Deployment:** local (XAMPP plus the API on port 5087 plus the FRS front end
   on port 5502) or on the LAN (for example
   `http://192.168.x.x/FormRequestSystem/`).

## 6. User Manual: Requester

**Who you are:** a regular employee who needs to leave the premises, use a vehicle,
or release items.

### 6.1 Logging in

1. **Log in** with your **name** and **password**. You may type your full name, a
   leading part of your name, or any individual part of your name.
   Capitalization does not matter. Your Employee ID is also accepted.

   **SCREENSHOT R1: Login Screen**

2. To change your password, click the **profile chip** (your name and avatar) at
   the top right of the screen. This opens the **Change Password** dialog. The
   Change Password entry is no longer in the sidebar.

### 6.2 Creating a request

1. On the dashboard, choose the gate pass type: **Person**, **Vehicle**, or
   **Material**. On a mobile phone, the **New Form Request** button appears at
   the top of the dashboard.

   **SCREENSHOT R2: Dashboard with Gate Pass buttons**

2. Fill in the details: name, date, time, **purpose**, and **destination**. If a
   company vehicle is required, tick "Need Vehicle" and select the **trip type**
   (Hatid at Sundo, Hatid lang, or Sundo lang).
3. In the **Associates** section, choose who the request is for. **Kasama ako**
   means you go out too (the default). **Para sa iba lang** means you stay
   inside and the pass covers only the listed associates; at least one associate
   is then required.
4. Add companions as needed. Tick the **Employee** checkbox to pick a companion
   from the employee directory (the suggestion list shows up to six matches), or
   leave it unticked and type the name of an outside companion such as a visitor
   or an OJT. Press Enter on a finished row to add the next row automatically.

   **SCREENSHOT R3: Request Form (filled in)**

5. Click **Submit** and wait for approval from your superior or the person in
   charge.

### 6.3 Checking status and printing

1. Go to the **My Requests** tab, or tap one of the compact statistic cards on
   the dashboard to filter the request table. Tapping the same card again clears
   the filter.

   **SCREENSHOT R4: My Requests List (Pending, Approved, Rejected)**

2. Check whether the request is **Pending**, **Approved**, or **Rejected**.
3. Once **Approved**, a **Print** button appears. Click it to produce the formal
   gate pass form with the **QR code** and signatures.

   **SCREENSHOT R5: Printable Gate Pass Form (with QR and signature)**

**Notes on the printed form:**

1. When the requester is not going out (**Para sa iba lang**), the form prints a
   **REQUESTOR** line with the requester's name above the **NAME OF ASSOCIATES**
   section, separated by a rule line.
2. A service indicator prints under **VEHICLE AND PLATE** when the trip is a
   service or pick up run (for example, SERVICE / SUNDO, REQUESTOR NOT ABOARD).
3. For company vehicle passes, the **PRESIDENT** signature line carries the
   printed name **TOMOAKI MAEKAWA** and is signed by hand on paper.

> **Tip:** print only once the request is Approved. The QR code on the form is
> what the guard scans, so make sure the print is clear.

## 7. User Manual: Approver (Immediate Superior)

**Who you are:** the person with the authority to permit an employee's request.

1. Log in and go to the **Approval Dashboard**. Users with approval duties also
   see a **For Your Approval** card on the main dashboard showing the pending
   approval count; tapping it opens the Approvals page.

   **SCREENSHOT AP1: Approval Dashboard (Pending requests)**

2. Click **Review** beside the requester's name.
3. Read the details: destination, purpose, and (if a vehicle is involved) the
   schedule.

   **SCREENSHOT AP2: Document Review Modal**

4. To approve, apply your **e-signature** on the digital canvas. You may sign with
   a mouse or a touchscreen.

   **SCREENSHOT AP3: Signature Pad**

5. Click **Approve**. If it cannot be approved, click **Reject** and provide a
   clear reason.

> Once you approve, the request moves to the next applicable digital step (HRAD
> Assignment for company vehicle requests, then PAS Noting). A company vehicle
> form is printed after PAS and signed physically by the President.

## 8. User Manual: PAS and HRAD (Vehicle Scheduling)

**Who you are:** the person who controls the vehicle, driver, and schedule. The
HRAD vehicle assigners are Joy (GA120), Roxanne Encinada (GA139), and Myla Mae
Abarquez (GA412).

1. Log in and open the **Vehicle Schedule** / **Calendar** view.

   **SCREENSHOT H1: Calendar View (monthly)**

2. When a request requiring a company vehicle comes in, it appears on the
   calendar as a **Pending Schedule**.

   **SCREENSHOT H2: Pending Schedule on the calendar / day view**

3. Click the request to open the assignment modal. The modal shows the
   **requested schedule window**, the **trip type** (Hatid, Sundo, or Both, with
   a note when the requester is not aboard), and **vehicle and driver
   availability** hints. Select the available **vehicle** and **driver**. The
   **trip type is locked** to the requester's choice; you may still choose
   whether the schedule is **straight** or **split** for a round trip.

   **SCREENSHOT H3: HRAD Assignment Modal (vehicle, driver, trip type locked)**

4. A split schedule (for example 10:00 to 11:00 in the morning and 1:00 to 2:00
   in the afternoon) is stored as two separate reservation windows, so the
   calendar keeps the gap vacant.
5. The system refuses to forward an assignment when the selected vehicle or the
   selected driver is already booked in any requested window, including
   recurring fixed runs. Choose a different vehicle, driver, or window.
6. Save to update the calendar. Everyone can then see that the vehicle is
   occupied at that time. It remains **Pending** until fully approved; the
   "Pending" label disappears once Approved.

> The **Request Service Schedule** button on the Vehicle Schedule Calendar routes
> to the standard New Request form with Company Vehicle already ticked.

### 8.1 Fixed / Permanent Schedules

For recurring trips (for example, every Monday):

1. Click **Manage Fixed Schedules**.

   **SCREENSHOT H4: Manage Fixed Schedules Modal**

2. Set a trip for each day (Monday, Tuesday, and so on) so it does not need to be
   entered daily.

> **Truck schedules (Logistics and PPC):** Logistics and PPC staff have separate
> access limited to **truck schedules only**. Regular vehicles are not included.
> For them, only **trucks** appear in Manage Fixed Schedules.

## 9. User Manual: Security Guard

**Who you are:** the person who ensures only authorized people enter and exit.

1. Log in with your security account. You land directly on the **QR scanner**
   page. You can open the queue dashboard through the **View Dashboard** button
   on the scanner page.

   **SCREENSHOT G1: Guard Scanner Page**

2. Present the printed gate pass (with QR code) to the camera.
3. After scanning, the pass details appear:
   1. **GREEN** if valid and Approved.
   2. **RED** if Rejected, expired, or not allowed.

   **SCREENSHOT G2: Scan Result (valid or invalid)**

4. Click **Mark as OUT** when the person or vehicle exits.
5. Click **Mark as IN** upon return. It is saved automatically; no logbook entry
   is needed.

> If the QR code cannot be read, type the **Control No.** on the form for a
> manual lookup.

## 10. User Manual: System Administrator

**Who you are:** the person who maintains users and master data.

1. Go to the **Admin Panel**.

   **SCREENSHOT AD1: Admin Panel Dashboard**

2. In **User Management**, add a new employee, reset a password, or deactivate a
   resigned user.

   **SCREENSHOT AD2: User Management Page**

3. In **Master Lists**, update the list of **Trucks**, **Drivers**, and
   **Destinations** so the choices in the forms stay current.

   **SCREENSHOT AD3: Master List Settings**

4. The full **Audit Trail** is also available to trace who approved or changed
   records.

   **SCREENSHOT AD4: Audit Trail / System Logs**

## 11. Frequently Asked Questions and Troubleshooting

**Why can't I log in?**
Check that your name and password are correct. You may sign in with your full
name, a leading part of your name, any individual part of your name, or your
Employee ID; capitalization does not matter. A new account's default password is
the date hired in `MMDDYYYY` format. If you already changed it, use the changed
password instead. If the problem persists, contact the Administrator or IT.

**How do I change my password?**
After signing in, click the **profile chip** (your name and avatar) at the top
right of the screen. This opens the **Change Password** dialog. Enter the current
password and the new password twice. After the system confirms that it was saved,
sign in again using the new password. Passwords are case sensitive. The Change
Password entry is no longer in the sidebar.

**Why is there no Print button on my request?**
The Print button appears only once the request is **Approved**. If it is still
Pending, wait for approval.

**Why does my schedule still show "Pending" on the calendar?**
This is normal. It remains Pending until every approval step is complete (through
the final PAS noting). Once fully Approved, the "Pending" label disappears.

**The guard cannot read the QR code.**
Type the **Control No.** from the form for a manual lookup. Make sure the printed
form is clear and not creased.

**The assigned vehicle or driver is wrong.**
HRAD can adjust the assignment on the calendar before the request is fully
approved. Note that the system refuses an assignment when the selected vehicle or
driver is already booked in any requested window, including recurring fixed runs.

**Why was my chosen vehicle refused at assignment?**
The vehicle or the driver is already booked in one of the requested windows,
possibly by a recurring fixed run. HRAD must pick a different vehicle, driver, or
schedule window.

## 12. Glossary

1. **Gate Pass**: formal authorization to leave the premises or release items.
2. **QR Code**: the code on an approved form that the guard scans.
3. **Time Out / Time In**: the recorded times of exit and return.
4. **Trip Type**: Hatid at Sundo (round trip), Hatid lang (drop off), or Sundo
   lang (pick up).
5. **Kasama ako**: the requester goes out together with the listed associates.
6. **Para sa iba lang**: the requester stays inside; the pass covers only the
   listed associates.
7. **HRAD**: the group that assigns vehicles, drivers, and schedules.
8. **PAS**: the group that performs the final digital noting.
9. **Reservation**: a vehicle reserved for a specific date and time window.
10. **Fixed Schedule**: a recurring weekly trip.
11. **Audit Trail**: a record of all actions (who, what, when).
12. **Control No.**: the unique number of each pass (used for manual lookup).

## 13. Screenshot Checklist

Capture these while logged in under the correct role. One clean screenshot per
item (mask real personal data where possible; test data is acceptable).

**Overview / Architecture**

1. A1: Approval Route Preview (on the request form)
2. A2: System Architecture Diagram (optional)

**Requester**

1. R1: Login Screen
2. R2: Dashboard with Gate Pass buttons
3. R3: Request Form (filled in)
4. R4: My Requests List
5. R5: Printable Gate Pass Form (with QR and signature)

**Approver**

1. AP1: Approval Dashboard (Pending)
2. AP2: Document Review Modal
3. AP3: Signature Pad

**PAS / HRAD**

1. H1: Calendar View (monthly)
2. H2: Pending Schedule on the calendar
3. H3: HRAD Assignment Modal (trip type locked)
4. H4: Manage Fixed Schedules Modal

**Guard**

1. G1: Guard Scanner Page
2. G2: Scan Result (valid or invalid)

**Admin**

1. AD1: Admin Panel Dashboard
2. AD2: User Management Page
3. AD3: Master List Settings
4. AD4: Audit Trail / System Logs

Total: 18 screenshots (2 optional in the A section).
