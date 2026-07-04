# FormRequestSystem

Internal Moriroku workflow app: request/approve/print/track gate passes
(Person Gate Pass with QR Time Out/In, Material Gate Pass with itemized
release). Vanilla JS frontend, ASP.NET Core 8 API, MariaDB via XAMPP.

## Commands

- `start-local.bat` / `.\start-local.ps1` â€” full local run: XAMPP MariaDB +
  API (port 5087) + frontend (port 5500). Use `-ExposeLan` for same-Wi-Fi
  device testing. Never open `index.html` directly â€” the API needs an HTTP
  origin.
- `deploy-xampp.bat` / `.\deploy-xampp.ps1` â€” builds API, copies frontend to
  `C:\xampp\htdocs\FormRequestSystem`, serves at `http://127.0.0.1/FormRequestSystem/`.
- `.\docker-start.ps1` â€” portable stack (nginx + API + MariaDB) on port 8080.
- `.\start-public.ps1` / `.\stop-public.ps1` â€” temporary Cloudflare Tunnel for
  internet-exposed testing. Never share `LocalData\public-access\credentials.txt`.
- Frontend smoke test: `node Tests/frontend-smoke.mjs` (needs
  `GATEPASS_TEST_USERNAME`/`GATEPASS_TEST_PASSWORD` env vars, `npm install
  --no-save playwright` first).

## Where things live

- `index.html` + `Frontend/SRC/` â€” the working frontend (`components`,
  `pages`, `services`, `state`, `styles`, `utils`).
- `Backend/Controllers/` â€” ASP.NET API endpoints (Auth, GatePassRequests,
  Approvals, Security, Fleet, Employees, Admin, Notifications, Signatures,
  Dashboard).
- `Database/schema.sql`, `seed-reference.sql`, `procedures.sql` â€” base DB.
- `Database/Migrations/0NN_description.sql` â€” incremental changes.
- `Docs/` â€” `API_CONTRACT.md`, `MIGRATION_PLAN.md`, `PROTOTYPE_AUDIT.md`,
  phase plan docs. Check the relevant one before large changes instead of
  re-deriving context from code.

## Rules

- **New DB migration = two edits, not one**: add the `.sql` file under
  `Database/Migrations/` AND add its execution block to
  `Database/setup-xampp.ps1` â€” it's the sole runner. A migration file alone
  does nothing.
- Real employee data, passwords, and server credentials never go in Git.
  `LocalData/` is gitignored for this reason â€” keep it that way.
- Six mock users exist for browser-only role UI testing; real accounts
  authenticate through MariaDB. Don't confuse the two when debugging auth.
## Git workflow

- **Branches**: `office/hans-branch` (working from the office) and
  `hans-house` (working from home) are the two location branches; `main` is
  the integration branch. At the **start** of a session, check the current
  branch against `main` (`git rev-list --count <branch>..main`) and merge
  `main` in first if behind â€” work may have landed from the other location
  branch since last time. At the **end** of a session, merge whichever
  location branch was just used into `main`, so the other location branch
  can pick up the latest work next time.
- **Commit iteratively**: commit and push as work completes, not one giant
  commit at the end.
- **Document progress continuously**: before and after substantial edits,
  add a short progress note to the relevant phase doc or handoff doc so the
  next turn can see what changed, what was verified, and what remains.
- **Phase numbering in commit messages** (`Phase X.Y: <description>`):
  before naming a phase, check the latest commit across **all branches**
  (not just the current one) so the number is never reused. Given a prior
  phase like `Phase 11.3`:
  - Bug fix or small improvement â†’ bump the minor number, same sprint:
    `Phase 11.4`.
  - Major new feature â†’ start a new sprint: `Phase 12.1`, and note what the
    new phase covers.
- **Keep phase numbers consistent**: every commit and push on this branch
  should use the next phase number in sequence, never an ad hoc message.
- **Never add Claude attribution**: no `Co-Authored-By: Claude`, no
  "Generated with Claude Code", nothing referencing Claude/Anthropic in
  commit messages, PR bodies, or committed files.

## Workflow tip

This repo spans frontend, API, and DB migrations at once â€” non-trivial
changes benefit from planning before editing. Run `/model opusplan` to use
Opus for the plan and Sonnet for the actual file edits: better plan quality,
lower cost than Opus for everything.

## Current branch notes

- Office branch removes the live `Cancel` approval action; `Reject` stays
  universal.
- HRAD assignment now shows the requested schedule window plus vehicle and
  driver availability hints in the modal.

