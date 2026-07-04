# Backend

ASP.NET Core Web API targeting .NET 8 with MariaDB/MySQL.

## Projects

- `FormRequestSystem.Api.csproj`: HTTP API, controllers, authentication, CORS,
  rate limiting, exception handling, and Swagger.
- `Project/FormRequestSystem.Project.csproj`: models, DTOs, repositories, and
  business services.
- `Tools/EmployeeImporter`: local workbook importer that reads only the six
  approved employee fields.

Controllers remain thin. Database access uses async Dapper queries through
`MySqlConnector`, and services are registered through dependency injection.
Every application/importer connection sets the MariaDB session timezone to UTC.
Database tables use HowConnect-style `tbl_` names and explicit entity keys,
while C# keeps standard PascalCase naming.

Phase 3 controllers expose gate pass requests, approval queues and decisions,
Security scans, fleet/driver data, dashboard snapshots, and protected
signature upload/download. JWT `permission` claims are enforced through named
authorization policies. API responses use consistent success, paged, business
error, validation, and trace-ID contracts.

## Local setup

1. Start XAMPP MariaDB.
2. Apply `Database/schema.sql`.
3. Apply `Database/seed-reference.sql`.
4. Apply `Database/procedures.sql`.
5. Run the employee importer from the repository root.
6. Start the API:

```powershell
dotnet run --project Backend/FormRequestSystem.Api.csproj
```

Swagger is available at `http://127.0.0.1:5087/swagger` in Development.

Build the complete solution with:

```powershell
dotnet build Backend/FormRequestSystem.sln -maxcpucount:1
```

The single-worker option avoids concurrent writes to the shared Project
library when the API and importer are built together.

The local XAMPP connection in `appsettings.json` is Development-only.
Production requires `GATEPASS_DB_CONNECTION` and a non-development JWT key.
For the live Moriroku XAMPP host, the API also allows browser requests from
`http://192.168.9.7` so the Apache-served frontend can talk to port 5087.

