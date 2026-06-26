# Phase 9.3 TODO

## Not Fully Finished / Needs QA

- Browser-test the public calendar weekly export using the real guest calendar flow.
- Open the downloaded Excel files in Excel and visually compare against:
  - `TRUCK SCHEDULE MARCH 9 - 13, 2026.xlsx`
  - `VEHICLE MONITORING FOR MARCH 30 - APRIL 4, 2026.xlsx`
- Fine-tune any remaining Excel spacing, merged-cell heights, print scaling, and color differences after visual QA.
- End-to-end test company vehicle requests:
  - requester checks `Company Vehicle Needed`
  - request goes to `Pending HR Assignment`
  - HRAD assigns a vehicle/driver
  - reservation appears on the public calendar and export
- Re-run/deploy `Database/procedures.sql` and `Database/seed-reference.sql` on the target database so backend validation matches the new HRAD-assignment flow.
- Clean up the older unused calendar export builder functions after the V2 export is confirmed stable.

## Landed In This Batch

- Requesters no longer select a vehicle/driver when checking `Company Vehicle Needed`.
- Company vehicle requests can be submitted without an assigned vehicle id.
- HR assignment now requires selecting an available company vehicle before forwarding.
- Weekly calendar export now has an `Export Week` picker.
- New V2 Excel export builders were added for vehicle and truck weekly formats with per-vehicle color distinctions.
