# Implementation Plan - Sprint 7 Final Bugfixes

This plan outlines the technical solutions to fix the remaining Sprint 7 bugs before moving to the next sprints:

1. **Guard Signature Box Height constraint:** Increase the vertical signature space on the Material Gate Pass to prevent scaling down/clipping.
2. **Read-Only Scanner View for Finished Transactions:** Ensure that any scanned QR or manual ID lookup for an already closed, returned, expired, or cancelled pass opens strictly in view-only mode (read-only document review).
3. **Guard Signatures in Logs Page:** Ensure that the Guard's Out/In signatures are correctly displayed when viewing passes from logs/history.
4. **Print Cut-Lines:** Add a dashed line with a scissor icon exactly at the midpoint of A4 pages containing multiple passes during batch printing without causing blank sheet overflows.

---

## Proposed Changes

### 1. Guard Signature Box Space
- **Target:** `Frontend/Design/styles.css` & `Frontend/Functions/modal.js`
- **Approach:**
  - Increase the height of the guard signature containers (`.sig-mat-guard-out` and `.sig-mat-guard-in`) in the CSS from `6mm` to `10mm` to give ample space for drawn signatures.
  - Squeeze the surrounding vertical margins/padding slightly in `styles.css` to keep the page height within A4 print boundaries.

### 2. View-Only Scans for Finished Passes
- **Target:** `Frontend/Functions/scanner.js` & `Frontend/Functions/modal.js`
- **Approach:**
  - Ensure that `viewPass(id, isReviewing)` forces `isReviewing = false` for any pass whose status name is `'Closed'`, `'Returned'`, `'Rejected'`, or `'Cancelled'`.
  - When the Security Guard scans an inactive pass via search lookup in `scanner.js` (line 114 onwards), ensure it properly renders in read-only mode by passing `isReviewing = false`.
  - Check for scan authorization permissions to verify that the guard can view inactive passes.

### 3. Guard Signatures in Logs Page
- **Target:** `Backend/Project/Repositories/GatePassRepository.cs` & `Frontend/Functions/modal.js`
- **Approach:**
  - Verify that `actualOutSignatureFileId` and `actualInSignatureFileId` are returned in the GET `/api/form-requests/{id}` API payload (which is loaded when viewing passes from the logs).
  - Ensure that when the modal loads, both single pass (`renderMaterialBundle`) and multi-pass views query the signatures via `handleSig` and render them correctly if the IDs exist.

### 4. Batch Print Cut-Lines
- **Target:** `Frontend/Design/styles.css`
- **Approach:**
  - Add a pseudo-element rule to the `.a4-wrapper` that draws a centered dashed line with a scissor icon (`✂---------------------------------`) at exactly `148.5mm` from the top (the center of a `297mm` A4 sheet) when it contains multiple passes:
    ```css
    .a4-wrapper.has-multiple-passes::before {
        content: "✂--------------------------------------------------";
        position: absolute;
        top: 148.5mm;
        left: 0;
        width: 100%;
        text-align: center;
        color: #9ca3af;
        font-size: 8px;
        letter-spacing: 2px;
        z-index: 100;
        pointer-events: none;
    }
    ```
  - This avoids adding empty wrapper space and guarantees no blank sheet overflows.

---

## Verification Plan

### Manual Verification
1. Open a Material Gate pass, sign as a guard, and confirm that the drawn signature looks clean, proportional, and is not clipped.
2. Scan a closed pass QR token or look up a closed pass by ID and confirm that the modal opens in read-only view (no signature panel or action buttons are visible).
3. View the system logs, click on a pass with guard signatures, and confirm that both Material and Associate guard signatures display correctly.
4. Batch print two passes and check that a dashed line with a scissor icon is visible at the center of the print preview page.
