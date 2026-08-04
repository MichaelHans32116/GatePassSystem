# Phase 18 Plan — Unified Name Login and Self-Service Password Change (2026-08-04)

## Scope

- Accept employee name aliases in Form Request login while retaining Employee ID as a fallback.
- Match names case-insensitively.
- Resolve duplicate name matches by verifying the password against every candidate.
- Add signed-in self-service password change.
- Persist the replacement PBKDF2 hash transactionally and verify it before commit.
- Preserve changed passwords character-for-character; no silent trimming.
- Clear initial-password, failed-login, and lock flags after a successful change.
- Record a `PASSWORD_CHANGE` audit row without storing any password or hash in the audit details.
- Keep HRAD Ticketing password-change behavior aligned with the Form Request flow.

## Safety and coordination

- Phase 17.1–17.7 was inspected before editing; Claude's committed workflow/mobile changes are preserved.
- `.claude/launch.json` and unrelated untracked staging files are intentionally untouched.
- Falcon warning followed: no PowerShell web login, cookie extraction, hidden process, polling loop, or forced process termination.
- Tests use synthetic credentials only. No production password is written to source or test output.

## Verification checklist

- [x] API and project compile with zero errors.
- [x] Frontend JavaScript syntax passes.
- [x] `LORD DAN`-style full/partial/case-insensitive name aliases select the expected candidate.
- [x] Legacy Employee ID login remains supported.
- [x] Wrong current password does not update storage.
- [x] Mismatched confirmation does not update storage.
- [x] Successful change persists a new PBKDF2 hash and audit row.
- [x] Old password stops working; new password works and remains case-sensitive.
- [x] Leading/trailing spaces are preserved as password characters instead of being silently removed.
- [x] Login copy renders in the local browser; modal controls and frontend handlers are present and syntax-checked.

## Phase 18.2 — UAT Hardening and End-to-End Closure

- Fixed non-employee companion serialization (`fullName`) and prevented a requestor
  from being added again as their own companion.
- Made person/material draft creation atomic, including the requestor-included flag
  and companion rows.
- Removed the broken service-request endpoint/modal and routed schedule requests to
  the working form flow.
- Enforced HRAD vehicle assignment from authoritative stored request data and added
  overlap checks for both legs of split schedules.
- Preserved the 11:00 AM–1:00 PM vacancy by storing 10:00–11:00 and 1:00–2:00 as
  separate reservation rows.
- Updated the digital vehicle route to Superior → HRAD → PAS; the President is the
  final physical signer on the printed company-vehicle form.
- Corrected local preview API routing and aligned the offline mock route with the
  production workflow.
- Retired the unsafe EmployeeImporter login/password utility.
- Hardened name login candidate selection and invalidated existing sessions after a
  password change with a password-version JWT claim.

## Phase 18.4–18.5 — UAT round-2 fixes (same day)

- 18.4 (backend): HRAD assignment now hard-blocks a double-booked DRIVER, not
  just the vehicle — fixed runs (explicit driver or the vehicle's default
  driver) and other passes' blocking reservations both count. Fixed-schedule
  conflict checks in ApprovalRepository and FleetRepository.ReserveAsync now
  convert UTC reservation times to Philippine wall-clock (+8h) before
  comparing, so afternoon fixed runs (e.g. 4:30–5:30 PM) are actually caught.
  The /fleet/schedule feed backfills a fixed run's driver from the vehicle's
  default driver so the HRAD modal's driver availability turns "Away".
  Restart the local API after pulling this.
- 18.5 (frontend): companion suggestion dropdown is no longer clipped by the
  card's overflow; Enter chains companion rows (select → Enter → fresh focused
  row) alongside the Add companion button; Change Password moved off the
  sidebar to the top-bar profile chip.

## Final verification evidence

- [x] Pass 1 — API, importer, and tracked regression projects compile; JavaScript
  syntax and repository diff checks pass.
- [x] Pass 2 — isolated MariaDB tests prove atomic rollback, overlap rejection before
  replacement, and two-row split-window persistence. The synthetic database is
  deleted after the test.
- [x] Pass 3 — browser smoke test, cache-busted local routing, and clean release
  candidate review before push.

## Phase 18.4 — Current HRAD Vehicle Assigners

- Import the verified minimum employee record for GA412, Myla Mae C. Abarquez,
  from `employees_export_2026-07-07.xlsx` without copying unrelated HR data.
- Preserve GA139, Roxanne G. Encinada (Ma'am Ro), and make GA139/GA412 active,
  equal-priority HRAD assigners for Person and Material company-vehicle requests.
- Create GA412's initial account with PBKDF2, require a password change, and never
  overwrite an existing changed password on migration reruns.
- Apply the idempotent migration to local and live `gate_pass_system` only after a
  disposable clone test and a live-database backup.

### Phase 18.4 verification

- [x] Approved source workbook confirms GA139 Roxanne G. Encinada and GA412 Myla
  Mae C. Abarquez identities and current employment records.
- [x] Disposable database clone accepts Migration 024 twice without duplicates or
  overwriting an existing password.
- [x] Local and live databases were backed up before the migration.
- [x] Local and live `gate_pass_system` contain active GA139/GA412 Person and
  Material HRAD assignment rows at equal priority.
- [x] Live verification reports zero duplicate HRAD assignment groups and preserves
  the existing GA120 assignments.

