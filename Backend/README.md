# Backend

ASP.NET Core Web API targeting .NET 8 with MariaDB/MySQL.

## Projects

- `GatePassSystem.Api.csproj`: HTTP API, controllers, authentication, CORS,
  rate limiting, exception handling, and Swagger.
- `Project/GatePassSystem.Project.csproj`: models, DTOs, repositories, and
  business services.
- `Tools/EmployeeImporter`: local workbook importer that reads only the six
  approved employee fields.

Controllers remain thin. Database access uses async Dapper queries through
`MySqlConnector`, and services are registered through dependency injection.
Database tables use HowConnect-style `tbl_` names and explicit entity keys,
while C# keeps standard PascalCase naming.

## Local setup

1. Start XAMPP MariaDB.
2. Apply `Database/schema.sql`.
3. Apply `Database/seed-reference.sql`.
4. Optionally run the employee importer from the repository root.
5. Start the API:

```powershell
dotnet run --project Backend/GatePassSystem.Api.csproj
```

Swagger is available at `http://127.0.0.1:5087/swagger` in Development.

The local XAMPP connection in `appsettings.json` is Development-only.
Production requires `GATEPASS_DB_CONNECTION` and a non-development JWT key.
