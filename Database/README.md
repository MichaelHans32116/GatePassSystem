# Database

This folder contains the MariaDB/MySQL migration target for the Form Request
System.

Files:

- `schema.sql`: canonical clean-install schema using the HowConnect-style
  `tbl_` and `view_` naming convention.
- `seed-reference.sql`: safe role, permission, and department baseline data.
- `procedures.sql`: transactional gate pass creation, submission,
  approval outcome, completion, paging, and dashboard stored procedures.
- `NAMING_CONVENTIONS.md`: naming rules for tables, keys, views, procedures,
  indexes, C# types, and DTOs.
- `Migrations/`: ordered scripts for changes after the first deployed database.

Current migrations:

- `001` to `005`: person gate pass, authentication, employee, vehicle,
  signature, QR, and audit foundations.
- `006_form_request_material_gate_pass.sql`: shared form types and daily control
  numbers, material item rows, Material Gate Pass approval routing, and
  form-aware reporting views and indexes.
- `007_department_access_shared_pas.sql`: separate Finance, HR, and IT
  departments, manager department access, and shared PAS approval.
- `008` to `018`: material gate pass restrictions, guard signatures, control
  number/view cleanup, vehicle schedule seed, HRAD assignment naming, material
  proof uploads, associates, cancel status, material vehicle handling, and
  split vehicle reservations.
- `019_sync_fixed_vehicle_schedule_with_workbook.sql`: workbook-driven fixed
  vehicle schedule correction for the recurring OUT window and Saturday
  Accord row.
- `020_harden_security_queue_active_states.sql`: terminal-state guard queue
  hardening so rejected/cancelled/expired requests do not linger in the live
  security list.

Gate pass lifecycle timestamps:

- `applied_at`: request submission time.
- `approval_completed_at`: final approval or rejection time.
- `approved_at`, `rejected_at`, `cancelled_at`, `expired_at`: explicit outcome times.
- `completed_at`: actual gate transaction completion time after Time In or a
  one-way Time Out.
- `tbl_gate_pass_status_history`: immutable status transition history.

Material Gate Pass records use the same request and approval foundation, with
their item rows stored in `tbl_material_gate_pass_items`. They never receive a
QR token and are excluded from the security scan queue.

PAS steps are shared. Any active account with `gatepass.note.pas` may act on a
pending PAS request, except the requester. The user who acts is recorded as the
actual approver.

Local setup order:

1. `schema.sql` for a clean database, or ordered migrations for an existing one
2. `seed-reference.sql`
3. `procedures.sql`
4. `seed-fleet.sql`
5. Employee importer with the external workbook

The raw employee workbook is intentionally excluded from Git. The importer reads
only Employee ID, Full Name, Department, Position, Date Hired, and Employment
Status. Do not place passwords, unrelated employee fields, or production server
credentials in this folder.

Expandable statuses and types are stored in reference tables rather than
MariaDB `ENUM` definitions. New values can therefore be seeded without altering
the core transaction tables.
