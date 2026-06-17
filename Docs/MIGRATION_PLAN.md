# Migration Plan

Goal: convert the current `index.html` prototype into a maintainable internal Gate Pass System with separate frontend modules, backend API, database schema, and role-based authorization.

## Target Architecture

```text
GatePassSystem/
  Backend/
    Controllers/
    Project/
      DTOs/
      Models/
      Repositories/
      Services/
  Database/
    schema.sql
    seed-reference.sql
    views.sql
    procedures.sql
  Frontend/
    index.html
    SRC/
      components/
      pages/
      services/
      state/
      utils/
    Design/
  Docs/
```

## Recommended Migration Phases

### Phase 1: Freeze And Document Prototype

- Keep root `index.html` as the visual/workflow reference until the split is complete.
- Use `Docs/PROTOTYPE_AUDIT.md` as the inventory of screens, roles, mock data, and JavaScript behavior.
- Remove test credentials from any production seed data.

### Phase 2: Frontend Split

Use vanilla HTML/CSS/JavaScript modules first, because the original direction is plain HTML/CSS/JS with Tailwind.

Suggested files:

```text
Frontend/
  index.html
  SRC/
    app.js
    config/
      navigation.js
      roles.js
      statuses.js
    components/
      sidebar.js
      topbar.js
      toast.js
      data-table.js
      gate-pass-form.js
      approval-card.js
      print-form.js
      signature-pad.js
      qr-code.js
    pages/
      login.page.js
      dashboard.page.js
      apply-gate-pass.page.js
      approvals.page.js
      security-scanner.page.js
      admin-logs.page.js
      user-management.page.js
      fleet-management.page.js
      departments-roles.page.js
    services/
      api-client.js
      auth.api.js
      gate-pass.api.js
      approvals.api.js
      security.api.js
      users.api.js
      fleet.api.js
    state/
      session-store.js
      app-store.js
    utils/
      date-time.js
      dom.js
      formatters.js
      validators.js
    styles/
      app.css
```

Migration order:

1. Extract CSS and Tailwind config.
2. Extract mock data into temporary `state/mock-data.js`.
3. Extract reusable components: toast, sidebar, topbar, modal, print form.
4. Extract pages one at a time.
5. Replace mock data calls with API service calls.
6. Remove quick-login and frontend-only authorization checks once backend auth is active.

### Phase 3: Backend API

Use ASP.NET Core Web API with MySQL. Keep controllers thin and put business rules in services.

Suggested backend responsibilities:

- `AuthService`: login, password hashing, session/JWT creation, current user lookup.
- `AuthorizationService`: role and permission checks.
- `GatePassWorkflowService`: route calculation and status transitions.
- `ApprovalService`: approve/reject requests, store signatures, write audit logs.
- `SecurityScanService`: validate QR token, record Time Out/In, protect against duplicate scans.
- `VehicleService`: vehicle availability, assignments, usage status.
- `NotificationService`: approver notifications and dashboard badges.
- `AuditLogService`: immutable audit trail.

Controller groups:

- `AuthController`
- `GatePassRequestsController`
- `ApprovalsController`
- `SecurityScansController`
- `UsersController`
- `RolesController`
- `DepartmentsController`
- `VehiclesController`
- `DriversController`
- `ReportsController`
- `AuditLogsController`

### Phase 4: Database

Start from `Database/schema.sql`.

Core tables:

- `roles`
- `permissions`
- `role_permissions`
- `departments`
- `positions`
- `users`
- `drivers`
- `vehicles`
- `gate_pass_requests`
- `gate_pass_approvals`
- `gate_pass_scans`
- `signature_files`
- `notifications`
- `audit_logs`

Important database rules:

- Request status must be a controlled value.
- Approval rows should be immutable once approved, except by admin correction with audit log.
- Scanner endpoint should update request and insert scan log inside one transaction.
- Vehicle usage should be derived from active approved/outside requests, not only a mutable vehicle flag.

### Phase 5: Role-Based Authorization

Frontend navigation should be generated from a role config, but backend policies are the real protection.

Suggested policies:

| Permission | Roles |
| --- | --- |
| `gatepass.create` | Associate, Immediate Superior, PAS / HR Admin, System Admin if allowed |
| `gatepass.read.own` | All logged-in users |
| `gatepass.read.department` | Immediate Superior, PAS / HR Admin |
| `gatepass.read.all` | System Admin, President, PAS / HR Admin as approved by policy |
| `gatepass.approve.superior` | Immediate Superior |
| `gatepass.approve.president` | President |
| `gatepass.note.pas` | PAS / HR Admin |
| `gatepass.scan` | Security |
| `users.manage` | System Admin |
| `roles.manage` | System Admin |
| `fleet.manage` | System Admin, PAS / HR Admin |
| `reports.view` | System Admin, PAS / HR Admin, President |
| `audit.view` | System Admin |

### Phase 6: Scanner And QR Hardening

- Generate a random QR token per approved request.
- Store only a hash of the QR token in the database.
- QR payload should not expose sensitive request details.
- Scanner calls `POST /api/security/scans`.
- Backend decides whether the scan is Time Out, Time In, already completed, expired, not approved, or invalid.
- Every scan attempt should create an audit or scan log.

### Phase 7: Production Readiness

- Replace CDN dependencies with approved internal/local assets if required by company IT.
- Add `.env.example` and keep secrets out of Git.
- Add backend validation and consistent API errors.
- Add database migration scripts.
- Add tests for workflow transitions.
- Add user manual after screens stabilize.

## First Build Slice

Best first implementation slice:

1. Backend auth with seeded roles/users using hashed passwords.
2. Create gate pass request API.
3. Approval queue API.
4. Security scan API.
5. Frontend pages connected to those APIs:
   - Login
   - Dashboard
   - Apply Gate Pass
   - Approvals
   - Security Scanner

Admin management screens can follow after the workflow is working end to end.
