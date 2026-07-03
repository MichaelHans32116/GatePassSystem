# Phase 14 Plan - HRAD Scheduling Windows, Trip Type Rules, and Calendar Visibility

Status: Draft planning doc, cleaned from the Gemini handoff text.

Note: the branch history is already past Phase 13, so this plan stays labeled Phase 14 to keep numbering monotonic.

## Goal

Make HRAD assign the real trip window that should land in the vehicle and driver calendar. The request form `from/to` fields are only the requester's context; the approved schedule is the source of truth.

The plan also keeps the form request naming and navigation changes aligned with the current `FormRequestSystem` direction.

## Core Logic To Preserve

- Material Gate Pass: hatid only.
- Associate Gate Pass with `willReturn = false`: hatid only.
- Associate Gate Pass with `willReturn = true`: hatid, sundo, or both.
- `Both` can be a single continuous block or two separate windows with a visible gap.
- If a driver or vehicle overlaps an assigned window, availability is false.
- If there is no overlap, availability is true.
- The calendar must reflect the HRAD-assigned schedule, not the requester's placeholder times.
- The workbook schedule rows, especially permanent `OUT` rows, are the baseline for imported availability.

## Proposed UI Behavior

### Request Form

- Show the trip type options only when they are valid for the request type.
- Keep the new form request entry more prominent than the schedule calendar in the nav if needed.
- Pass the selected vehicle trip type through the submit payload so the backend can persist it immediately.

### HRAD Assignment Modal

- Replace the confusing primary/secondary time labels with card-based schedule blocks.
- Show the requested schedule as a reference only.
- Show the assigned schedule separately so HRAD can see what will be stored in the calendar.
- Keep `Close` at the bottom of the modal action stack.
- Hide `Put on Hold` for non-HRAD approvers if the branch rules already removed it.

### Calendar

- Render the assigned schedule windows, including split windows.
- Show the visible gap between split windows as availability.
- Keep the trip type visible in day and tooltip views so operators can understand why a window exists.

## File-By-File Implementation Order

1. `index.html`
   - Add or update the trip type options.
   - Keep the new form request action higher than the schedule calendar entry when the nav is rebuilt.
   - Keep the modal buttons and schedule controls readable on narrower screens.

2. `Frontend/Functions/gatepass.js`
   - Limit the request form trip type choices based on `willReturn`.
   - Submit the vehicle trip type with the create request payload.
   - Keep the request form state in sync when the company vehicle option changes.

3. `Frontend/Functions/modal.js`
   - Build the HRAD scheduling cards.
   - Support straight windows and split windows.
   - Show the assigned schedule separate from the request schedule.
   - Keep the document review flow readable from top to bottom.

4. `Backend/Project/DTOs/GatePass/GatePassDtos.cs`
   - Add the fields needed to carry the selected vehicle trip type and any schedule window data.

5. `Backend/Project/Repositories/GatePassRepository.cs`
   - Persist the trip type and the assigned schedule window during create and update flows.

6. `Backend/Project/Services/ApprovalService.cs`
   - Relax validation so the allowed trip types match the request type and `willReturn` state.
   - Reject invalid windows where the end is not later than the start.

7. `Backend/Project/Repositories/ApprovalRepository.cs`
   - Save the HRAD-assigned window instead of defaulting to the request `from/to` values.
   - Preserve the schedule choice that HRAD actually made.

8. `Backend/Project/Models/VehicleScheduleRecord.cs`
   - Add the fields needed to represent the assigned trip type and the visible time window.

9. `Backend/Project/Repositories/FleetRepository.cs`
   - Select the stored schedule windows and preserve any split gaps.
   - Keep the calendar query shape compatible with the frontend renderer.

10. `Frontend/Functions/calendar.js`
    - Render the assigned trip windows and the gap between them.
    - Keep the driver and vehicle availability checks aligned with the backend overlap rule.

11. `Docs/VEHICLE SCHEDULE/VEHICLE MONITORING FOR MARCH 30 - APRIL 4, 2026.xlsx`
    - Use this workbook as the source of truth when comparing calendar output.
    - Verify which rows are `IN`, `OUT`, and permanent schedule markers before import or normalization.

## Workbook-Driven Rules

- Do not collapse permanent `OUT` rows into a single generic block.
- Keep the workbook timing pattern visible when the calendar is rendered.
- Use the workbook as the reference when deciding whether a slot is occupied, free, or split.
- If the workbook shows a separate `OUT` row, it should still appear in the calendar flow.

## Verification Plan

- Request form test: invalid trip options stay hidden.
- Material pass test: hatid only remains enforced.
- Associate pass test: `willReturn = false` stays hatid only.
- Associate pass test: `willReturn = true` unlocks the allowed trip modes.
- HRAD scheduling test: straight window and split window both render correctly.
- Calendar test: split windows leave a visible gap.
- Workbook test: consistent `OUT` rows still appear in the calendar baseline.
- Validation test: no unrelated tables or rows are changed outside the gate pass schedule data.

## Progress Log

- 2026-07-03: cleaned the pasted Gemini draft into a single Markdown plan, removed the garbled encoding, and aligned the wording with the current repo history and naming.
- 2026-07-03: verified the markdown with `git diff --check`; `gh auth status` is healthy for the later push.
- 2026-07-03: implemented and smoke-tested the request-form trip type guardrails locally; login succeeded against the API, the form now locks `Hatid Lang` for `willReturn = no` and `Hatid at Sundo` for `willReturn = yes`, and the submit payload now carries `vehicleTripTypeCode`.
