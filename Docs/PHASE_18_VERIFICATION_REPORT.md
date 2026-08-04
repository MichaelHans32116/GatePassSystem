# Phase 18 Verification Report — 2026-08-04

## Result

Phase 17 UAT revisions and Phase 18 authentication hardening are complete on
`office/hans-branch`. The reviewed frontend, API, repository, and database paths
compile and pass the targeted regression and isolated integration tests.

## Closed UAT items

1. Person requests support requestor-only, requestor-with-companions, and
   companions-only layouts.
2. Companions can be marked as company employees or external visitors/OJTs.
3. External companion payloads use the backend `fullName` contract.
4. The requestor cannot be inserted again as their own companion.
5. The broken schedule-request modal/endpoint was removed; the action redirects to
   the working request form.
6. Company vehicle forms preserve Hatid, Sundo, or Both indicators, including when
   the requestor is not travelling.
7. Split schedules persist as separate windows, preserving vacancies such as
   11:00 AM–1:00 PM.
8. The digital vehicle route is Immediate Superior → HRAD Assignment → PAS.
9. The President is the final physical signer on printed company-vehicle forms.
10. Mobile request entry and dashboard navigation changes from Phase 17 were kept.
11. Approval dashboards retain pending-count information from Phase 17.
12. Security opens on the QR scanner and provides a dashboard link.
13. Local preview ports route to the API and are present in the backend CORS
    allowlist.

## Authentication and safety

- Login accepts a case-insensitive full name, leading name phrase, individual name
  part, or legacy Employee ID, with password-based duplicate disambiguation.
- Password changes persist PBKDF2 hashes without trimming password characters.
- A password change invalidates earlier JWT sessions through `password_version`.
- The tracked EmployeeImporter password/login utility is retired and inert.
- No real credentials were used. Tests used synthetic users and an isolated
  `gatepass_codex_phase18_2_test` schema, which was deleted and verified absent.
- Falcon warning observed: no scripted web login, cookie extraction, hidden server,
  polling loop, or forced process termination.

## Verification passes

### Pass 1 — compile and static checks

- API Release build: 0 warnings, 0 errors.
- EmployeeImporter Release build: 0 warnings, 0 errors.
- All 18 frontend JavaScript files pass `node --check`.
- HTML IDs are unique; `git diff --check` passes.
- The retired service-request route has no remaining runtime reference.

### Pass 2 — regression and database integration

- Non-employee companion DTO serialization passes.
- HRAD rejects missing assignments and ignores spoofed client workflow context.
- Vehicle conflicts return `VEHICLE_UNAVAILABLE`.
- A disabled duplicate name cannot mask an active login candidate.
- JWT password-version issuance passes.
- Outer transaction rollback removes the draft, requestor flag, and companions
  together.
- A conflicting split leg is rejected before the previous reservation is deleted.
- A valid 10:00–11:00 / 1:00–2:00 request persists exactly two reservation rows.

### Pass 3 — browser and release review

- Login copy shows name/Employee-ID aliases and the date-hired password clue.
- Guest calendar opens from the login page.
- Cache-busted Phase 18 assets remove the former localhost `404` API routing error.
- The current local API process was started before the final CORS edit; restart it
  once to load the new allowlist on port 5502.

## Remaining non-blocking warning

The browser still reports the pre-existing Tailwind CDN production warning. It does
not block these workflows, but a future deployment phase should compile and serve a
local Tailwind stylesheet instead of loading `cdn.tailwindcss.com`.
