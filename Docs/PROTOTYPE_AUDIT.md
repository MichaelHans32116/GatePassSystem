# Prototype Audit: index.html

Source file: `index.html`

This document inventories the current single-file prototype before migration. The prototype is useful as a UI and workflow reference, but all data, authentication, authorization, workflow transitions, and scan logic currently run in the browser.

## Screens And UI Areas

1. Login View
   - Split-screen login with factory image, MPI branding, username/password fields, password visibility toggle, and quick-login testing buttons.
   - Uses plaintext mock credentials in JavaScript. These must not become production seed credentials.

2. Main App Shell
   - Blue left sidebar, white topbar, mobile overlay, current date display, logged-in user display, and logout action.
   - Navigation is hidden or shown based on role by direct DOM style changes.

3. Dashboard
   - Standard user dashboard shows pending, approved/ready, and returned/closed counts.
   - Shows "Recent Gate Passes" for the current user.
   - PAS / HR users see a live fleet status widget.
   - Security users see a live gate queue instead of the standard dashboard.

4. Apply Gate Pass
   - Form fields: destination, expected out, expected in, purpose, will return, company vehicle needed, selected vehicle, assigned driver, manual vehicle, and manual driver.
   - Shows an approval route preview based on requester role and company vehicle usage.

5. Approvals
   - Card grid of requests requiring action from the logged-in approver.
   - Immediate Superior sees requests from their department.
   - President sees requests waiting for president approval.
   - PAS / HR users see requests waiting for noting/final validation.

6. Security QR Scanner
   - Simulated camera area plus manual GP-ID entry.
   - Records Time Out, Time In, one-way pass closure, and vehicle status changes.

7. Admin Panel
   - Gate Pass Logs: searchable, date-filtered, department-filtered, paginated table.
   - Manage Users: active/archive UI placeholder using mock users.
   - Departments & Roles: static list placeholders.
   - Vehicles & Drivers: mock fleet table with edit/delete placeholders.

8. Document Review And Print Modal
   - A6 landscape gate pass form matching the paper layout.
   - Shows QR code only when a request is Approved or Outside.
   - Includes workflow progress tracker for approver/admin-style roles.
   - Modal supports dragging, resizing, maximize/restore, close, and print.

9. Approval Signature Area
   - Signature upload, local background removal, optional local Python background-removal endpoint, drawn signature canvas, size control, vertical offset, and "save default signature" option.
   - Signature defaults are stored only in the in-memory current user object.

10. Toast Notifications
   - Small transient success/error/info messages.

## Roles Found In Prototype

| Role | Current UI Access | Notes |
| --- | --- | --- |
| Associate | Dashboard, Apply Gate Pass, own request history | No approval/admin/scanner access. |
| Immediate Superior | Dashboard, Apply Gate Pass, Approvals, Department Logs | Can approve `Pending Superior` requests from own department. Own request skips superior approval and goes to president when needed. |
| President | Dashboard, Approvals, Department Logs | Apply form is hidden. Can approve `Pending President`. |
| PAS / HR Admin | Dashboard, Apply Gate Pass, Approvals, Department Logs, Vehicles & Drivers | Uses `canNoteGatePass: true`; can approve `Pending PAS`. |
| Admin | In mock data only; treated like non-system admin with `canNoteGatePass` | Needs clarification or merge into System Admin/PAS role. |
| System Admin | System Configuration, users, vehicles, departments, logs | Cannot approve requests in current frontend logic. |
| Security | Dashboard gate queue, QR Scanner | Cannot apply or approve. Can record scan events. |

## Mock Data

1. `mockUsers`
   - Seven test users: associate, immediate superior, president, PAS / HR admin, admin, system admin, and security guard.
   - Stores id, display name, role, department, plaintext test password, and `canNoteGatePass` for selected roles.
   - Passwords are prototype-only and must be replaced by password hashes in the backend.

2. `mockVehicles`
   - Four vehicles with id, name, plate, assigned driver, and status.
   - Vehicle status is changed in memory during QR scan logic.

3. `gatePasses`
   - Starts as an empty in-memory array.
   - New requests are appended by `submitGatePass`.
   - Records are lost on page refresh.

4. Request Object Shape
   - `id`
   - `userId`, `userName`, `userDept`
   - `dateFiled`
   - `destination`
   - `expectedOut`, `expectedIn`
   - `purpose`
   - `vehicle`
   - `status`
   - `requiresSuperiorApproval`
   - `requiresPresidentApproval`
   - `signatures.imm`, `signatures.pres`, `signatures.pas`
   - `scanCount`
   - `actualOut`, `actualIn`
   - `willReturn`

