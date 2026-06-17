# Database

This folder contains the MySQL migration target for the Gate Pass System.

Files:

- `schema.sql`: normalized draft schema, indexes, and starter views.
- `seed-reference.sql`: safe role, permission, and department baseline data.

Planned next files:

- `procedures.sql`: transactional workflow helpers for request creation, approvals, and scans.
- `views.sql`: reporting and queue views if the schema file becomes too large.

Do not put real passwords, private employee data, or production server credentials in this folder.
