# Backend

Target backend: ASP.NET Core Web API with MySQL.

Keep controllers thin. Put workflow and business rules in services.

Suggested top-level groups:

- `Controllers`: API endpoints.
- `Project/Models`: database entities/domain models.
- `Project/DTOs`: request and response contracts.
- `Project/Repositories`: persistence access.
- `Project/Services`: workflow, auth, approval, scan, notification, and audit logic.

The current repository files are placeholders. The next step is to add the actual ASP.NET project file after confirming the installed .NET SDK version on the development machine.
