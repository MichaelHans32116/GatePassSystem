# Phase 11 Plan — Rejection Remarks, Internal Proof Viewing, Image Compression, Dual View Modes & Multiple Associates

## ✅ Implementation Status (2026-06-29) — all 6 features implemented

Built via spec-driven generation + a 5-dimension adversarial review (4 confirmed bugs found & fixed,
incl. 1 critical). Backend builds clean; all edited JS passes `node --check`; `app.py` parses.

| # | Feature | Key files |
|---|---------|-----------|
| 1A | Decision remarks panel + inline reason textarea (replaces `window.prompt`) | modal.js, approvals.js, index.html |
| 1B | HRAD-only vehicle scheduling window + required remarks; universal reject; cancel removed | migration 016, ApprovalsController/Service/Repository, modal.js, approvals.js, index.html |
| 2 | Proofs viewable by routing chain, excluded from print + authz branch | SignatureRepository.cs, styles.css, gatepass.js (`proofFileIds` map fix) |
| 3 | Python `/compress` (1600px/q70) wired into proof uploads only | app.py, SignatureStorage.cs, SignaturesController.cs, appsettings/docker-compose, material-gatepass.js |
| 4 | Digital (default) vs Printable Form toggle | modal.js (`renderDigitalView`/`setDocumentViewMode`), index.html, styles.css |
| 5 | Multiple associates (both forms) | migration 015, schema.sql, DTOs/models/repo/service, gatepass.js/material-gatepass.js/modal.js, styles.css |

**Bonus fixes during build:** `mapApiGatePass` never mapped `proofFileIds` (existing proof gallery was silently
broken — fixed); migration runner `setup-xampp.ps1` wasn't wired for 015/016 (critical — fixed); on-hold reason
now stamped onto the approval step so it shows in the remarks panel; compress fallback now also catches the
HttpClient timeout.

### Known limitations / follow-ups
- **Req 5 print overflow:** the **batch print** path (`printSelectedLogs`) now paginates associates at 5 names
  per A6 sheet and spills >5 onto continuation sheets (only the first sheet carries the QR back page). The
  **Digital view** lists the full companion set on screen. The **single-pass** print (`window.print()` on the
  live `#printableArea`) still renders companions compactly in the one cell (fits ≤5 cleanly); true single-pass
  pagination onto extra sheets needs a visual print iteration and is the remaining follow-up.
- **HRAD scheduling controls** are still keyed to the current HRAD usernames (`GA120` / `GA139`) in the modal and
  approval flow. If the approver roster changes, update the role check in both layers.
- **Digital view** does not list Person-pass companions (shows "Requested By" only); could add an associates row.
- DB migrations 015 & 016 must be applied (`setup-xampp.ps1` now runs them); re-run `procedures.sql` for the
  comment-only SP note.

### Follow-up progress (2026-07-02)
- HRAD scheduling now supports straight windows and split windows for BOTH trips.
- Approval payloads now carry optional secondary window timestamps for split schedules.
- Database migration 018 adds `vehicle_trip_type_code` and removes the single-row reservation constraint so the calendar can reflect gaps between trips.
- Validation/build pass completed locally after the change set.

### Follow-up progress (2026-07-02, later pass)
- Approval queue now carries the real `willReturn` flag from the backend instead of inferring it from `expectedInAt`.
- HRAD trip selection no longer falls back to `privateVehicleDetails`; it now resolves from the assigned trip code or the allowed default for the form type.
- Local verification re-ran clean: `node --check` passed for the updated frontend files, `dotnet build Backend/FormRequestSystem.sln` succeeded, and `git diff --check` returned only line-ending warnings.

---


> Requested by **Sir Lyndon** (Senior IT Supervisor) and **Miss Joy** (HRAD Supervisor, employee `GA120`).
> Branch: `office/hans-branch` (synced up to `main` / `969c459` before planning).

## Background

Five feature requests were gathered from the supervisors. This plan maps each to the
**current** codebase (post Phase 9.12) and defines the work. Two requirements turned out
to be **partially done already** — the notes below say exactly what remains.

| # | Requirement | Current state | Net work |
|---|-------------|---------------|----------|
| 1 | Rejection reason + status-update remarks | Reason already stored backend-side, but never shown back; capture is via `window.prompt` | Frontend display + remarks UX + **new HRAD status-change action** |
| 2 | Material proof picture viewable on website, **not** printed | Proofs already auth-only (server-only) | Hide proofs from print + let all routing parties view (fix authz gap) |
| 3 | Python script to lower image quality (lighter on server) | Python FastAPI service + Pillow already present | Add compression endpoint + wire it into proof upload |
| 4 | Two view options: digital list view vs printable form view | Only the printable A6 form exists; opens directly | Add a view-mode toggle/chooser + digital render |
| 5 | More than one associate/companion + printable name layout | Single associate only (one DB column) | **Schema change** (child table) + multi-entry UI + printable layout (Figma) |

