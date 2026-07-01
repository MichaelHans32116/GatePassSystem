# Phase 8: Global QR â€” Employee QR as Universal Gate Pass Scanner

## Background

Currently, two QR types exist:
1. **Per-Pass QR** (`GP1.{gatePassId}.{signature}`) â€” tied to one specific gate pass
2. **Employee QR** (`EMP1.{employeeRecordId}.{signature}`) â€” shown on every user's dashboard but **underutilized**: it only finds one active pass or shows "No active gate pass queue"

The employee QR is already generated for every user (see `gatepass.js` â†’ `renderMyEmployeeQr()`), but the scanner logic (`scanner.js` â†’ `simulateQrScan()` line 74-91) only checks the active security queue. If the employee has no active pass, it dead-ends with a toast message. Meanwhile, the per-pass QR for CLOSED transactions also dead-ends with "ID/Control No. not found in active queue" (screenshot bug).

**Goal:** Turn the Employee QR into a **Global QR** â€” one QR per employee that handles everything:
- Active pass scanning (time out / time in)
- Multiple active pass selection
- History viewing for completed passes
- Bug fix for closed pass lookups

> [!IMPORTANT]
> **User Review Required**
> Please confirm these behavioral rules before we begin coding:
> 1. When guard scans a Global QR with **1 active pass** â†’ go directly to that pass (scan mode)
> 2. When guard scans a Global QR with **2+ active passes** â†’ show a selection popup (guard picks which one)
> 3. When guard scans a Global QR with **0 active passes** â†’ show the employee's recent transaction history (view-only dashboard)
> 4. When guard scans/enters a **closed control number** â†’ open it in view-only mode (NOT show "not found" error)
> 5. Per-pass QR (`GP1.`) continues to work exactly as before (direct to that specific pass)

## Open Questions

> [!WARNING]
> 1. **History limit**: How many past transactions should the history view show? Suggested: last 20.
> 2. **History view location**: Should the history appear as a popup modal (like the current pass viewer) or as a mini-dashboard card list? Suggested: popup modal with a scrollable list of past passes, each clickable to view details.
> 3. **Multiple active passes**: Is it realistic that an employee would have 2+ active passes simultaneously? (e.g., one Associate pass and one Material pass open at the same time?) If yes, the selection popup makes sense.

---

## Proposed Changes

### Bug Fix: Closed Pass "Not Found" Error

This fix is independent of the Global QR feature but must be done first since it's a prerequisite.

#### [MODIFY] [scanner.js](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/Frontend/Functions/scanner.js)

**Problem**: Lines 103-131 â€” when a guard enters a control number manually (e.g., `062026-001`), the code:
1. Checks `GET /api/security/queue` â†’ only returns APPROVED/OUTSIDE/OVERDUE passes
2. If not found, falls back to `GET /api/form-requests?search=...` â†’ but Security role may not have access (403), which triggers the `catch` block at line 127-128 showing the misleading error

**Fix (lines 113-129)**:
- Improve the fallback to use the new `GET /api/security/employee-lookup` endpoint (see backend changes below)
- If the pass is found but terminal (CLOSED/RETURNED/etc), open it with `viewPass(id, false)` (view-only)
- Show a more helpful message: "This gate pass is completed. Opening in view-only mode."

---

### Global QR: Frontend Changes

#### [MODIFY] [scanner.js](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/Frontend/Functions/scanner.js)

**`simulateQrScan()` â€” EMP1 token path (lines 74-91):**

Current behavior:
```js
// Line 74-91: Searches active queue only, dead-ends if no match
const queue = await ApiClient.get('/security/queue');
const match = queue.find(item => item.employeeRecordId === idVal);
if (match) { viewPass(match.gatePassId, true); }
else { showToast('No active gate pass queue...', 'info'); }
```

New behavior:
```
1. Call new endpoint: GET /api/security/employee/{employeeRecordId}/passes
   â†’ Returns { active: [...], recent: [...] }

2. If active.length === 1:
   â†’ viewPass(active[0].gatePassId, true)  // direct scan mode

3. If active.length > 1:
   â†’ Show pass selection modal (new UI component)
   â†’ Guard picks which pass to process
   â†’ viewPass(selectedPass.gatePassId, true)

4. If active.length === 0 && recent.length > 0:
   â†’ Show employee history modal (new UI component)
   â†’ Each past pass is clickable to view details (view-only)

5. If active.length === 0 && recent.length === 0:
   â†’ showToast('No gate pass records found for this employee.', 'info')
```

#### [MODIFY] [scanner.js](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/Frontend/Functions/scanner.js) â€” New UI functions

Add two new functions at the bottom of `scanner.js`:

**`showPassSelectionModal(activePasses, employeeName)`**
- A simple modal/popup listing 2+ active passes
- Each row shows: Control No, Form Type (Associate/Material), Destination, Status badge
- Guard clicks one â†’ calls `viewPass(selectedId, true)`
- "Cancel" button closes modal

