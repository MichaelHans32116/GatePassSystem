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