---

## Requirement 1 — Rejection Remarks + HRAD Status-Change Action

### 1A. Show the rejection reason back to the requester (and reviewers)

**Finding:** The rejection reason is **already mandatory and persisted** — `ApprovalService.DecideAsync`
(`Backend/Project/Services/ApprovalService.cs:30`) rejects with `REJECTION_REASON_REQUIRED` when
`Comment` is blank, and the repository writes it to **both** `tbl_gate_pass_approval_steps.comments`
(`ApprovalRepository.cs:344-368`) and `tbl_gate_pass_status_history.remarks` (`ApprovalRepository.cs:456-516`).
It is carried to the frontend in `approvalSteps[].comments` (`gatepass.js`) but **rendered nowhere**.

**Changes (frontend only):**
- `[MODIFY]` `Frontend/Functions/modal.js` — in `viewPass` (`:605`), add a **feedback/remarks container**
  in the document modal that displays the latest rejection reason (and any step comments) when the pass
  is `REJECTED` / `ON_HOLD`. Mirror the existing guard-remarks pattern (`getGuardRemarksText`, `#vGuardRemarks`).
- `[MODIFY]` `index.html` — add the container markup (e.g. `#vDecisionRemarks`) near the workflow tracker
  (`:806`) or status area; must be `.print-hide` so it does not print.
- `[MODIFY]` `Frontend/Functions/approvals.js` — replace the blocking `window.prompt` in
  `rejectCurrentPass` (`:105`) and `holdCurrentPass` (`:80`) with an **inline `<textarea>`** in the
  approval action area (`#approvalActionArea`, near `modal.js:917`). Reason stays required (backend already enforces).
- Optional: allow an **approve comment** too — `approveCurrentPass` (`:15`) currently sends `comment: null`;
  the backend already accepts/stores it, so surfacing an optional note is a one-line payload change.

**No backend or DB change needed** for 1A (columns are `VARCHAR(500)`; confirm length is enough).

### 1B. New HRAD status-change action for vehicle gate passes (Miss Joy)

**Finding:** There is **no generic status-update endpoint**. Status only changes through approve/reject/hold
and guard scans. `tbl_vehicle_reservations` has **no remarks column**; `tbl_gate_pass_status_history.remarks`
is the canonical place for transition remarks. Miss Joy = `GA120`, the `HRAD_ASSIGN` approver.

**Changes:**
- `[DB / NEW]` `Database/Migrations/015_*.sql` — add any new vehicle-pass status codes needed
  (e.g. `RESCHEDULED`, `CANCELLED_BY_HRAD`) to `tbl_gate_pass_statuses` if the change set requires them.
  (Confirm the exact statuses Miss Joy needs.)
- `[BACKEND / NEW]` endpoint, e.g. `PATCH /api/form-requests/{id}/status` (or under `FleetController`),
  restricted to HRAD (`HRAD_ASSIGN` assignment / a new permission). Body: `{ newStatusCode, remarks (required) }`.
  - New service + repository method that validates the transition, updates
    `tbl_gate_pass_requests.gate_pass_status_code`, updates the linked `tbl_vehicle_reservations`
    status if present, and **inserts `tbl_gate_pass_status_history`** with `remarks = NULLIF(TRIM(@Remarks),'')`
    (reuse the idiom at `ApprovalRepository.cs:498`). Write an audit log row too (`WriteAuditAsync`).
- `[FRONTEND / NEW]` a "Change Status" control with a **required remarks textarea**, shown to HRAD on
  vehicle-bearing passes (in `modal.js` review area, and/or the calendar day modal in `calendar.js`).
  The same `#vDecisionRemarks` container from 1A displays the resulting history entry.

---

## Requirement 2 — Material Proof Pictures: View on Website, Never Print

**Confirmed intent:** Proof photos must be **viewable on the website by everyone who handles the pass**
(requester → all approvers → security → archive), but must **never appear on the printable form**.

**Finding:** Proofs are already server-only (auth blob via `GET /api/signatures/{id}`, no static serving,
Bearer token, GUID filenames). Two real gaps remain:

1. **Print exclusion.** The proof gallery (`#materialProofsGallery` / `#materialProofsList`,
   `modal.js:903-932`) currently renders in the same DOM used for printing.
