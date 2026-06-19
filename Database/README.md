# Database

This folder contains the MariaDB/MySQL migration target for the Gate Pass System.

Files:

- `schema.sql`: canonical clean-install schema using the HowConnect-style
  `tbl_` and `view_` naming convention.
- `seed-reference.sql`: safe role, permission, and department baseline data.
- `procedures.sql`: transactional gate pass creation, submission,
  approval outcome, completion, paging, and dashboard stored procedures.
- `NAMING_CONVENTIONS.md`: naming rules for tables, keys, views, procedures,
  indexes, C# types, and DTOs.
- `Migrations/`: ordered scripts for changes after the first deployed database.

Gate pass lifecycle timestamps:

- `applied_at`: request submission time.
- `approval_completed_at`: final approval or rejection time.
- `approved_at`, `rejected_at`, `cancelled_at`, `expired_at`: explicit outcome times.
- `completed_at`: actual gate transaction completion time after Time In or a
  one-way Time Out.
- `tbl_gate_pass_status_history`: immutable status transition history.

Local setup order:

1. `schema.sql`
2. `seed-reference.sql`
3. `procedures.sql`
4. Employee importer with the external workbook

Planned next file:

- `views.sql`: reporting and queue views if the schema file becomes too large.

The raw employee workbook is intentionally excluded from Git. The importer reads
only Employee ID, Full Name, Department, Position, Date Hired, and Employment
Status. Do not place passwords, unrelated employee fields, or production server
credentials in this folder.

Expandable statuses and types are stored in reference tables rather than
MariaDB `ENUM` definitions. New values can therefore be seeded without altering
the core transaction tables.
