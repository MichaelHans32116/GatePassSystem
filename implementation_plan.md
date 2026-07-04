# Active Plan Snapshot

Status: The original Phase 8 Global QR work is implemented and the active source of truth now lives in the code and progress report.

## What The Scanner Does Now

- Employee QR scans open a tabbed `Employee QR Records` modal.
- Pending and active records are shown first.
- Closed records stay available in a separate tab.
- If there is exactly one active record and no closed history, the scan still goes straight to the pass view.
- Closed control numbers and completed gate passes open in view-only mode instead of failing in the queue lookup.

## Current Source Files

- `Frontend/Functions/scanner.js`
- `index.html`

## Historical Notes

- The original Phase 8 proposal and checklist are archived in [`Docs/archived plan.txt`](Docs/archived%20plan.txt).
- The live server handoff stays in [`Docs/server access documentation.md`](Docs/server%20access%20documentation.md).
- The backend and database server plan stays in [`Docs/BACKEND_DATABASE_PLAN To server.md`](Docs/BACKEND_DATABASE_PLAN%20To%20server.md).

## Progress

- Use [`Docs/progress_report.txt`](Docs/progress_report.txt) for the centralized status updates.
