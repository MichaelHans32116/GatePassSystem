# Phase 17 Plan — Vehicle & OT Request Feedback Batch (2026-08-04)

Feedback/revisions from UAT on the Vehicle & OT request flow (default role:
Requestor). Work happens on `office/hans-branch`, commits follow `Phase 17.x`,
merged to `main` at session end.

## Requirement checklist (from feedback list)

| # | Item | Area | Status |
|---|------|------|--------|
| 1 | Option: request is for others only, or requestor included (associates section) | FE form + BE + DB | Pending |
| 2 | Person Gate Pass print: if requestor NOT included, top label is "Requestor" + underline, then "Name of Associates" listing companions; if included, keep default structure | FE print | Pending |
| 3 | "Request for schedule" logic broken — redirect to the New Request form instead of in-place flow | FE | Pending |
| 4 | Companions can be non-employees (visitors/OJT): per-companion "company employee?" checkbox; free-text name when not employee | FE form + BE + DB | Pending |
| 5 | (cut off in feedback — no actionable content; flows into #6) | — | N/A |
| 6 | Vehicle checked but trip is service/sundo (pick-up) only: show indicator, esp. when requestor not aboard | FE + BE + DB | Pending |
| 7 | Vehicle calendar must show split windows (10–11 AM and 1–2 PM booked ⇒ 11 AM–1 PM vacant), not one merged block | FE and/or BE | Pending |
| 8 | President is the FINAL approver for company-vehicle requests — via physical signature (see 12–13), not a digital step | Print | Pending |
| 12 | Remove President digital approval step: vehicle flow = Immediate Superior → HRAD assignment → PAS (Ma'am Alona) → print physical form | BE + DB + FE | Pending |
| 13 | Printed vehicle form carries President (Tomoaki Maekawa) signature line last — physical signature is what's required | FE print | Pending |
| 9 | Mobile: "New Form Request" button must be at TOP of dashboard (main function) | FE CSS | Pending |
| 10 | Mobile: dashboard stat boxes too big and not tappable — shrink + add redirects | FE | Pending |
| 11 | Approver dashboards: info box with count of pending approvals for that user | FE + BE | Pending |
| 14 | Security landing view = QR scanner immediately, with a "View Dashboard" button redirecting to dashboard | FE | Pending |

## Interpretation notes

- Items 8 + 12 + 13 read together: the President stays the *conceptual* final
  approver for company-vehicle requests, but his approval is the **physical
  signature on the printed form**, not a system step. Digital chain for
  vehicle requests ends at PAS; after PAS approval the request is ready to
  print, and the printed form shows the President signature block last.
- Item 5 in the feedback was cut off mid-sentence ("Next part naman na
  gagawin natin is ung") — no actionable content; treated as a lead-in to #6.

## Progress log

- 2026-08-04: Session start. Branch synced with main (0 behind). Latest phase
  across all branches = 16.4 ⇒ this sprint is 17.x. Recon subagents dispatched
  across frontend form/print, dashboards/calendar, backend, and database.