2. **Authz gap.** `SignatureRepository.CanUserReadAsync` (`:82-183`) has **no branch for
   `tbl_material_gate_pass_proofs`** — so an approver/superior without `gatepass.read.all` or
   `gatepass.scan` can see the proof IDs but gets **404 on the image**. "Everyone in the routing chain"
   is therefore not currently met.

**Changes:**
- `[FRONTEND]` `index.html` — give `#materialProofsGallery` the `print-hide` class (CSS at
  `styles.css:213` already hides `.print-hide` on print). 
- `[FRONTEND]` `Frontend/Functions/modal.js` — exclude proofs from the **clone/print** paths
  (`renderMaterialGatePassClone:1343`, `printSelectedLogs:1641`) so batch print also omits them.
- `[FRONTEND]` `Frontend/Design/styles.css` — add an explicit `@media print { #materialProofsGallery { display:none } }`
  safeguard.
- `[BACKEND]` `Backend/Project/Repositories/SignatureRepository.cs` — add a **proof branch** to
  `CanUserReadAsync`: allow read when the signature file is referenced by `tbl_material_gate_pass_proofs`
  for a gate pass the user requested / approves / can PAS-note (same join shape as the existing
  prepared-by branch at `:139-174`). This lets the whole routing chain view proofs on the website.

---

## Requirement 3 — Python Image Compression (lighter on server)

**Finding:** A FastAPI service already exists at `Backend/SignatureBackgroundRemoval/app.py`
(port 8000, **Pillow 11.1.0 already in `requirements.txt`**). The frontend never calls it directly —
it goes through the C# proxy `POST /api/signatures/process-background`
(`SignaturesController.cs:105`), per the documented rule that the browser must not hit `127.0.0.1:8000`
in production. All image bytes are persisted verbatim in `SignatureStorage.SaveAsync`
(`Backend/Infrastructure/SignatureStorage.cs:42-97`) with **no resize/re-encode**.

**Changes:**
- `[PYTHON / NEW]` add `POST /compress` to `app.py`: multipart in → downscale (e.g. max 1600px long edge
  via `Image.thumbnail`) + re-encode JPEG `quality≈70, optimize=True` → compressed bytes out.
  Keep the localhost-only CORS already configured.
- `[BACKEND]` wire compression into the **proof upload path only** (signatures must stay lossless):
  - Preferred: add a `compress=true` form field to the `/signatures` upload that proof uploads set;
    when present, the controller/storage calls the Python `/compress` (named HttpClient, like
    `process-background`) **before** `SaveAsync` writes to disk. Falls back to storing the original if
    the Python service is down (503 handling like `ProcessBackground:154`).
  - Config the compress URL in `appsettings.json` (alongside `BackgroundRemovalUrl:18`) and
    `docker-compose.yml:45`.
- `[FRONTEND]` `Frontend/Functions/material-gatepass.js` — `uploadMaterialProofFile` (`:764`) sends
  `compress='true'`. (Optional client-side canvas downscale as a fallback before upload.)
- `[OPS]` `start-local.ps1` already launches uvicorn (`:203`); no change beyond the new endpoint.

---

## Requirement 4 — Two View Options: Digital View vs Form (Printable) View

**Finding:** Every viewer funnels through `getViewPassCall` (`gatepass.js:43`) → `viewPass(id, isReviewing)`
(`modal.js:605`), which **always** renders the printable A6 layout (`#printableArea` /
`#materialPrintableArea`). There is no field-list "digital" view; the request forms (`#applyForm` `index.html:411`,
`#materialApplyForm` `:531`) are the reference for the digital layout the supervisors want.

**Changes:**
- `[FRONTEND]` `Frontend/Functions/modal.js` — add a **view-mode toggle** inside the document modal:
  - **Digital View** (default): a read-only, vertically-listed field summary (Destination, Dates,
    Purpose, Associates, Vehicle/Driver, Items, **proof photos**, decision remarks) styled like the
    request form. Build a `renderDigitalView(p)` that fills a new `#digitalViewArea`.
  - **Form View**: the existing printable A6 layout (current `#printableArea` / material bundle).
  - Toggle buttons in the modal header (`#modalDragHandle`, `index.html:796`). **Print is enabled only in
    Form View** (proofs are Digital-only per Req 2).
- `[FRONTEND]` `index.html` — add `#digitalViewArea` container + the toggle buttons; default open to Digital.
- Keep `viewPass(id, isReviewing)` as the single entry point; the toggle just swaps which sub-area is visible.
  Reviewing (approve/reject) controls remain available regardless of mode.

---

## Requirement 5 — Multiple Associates / Companions + Printable Name Layout

