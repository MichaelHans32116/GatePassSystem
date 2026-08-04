# Phase 19 Plan — Client Review Round

Follows Phase 18 (see `PHASE_18_PLAN.md`). Opened by the 2026-08-04 review
from Ma'am Joy (HRAD) and Sir Lyndon (IT), relayed by Hans.

## Phase 19.1 — Client review changes (Ma'am Joy / Sir Lyndon, 2026-08-04)

Seven review items from the client, applied across the frontend, API, and DB.

1. **Requestor inclusion is now derived, not picked.** The "Kasama ako / Para sa
   iba lang" radio is gone. Who goes out is read off the companion list:
   no companions = the requestor goes alone; requestor on the list = they go with
   the companions; requestor absent = others-only. Picking yourself in a companion
   row is now allowed on the Person form (the Material form keeps the old rule —
   there the requestor is the preparer, not a traveller). The requestor's own row
   is stripped from the payload before submit, so the API's "requestor cannot also
   be a companion" rule is untouched. A live amber notice restates the resulting
   scope in Taglish so the requestor sees the consequence of their list.
2. **Companion Employee checkbox → labelled dropdown.** An unticked box reading as
   "not an employee" confused users. The row now carries a two-option select,
   `Employee` / `Non-employee`, so the state is always spelled out.
3. **"Immediate Superior" → "Manager"** everywhere the user can see it (form,
   approval-route hints, printed pass, modal, role chip, user manual). The
   `IMMEDIATE_SUPERIOR` role code and every DB value are unchanged; the role-string
   comparisons in `approvals.js` and `modal.js` were updated in the same pass so
   the approver queue keeps working.
4. **Requesting Department removed** from both request forms. Accounts with a home
   department always used it implicitly; shared accounts without one now fall back
   to their first requestable department, since `requester_department_id` is still
   NOT NULL.
5. **President block on the printed pass.** The `FINAL APPROVAL` caption and the
   pre-printed `TOMOAKI MAEKAWA` name are gone from both the Person and Material
   printed forms. The signature space stays, captioned `PRESIDENT & GEN. MANAGER`.
6. **New "Date of Gate Pass" field.** The form only carried Date Filed, so a pass
   prepared ahead of time never said which day it was for. Migration 025 adds a
   nullable `pass_date DATE`, backfilled from `form_date`, republishes
   `view_gate_pass_records`, and `SP_CreateGatePass` takes `p_pass_date`
   (`COALESCE(p_pass_date, v_form_date)`). It appears on the request form, on the
   printed pass as a `DATE` box beside FROM/TO, and in the detail modal.
   **Deliberately display-only:** `expected_out_at` / `expected_in_at` still drive
   control numbering, vehicle conflict checks, and the security queue exactly as
   before, so nothing about scheduling changes. True future-dated booking would be
   a separate phase.
7. **"Form Request System" → "Gate Pass Request System"**, and "New Form Request"
   → "Gate Pass Request", across the title, hero, sidebar, nav, dashboard, admin
   tab, Excel export metadata, and API error copy.

### Phase 19.1 verification

- [x] API solution builds clean (0 warnings, 0 errors); all 13 frontend JS files
  pass `node --check`.
- [x] Migration 025 applies locally; `pass_date` backfilled from `form_date` on
  every existing row; `view_gate_pass_records` exposes the column.
- [x] `SP_CreateGatePass` accepts `p_pass_date` and stores a pass date that
  differs from the filing date — control no. `080426-002` kept `form_date`
  2026-08-04 while `pass_date` was 2026-08-19. Smoke-test row deleted afterwards.
- [x] Browser check of the request form: no Requesting Department, no scope radio,
  `Date of Gate Pass` defaults to today, approval route reads `Manager -> HRAD`.
- [x] Companion logic exercised in-page: other-only → `includesRequestor false`;
  self-added → `true`; payload strips the requestor's own row; row control renders
  `Employee` / `Non-employee`.
- [x] Printed pass captions read `APPROVED BY / MANAGER`, `NOTED BY / HRAD`,
  `PRESIDENT & GEN. MANAGER`, with an empty president name slot.
- [x] No dangling references to the removed radio, checkbox, department selectors,
  or `PRESIDENT_PRINTED_NAME`; no console errors.
