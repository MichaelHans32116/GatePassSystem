# Database

This folder contains the MariaDB/MySQL migration target for the Gate Pass System.

Files:

- `schema.sql`: canonical clean-install schema using the HowConnect-style
  `tbl_` and `view_` naming convention.
- `seed-reference.sql`: safe role, permission, and department baseline data.
- `NAMING_CONVENTIONS.md`: naming rules for tables, keys, views, procedures,
  indexes, C# types, and DTOs.
- `Migrations/`: ordered scripts for changes after the first deployed database.

Planned next files:

- `procedures.sql`: transactional workflow helpers for request creation, approvals, and scans.
- `views.sql`: reporting and queue views if the schema file becomes too large.

The raw employee workbook is intentionally excluded from Git. The importer reads
only Employee ID, Full Name, Department, Position, Date Hired, and Employment
Status. Do not place passwords, unrelated employee fields, or production server
credentials in this folder.

Expandable statuses and types are stored in reference tables rather than
MariaDB `ENUM` definitions. New values can therefore be seeded without altering
the core transaction tables.