**Confirmed intent:** Support **more than one** associate/companion on **both** Person and Material gate
passes. Schema change approved. Req 5.1: on the **printable** form, fix associate-name spacing — primary
associate keeps `First Middle Last`; additional companions use a **compact `First Last`** in a **smaller font**.

**Finding:** Associates are **single** today — `tbl_gate_pass_requests.authorized_employee_id` /
`authorized_department_id` (`schema.sql:429-430`); DTO `CreateMaterialGatePassRequest.AuthorizedEmployeeId`
(`GatePassDtos.cs:35`); the Person form has no associate field (it prints the requester's `userName` into
`#vName`, `modal.js:666`, `index.html:846`). The clean precedent for one-to-many is
`tbl_material_gate_pass_items` (`schema.sql:612-628`).

**Changes:**
- `[DB / NEW]` `Database/Migrations/015_*.sql` — add `tbl_gate_pass_associates`:
  `associate_id PK, gate_pass_id FK (ON DELETE CASCADE), line_no, employee_id NULL, department_id NULL,
  full_name, UNIQUE(gate_pass_id, line_no)` — mirrors the items table. **Backfill** existing single
  `authorized_employee_id` into `line_no = 1`. Keep the old column as the "primary" for compatibility, or
  migrate fully (decide during implementation).
- `[DB]` update the gate-pass **views** (`schema.sql:829-876`) and material-create **procedure**
  (`procedures.sql`, items-loop pattern at `:325`) to read/write the new child table.
- `[BACKEND]` DTOs (`GatePassDtos.cs`) — add `Associates: IReadOnlyList<AssociateRequest>` to both
  `CreateGatePassRequest` (`:6`) and `CreateMaterialGatePassRequest` (`:32`). Models
  (`GatePassModels.cs`) — add an `Associates` list to `GatePassDetail` (like `MaterialItems:80`).
  Repository (`GatePassRepository.cs`) — insert associates in the create transaction (mirror proof loop
  `:94-105`), read them in `GetDetailAsync` (mirror proof read `:366-391`).
- `[FRONTEND]` request forms — add an **"Add companion" multi-row UI** (model after the material items
  table) to `#applyForm` (`index.html:411`) and the authorized-employee block in `#materialApplyForm`
  (`:542`), with the employee typeahead (`material-gatepass.js:103`). Map the list in `mapApiGatePass`
  (`gatepass.js:105`) and submit it.
- `[FRONTEND / FIGMA]` printable name layout — in the Person name cell (`#vName`, `index.html:844-847`,
  label "NAME OF ASSOCIATES") and the Material authorization statement (`modal.js:481`, clone `:1428`):
  - Add a dedicated CSS class (model after `.person-date-filed`, `styles.css:313`:
    `font-size:8px; line-height:1.05; white-space:nowrap`) for the **additional** names.
  - Render: primary name normal size; extra companions as a smaller `First Last` list (comma/slash
    separated or stacked). Apply to **both** render paths and the clones (`renderPersonGatePassClone:1197`,
    `renderMaterialGatePassClone:1428`). The cell is only `10mm` tall × 65% wide — tune height/font to fit.

---

## Suggested Build Order

1. **Req 1A** (rejection-reason display + inline remarks) — small, frontend-only, high visibility.
2. **Req 2** (print exclusion + proof authz branch) — small, unblocks "everyone can view."
3. **Req 3** (Python `/compress` + proof upload wiring) — isolated to proof path.
4. **Req 4** (digital vs form view toggle) — UI restructure; depends on nothing.
5. **Req 5** (multiple associates) — largest; schema + full-stack + printable layout.
6. **Req 1B** (HRAD status-change action) — new endpoint; confirm exact statuses with Miss Joy first.

---

## Schedule Follow-Up Plan â€” Workbook-Driven HRAD Timing

### Goal

Make the vehicle and driver calendar reflect the actual workbook schedule windows instead of only the request
`from/to` fields. The workbook is the source of truth for the route timing pattern:

- `IN` and `OUT` are separate observable schedule markers.
- Some days have one visible trip window.
- Some days have extra mid-day entries that must stay visible in the calendar.
- The calendar must show real availability gaps between windows, not only a single start/end pair.

### File-by-file implementation order

1. `Docs/VEHICLE SCHEDULE/VEHICLE MONITORING FOR MARCH 30 - APRIL 4, 2026.xlsx`
   - Use this workbook as the schedule reference during implementation.
   - Verify which rows are `IN`, `OUT`, and mid-day trip entries.
   - Keep it as the baseline when comparing calendar output.
2. `Backend/Project/Repositories/FleetRepository.cs`
   - Update schedule projection so it can represent more than one window per day or per pass.
   - Preserve the current calendar query shape only if it can carry split windows cleanly.
   - If one parent reservation is not enough, add a child segment model instead of overloading `reserved_from` / `reserved_until`.
