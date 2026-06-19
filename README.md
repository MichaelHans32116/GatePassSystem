# Gate Pass System

Internal gate pass workflow system for requesting, approving, printing, scanning, and tracking associate gate passes.

## Start the complete local system

Double-click `start-local.bat`, or run:

```powershell
.\start-local.ps1
```

This checks XAMPP MariaDB, builds and starts the ASP.NET API on port `5087`,
serves the vanilla frontend on port `5500`, verifies `/api/health`, and opens
the frontend. Do not open `index.html` directly because the API expects an
HTTP origin.

The launcher binds the frontend and API to all local network interfaces. It
prints LAN URLs that can be opened by another device on the same network.
Manual QR entry works over HTTP; live phone-camera scanning requires HTTPS or
localhost because of browser security rules.

## Deploy through local XAMPP

Double-click `deploy-xampp.bat`, or run:

```powershell
.\deploy-xampp.ps1
```

This builds and starts the ASP.NET API, uses XAMPP MariaDB, copies only the
frontend assets to `C:\xampp\htdocs\GatePassSystem`, starts Apache when needed,
and opens:

```text
http://127.0.0.1/GatePassSystem/
```

The API remains on port `5087`. Development CORS is enabled only by the local
launcher so the Apache/PHP frontend can call the API from localhost or a LAN IP.

## Start the portable Docker stack

Docker Desktop is required. Double-click `docker-start.bat`, or run:

```powershell
.\docker-start.ps1
```

The Docker stack contains:

- Nginx frontend and same-origin `/api` reverse proxy on port `8080`
- ASP.NET Core API on internal port `8080` and host port `5088`
- MariaDB on internal port `3306` and host port `3307`
- optional Python signature-background-removal service

On first use, `.env.example` is copied to the ignored `.env` file. Change its
development passwords and JWT key before sharing the stack. The database is
initialized from `Database/schema.sql`, `Database/seed-reference.sql`, and
`Database/procedures.sql`. If the ignored employee workbook is present, the
launcher imports its approved active employee fields into the Docker database.

Open:

```text
http://127.0.0.1:8080/
```

Other devices on the same network can use the Docker host's LAN IP with port
`8080`. Production or camera-enabled network deployment must add HTTPS.

For automatic signature cleanup, run
`Backend/SignatureBackgroundRemoval/start_backend.bat` once to create its
isolated environment. Later `start-local.bat` launches that helper
automatically when the environment exists.

Optional automated frontend smoke test:

```powershell
$env:GATEPASS_TEST_USERNAME = "employee-id"
$env:GATEPASS_TEST_PASSWORD = "initial-or-current-password"
npm install --no-save playwright
node Tests/frontend-smoke.mjs
```

## Current Status

The repository now contains:

- `index.html` and `Frontend/`: working vanilla frontend with database-backed
  authentication, gate pass workflow, approvals, signatures, fleet data, and
  QR/manual security scanning.
- `Docs/PROTOTYPE_AUDIT.md`: inventory of prototype screens, roles, mock data, and JavaScript logic.
- `Docs/MIGRATION_PLAN.md`: plan for converting the prototype into a maintainable app.
- `Docs/API_CONTRACT.md`: first draft of backend endpoints.
- `Database/`: normalized MariaDB schema, seed references, migrations, and
  transactional stored procedures.
- `Backend/`: .NET 8 ASP.NET Core API with JWT authorization and secured
  workflow endpoints.
- `docker-compose.yml`: portable frontend, API, MariaDB, and signature-helper
  stack.

## Planned Features

- Gate pass request creation
- Request review and approval workflow
- President approval when required by policy
- PAS final noting
- QR-based security Time Out and Time In
- Vehicle and driver tracking
- Searchable gate pass logs
- User, role, department, vehicle, and driver management
- Audit logs and reports
- Role-based access control

## Development Notes

- Six browser-only mock users remain available for UI role testing. Real
  employee accounts authenticate through MariaDB.
- The backend foundation now uses password hashing, database-backed accounts,
  multiple role assignments, and server-side JWT claims.
- The raw employee workbook is excluded from Git. The importer reads only
  Employee ID, Full Name, Department, Position, Date Hired, and Employment Status.
- Keep real employee data, passwords, and server credentials out of Git.

## Repository

GitHub: https://github.com/MichaelHans32116/GatePassSystem
