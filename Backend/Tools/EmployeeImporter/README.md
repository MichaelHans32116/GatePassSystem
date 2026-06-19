# Employee Importer

This local command imports only:

- Employee ID
- Full Name
- Department
- Position
- Date Hired
- Employment Status

It never reads or writes addresses, contact details, birth information,
government IDs, or emergency-contact fields.

Run a validation-only dry run:

```powershell
dotnet run --project Backend/Tools/EmployeeImporter -- `
  --file Database/employees_export_2026-06-17.xlsx
```

Apply `Database/schema.sql` and `Database/seed-reference.sql`, then import:

```powershell
$env:GATEPASS_DB_CONNECTION = "Server=127.0.0.1;Port=3306;Database=gate_pass_system;User ID=root;Password=;SslMode=None"

dotnet run --project Backend/Tools/EmployeeImporter -- `
  --file Database/employees_export_2026-06-17.xlsx `
  --apply
```

Only active employees are inserted into a fresh database. They receive an
account whose username is the Employee ID. The
initial password is Date Hired in `MMDDYYYY` format, stored only as a PBKDF2
hash, and the account is marked to require a password change.

Inactive workbook rows are not inserted into a fresh database. If a later
workbook marks an employee who already exists in the system as inactive, the
existing account is archived so the user can no longer sign in.

The apply operation also synchronizes workflow assignments from active roles:

- Immediate Superior approvers are scoped to their employee department.
- President approvers are global.
- PAS / HR noters are global and priority ordered.