3. `Backend/Project/Models/FleetModels.cs`
   - Add explicit schedule/window models for `Hatid`, `Sundo`, `Both` straight-window assignment, and `Both` split-window assignment.
   - Keep the model readable so calendar rendering and validation can share the same data shape.
4. `Backend/Controllers/FleetController.cs`
   - Ensure the calendar endpoint returns the new schedule shape without dropping the outbound rows.
   - Keep conflict detection server-side for driver and vehicle overlap checks.
5. `Backend/Project/Repositories/ApprovalRepository.cs`
   - Remove the default assumption that HRAD approval always stores the request `from/to`.
   - Persist the HRAD-assigned schedule window that was intentionally chosen during approval.
   - If split windows are needed, save both windows explicitly.
6. `Backend/Project/Services/ApprovalService.cs`
   - Enforce validation that schedule start and end exist before forwarding.
   - Reject invalid windows where end is not later than start.
   - Keep this logic consistent with the repository so bad data cannot slip through.
7. `Frontend/Functions/modal.js`
   - Make the HRAD schedule inputs the source of truth for assignment time.
   - Show the requested schedule as reference only.
   - Show the assigned schedule separately so HRAD can see what will land in the calendar.
   - Hide `Put on Hold` for non-HRAD approvers.
8. `Frontend/Functions/approvals.js`
   - Send the HRAD-assigned window to the backend.
   - Require explicit schedule start and end before forward/assign actions.
   - Keep `Reject` available universally.
9. `Frontend/Functions/calendar.js`
   - Render the stored schedule windows, including split windows.
   - Preserve visible gaps between windows so availability is obvious.
   - Keep conflict labels aligned with the same overlap rule the backend uses.
10. `index.html`
   - Keep the HRAD schedule controls visible in the assignment block.
   - Keep `Close` at the bottom of the modal action stack.
   - Keep the layout readable on narrower screens while the new time controls are added.
11. `Docs/PHASE_11_PLAN.md` and `Docs/server access documentation.txt`
   - Record what was changed, what was verified, and what remains.
   - Add short notes after each successful pass so the next review starts with fresh context.

### Logic rules to preserve

- If a driver or vehicle conflicts with an assigned schedule window, the result is `false` for availability.
- If there is no conflict in the assigned time window, the result is `true`.
- `Hatid` only or `Sundo` only should map to a single explicit window.
- `Both` can be either one straight continuous schedule window or two separate windows with a free gap between them.
- The calendar must reflect the schedule that HRAD chose, not the requester's original placeholder time.
- If the workbook shows an `OUT` row, do not lose it during import or normalization.

### Top-to-bottom recheck loop

1. Inspect the current file layer.
2. Patch the smallest safe change.
3. Rebuild or rerender the touched layer.
4. Recheck for missing `OUT` rows, button regressions, or conflict logic gaps.
5. Clean stale helpers only after the new path is verified.
6. Repeat from the top until the layer is clean before moving to the next file group.

---

## Resolved Decisions (confirmed by Sir Lyndon / Miss Joy, 2026-06-29)

- **1B:** Miss Joy now needs a **vehicle scheduling window** on the HRAD assignment step, while `Reject`
  stays universal and the cancel action stays removed from the approval UI.
- **5:** **Max 5** associates rendered per printed page; if more than fit, **overflow onto a new page**
  (additional printed sheet). Companions are chosen from the **employee directory (typeahead)**, same as
  the existing material authorized-employee picker. Keep `authorized_employee_id` as the primary
  (`line_no = 1`); additional companions live in the new child table.
- **4:** Default view = **Digital** (confirmed).
- **3:** Compression target = **1600px long edge, JPEG quality 70** (confirmed).

## Verification Plan (per requirement)

1. **1A:** Reject a pass with a reason → requester sees the reason in the view modal; reason not printed.
2. **1B:** As HRAD (GA120), change a vehicle pass status with remarks → status + remarks appear in history;
   non-HRAD users cannot.
3. **2:** Open a material pass as an approver without `read.all` → proof photos load on screen; Print →
   proofs absent from the printed form and batch print.
4. **3:** Upload a large proof photo → stored file is significantly smaller than the original; image still
   legible; signatures remain lossless.
5. **4:** Open any pass → Digital View by default (field list + proofs); toggle to Form View → printable
   A6; Print works only in Form View.
6. **5:** File a Person and a Material pass each with 3 associates → all saved; printable shows primary name
   full-size and extra companions in compact smaller font without overflowing the cell.