**`showEmployeeHistoryModal(recentPasses, employeeName)`**
- A scrollable modal listing recent completed passes
- Each row shows: Control No, Date Filed, Form Type, Status badge (Closed/Returned), Destination
- Each row is clickable â†’ calls `viewPass(passId, false)` (view-only)
- "Close" button closes modal

#### [MODIFY] [index.html](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/index.html)

Add the HTML for two new modals:
1. `#globalQrPassSelectionModal` â€” for multiple active passes
2. `#globalQrHistoryModal` â€” for employee history view

These will be hidden `<div>` overlays, same pattern as existing modals.

---

### Global QR: Backend Changes

#### [MODIFY] [SecurityController.cs](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/Backend/Controllers/SecurityController.cs)

Add a new endpoint:

```csharp
[HttpGet("employee/{employeeRecordId:long}/passes")]
public async Task<ActionResult<ApiResponse<EmployeePassesResult>>> EmployeePasses(
    long employeeRecordId, CancellationToken cancellationToken)
```

This returns:
```json
{
  "employeeName": "Juan Dela Cruz",
  "active": [
    { "gatePassId": 42, "controlNo": "062026-005", "formTypeName": "Associate", "destination": "SM Clark", "status": "Approved", "expectedOut": "2026-06-25T10:00" }
  ],
  "recent": [
    { "gatePassId": 38, "controlNo": "062026-001", "formTypeName": "Material", "status": "Closed", "dateFiled": "2026-06-20", "completedAt": "2026-06-20T15:30" }
  ]
}
```

#### [MODIFY] [ISecurityRepository.cs](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/Backend/Project/Repositories/ISecurityRepository.cs)

Add interface method:
```csharp
Task<EmployeePassesResult> GetEmployeePassesAsync(
    long employeeRecordId, CancellationToken cancellationToken = default);
```

#### [MODIFY] [SecurityRepository.cs](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/Backend/Project/Repositories/SecurityRepository.cs)

Implement `GetEmployeePassesAsync()`:
- **Active passes query**: Same as `view_security_gate_queue` but filtered by `employee_record_id`, returning passes where `allows_qr_scan = TRUE`
- **Recent passes query**: `SELECT ... FROM tbl_gate_pass_requests WHERE (requester_employee_id = @id OR authorized_employee_id = @id) AND is_terminal = TRUE ORDER BY completed_at DESC LIMIT 20`

#### [MODIFY] [SecurityService.cs](file:///c:/Users/Michael%20Hans/OneDrive/Desktop/FormRequestSystem/Backend/Project/Services/SecurityService.cs)

Add service method that calls the repository and validates the employee record ID (HMAC check if needed, or direct lookup since the guard is already authenticated).

#### [NEW] DTOs â€” `EmployeePassesResult`, `EmployeePassItem`

Add new DTO models:
- `EmployeePassesResult` â€” contains `EmployeeName`, `Active` list, `Recent` list
- `EmployeePassItem` â€” contains `GatePassId`, `ControlNo`, `FormTypeName`, `Destination`, `Status`, `DateFiled`, `ExpectedOut`, `CompletedAt`

---

### Global QR: Database Changes

#### No schema changes required

The existing `tbl_gate_pass_requests` table already has all the columns we need:
- `requester_employee_id` / `authorized_employee_id` for employee lookup
- `gate_pass_status_code` + join to `tbl_gate_pass_statuses` for active vs terminal filtering
- `completed_at`, `expected_out_at` for sorting

The new repository queries will use these existing columns directly â€” no new tables, views, or migrations needed.

---

## Summary of Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `Frontend/Functions/scanner.js` | MODIFY | Global QR logic + bug fix + new modals |
| `index.html` | MODIFY | Add modal HTML containers |
| `Backend/Controllers/SecurityController.cs` | MODIFY | New endpoint |
| `Backend/Project/Repositories/ISecurityRepository.cs` | MODIFY | New interface method |
| `Backend/Project/Repositories/SecurityRepository.cs` | MODIFY | New query implementation |
| `Backend/Project/Services/SecurityService.cs` | MODIFY | New service method |
| `Backend/Project/DTOs/` | NEW | New DTO models |

---

## Verification Plan

### Manual Verification
1. **Single active pass**: Scan employee QR when employee has 1 approved pass â†’ should open that pass directly in scan mode
2. **Multiple active passes**: Create 2 passes for same employee (1 Associate, 1 Material), scan employee QR â†’ should show selection popup
3. **No active passes**: Scan employee QR when all passes are closed â†’ should show history modal with recent transactions
4. **History click**: Click a completed pass in history modal â†’ should open view-only (no action buttons)
5. **Bug fix**: Type a closed control number (e.g., `062026-001`) into manual input â†’ should open view-only display, NOT show "not found" error
6. **Per-pass QR unchanged**: Scan a `GP1.` QR code â†’ should still work exactly as before
7. **Empty employee**: Scan employee QR for someone with zero passes ever â†’ should show "No gate pass records found" toast