5. Runtime State
   - `currentUser`
   - `currentViewedPassId`
   - `currentUploadedSig`
   - `currentOriginalSignatureData`
   - `currentLogPage`
   - modal drag/resize state
   - signature pad state

## JavaScript Logic Inventory

### Auth And Session

- `quickLogin(id, password)` fills the login form and submits it.
- `handleLogin(event)` checks `mockUsers` by id and password, stores `currentUser`, shows the app, and calls `setupRoleAccess`.
- `logout()` clears `currentUser`, resets the login form, and returns to the login view.
- Production migration target: backend login endpoint, password hashing, session/JWT handling, server-side authorization, and no plaintext quick-login credentials.

### Role-Based UI

- `setupRoleAccess(user)` directly hides or shows sidebar groups, admin tabs, department filters, and default landing sections.
- `switchSection(targetId)` switches visible sections, updates topbar title, refreshes dashboard state, and switches admin tabs.
- Production migration target: shared navigation config plus backend-enforced policies. Frontend hiding is usability only, not security.

### Request Creation And Workflow Routing

- `toggleExpectedIn(show)` disables expected-in when the user selects one-way pass.
- `requiresSuperiorApproval(user)` returns true for Associate.
- `requiresPresidentApproval(user, hasCompanyVehicle)` returns true for Immediate Superior or company vehicle usage.
- `getInitialRequestStatus(user, hasCompanyVehicle)` returns `Pending Superior`, `Pending President`, or `Pending PAS`.
- `updateApprovalRoutePreview()` builds the route preview text.
- `toggleVehicleFields()` shows vehicle selector and sets field requirements.
- `handleVehicleChange(select)` auto-fills assigned driver or shows manual vehicle fields.
- `submitGatePass(event)` creates the gate pass object and pushes it into `gatePasses`.
- Production migration target: backend workflow service should compute approval route and status, not the frontend.

### Dashboard And Lists

- `refreshDashboards()` renders user counters, recent requests, fleet widget, guard queue, approval queue, and approval badge.
- `renderAdminLogs(page)` filters and paginates gate pass records.
- `changeLogPage(step)` changes admin log page.
- `switchAdminTab(tabId)` switches admin tab content.
- `renderAdminTables()` renders mock users and vehicles.
- Production migration target: API-backed paginated lists and server-side filtering.

### Document, QR, And Print

- `viewPass(id, isReviewing)` populates the A6 printable form, shows signatures, creates QR code when status is `Approved` or `Outside`, and optionally shows the approval action area.
- `closeModal()` closes document modal and resets modal layout.
- Print CSS targets A6 landscape.
- Production migration target: QR should contain a signed token or lookup key, not a plain sequential GP-ID only.

### Approval And Signature

- `approveCurrentPass()` saves optional default signature settings on `currentUser`, attaches the signature object to the request, and advances status:
  - `Pending Superior` -> `Pending President` or `Pending PAS`
  - `Pending President` -> `Pending PAS`
  - `Pending PAS` -> `Approved`
- Signature utilities:
  - `removeSignatureBackground`
  - `detectSimpleBackgroundMode`
  - `removeBackgroundWithPython`
  - `processAndRenderSignature`
  - `showSignatureSource`
  - `setupSignaturePad`
  - `resizeSignatureCanvas`
  - `clearSignaturePad`
  - `useDrawnSignature`
- Production migration target: store signatures as files or blobs with audit metadata; approval transitions must be transaction-safe in backend.

### Security Scan

- `simulateQrScan()` validates Security role, finds a request by GP-ID, and transitions:
  - `Approved` + first scan + return expected -> `Outside`
  - `Approved` + first scan + one-way -> `Closed`
  - `Outside` + second scan -> `Returned`
- Also updates vehicle status to `In Use` or `Available`.
- Production migration target: backend scanner endpoint with concurrency protection, duplicate-scan prevention, audit log, and clear error messages.

## Prototype Risks To Fix During Migration

- All state is in memory and disappears on refresh.
- Passwords and quick-login shortcuts are hardcoded in frontend.
- Role checks are frontend-only.
- Approval and scanner status changes are not protected from race conditions.
- QR uses visible request id only; it should use a signed or random token.
- Admin, PAS / HR Admin, and System Admin responsibilities need clean separation.
- Optional local Python background-removal endpoint is referenced from frontend; decide whether to remove it, keep it developer-only, or build an approved internal service.
- Vehicle status is mutated inside the request object when selected from mock data; production should separate trip usage from vehicle master status.
