# Gate Pass System

Internal gate pass workflow system for requesting, approving, printing, scanning, and tracking associate gate passes.

## Current Status

The repository now contains:

- `index.html`: single-file UI prototype generated during planning.
- `Docs/PROTOTYPE_AUDIT.md`: inventory of prototype screens, roles, mock data, and JavaScript logic.
- `Docs/MIGRATION_PLAN.md`: plan for converting the prototype into a maintainable app.
- `Docs/API_CONTRACT.md`: first draft of backend endpoints.
- `Database/schema.sql`: normalized MySQL schema draft.
- `Frontend/`: target structure for the future modular frontend.
- `Backend/`: target structure for the future ASP.NET Core Web API.

## Planned Features

- Gate pass request creation
- Request review and approval workflow
- President approval when required by policy
- PAS / HR final noting
- QR-based security Time Out and Time In
- Vehicle and driver tracking
- Searchable gate pass logs
- User, role, department, vehicle, and driver management
- Audit logs and reports
- Role-based access control

## Development Notes

- The current prototype uses browser-only mock data and hardcoded test users.
- Production implementation must use backend authentication, password hashing, database storage, and server-side authorization.
- Keep real employee data, passwords, and server credentials out of Git.

## Repository

GitHub: https://github.com/MichaelHans32116/GatePassSystem
