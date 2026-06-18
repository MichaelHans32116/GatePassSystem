# Database Naming Conventions

The database follows the naming pattern used by the HowConnect repository while
keeping the schema extensible for future Gate Pass modules.

## Objects

- Tables: `tbl_<plural_name>`
- Views: `view_<descriptive_name>`
- Stored procedures: `SP_<Action><Entity>`
- Indexes: `ix_<table_or_purpose>_<columns>`
- Unique keys: `ux_<table_or_purpose>_<columns>`
- Foreign keys: `fk_<child_table>_<parent_or_relationship>`

Examples:

- `tbl_gate_pass_requests`
- `view_security_gate_queue`
- `SP_RecordGatePassTimeOut`
- `ix_gate_pass_requester_status`

## Columns

- Use lowercase `snake_case`.
- Primary keys use the entity name: `user_id`, `vehicle_id`, `gate_pass_id`.
- Foreign keys use the referenced key name.
- Stable reference values use `*_code`, such as `gate_pass_status_code`.
- Boolean values start with `is_`, `has_`, `can_`, `allows_`, or `requires_`.
- Timestamps end in `_at`; dates end in `_date`.

## C# Naming

Database names remain `snake_case`, while C# follows normal .NET conventions:

- Classes/interfaces/properties: `PascalCase`
- Interfaces: `I` prefix
- Controllers: singular resource name plus `Controller`
- Services and repositories: singular entity or workflow name
- DTOs: action and purpose, such as `LoginRequest` or `GatePassDetailResponse`

SQL queries alias database columns to C# property names. This keeps the database
consistent with HowConnect without spreading `snake_case` property names through
the application.

## Extensibility

Statuses and types that may grow are stored in `tbl_*_statuses` or
`tbl_*_types` reference tables. Do not use MariaDB `ENUM` for expandable
business values.

New schema changes must be added as numbered migration scripts. Do not edit a
database manually without recording the equivalent migration.
