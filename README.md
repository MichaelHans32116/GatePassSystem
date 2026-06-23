# Form Request System

Internal workflow system for requesting, approving, printing, and tracking
Moriroku forms. The current release supports:

- Person Gate Pass: approval routing, printable document, QR Time Out/Time In,
  and optional company-vehicle reservation.
- Material Gate Pass: itemized release form routed from Prepared By to the
  Immediate Superior and then to the shared PAS approval queue.

Both forms receive a daily control number in `MMDDYY-001` format. Material
forms do not generate a QR because they are approved item-release documents,
not employee movement records.

## Start the complete local system

Double-click `start-local.bat`, or run:

```powershell
.\start-local.ps1
```

This checks XAMPP MariaDB, builds and starts the ASP.NET API on port `5087`,
serves the vanilla frontend on port `5500`, verifies `/api/health`, and opens
the frontend. Do not open `index.html` directly because the API expects an
HTTP origin.

The default launcher is localhost-only for testing on the current
computer. Manual QR entry works over HTTP; live phone-camera scanning requires
HTTPS or localhost because of browser security rules.

If you intentionally want same-Wi-Fi/LAN access, run:

```powershell
.\start-local.ps1 -ExposeLan
```

This binds the frontend and API to local network interfaces and prints LAN
URLs that can be opened by another device on the same router or Wi-Fi.

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

### Access from another device on the same Wi-Fi

Cloudflare is not required for devices connected to the same router or Wi-Fi.
After running `deploy-xampp.ps1` or `start-local.ps1`, use the LAN URL printed
by the launcher. Example:

```text
http://192.168.100.46/GatePassSystem/
```

The IP address can change after reconnecting to Wi-Fi, so use the current
address printed by the launcher instead of permanently relying on the example.
The laptop, XAMPP Apache, MariaDB, and the ASP.NET API must remain running.

## Start protected internet practice access

Cloudflare access is optional. Use it only when the system must be opened from
another network, mobile data, or another country.

Run:

```powershell
.\start-public.ps1
```

This installs Cloudflare Tunnel when needed, creates a separate
password-protected Apache gateway, and publishes a temporary HTTPS URL without
opening router ports. The URL and generated access credentials are stored only
under the ignored `LocalData\public-access` directory.

The launcher uses HTTP/2 for the tunnel because some networks intermittently
drop Cloudflare QUIC/UDP sessions. It also verifies the temporary hostname
through Cloudflare DNS while other public resolvers are still propagating it.
Both the frontend and `/api` route remain behind the gateway password; the
ASP.NET Bearer token is forwarded separately after Apache authentication.

Stop the public practice URL when testing is complete:

```powershell
.\stop-public.ps1
```

The temporary URL changes whenever the tunnel restarts. MariaDB and the
ASP.NET API remain on the laptop; only the protected gateway is exposed.
Anyone with the current URL and generated gateway credentials can connect from
outside the local network while the laptop and tunnel remain online. Do not
commit or share the credentials publicly.

The current temporary URL and gateway credentials are written locally to:

```text
LocalData\public-access\credentials.txt
```

`LocalData` is ignored by Git, so credentials are never included in a push.
Run `start-public.ps1` on each computer after pulling; do not expect an old
temporary `trycloudflare.com` URL from another machine to remain active.

### Cloudflare URL does not resolve

If Cloudflare and Google DNS already know the temporary hostname but Windows
reports `DNS name does not exist`, the router may be caching an old negative
DNS response. Open PowerShell as Administrator and set reliable Wi-Fi DNS:

```powershell
Set-DnsClientServerAddress `
    -InterfaceAlias "Wi-Fi" `
    -ServerAddresses @(
        "1.1.1.1",
        "8.8.8.8",
        "2606:4700:4700::1111",
        "2001:4860:4860::8888"
    )
Clear-DnsClientCache
ipconfig /flushdns
```

To restore automatic DNS from the router:

```powershell
Set-DnsClientServerAddress -InterfaceAlias "Wi-Fi" -ResetServerAddresses
```

Cloudflare Quick Tunnels are intended for temporary testing and have no uptime
guarantee. Use a named Cloudflare Tunnel and company-controlled domain for a
stable production address.

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
