# GatePassSystem

Internal Moriroku workflow app: request/approve/print/track gate passes
(Person Gate Pass with QR Time Out/In, Material Gate Pass with itemized
release). Vanilla JS frontend, ASP.NET Core 8 API, MariaDB via XAMPP.

## Commands

- `start-local.bat` / `.\start-local.ps1` — full local run: XAMPP MariaDB +
  API (port 5087) + frontend (port 5500). Use `-ExposeLan` for same-Wi-Fi
  device testing. Never open `index.html` directly — the API needs an HTTP
  origin.
- `deploy-xampp.bat` / `.\deploy-xampp.ps1` — builds API, copies frontend to
  `C:\xampp\htdocs\GatePassSystem`, serves at `http://127.0.0.1/GatePassSystem/`.
- `.\docker-start.ps1` — portable stack (nginx + API + MariaDB) on port 8080.
- `.\start-public.ps1` / `.\stop-public.ps1` — temporary Cloudflare Tunnel for
  internet-exposed testing. Never share `LocalData\public-access\credentials.txt`.
- Frontend smoke test: `node Tests/frontend-smoke.mjs` (needs
  `GATEPASS_TEST_USERNAME`/`GATEPASS_TEST_PASSWORD` env vars, `npm install
  --no-save playwright` first).

## Where things live

- `index.html` + `Frontend/SRC/` — the working frontend (`components`,
  `pages`, `services`, `state`, `styles`, `utils`).
- `Backend/Controllers/` — ASP.NET API endpoints (Auth, GatePassRequests,
  Approvals, Security, Fleet, Employees, Admin, Notifications, Signatures,
  Dashboard).
- `Database/schema.sql`, `seed-reference.sql`, `procedures.sql` — base DB.
- `Database/Migrations/0NN_description.sql` — incremental changes.
- `Docs/` — `API_CONTRACT.md`, `MIGRATION_PLAN.md`, `PROTOTYPE_AUDIT.md`,
  phase plan docs. Check the relevant one before large changes instead of
  re-deriving context from code.

## Rules

- **New DB migration = two edits, not one**: add the `.sql` file under
  `Database/Migrations/` AND add its execution block to
  `Database/setup-xampp.ps1` — it's the sole runner. A migration file alone
  does nothing.
- Real employee data, passwords, and server credentials never go in Git.
  `LocalData/` is gitignored for this reason — keep it that way.
- Six mock users exist for browser-only role UI testing; real accounts
  authenticate through MariaDB. Don't confuse the two when debugging auth.
## Git workflow

- **Branches**: `office/hans-branch` (working from the office) and
  `hans-house` (working from home) are the two location branches; `main` is
  the integration branch. At the **start** of a session, check the current
  branch against `main` (`git rev-list --count <branch>..main`) and merge
  `main` in first if behind — work may have landed from the other location
  branch since last time. At the **end** of a session, merge whichever
  location branch was just used into `main`, so the other location branch
  can pick up the latest work next time.
- **Commit iteratively**: commit and push as work completes, not one giant
  commit at the end.
- **Phase numbering in commit messages** (`Phase X.Y: <description>`):
  before naming a phase, check the latest commit across **all branches**
  (not just the current one) so the number is never reused. Given a prior
  phase like `Phase 11.3`:
  - Bug fix or small improvement → bump the minor number, same sprint:
    `Phase 11.4`.
  - Major new feature → start a new sprint: `Phase 12.1`, and note what the
    new phase covers.
- **Never add Claude attribution**: no `Co-Authored-By: Claude`, no
  "Generated with Claude Code", nothing referencing Claude/Anthropic in
  commit messages, PR bodies, or committed files.

## Workflow tip

This repo spans frontend, API, and DB migrations at once — non-trivial
changes benefit from planning before editing. Run `/model opusplan` to use
Opus for the plan and Sonnet for the actual file edits: better plan quality,
lower cost than Opus for everything.
