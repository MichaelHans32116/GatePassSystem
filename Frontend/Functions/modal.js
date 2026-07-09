// Document Review modal, print preview, drag, resize, and expand/restore.

var isDragging = false;
var isResizing = false;
var isMaximized = false;
var modalStartX = 0;
var modalStartY = 0;
var modalStartLeft = 0;
var modalStartTop = 0;
var modalStartWidth = 0;
var modalStartHeight = 0;
var modalRestoreLayout = null;
var modalFrameRequest = null;
var pendingModalBox = null;
var QR_BACK_CODE_SIZE = 136;

function getGuardRemarksText(p) {
    return String(p?.status || 'Pending').toUpperCase();
}

// ----- Decision Remarks / Feedback (rejection reason + per-step comments) -----
const APPROVAL_STEP_LABELS = {
    SUPERIOR: 'Immediate Superior',
    PRESIDENT: 'President',
    PAS: 'PAS / HR Admin',
    HRAD_ASSIGN: 'HRAD Assignment'
};

function approvalStepLabel(code) {
    return APPROVAL_STEP_LABELS[String(code || '').toUpperCase()] || (code || 'Approver');
}

function shouldShowDecisionRemarks(p) {
    const status = normalizeDocumentStatus(p?.status);
    if (status === 'REJECTED' || status === 'ON HOLD') return true;
    // Also surface any captured approver comments regardless of label drift.
    return (p?.approvalSteps || []).some(step => String(step?.comments || '').trim() !== '');
}

function renderDecisionRemarks(p) {
    const panel = document.getElementById('decisionRemarksPanel');
    const body = document.getElementById('decisionRemarksBody');
    if (!panel || !body) return;

    if (!shouldShowDecisionRemarks(p)) {
        panel.classList.add('hidden');
        body.innerHTML = '';
        return;
    }

    const steps = (p?.approvalSteps || []).filter(step => String(step?.comments || '').trim() !== '');
    // Latest decision first (acted_at desc); steps without a timestamp sink to the bottom.
    steps.sort((a, b) => new Date(b?.actedAt || 0) - new Date(a?.actedAt || 0));

    if (steps.length === 0) {
        // Status is REJECTED/ON HOLD but no per-step comment was carried; show a neutral note.
        body.innerHTML = '<div class="italic text-gray-500">No written remarks were recorded for this decision.</div>';
        panel.classList.remove('hidden');
        return;
    }

    body.innerHTML = steps.map((step, index) => {
        const statusCode = normalizeDocumentStatus(step?.approvalStatusCode);
        const isReject = statusCode === 'REJECTED';
        const badgeClass = isReject
            ? 'bg-red-100 text-red-700'
            : (statusCode === 'ON HOLD' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600');
        const when = step?.actedAt ? formatDateTime(step.actedAt) : '';
        const latestTag = index === 0
            ? '<span class="ml-2 rounded bg-red-600 px-1.5 py-0.5 text-[9px] font-bold uppercase text-white">Latest</span>'
            : '';
        return `
            <div class="rounded border border-red-100 bg-white p-2">
                <div class="flex flex-wrap items-center gap-2 mb-1">
                    <span class="font-bold text-gray-800">${escapeDocumentText(approvalStepLabel(step?.approvalStepCode))}</span>
                    <span class="rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${badgeClass}">${escapeDocumentText(step?.approvalStatusCode || '')}</span>
                    ${step?.approverName ? `<span class="text-[10px] text-gray-500">by ${escapeDocumentText(step.approverName)}</span>` : ''}
                    ${when ? `<span class="text-[10px] text-gray-400">${escapeDocumentText(when)}</span>` : ''}
                    ${latestTag}
                </div>
                <div class="whitespace-pre-wrap break-words text-gray-700">${escapeDocumentText(step.comments)}</div>
            </div>`;
    }).join('');
    panel.classList.remove('hidden');
}

function hideDecisionRemarks() {
    const panel = document.getElementById('decisionRemarksPanel');
    const body = document.getElementById('decisionRemarksBody');
    if (panel) panel.classList.add('hidden');
    if (body) body.innerHTML = '';
}

// ----- Inline reason/remarks composer (replaces window.prompt) -----
function showDecisionReasonComposer(label, { required } = { required: true }) {
    const composer = document.getElementById('decisionReasonComposer');
    const labelEl = document.getElementById('decisionReasonLabel');
    const input = document.getElementById('decisionReasonInput');
    const error = document.getElementById('decisionReasonError');
    if (!composer || !input) return;
    if (labelEl && label) labelEl.innerText = label;
    input.dataset.required = required ? '1' : '0';
    error?.classList.add('hidden');
    composer.classList.remove('hidden');
    input.focus();
}

function hideDecisionReasonComposer() {
    const composer = document.getElementById('decisionReasonComposer');
    const input = document.getElementById('decisionReasonInput');
    const error = document.getElementById('decisionReasonError');
    if (input) input.value = '';
    error?.classList.add('hidden');
    composer?.classList.add('hidden');
}

// Returns the trimmed reason, or null if required-and-empty (and flags the error inline).
function readDecisionReason() {
    const input = document.getElementById('decisionReasonInput');
    const error = document.getElementById('decisionReasonError');
    if (!input) return '';
    const value = (input.value || '').trim();
    const required = input.dataset.required === '1';
    if (required && !value) {
        error?.classList.remove('hidden');
        input.focus();
        return null;
    }
    error?.classList.add('hidden');
    return value;
}

function normalizeDocumentStatus(status) {
    return String(status || 'Pending')
        .trim()
        .replace(/[_-]+/g, ' ')
        .replace(/\s+/g, ' ')
        .toUpperCase();
}

function isFinishedDocumentStatus(status) {
    const normalized = normalizeDocumentStatus(status);
    return [
        'CLOSED',
        'RETURNED',
        'REJECTED',
        'CANCELLED',
        'CANCELED',
        'EXPIRED'
    ].includes(normalized);
}

function isSecurityScanActionableStatus(status) {
    const normalized = normalizeDocumentStatus(status);
    return [
        'APPROVED',
        'OUTSIDE',
        'OVERDUE',
        'WAITING OUT',
        'WAITING IN'
    ].includes(normalized);
}

function shouldShowGuardStatusRow(pass) {
    const status = normalizeDocumentStatus(pass?.status);
    return status !== '' && status !== 'DRAFT';
}

function getDocumentStatusBadgeClass(status) {
    const normalized = normalizeDocumentStatus(status);
    if (normalized.includes('REJECTED') ||
        normalized.includes('CANCELLED') ||
        normalized.includes('CANCELED') ||
        normalized.includes('EXPIRED') ||
        normalized.includes('OVERDUE')) {
        return 'document-status-badge status-badge-danger';
    }
    if (normalized.startsWith('PENDING') || normalized === 'DRAFT') {
        return 'document-status-badge status-badge-pending';
    }
    if (normalized === 'OUTSIDE') {
        return 'document-status-badge status-badge-info';
    }
    if (normalized.includes('APPROVED') ||
        normalized.includes('RETURNED') ||
        normalized.includes('CLOSED')) {
        return 'document-status-badge status-badge-success';
    }
    return 'document-status-badge status-badge-neutral';
}

function getGuardScanName(p, actionCode) {
    const fallback = actionCode === 'TIME_IN'
        ? p?.actualInGuardName
        : p?.actualOutGuardName;
    if (fallback) return fallback;

    const scan = [...(p?.scans || [])]
        .filter(item =>
            item.scanActionCode === actionCode ||
            item.resultCode === `${actionCode}_RECORDED`
        )
        .sort((a, b) => new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0))[0];
    return scan?.guardName || '';
}

function escapeDocumentText(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function setHradDecisionControls() {}

function parseScheduleDateTime(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
}

function formatScheduleTimeInput(value) {
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) return '';
    const hours = String(value.getHours()).padStart(2, '0');
    const minutes = String(value.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
}

function getHradScheduleBaseDate(pass) {
    return parseScheduleDateTime(
        pass?.expectedOutAtRaw ||
        pass?.expectedOutAt ||
        pass?.expectedOut ||
        pass?.formDate ||
        pass?.dateFiled ||
        pass?.createdAt ||
        pass?.appliedAt
    );
}

function buildHradScheduleDateTime(baseDate, timeValue) {
    if (!(baseDate instanceof Date) || Number.isNaN(baseDate.getTime()) || !timeValue) return null;
    const [hours, minutes] = String(timeValue).split(':').map(part => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
    const next = new Date(baseDate);
    next.setHours(hours, minutes, 0, 0);
    return Number.isNaN(next.getTime()) ? null : next;
}

function formatHradScheduleWindow(window) {
    const startText = window?.start ? formatDateTime(window.start.toISOString()) : 'N/A';
    const endText = window?.end ? formatDateTime(window.end.toISOString()) : 'N/A';
    return `${startText} to ${endText}`;
}

function normalizeHradTripTypeCode(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    const upper = raw.toUpperCase();
    if (upper === 'BOTH' || upper.includes('HATID AT SUNDO') || upper.includes('HATID_AND_SUNDO')) {
        return 'BOTH';
    }
    // Check SUNDO before HATID: "HATID AT SUNDO" is handled above.
    if (upper === 'SUNDO' || upper.includes('SUNDO LANG')) {
        return 'SUNDO';
    }
    if (upper === 'HATID' || upper.includes('HATID LANG')) {
        return 'HATID';
    }
    return upper;
}

function hradTripTypeLabel(code) {
    const normalized = normalizeHradTripTypeCode(code);
    const labels = {
        HATID: 'Hatid lang',
        SUNDO: 'Sundo lang',
        BOTH: 'Hatid at Sundo'
    };
    return labels[normalized] || (code ? String(code) : 'Company Vehicle Needed');
}

function getAllowedHradTripTypes(pass) {
    const formType = String(pass?.formTypeCode || '').trim().toUpperCase();
    const willReturn = pass?.willReturn !== false;
    if (!formType) {
        return ['HATID'];
    }
    if (formType === 'MATERIAL_GATE_PASS') {
        return ['HATID'];
    }
    if (!willReturn) {
        return ['HATID'];
    }
    // Bug 1: a returning person pass may be Hatid at Sundo, Hatid lang or Sundo lang —
    // HRAD honours the requester's choice but can still adjust.
    return ['BOTH', 'HATID', 'SUNDO'];
}

function setHradTripTypeOptions(pass) {
    const select = document.getElementById('hradTripType');
    if (!select) return;
    const allowed = getAllowedHradTripTypes(pass);
    // The requester already chose the trip type (Hatid at Sundo / Hatid lang /
    // Sundo lang) on their own request form — that IS the request. HRAD must honour
    // it, so when the request carries a trip type we lock the selector to that single
    // value instead of re-offering the whole list. Only legacy requests with no
    // stored trip type fall back to the editable list.
    const requested = normalizeHradTripTypeCode(
        pass?.vehicleTripTypeCode ||
        pass?.tripTypeCode ||
        ''
    );
    const locked = Boolean(requested) && allowed.includes(requested);
    const options = locked ? [requested] : allowed;
    const currentValue = locked
        ? requested
        : normalizeHradTripTypeCode(select.value || requested || '');
    select.innerHTML = options.map(code =>
        `<option value="${code}">${hradTripTypeLabel(code)}</option>`
    ).join('');
    select.value = options.includes(currentValue) ? currentValue : options[0];
    select.disabled = locked || options.length === 1;
    select.dataset.locked = locked ? 'true' : 'false';

    const lockedHint = document.getElementById('hradTripTypeLockedHint');
    if (lockedHint) lockedHint.classList.toggle('hidden', !locked);
}

function getHradTripTypeCode(pass) {
    const selectValue = normalizeHradTripTypeCode(document.getElementById('hradTripType')?.value);
    if (selectValue) return selectValue;
    const fallbackValue = normalizeHradTripTypeCode(
        pass?.vehicleTripTypeCode ||
        pass?.tripTypeCode
    );
    if (fallbackValue) return fallbackValue;
    return getAllowedHradTripTypes(pass)[0] || '';
}

function getHradScheduleModeCode() {
    return String(document.getElementById('hradScheduleMode')?.value || 'STRAIGHT')
        .trim()
        .toUpperCase();
}

function setHradScheduleControls(pass) {
    const modeRow = document.getElementById('hradScheduleModeRow');
    const modeSelect = document.getElementById('hradScheduleMode');
    const secondaryRow = document.getElementById('hradSecondaryScheduleRow');
    const secondaryStart = document.getElementById('hradScheduleStartSecondary');
    const secondaryEnd = document.getElementById('hradScheduleEndSecondary');
    setHradTripTypeOptions(pass);
    const tripType = getHradTripTypeCode(pass);
    const isBothTrip = tripType === 'BOTH';
    const splitMode = isBothTrip && getHradScheduleModeCode() === 'SPLIT';

    if (modeRow) {
        modeRow.classList.toggle('hidden', !isBothTrip);
    }
    if (modeSelect) {
        if (!isBothTrip) {
            modeSelect.value = 'STRAIGHT';
        } else if (!modeSelect.value) {
            modeSelect.value = 'STRAIGHT';
        }
    }
    if (secondaryRow) {
        secondaryRow.classList.toggle('hidden', !splitMode);
    }
    if (secondaryStart) {
        secondaryStart.disabled = !splitMode;
        if (!splitMode) secondaryStart.value = '';
    }
    if (secondaryEnd) {
        secondaryEnd.disabled = !splitMode;
        if (!splitMode) secondaryEnd.value = '';
    }
}

function scheduleWindowFromInputs(baseDate, startId, endId) {
    const startValue = document.getElementById(startId)?.value || '';
    const endValue = document.getElementById(endId)?.value || '';
    const start = buildHradScheduleDateTime(baseDate, startValue);
    const end = buildHradScheduleDateTime(baseDate, endValue);
    if (start && end && end <= start) {
        return { start, end: null };
    }
    return { start, end };
}

function getHradScheduleWindow(pass) {
    const baseDate = getHradScheduleBaseDate(pass);
    const requestedStart = parseScheduleDateTime(
        pass?.expectedOutAtRaw ||
        pass?.expectedOutAt ||
        pass?.expectedOut
    );
    const requestedEnd = parseScheduleDateTime(
        pass?.expectedInAtRaw ||
        pass?.expectedInAt ||
        pass?.expectedIn
    );
    const tripType = getHradTripTypeCode(pass);
    const scheduleMode = getHradScheduleModeCode();
    const primaryWindow = scheduleWindowFromInputs(
        baseDate,
        'hradScheduleStart',
        'hradScheduleEnd'
    );
    const secondaryWindow = tripType === 'BOTH' && scheduleMode === 'SPLIT'
        ? scheduleWindowFromInputs(
            baseDate,
            'hradScheduleStartSecondary',
            'hradScheduleEndSecondary'
        )
        : null;
    const windows = [primaryWindow];
    if (secondaryWindow) {
        windows.push(secondaryWindow);
    }
    const completeWindows = windows.filter(window => window?.start && window?.end);
    const isSplit = tripType === 'BOTH' && scheduleMode === 'SPLIT';
    const start = completeWindows[0]?.start || null;
    const end = completeWindows.length > 0
        ? completeWindows[completeWindows.length - 1].end
        : null;

    return {
        start,
        end,
        requestedStart,
        requestedEnd,
        tripType,
        scheduleMode,
        windows: completeWindows,
        primaryWindow,
        secondaryWindow,
        isSplit,
        isComplete: isSplit
            ? completeWindows.length === 2
            : completeWindows.length === 1
    };
}

function setHradScheduleInputsFromPass(pass) {
    const startInput = document.getElementById('hradScheduleStart');
    const endInput = document.getElementById('hradScheduleEnd');
    const secondaryStart = document.getElementById('hradScheduleStartSecondary');
    const secondaryEnd = document.getElementById('hradScheduleEndSecondary');
    const modeSelect = document.getElementById('hradScheduleMode');
    if (!startInput && !endInput && !secondaryStart && !secondaryEnd && !modeSelect) return;
    if (startInput) startInput.value = '';
    if (endInput) endInput.value = '';
    if (secondaryStart) secondaryStart.value = '';
    if (secondaryEnd) secondaryEnd.value = '';
    if (modeSelect) modeSelect.value = 'STRAIGHT';
    setHradScheduleControls(pass);
}

function scheduleWindowOverlaps(startA, endA, startB, endB) {
    if (!startA || !startB) return false;
    const normalizedEndA = endA || new Date(startA.getTime() + 60 * 60 * 1000);
    const normalizedEndB = endB || new Date(startB.getTime() + 60 * 60 * 1000);
    return startA < normalizedEndB && normalizedEndA > startB;
}

function scheduleEntryWindow(entry) {
    if (!entry?.scheduleDate) return null;
    const datePart = String(entry.scheduleDate).split('T')[0];
    const start = entry.startTime ? new Date(`${datePart}T${String(entry.startTime).substring(0, 8)}`) : null;
    const end = entry.endTime
        ? new Date(`${datePart}T${String(entry.endTime).substring(0, 8)}`)
        : (start ? new Date(start.getTime() + 60 * 60 * 1000) : null);
    if (start && Number.isNaN(start.getTime())) return null;
    if (end && Number.isNaN(end.getTime())) return null;
    return { start, end };
}

function scheduleWindowsOverlapAny(windowSet, rowWindow) {
    return (windowSet || []).some(window =>
        scheduleWindowOverlaps(window?.start, window?.end, rowWindow?.start, rowWindow?.end)
    );
}

function getVehicleAvailabilityLabel(vehicle, pass) {
    const status = String(vehicle?.status || vehicle?.availabilityStatusCode || '').trim().toUpperCase();
    if (!vehicle) return 'Not Available';
    if (status && status !== 'AVAILABLE') {
        return status.includes('USE') || status.includes('RESERVED')
            ? 'Away'
            : 'Not Available';
    }

    const window = getHradScheduleWindow(pass);
    if (!window.isComplete) {
        return window.isSplit ? 'Awaiting split schedule' : 'Awaiting schedule';
    }
    const sourceRows = typeof scheduleData !== 'undefined' && Array.isArray(scheduleData)
        ? scheduleData
        : [];
    const vehicleId = String(vehicle?.id || vehicle?.vehicleId || '');
    const hasConflict = sourceRows.some(entry => {
        if (String(entry.vehicleId || '') !== vehicleId) return false;
        const rowWindow = scheduleEntryWindow(entry);
        return scheduleWindowsOverlapAny(window.windows, rowWindow);
    });
    return hasConflict ? 'Away' : 'Available';
}

function getDriverAvailabilityLabel(driverId, pass) {
    if (!driverId) return 'Unassigned';
    const window = getHradScheduleWindow(pass);
    if (!window.isComplete) {
        return window.isSplit ? 'Awaiting split schedule' : 'Awaiting schedule';
    }
    const sourceRows = typeof scheduleData !== 'undefined' && Array.isArray(scheduleData)
        ? scheduleData
        : [];
    const hasConflict = sourceRows.some(entry => {
        if (String(entry.driverId || '') !== String(driverId)) return false;
        const rowWindow = scheduleEntryWindow(entry);
        return scheduleWindowsOverlapAny(window.windows, rowWindow);
    });
    return hasConflict ? 'Away' : 'Available';
}

function formatHradAssignedScheduleSummary(window) {
    if (!window?.start || !window?.end) return 'N/A';

    const outerBounds = formatHradScheduleWindow({
        start: window.start,
        end: window.end
    });

    if (window.isSplit) {
        if (!Array.isArray(window.windows) || window.windows.length < 2) {
            return 'Awaiting split schedule';
        }
        const windowsText = window.windows
            .map(segment => formatHradScheduleWindow(segment))
            .join(' / ');
        return `${outerBounds} (split: ${windowsText})`;
    }

    return outerBounds;
}

function updateHradAssignmentSummary(pass) {
    const scheduleEl = document.getElementById('hradRequestedSchedule');
    const assignedScheduleEl = document.getElementById('hradAssignedSchedule');
    const tripEl = document.getElementById('hradRequestedTripType');
    const vehicleAvailabilityEl = document.getElementById('hradVehicleAvailability');
    const driverAvailabilityEl = document.getElementById('hradDriverAvailability');
    const vehicleSelect = document.getElementById('hradAssignVehicle');
    const driverSelect = document.getElementById('hradAssignDriver');

    const requestedWindow = {
        start: parseScheduleDateTime(pass?.expectedOutAtRaw || pass?.expectedOutAt || pass?.expectedOut),
        end: parseScheduleDateTime(pass?.expectedInAtRaw || pass?.expectedInAt || pass?.expectedIn)
    };
    const window = getHradScheduleWindow(pass);
    if (scheduleEl) {
        scheduleEl.innerText = formatHradScheduleWindow(requestedWindow);
    }
    if (assignedScheduleEl) {
        assignedScheduleEl.innerText = formatHradAssignedScheduleSummary(window);
    }
    if (tripEl) {
        tripEl.innerText = hradTripTypeLabel(
            document.getElementById('hradTripType')?.value
            || pass?.vehicleTripTypeCode
            || pass?.tripTypeCode
            || getAllowedHradTripTypes(pass)[0]
        );
    }
    if (vehicleAvailabilityEl && vehicleSelect) {
        const vehicle = (databaseVehicles || []).find(v => String(v.id) === String(vehicleSelect.value));
        vehicleAvailabilityEl.innerText = vehicle ? getVehicleAvailabilityLabel(vehicle, pass) : 'Select a vehicle';
    }
    if (driverAvailabilityEl && driverSelect) {
        const driver = (databaseDrivers || []).find(d => String(d.driverId) === String(driverSelect.value));
        driverAvailabilityEl.innerText = driver ? getDriverAvailabilityLabel(driver.driverId, pass) : 'Select a driver';
    }
}

// ---- Phase 11 Req 4: Digital vs Printable Form view mode ----
// Bug 3: the modal opens on the Printable Form tab by default (not Digital).
let currentDocumentViewMode = 'form';

function setDocumentViewMode(mode) {
    currentDocumentViewMode = (mode === 'form') ? 'form' : 'digital';
    const digitalArea = document.getElementById('digitalViewArea');
    const printableArea = document.getElementById('printableArea');
    const materialPrintableArea = document.getElementById('materialPrintableArea');
    const proofsGallery = document.getElementById('materialProofsGallery');
    const digitalBtn = document.getElementById('docViewDigitalBtn');
    const formBtn = document.getElementById('docViewFormBtn');
    const printBtn = document.getElementById('modalPrintButton');

    const showForm = currentDocumentViewMode === 'form';
    const isMaterialDoc = !!(materialPrintableArea && !materialPrintableArea.dataset.docEmpty);

    if (digitalArea) digitalArea.classList.toggle('hidden', showForm);
    if (printableArea) printableArea.classList.toggle('hidden', showForm ? isMaterialDoc : true);
    if (materialPrintableArea) materialPrintableArea.classList.toggle('hidden', showForm ? !isMaterialDoc : true);
    // Material proof gallery (Req 2) belongs to DIGITAL view only.
    if (proofsGallery && !proofsGallery.dataset.noProofs) {
        proofsGallery.classList.toggle('hidden', showForm);
    }

    if (digitalBtn) {
        digitalBtn.classList.toggle('is-active', !showForm);
        digitalBtn.setAttribute('aria-pressed', String(!showForm));
    }
    if (formBtn) {
        formBtn.classList.toggle('is-active', showForm);
        formBtn.setAttribute('aria-pressed', String(showForm));
    }
    // Print only enabled in Form view.
    if (printBtn) {
        printBtn.disabled = !showForm;
        printBtn.classList.toggle('opacity-40', !showForm);
        printBtn.classList.toggle('cursor-not-allowed', !showForm);
        printBtn.title = showForm ? '' : 'Switch to Printable Form to print';
    }
}

function printCurrentDocument() {
    // Auto-switch to Form view before printing so the printable layout is on screen.
    if (currentDocumentViewMode !== 'form') {
        setDocumentViewMode('form');
    }
    setTimeout(() => window.print(), 50);
}

// ----- Associate name rendering for the printable forms (Phase 11 req5) -----
// Primary associate (index 0) is rendered at normal size; additional companions are
// rendered compact (smaller font). Max 5 names per printed page; overflow spills onto
// extra printed sheets handled by buildAssociateNamePages().
var ASSOCIATE_NAMES_PER_PAGE = 5;

function getAssociateNames(pass) {
    const list = Array.isArray(pass?.associates) ? pass.associates : [];
    const names = list.map(a => String(a?.name || '').trim()).filter(Boolean);
    if (names.length > 0) return names;
    const fallback = String(pass?.userName || pass?.authorizedEmployeeName || '').trim();
    return fallback ? [fallback] : [];
}

// Compact "First Last" markup for the additional companions (index >= 1) on one page.
function renderCompactAssociateNames(names) {
    if (!names || names.length === 0) return '';
    return names
        .map(name => `<div class="person-associate-compact">${escapeDocumentText(name)}</div>`)
        .join('');
}

// Split associate names into pages of ASSOCIATE_NAMES_PER_PAGE; returns an array of
// { primary, extra[] } page descriptors. Page 0 always carries the primary associate.
function buildAssociateNamePages(names) {
    const all = (names || []).slice();
    if (all.length === 0) return [{ primary: '', extra: [] }];
    const pages = [];
    for (let i = 0; i < all.length; i += ASSOCIATE_NAMES_PER_PAGE) {
        const chunk = all.slice(i, i + ASSOCIATE_NAMES_PER_PAGE);
        pages.push({ primary: chunk[0], extra: chunk.slice(1) });
    }
    return pages;
}

function formatManualScanId(gpId) {
            const raw = String(gpId || '').trim();
            if (!raw) return '';
            const suffixMatch = raw.match(/(\d{3})$/);
            if (!suffixMatch) return escapeDocumentText(raw);
            const suffix = suffixMatch[1];
            const prefix = raw.slice(0, -suffix.length);
            return `${escapeDocumentText(prefix)}<span class="qr-manual-suffix">${escapeDocumentText(suffix)}</span>`;
        }

function deriveGatePassNoFromControlNo(controlNo) {
            const match = String(controlNo || '').trim().match(/^(\d{2})(\d{2})(\d{2})-(\d{1,6})$/);
            if (!match) return '';
            const [, month, day, year, sequence] = match;
            return `GP-20${year}${month}${day}-${sequence.padStart(6, '0')}`;
        }

function getPrintableGatePassNo(pass) {
            const direct = String(pass?.gatePassNo || pass?.id || '').trim();
            if (direct && /^GP-/i.test(direct)) return direct;
            return deriveGatePassNoFromControlNo(pass?.controlNo) || direct;
        }

// Bug 9: the "To Scan:" identifier printed under the QR is the human Control No.
// (the guard's manual-entry field matches on controlNo — see scanner.js handleManualEntryLookup).
// The whole control number is underlined, not just the trailing sequence.
function formatScanControlNo(pass) {
            const raw = String(pass?.controlNo || '').trim();
            if (!raw || /^(GP-ID|TEMP|TMP|ID)-/i.test(raw)) return '';
            const controlNo = raw.length > 20 ? raw.slice(0, 20) : raw;
            return `<span class="qr-manual-suffix">${escapeDocumentText(controlNo)}</span>`;
        }

function getQrBackMetaHtml(pass) {
            const controlNo = escapeDocumentText(pass?.controlNo || '');
            const scanId = formatScanControlNo(pass);
            return `
                <div class="qr-back-meta">
                    ${controlNo ? `<div>Control No.: <strong>${controlNo}</strong></div>` : ''}
                    ${scanId ? `<div>To Scan: <strong>${scanId}</strong></div>` : ''}
                </div>
            `;
        }

function getQrBackPageHtml(pass, codeClassName = 'qrCodeBackDisplay') {
            return `
                <div class="qr-back-card">
                    <h3 class="qr-back-title">Gate Pass QR Code</h3>
                    <div class="${codeClassName} qr-back-code"></div>
                    ${getQrBackMetaHtml(pass)}
                </div>
            `;
        }
function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

function scheduleModalBoxUpdate(modal, box) {
            pendingModalBox = { ...(pendingModalBox || {}), ...box };
            if (modalFrameRequest) return;

            modalFrameRequest = requestAnimationFrame(() => {
                if (!pendingModalBox) return;
                if (pendingModalBox.left !== undefined) modal.style.left = pendingModalBox.left + 'px';
                if (pendingModalBox.top !== undefined) modal.style.top = pendingModalBox.top + 'px';
                if (pendingModalBox.width !== undefined) modal.style.width = pendingModalBox.width + 'px';
                if (pendingModalBox.height !== undefined) modal.style.height = pendingModalBox.height + 'px';
                pendingModalBox = null;
                modalFrameRequest = null;
            });
        }

function setModalInteractionState(mode, enabled) {
            const modal = document.getElementById('printModalContent');
            if (!modal) return;

            modal.classList.toggle('is-dragging', enabled && mode === 'drag');
            modal.classList.toggle('is-resizing', enabled && mode === 'resize');
            document.body.classList.toggle('modal-no-select', enabled);
        }

function prepareModalForFloating(modal) {
            const rect = modal.getBoundingClientRect();

            modal.classList.add('is-floating');
            modal.classList.remove('scale-95');
            modal.classList.add('scale-100');

            modal.style.left = rect.left + 'px';
            modal.style.top = rect.top + 'px';
            modal.style.width = rect.width + 'px';
            modal.style.height = rect.height + 'px';
            modal.style.maxWidth = 'none';
            modal.style.maxHeight = 'none';
        }

function resetDocumentModalLayout() {
            const modal = document.getElementById('printModalContent');
            const printModal = document.getElementById('printModal');
            if (!modal || !printModal) return;

            isDragging = false;
            isResizing = false;
            isMaximized = false;
            modalRestoreLayout = null;
            pendingModalBox = null;
            if (modalFrameRequest) {
                cancelAnimationFrame(modalFrameRequest);
                modalFrameRequest = null;
            }
            setModalInteractionState('drag', false);
            setModalInteractionState('resize', false);

            modal.classList.remove('is-floating', 'is-reviewing', 'w-screen', 'h-screen', 'm-0', 'scale-100');
            modal.classList.add('scale-95');

            modal.style.left = '';
            modal.style.top = '';
            modal.style.width = '';
            modal.style.height = '';
            modal.style.maxWidth = '';
            modal.style.maxHeight = '';
            modal.style.borderRadius = '';
            const scrollArea = document.getElementById('modalScrollArea');
            if (scrollArea) scrollArea.scrollTop = 0;

            printModal.classList.remove('p-0');
            printModal.classList.add('p-4');
            updateModalExpandButton(false);

            const multiPrint = document.getElementById('multiPrintableArea');
            if (multiPrint) {
                multiPrint.innerHTML = '';
                multiPrint.classList.add('hidden');
            }
            // Reset Phase 11 Req 4 view-mode state so the next opened document defaults to Printable Form (Bug 3).
            currentDocumentViewMode = 'form';
            const digitalAreaReset = document.getElementById('digitalViewArea');
            if (digitalAreaReset) digitalAreaReset.innerHTML = '';
        }

function initializeModalDragResize() {
            const modal = document.getElementById('printModalContent');
            const dragHandle = document.getElementById('modalDragHandle');
            const resizeHandle = document.getElementById('resizeHandle');
            if (!modal || !dragHandle || !resizeHandle) return;

            dragHandle.addEventListener('pointerdown', (e) => {
                if (window.innerWidth <= 768) return; // Disable dragging on mobile
                if (isMaximized) return;
                if (e.target.closest('button, input, select, textarea, a, label')) return;

                e.preventDefault();
                prepareModalForFloating(modal);

                const rect = modal.getBoundingClientRect();
                isDragging = true;
                modalStartX = e.clientX;
                modalStartY = e.clientY;
                modalStartLeft = rect.left;
                modalStartTop = rect.top;
                modalStartWidth = rect.width;
                modalStartHeight = rect.height;

                dragHandle.setPointerCapture?.(e.pointerId);
                dragHandle.style.cursor = 'grabbing';
                setModalInteractionState('drag', true);
            });

            resizeHandle.addEventListener('pointerdown', (e) => {
                if (window.innerWidth <= 768) return; // Disable resizing on mobile
                if (isMaximized) return;

                e.preventDefault();
                e.stopPropagation();
                prepareModalForFloating(modal);

                const rect = modal.getBoundingClientRect();
                isResizing = true;
                modalStartX = e.clientX;
                modalStartY = e.clientY;
                modalStartLeft = rect.left;
                modalStartTop = rect.top;
                modalStartWidth = rect.width;
                modalStartHeight = rect.height;

                resizeHandle.setPointerCapture?.(e.pointerId);
                setModalInteractionState('resize', true);
            });

            document.addEventListener('pointermove', (e) => {
                if (isDragging && !isMaximized) {
                    e.preventDefault();
                    const maxLeft = Math.max(0, window.innerWidth - modalStartWidth);
                    const maxTop = Math.max(0, window.innerHeight - modalStartHeight);
                    const nextLeft = clamp(modalStartLeft + (e.clientX - modalStartX), 0, maxLeft);
                    const nextTop = clamp(modalStartTop + (e.clientY - modalStartY), 0, maxTop);

                    scheduleModalBoxUpdate(modal, { left: nextLeft, top: nextTop });
                }

                if (isResizing && !isMaximized) {
                    e.preventDefault();
                    const isReviewingMode = modal.classList.contains('is-reviewing');
                    const targetMinWidth = isReviewingMode ? 900 : 460;
                    const targetMinHeight = isReviewingMode ? 600 : 420;

                    const minWidth = Math.min(targetMinWidth, Math.max(320, window.innerWidth - modalStartLeft - 10));
                    const minHeight = Math.min(targetMinHeight, Math.max(280, window.innerHeight - modalStartTop - 10));
                    const maxWidth = Math.max(minWidth, window.innerWidth - modalStartLeft - 10);
                    const maxHeight = Math.max(minHeight, window.innerHeight - modalStartTop - 10);

                    const nextWidth = clamp(modalStartWidth + (e.clientX - modalStartX), minWidth, maxWidth);
                    const nextHeight = clamp(modalStartHeight + (e.clientY - modalStartY), minHeight, maxHeight);

                    scheduleModalBoxUpdate(modal, { width: nextWidth, height: nextHeight });
                }
            }, { passive: false });

            document.addEventListener('pointerup', () => {
                isDragging = false;
                isResizing = false;
                dragHandle.style.cursor = 'move';
                setModalInteractionState('drag', false);
                setModalInteractionState('resize', false);
            });

            window.addEventListener('resize', () => {
                if (!modal.classList.contains('is-floating') || isMaximized) return;
                const rect = modal.getBoundingClientRect();
                scheduleModalBoxUpdate(modal, {
                    left: clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width)),
                    top: clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height)),
                    width: Math.min(rect.width, window.innerWidth),
                    height: Math.min(rect.height, window.innerHeight)
                });
            });

            dragHandle.addEventListener('dblclick', (e) => {
                if (e.target.closest('button, input, select, textarea, a, label')) return;
                toggleMaximizeModal();
            });
        }

function toggleMaximizeModal() {
            const modal = document.getElementById('printModalContent');
            const printModal = document.getElementById('printModal');
            if (!modal || !printModal) return;

            if (isMaximized) {
                isMaximized = false;
                modal.classList.remove('w-screen', 'h-screen', 'm-0');
                printModal.classList.remove('p-0');
                printModal.classList.add('p-4');
                modal.style.borderRadius = '';

                if (modalRestoreLayout) {
                    modal.classList.add('is-floating');
                    modal.style.left = modalRestoreLayout.left;
                    modal.style.top = modalRestoreLayout.top;
                    modal.style.width = modalRestoreLayout.width;
                    modal.style.height = modalRestoreLayout.height;
                }
                updateModalExpandButton(false);
            } else {
                const rect = modal.getBoundingClientRect();
                modalRestoreLayout = {
                    left: modal.style.left || rect.left + 'px',
                    top: modal.style.top || rect.top + 'px',
                    width: modal.style.width || rect.width + 'px',
                    height: modal.style.height || rect.height + 'px'
                };

                isMaximized = true;
                modal.classList.add('is-floating', 'w-screen', 'h-screen', 'm-0');
                modal.style.left = '0px';
                modal.style.top = '0px';
                modal.style.width = '100vw';
                modal.style.height = '100vh';
                modal.style.maxWidth = '100vw';
                modal.style.maxHeight = '100vh';
                modal.style.borderRadius = '0';
                printModal.classList.remove('p-4');
                printModal.classList.add('p-0');
                updateModalExpandButton(true);
            }
        }

function updateModalExpandButton(expanded) {
            const text = document.getElementById('modalExpandText');
            const icon = document.getElementById('modalExpandIcon');
            const button = document.getElementById('modalExpandButton');
            if (text) text.innerText = expanded ? 'Minimize' : 'Expand';
            if (icon) {
                icon.classList.toggle('fa-window-maximize', !expanded);
                icon.classList.toggle('fa-window-minimize', expanded);
            }
            if (button) {
                button.title = expanded
                    ? 'Minimize document workspace'
                    : 'Expand document workspace';
            }
        }

function materialSignatureSlot(idPrefix, pageIndex) {
            const isPrimary = pageIndex === 0;
            return {
                imageAttribute: isPrimary
                    ? `id="${idPrefix}"`
                    : `data-material-signature-copy="${idPrefix}"`,
                nameAttribute: isPrimary
                    ? `id="${idPrefix}Name"`
                    : `data-material-signature-name-copy="${idPrefix}"`
            };
        }

async function renderMaterialBundle(pass) {
            const container = document.getElementById('materialPrintableArea');
            if (!container) return;

            const itemRows = [...(pass.materialItems || [])];
            const pageCount = Math.max(1, Math.ceil(itemRows.length / 8));
            const formDate = pass.formDate
                ? new Date(`${String(pass.formDate).slice(0, 10)}T00:00:00`)
                    .toLocaleDateString()
                : pass.dateFiled;
            const controlNo = String(pass.controlNo || pass.id || '')
                .trim()
                .slice(0, 20);

            // pass.actualOut/actualIn are already-formatted time strings (e.g. "10:30 AM")
            // from formatDateTime(..., false). Re-parsing via new Date() would give Invalid Date.
            const matSafeTime = (ts) => {
                if (!ts || ts === 'N/A') return '—';
                if (/^\d{1,2}:\d{2}/.test(String(ts))) return ts; // already "HH:MM" or "H:MM AM"
                const d = new Date(ts);
                return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            };

            container.innerHTML = Array.from({ length: pageCount }, (_, pageIndex) => {
                const pageItems = itemRows.slice(pageIndex * 8, pageIndex * 8 + 8);
                while (pageItems.length < 8) pageItems.push(null);

                const prepared = materialSignatureSlot('sigMatPrepared', pageIndex);
                const superior = materialSignatureSlot('sigMatSuperior', pageIndex);
                const pas = materialSignatureSlot('sigMatPas', pageIndex);
                const guardOutSlot = materialSignatureSlot('sigMatGuardOut', pageIndex);
                const guardInSlot = materialSignatureSlot('sigMatGuardIn', pageIndex);
                const rowsHtml = pageItems.map(item => item
                    ? `<tr>
                        <td>${materialEscape(item.itemNo || '')}</td>
                        <td>${materialEscape(item.description)}</td>
                        <td class="text-center">${materialEscape(Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }))}</td>
                        <td class="text-center">${materialEscape(item.unit)}</td>
                    </tr>`
                    : '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>')
                    .join('');

                 return `
                    <section class="material-print-page" data-material-page="${pageIndex + 1}">
                        <!-- Brand Header (Centered relative to the entire page, shifted slightly left of the QR code) -->
                        <div class="material-form-header" style="display: flex; align-items: center; justify-content: center; text-align: center; gap: 2.5mm; min-height: 0; width: 100%; margin-bottom: 0.5mm; padding-right: 22mm;">
                            <div class="material-form-brand" style="display: flex; align-items: center; justify-content: center; gap: 2.5mm; min-width: 0;">
                                <img src="Frontend/Design/images/logo.png" alt="MPI Logo" style="width: 18mm; height: 8.5mm; object-fit: contain;">
                                <div class="text-left">
                                    <h1 style="margin: 0; font-size: 9px; font-weight: 800; line-height: 1.05; letter-spacing: 0.1px; white-space: nowrap;">MORIROKU PHILIPPINES, INC.</h1>
                                    <p style="margin: 0.5px 0 0; font-size: 4.6px; line-height: 1.05; color: #4b5563; white-space: nowrap;">115 North Science Avenue, Laguna Technopark 4024, Biñan, Laguna Philippines</p>
                                </div>
                            </div>
                        </div>

                        <!-- Centered Title -->
                        <h2 class="font-extrabold text-[9.5px] uppercase tracking-[0.5px] text-center w-full" style="margin: 0 0 1.2mm 0; padding: 0; font-size: 9.5px; line-height: 1; letter-spacing: 0.5px; text-align: center; padding-right: 22mm;">MATERIAL GATE PASS</h2>

                        <!-- Underlined Metadata Fields (Restricted width to avoid QR code) -->
                        <div class="grid grid-cols-12 gap-x-2 gap-y-1.5 text-[7px] leading-none mb-1.5 w-[74%]">
                            <div class="col-span-7 flex items-end">
                                <span class="font-semibold text-gray-500 w-[14%]">TO:</span>
                                <span class="border-b border-black flex-grow pl-1 font-bold">GUARD ON DUTY</span>
                            </div>
                            <div class="col-span-5 flex items-end">
                                <span class="font-semibold text-gray-500 w-[20%]">DATE:</span>
                                <span class="border-b border-black flex-grow pl-1 font-bold">${materialEscape(formDate)}</span>
                            </div>
                            <div class="col-span-7 flex items-end">
                                <span class="font-semibold text-gray-500 w-[14%]">FROM:</span>
                                <span class="border-b border-black flex-grow pl-1 font-bold">PERSONNEL &amp; ADMIN. SECTION</span>
                            </div>
                            <div class="col-span-5 flex items-end">
                                <span class="font-semibold text-gray-500 w-[20%]">PAGE:</span>
                                <span class="border-b border-black flex-grow pl-1 font-mono">${pageIndex + 1} OF ${pageCount}</span>
                            </div>
                        </div>

                        <!-- Absolutely Positioned QR Code + Control Details -->
                        <div class="absolute material-front-qr-panel flex flex-col items-center justify-start text-center" style="top: 2mm; right: 3mm; width: 31mm; z-index: 10;">
                            <div class="materialQrCodeDisplay mb-0.5 flex items-center justify-center" style="width: 24mm; height: 24mm;"></div>
                            <div class="material-front-qr-control">Control No.: ${materialEscape(controlNo)}</div>
                            <div class="material-front-qr-scan">To Scan: ${formatScanControlNo(pass)}</div>
                        </div>

                                <!-- Underlined Authorization Statement (Canva Layout) -->
                                <div class="flex flex-col text-[7px]" style="margin-top: 1mm; gap: 0.8mm; line-height: 1; width: calc(100% - 35mm);">
                                    <div class="flex items-end w-full">
                                        <span class="whitespace-nowrap text-gray-500 font-semibold mr-1">This is to allow Mr. / Ms.</span>
                                        <span class="border-b border-black font-bold flex-grow text-center pb-0.5">${materialEscape(pass.authorizedEmployeeName || 'N/A')}</span>
                                    </div>
                                    <div class="flex items-end w-full">
                                        <span class="whitespace-nowrap text-gray-500 font-semibold mr-1">of</span>
                                        <span class="border-b border-black font-bold flex-grow text-center pb-0.5">${materialEscape(pass.authorizedDepartmentName || pass.userDept || 'N/A')}</span>
                                        <span class="whitespace-nowrap text-gray-500 font-semibold ml-1">to bring out the following items.</span>
                                    </div>
                                    ${(() => { const extra = getAssociateNames(pass).slice(1); return extra.length ? `<div class="flex items-start w-full"><span class="whitespace-nowrap text-gray-500 font-semibold mr-1">with</span><div class="material-associates-extra flex-grow">${renderCompactAssociateNames(extra)}</div></div>` : ''; })()}
                                </div>
                            </div>

                        <table class="material-items-table material-front-table">
                            <thead>
                                <tr class="bg-gray-100 font-bold border-b border-gray-900" style="background-color: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                                    <th class="border border-gray-900 p-0.5 w-[15%] text-center">ITEM NO.</th>
                                    <th class="border border-gray-900 p-0.5 w-[55%]">DESCRIPTION</th>
                                    <th class="border border-gray-900 p-0.5 w-[15%] text-center">QUANTITY</th>
                                    <th class="border border-gray-900 p-0.5 w-[15%] text-center">UNIT</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>

                        <!-- Underlined Remarks -->
                        <div class="flex items-end text-[7px] leading-tight" style="margin-top: 1.5mm; margin-bottom: 1.5mm;">
                            <span class="font-bold text-gray-800 mr-2">REMARKS:</span>
                            <span class="border-b border-gray-400 flex-grow pl-1 font-bold pb-0.5">${materialEscape(pass.materialRemarks || '—')}</span>
                        </div>

                        <div class="material-form-signatures" style="margin-top: 2mm;">
                            <div>
                                <strong>Prepared By:</strong>
                                <div ${prepared.imageAttribute} class="material-signature-image"></div>
                                <span ${prepared.nameAttribute}></span>
                            </div>
                            <div>
                                <strong>Noted By:</strong>
                                <div ${superior.imageAttribute} class="material-signature-image"></div>
                                <span ${superior.nameAttribute}></span>
                                <small>Immediate Superior</small>
                            </div>
                            <div>
                                <strong>Approved By:</strong>
                                <div ${pas.imageAttribute} class="material-signature-image"></div>
                                <span ${pas.nameAttribute}></span>
                                <small>Personnel &amp; Admin Section</small>
                            </div>
                        </div>

                        <!-- GUARD TRACKING ROW FOR MATERIAL -->
                        <div class="guard-status-row ${shouldShowGuardStatusRow(pass) ? 'grid' : 'hidden'}" style="display: grid; grid-template-columns: 1.15fr 1.15fr 0.7fr; gap: 4mm; margin-top: 2.2mm; align-items: center; width: 100%;">
                            <div style="display: flex; align-items: center; gap: 1.5mm; min-width: 0; width: 100%;">
                                <strong style="font-size: 7px; color: #4b5563; font-weight: 700; white-space: nowrap; text-transform: uppercase;">ACTUAL OUT</strong>
                                <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; min-width: 0;">
                                    <div class="sig-wrapper sig-mat-guard-out guard-scan-sig" ${guardOutSlot.imageAttribute} style="height: 9.5mm; display: flex; align-items: end; justify-content: center; width: 100%;"></div>
                                    <span class="guard-scan-time vActOut" style="display: block; text-align: center; font-size: 7px; font-weight: 700; min-height: 3.5mm; line-height: 1;">${matSafeTime(pass.actualOut)}</span>
                                    <div style="width: 100%; border-top: 1px solid #111827; margin-top: 0.2mm; margin-bottom: 0.2mm;"></div>
                                    <small class="name sig-mat-guard-out-name guard-scan-name" ${guardOutSlot.nameAttribute} style="display: block; text-align: center; font-size: 5.4px; color: #4b5563; font-weight: bold; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${materialEscape(getGuardScanName(pass, 'TIME_OUT')) || 'Guard'}</small>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 1.5mm; min-width: 0; width: 100%;">
                                <strong style="font-size: 7px; color: #4b5563; font-weight: 700; white-space: nowrap; text-transform: uppercase;">ACTUAL IN</strong>
                                <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; min-width: 0;">
                                    <div class="sig-wrapper sig-mat-guard-in guard-scan-sig" ${guardInSlot.imageAttribute} style="height: 9.5mm; display: flex; align-items: end; justify-content: center; width: 100%;"></div>
                                    <span class="guard-scan-time vActIn" style="display: block; text-align: center; font-size: 7px; font-weight: 700; min-height: 3.5mm; line-height: 1;">${matSafeTime(pass.actualIn)}</span>
                                    <div style="width: 100%; border-top: 1px solid #111827; margin-top: 0.2mm; margin-bottom: 0.2mm;"></div>
                                    <small class="name sig-mat-guard-in-name guard-scan-name" ${guardInSlot.nameAttribute} style="display: block; text-align: center; font-size: 5.4px; color: #4b5563; font-weight: bold; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${materialEscape(getGuardScanName(pass, 'TIME_IN')) || 'Guard'}</small>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 1.5mm; min-width: 0; justify-content: flex-start;">
                                <strong style="font-size: 7px; color: #4b5563; font-weight: 700; white-space: nowrap; text-transform: uppercase;">REMARKS</strong>
                                <div class="${getDocumentStatusBadgeClass(pass.status)} vGuardRemarks" style="font-size: 7.5px; font-weight: 800; padding: 1px 4.5px;">${materialEscape(getGuardRemarksText(pass))}</div>
                            </div>
                        </div>

                        <div class="material-page-number">Page ${pageIndex + 1} of ${pageCount}</div>
                    </section>`;
            }).join('');

            let qrText = '';
            const isApprovedOrPast = ['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(pass.status);
            if (isApprovedOrPast) {
                try {
                    qrText = await loadQrToken(pass);
                } catch {
                    qrText = '';
                }
            }

            const qrContainers = container.querySelectorAll('.materialQrCodeDisplay');
            if (qrContainers.length > 0 && isApprovedOrPast && qrText && typeof QRCode === 'function') {
                qrContainers.forEach(qc => {
                    qc.innerHTML = '';
                    new QRCode(qc, {
                        text: qrText,
                        width: 150,
                        height: 150
                    });
                });
            } else if (qrContainers.length > 0) {
                qrContainers.forEach(qc => {
                    qc.innerHTML = '<span class="text-[6px] text-gray-400">Not Approved</span>';
                });
            }
        }

function syncMaterialSignatureCopies(idPrefix) {
            const sourceImage = document.getElementById(idPrefix);
            const sourceName = document.getElementById(idPrefix + 'Name');
            document.querySelectorAll(
                `[data-material-signature-copy="${idPrefix}"]`
            ).forEach(target => {
                target.innerHTML = sourceImage?.innerHTML || '';
            });
            document.querySelectorAll(
                `[data-material-signature-name-copy="${idPrefix}"]`
            ).forEach(target => {
                target.innerText = sourceName?.innerText || '';
                target.classList.toggle(
                    'hidden',
                    sourceName?.classList.contains('hidden') !== false
                );
            });
        }

function renderDigitalView(p) {
            const area = document.getElementById('digitalViewArea');
            if (!area) return;
            const isMaterial = p.formTypeCode === 'MATERIAL_GATE_PASS';
            const esc = escapeDocumentText;

            const fieldRow = (label, value) =>
                `<div class="digital-field">`
                + `<div class="digital-field-label">${esc(label)}</div>`
                + `<div class="digital-field-value">${value === '' || value === null || value === undefined ? '<span class="digital-field-empty">N/A</span>' : esc(value)}</div>`
                + `</div>`;

            // Vehicle / driver display (mirrors printable population in viewPass).
            let vehicleString = 'N/A';
            let driverString = 'N/A';
            if (p.vehicle) {
                vehicleString = p.vehicle.id === 'MANUAL'
                    ? p.vehicle.name
                    : `${p.vehicle.name} [${p.vehicle.plate}]`;
                driverString = p.vehicle.driver || 'N/A';
            }

            // Decision / approval remarks gathered from approval steps (rejection/hold comments).
            const decisionRemarks = (p.approvalSteps || [])
                .filter(step => step && step.comments && String(step.comments).trim())
                .map(step => {
                    const who = step.approverName || step.approvalStepCode || 'Approver';
                    const verdict = step.approvalStatusCode === 'REJECTED'
                        ? 'Rejected'
                        : (step.approvalStatusCode === 'ON_HOLD' ? 'On Hold' : 'Note');
                    return `<li><span class="font-semibold">${esc(who)} (${esc(verdict)}):</span> ${esc(step.comments)}</li>`;
                })
                .join('');
            const guardRemarks = (typeof getGuardRemarksText === 'function') ? getGuardRemarksText(p) : '';

            const sections = [];

            // --- Header ---
            sections.push(
                `<div class="digital-view-header">`
                + `<h3 class="digital-view-title">${esc(p.formName || (isMaterial ? 'Material Gate Pass' : 'Person Gate Pass'))}</h3>`
                + `<span class="digital-view-status">${esc(p.status || '')}</span>`
                + `</div>`
            );

            // --- Core details ---
            const core = [];
            core.push(fieldRow('Control No.', p.controlNo));
            core.push(fieldRow('Date Filed', p.dateFiled));
            core.push(fieldRow('Requested By', p.userName));
            if (p.userDept) core.push(fieldRow('Department', p.userDept));
            if (isMaterial) {
                core.push(fieldRow('Authorized Person', p.authorizedEmployeeName));
                core.push(fieldRow('Authorized Department', p.authorizedDepartmentName || p.userDept));
            } else {
                core.push(fieldRow('Destination', p.destination));
                core.push(fieldRow('Purpose', p.purpose));
                core.push(fieldRow('From (Expected Out)', p.expectedOut));
                core.push(fieldRow('To (Expected In)', p.expectedIn));
                core.push(fieldRow('Will Return Today', p.willReturn ? 'Yes' : 'No'));
                core.push(fieldRow('Vehicle & Plate', vehicleString));
                core.push(fieldRow('Driver', driverString));
            }
            sections.push(`<div class="digital-field-grid">${core.join('')}</div>`);

            // --- Associates / Companions (full list, screen-only) ---
            // index 0 is the primary (requester for Person, authorized employee for
            // Material); show any additional companions so the complete list is always
            // readable here even when the printable form paginates them.
            const allAssociateNames = (typeof getAssociateNames === 'function') ? getAssociateNames(p) : [];
            const extraCompanions = allAssociateNames.slice(1);
            if (extraCompanions.length > 0) {
                const items = extraCompanions
                    .map(name => `<li>${esc(name)}</li>`)
                    .join('');
                sections.push(
                    `<div class="digital-subsection"><div class="digital-subsection-title">`
                    + `Additional Companions (${extraCompanions.length})</div>`
                    + `<ul class="digital-remarks-list">${items}</ul></div>`
                );
            }

            // --- Material items table ---
            if (isMaterial) {
                const items = p.materialItems || [];
                let itemsHtml;
                if (items.length) {
                    const rows = items.map((item, i) => `<tr>`
                        + `<td class="text-center">${esc(item.itemNo || (i + 1))}</td>`
                        + `<td>${esc(item.description)}</td>`
                        + `<td class="text-center">${esc(Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }))}</td>`
                        + `<td class="text-center">${esc(item.unit)}</td>`
                        + `</tr>`).join('');
                    itemsHtml = `<table class="digital-items-table"><thead><tr><th>Item No.</th><th>Description</th><th>Qty</th><th>Unit</th></tr></thead><tbody>${rows}</tbody></table>`;
                } else {
                    itemsHtml = `<p class="digital-field-empty">No items listed.</p>`;
                }
                sections.push(`<div class="digital-subsection"><div class="digital-subsection-title">Material Items</div>${itemsHtml}</div>`);
                sections.push(`<div class="digital-subsection">${fieldRow('Remarks', p.materialRemarks)}</div>`);
            }

            // --- Signatures summary ---
            const sigRows = [];
            if (p.signatures) {
                if (p.signatures.imm) sigRows.push(fieldRow(isMaterial ? 'Noted By (Immediate Superior)' : 'Approved By (Immediate Superior)', p.signatures.imm.name));
                if (p.signatures.pres) sigRows.push(fieldRow('Approved By (President)', p.signatures.pres.name));
                if (p.signatures.pas) sigRows.push(fieldRow(isMaterial ? 'Approved By (PAS)' : 'Noted By (PAS)', p.signatures.pas.name));
            }
            if (sigRows.length) {
                sections.push(`<div class="digital-subsection"><div class="digital-subsection-title">Approvals</div><div class="digital-field-grid">${sigRows.join('')}</div></div>`);
            }

            // --- Guard scan summary ---
            if (p.actualOut || p.actualIn) {
                const guardRows = [];
                if (p.actualOut) guardRows.push(fieldRow('Actual Time Out', p.actualOut));
                if (p.actualIn) guardRows.push(fieldRow('Actual Time In', p.actualIn));
                if (guardRemarks) guardRows.push(fieldRow('Guard Remarks', guardRemarks));
                sections.push(`<div class="digital-subsection"><div class="digital-subsection-title">Gate Scan</div><div class="digital-field-grid">${guardRows.join('')}</div></div>`);
            }

            // --- Decision remarks ---
            if (decisionRemarks) {
                sections.push(`<div class="digital-subsection"><div class="digital-subsection-title">Decision Remarks</div><ul class="digital-remarks-list">${decisionRemarks}</ul></div>`);
            }

            area.innerHTML = sections.join('');
            // Proof photos are shown in #materialProofsGallery (rendered separately in viewPass)
            // which setDocumentViewMode already hides in form view. No rendering needed here.
        }

async function viewPass(id, isReviewing = false) {
            let p;
            try {
                p = await getGatePassDetail(id);
            } catch (error) {
                showToast(error instanceof ApiError ? error.message : 'Unable to load document.', 'error');
                return;
            }
            if(!p) return;
            if (isFinishedDocumentStatus(p.status) ||
                (currentUser?.role === 'Security' &&
                    isReviewing &&
                    !isSecurityScanActionableStatus(p.status))) {
                isReviewing = false;
            }
            currentViewedPassId = getGatePassViewKey(p);

            const setVal = (elemId, val) => {
                const el = document.getElementById(elemId);
                if (el) el.innerText = val;
            };

            const isMaterial =
                p.formTypeCode === 'MATERIAL_GATE_PASS';
            const printableArea = document.getElementById('printableArea');
            document.getElementById('printableArea')?.classList.toggle(
                'hidden',
                isMaterial
            );
            document.getElementById('materialPrintableArea')?.classList.toggle(
                'hidden',
                !isMaterial
            );
            printableArea?.classList.toggle('person-print-form', !isMaterial);
            // Mark which printable layout this document uses so the view-mode toggle can restore it.
            const materialPrintableAreaEl = document.getElementById('materialPrintableArea');
            if (materialPrintableAreaEl) {
                if (isMaterial) delete materialPrintableAreaEl.dataset.docEmpty;
                else materialPrintableAreaEl.dataset.docEmpty = '1';
            }

            const compactPersonDateFiled = (value) => {
                if (!value) return 'N/A';
                const textValue = String(value).trim();
                const textualDateMatch = textValue.match(/^([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/);
                if (textualDateMatch) return textualDateMatch[1];
                const parsed = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
                if (Number.isNaN(parsed.getTime())) {
                    const isoDateMatch = textValue.match(/^(\d{4}-\d{2}-\d{2})/);
                    return isoDateMatch ? isoDateMatch[1] : textValue;
                }
                return parsed.toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            };

            const printableControlNo = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return '';
                if (/^(GP-ID|TEMP|TMP|ID)-/i.test(raw)) return '';
                return raw.length > 20 ? raw.slice(0, 20) : raw;
            };

            setVal('vDateF', isMaterial ? p.dateFiled : compactPersonDateFiled(p.dateFiled));
            setVal('vControlNo', printableControlNo(p.controlNo));
            const viewAssociateNames = getAssociateNames(p);
            setVal('vName', viewAssociateNames[0] || p.userName);
            const vAssocExtra = document.getElementById('vAssociatesExtra');
            if (vAssocExtra) vAssocExtra.innerHTML = renderCompactAssociateNames(viewAssociateNames.slice(1));
            setVal('vDest', p.destination);
            setVal('vPurp', p.purpose);
            setVal('vExpOut', p.expectedOut);
            setVal('vExpInLabel', p.expectedIn);
            setVal('vReturn', p.willReturn ? 'Yes' : 'No');

            // Format vehicle rendering
            let vehicleString = 'N/A';
            if (p.vehicle) {
                if (p.vehicle.id === 'MANUAL') vehicleString = p.vehicle.name;
                else vehicleString = `${p.vehicle.name} [${p.vehicle.plate}]`;
            }
            setVal('vDriver', p.vehicle ? p.vehicle.driver : 'N/A');
            setVal('vPlate', vehicleString);

            if (isMaterial) {
                await renderMaterialBundle(p);
            }

            // Signatures handling
            ['sigImm', 'sigPres', 'sigPAS', 'sigMatPrepared', 'sigMatSuperior', 'sigMatPas', 'sigMatGuardOut', 'sigMatGuardIn'].forEach(idPrefix => {
                const sigDiv = document.getElementById(idPrefix);
                const nameSpan = document.getElementById(idPrefix + 'Name');
                if(sigDiv) sigDiv.innerHTML = '';
                if(nameSpan) { nameSpan.innerText = ''; nameSpan.classList.add('hidden'); }
            });

            const handleSig = async (sigData, idPrefix) => {
                if(!sigData) return;
                const nameSpan = document.getElementById(idPrefix + 'Name');
                const sigDiv = document.getElementById(idPrefix);

                if(nameSpan) {
                    nameSpan.innerText = sigData.name;
                    nameSpan.classList.remove('hidden');
                }
                if (sigData.fileId && !sigData.img && isDatabaseSession()) {
                    try {
                        const blob = await ApiClient.blob(`/signatures/${sigData.fileId}`);
                        sigData.img = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                    } catch {
                        // Keep the digitally-signed fallback if the file is unavailable.
                    }
                }
                if(sigDiv) {
                    if(sigData.img) {
                        sigDiv.innerHTML = buildSignatureImgHtml(sigData.img, sigData.w, sigData.y);
                    }
                    else {
                        sigDiv.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 14px; color: blue;">Digitally Signed</span>`;
                    }
                }
                if (idPrefix.startsWith('sigMat')) {
                    syncMaterialSignatureCopies(idPrefix);
                }
            };

            await handleSig(p.signatures.imm, 'sigImm');
            await handleSig(p.signatures.pres, 'sigPres');
            await handleSig(p.signatures.pas, 'sigPAS');
            if (isMaterial) {
                await handleSig(p.signatures.imm, 'sigMatSuperior');
                await handleSig(p.signatures.pas, 'sigMatPas');

                const preparedSignature = p.preparedBySignatureFileId
                    ? {
                        name: p.userName,
                        fileId: p.preparedBySignatureFileId,
                        w: p.preparedBySignatureWidth || 100,
                        y: p.preparedBySignatureYOffset || 0
                    }
                    : null;
                if (preparedSignature) {
                    await handleSig(preparedSignature, 'sigMatPrepared');
                } else {
                    setVal('sigMatPreparedName', p.userName);
                    document.getElementById('sigMatPreparedName')?.classList.remove('hidden');
                    const preparedContainer = document.getElementById('sigMatPrepared');
                    if (preparedContainer) {
                        preparedContainer.innerHTML =
                            '<span style="font-family:serif;font-style:italic;font-size:11px;color:#155CA2;">Digitally Prepared</span>';
                    }
                    syncMaterialSignatureCopies('sigMatPrepared');
                }

                // LOAD GUARD SIGNATURES FOR MATERIAL
                const outGuardSignature = p.actualOutSignatureFileId
                    ? {
                        name: getGuardScanName(p, 'TIME_OUT'),
                        fileId: p.actualOutSignatureFileId,
                        w: p.actualOutSignatureWidth || 100,
                        y: p.actualOutSignatureYOffset || 0
                    }
                    : null;
                const inGuardSignature = p.actualInSignatureFileId
                    ? {
                        name: getGuardScanName(p, 'TIME_IN'),
                        fileId: p.actualInSignatureFileId,
                        w: p.actualInSignatureWidth || 100,
                        y: p.actualInSignatureYOffset || 0
                    }
                    : null;

                if (outGuardSignature) {
                    await handleSig(outGuardSignature, 'sigMatGuardOut');
                } else {
                    const outContainer = document.getElementById('sigMatGuardOut');
                    if (outContainer) outContainer.innerHTML = '';
                    const outName = document.getElementById('sigMatGuardOutName');
                    if (outName) {
                        outName.innerText = 'Guard';
                        outName.classList.remove('hidden');
                    }
                    syncMaterialSignatureCopies('sigMatGuardOut');
                }
                if (inGuardSignature) {
                    await handleSig(inGuardSignature, 'sigMatGuardIn');
                } else {
                    const inContainer = document.getElementById('sigMatGuardIn');
                    if (inContainer) inContainer.innerHTML = '';
                    const inName = document.getElementById('sigMatGuardInName');
                    if (inName) {
                        inName.innerText = 'Guard';
                        inName.classList.remove('hidden');
                    }
                    syncMaterialSignatureCopies('sigMatGuardIn');
                }
            }

            const qrContainer = document.getElementById('qrCodeDisplay');
            const qrBackContainer = document.querySelector('.qrCodeBackDisplay');
            const qrBackPage = document.querySelector('.qr-back-page');
            const gpIdTextDisplay = document.querySelector('.gp-id-text-display');
            const controlNoQR = document.getElementById('vControlNoQR');
            const scanTextQR = document.getElementById('vScanTextQR');

            if (controlNoQR) controlNoQR.innerText = '';
            if (scanTextQR) scanTextQR.innerText = '';

            if (gpIdTextDisplay) {
                const scanControlNo = formatScanControlNo(p);
                gpIdTextDisplay.innerHTML = scanControlNo
                    ? `To Scan: <strong>${scanControlNo}</strong>`
                    : '';
            }

            if(qrContainer) {
                qrContainer.innerHTML = '';
                if (qrBackContainer) qrBackContainer.innerHTML = '';
                const controlNoDisplay = document.querySelector('.control-no-display');
                if (controlNoDisplay) {
                    controlNoDisplay.innerHTML = p.controlNo
                        ? `Control No.: <strong>${escapeDocumentText(p.controlNo)}</strong>`
                        : '';
                }

                const isApprovedOrPast = ['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status);

                if (qrBackPage) {
                    if (isApprovedOrPast && isMaterial) {
                        qrBackPage.classList.remove('hidden');
                        qrBackPage.style.display = 'flex';
                    } else {
                        qrBackPage.classList.add('hidden');
                        qrBackPage.style.display = 'none';
                    }
                }

                if (!isMaterial && isApprovedOrPast) {
                    if (controlNoQR) {
                        controlNoQR.innerHTML = p.controlNo
                            ? `Control No.: <strong>${escapeDocumentText(printableControlNo(p.controlNo))}</strong>`
                            : '';
                    }
                    if (scanTextQR) {
                        const scanControlNo = formatScanControlNo(p);
                        scanTextQR.innerHTML = scanControlNo
                            ? `To Scan: <strong>${scanControlNo}</strong>`
                            : '';
                    }

                    try {
                        const qrValue = await loadQrToken(p);
                        if (qrValue && typeof QRCode === 'function') {
                            new QRCode(qrContainer, {
                                text: String(qrValue),
                                width: 80,
                                height: 80
                            });
                        }
                    } catch {
                        qrContainer.innerHTML = '<span class="text-[8px] text-gray-400">QR unavailable</span>';
                    }
                }
            }

            // System Admin Progress Tracker
            const wf = document.getElementById('workflowTracker');
            if (currentUser.role === 'System Admin' || ['President','Immediate Superior','PAS Noter','PAS / HR Admin'].includes(currentUser.role)) {
                wf.classList.remove('hidden');
                let stepsHTML = '';

                const hasImm = p.signatures.imm ? 'text-green-600 font-bold' : 'text-gray-400';
                const hasPres = p.signatures.pres ? 'text-green-600 font-bold' : 'text-gray-400';
                const hasPAS = p.signatures.pas ? 'text-green-600 font-bold' : 'text-gray-400';
                const reqPres = !isMaterial && p.requiresPresidentApproval === true;

                const reqSuperior = p.requiresSuperiorApproval !== false;
                let stepNo = 1;

                if (reqSuperior) {
                    stepsHTML += `<span class="${hasImm}"><i class="fas ${p.signatures.imm ? 'fa-check-circle' : 'fa-circle'}"></i> ${stepNo++}. Supervisor</span>`;
                    stepsHTML += ` <i class="fas fa-chevron-right text-gray-300 mx-2"></i> `;
                }

                if (reqPres) {
                    stepsHTML += `<span class="${hasPres}"><i class="fas ${p.signatures.pres ? 'fa-check-circle' : 'fa-circle'}"></i> ${stepNo++}. President</span>`;
                    stepsHTML += ` <i class="fas fa-chevron-right text-gray-300 mx-2"></i> `;
                }
                stepsHTML += `<span class="${hasPAS}"><i class="fas ${p.signatures.pas ? 'fa-check-circle' : 'fa-circle'}"></i> ${stepNo}. ${isMaterial ? 'PAS Approval' : 'PAS'}</span>`;

                document.getElementById('workflowSteps').innerHTML = stepsHTML;
            } else {
                wf.classList.add('hidden');
            }

            // Decision Remarks / Feedback (rejection reason + per-step comments)
            renderDecisionRemarks(p);

            resetDocumentModalLayout();

            // Populate Photo Proofs for Material Gate Pass
            const galleryDiv = document.getElementById('materialProofsGallery');
            const listDiv = document.getElementById('materialProofsList');
            if (galleryDiv && listDiv) {
                galleryDiv.classList.add('hidden');
                listDiv.innerHTML = '';
                
                if (isMaterial && p.proofFileIds && p.proofFileIds.length > 0) {
                    galleryDiv.classList.remove('hidden');
                    p.proofFileIds.forEach((fileId, i) => {
                        const col = document.createElement('div');
                        col.className = 'relative rounded-lg overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center min-h-[160px] cursor-pointer hover:shadow transition';
                        col.innerHTML = `
                            <div class="text-xs text-slate-400 font-semibold"><i class="fas fa-spinner fa-spin mr-1"></i>Loading Photo ${i+1}...</div>
                        `;
                        listDiv.appendChild(col);

                        // Async fetch photo
                        ApiClient.blob(`/signatures/${fileId}`).then(blob => {
                            const reader = new FileReader();
                            reader.onload = function(e) {
                                col.innerHTML = `<img src="${e.target.result}" class="w-full h-full object-cover max-h-[220px]" onclick="viewFullScreenImage('${e.target.result.replace(/'/g, "\\'")}')">`;
                            };
                            reader.readAsDataURL(blob);
                        }).catch(() => {
                            col.innerHTML = `<div class="text-xs text-red-500 font-semibold p-4 text-center"><i class="fas fa-exclamation-circle mr-1"></i>Failed to load photo</div>`;
                        });
                    });
                }
                // Track whether this document has proof photos so the view toggle keeps the gallery hidden when empty.
                if (isMaterial && p.proofFileIds && p.proofFileIds.length > 0) {
                    delete galleryDiv.dataset.noProofs;
                } else {
                    galleryDiv.dataset.noProofs = '1';
                }
            }

            // Render the read-only Digital view but default to the Printable Form tab (Bug 3).
            renderDigitalView(p);
            setDocumentViewMode('form');

            const modal = document.getElementById('printModal');
            if(modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    const content = document.getElementById('printModalContent');
                    if(content) {
                        content.classList.remove('scale-95');
                        content.classList.add('scale-100');
                    }
                }, 10);
            }

            // ACTION AREA & DEFAULT SIGNATURE LOADING
            const actionArea = document.getElementById('approvalActionArea');
            const approvalSignatureEditor = document.getElementById('approvalSignatureEditor');
            const btnApprove = document.getElementById('approveRequestButton');
            const btnReject = document.querySelector('button[onclick="rejectCurrentPass()"]');

            if(actionArea) {
                const btnPrintForm = document.getElementById('btnPrintForm');
                if(btnPrintForm) {
                    if(currentUser.role === 'Security') btnPrintForm.classList.add('hidden');
                    else btnPrintForm.classList.remove('hidden');
                }

                const vActOut = document.getElementById('vActOut');
                const vActIn = document.getElementById('vActIn');
                const vActOutGuardName = document.getElementById('vActOutGuardName');
                const vActInGuardName = document.getElementById('vActInGuardName');
                const vGuardRemarks = document.getElementById('vGuardRemarks');
                const guardStatusRow = document.getElementById('guardStatusRow');

                if (vActOut && vActIn && vGuardRemarks && guardStatusRow) {
                    if (p.actualOut || p.actualIn || ['Approved', 'Outside', 'Returned', 'Overdue', 'Closed'].includes(p.status)) {
                        const safeFormatTime = (ts) => {
                            if (!ts) return '';
                            if (typeof ts === 'string' && ts.includes(':') && !ts.includes('-')) return ts;
                            const d = new Date(ts);
                            if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
                            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        };
                        guardStatusRow.classList.remove('hidden');
                        vActOut.innerText = safeFormatTime(p.actualOut);
                        vActIn.innerText = safeFormatTime(p.actualIn);
                        if (vActOutGuardName) vActOutGuardName.innerText = getGuardScanName(p, 'TIME_OUT');
                        if (vActInGuardName) vActInGuardName.innerText = getGuardScanName(p, 'TIME_IN');

                        const vOutSig = document.getElementById('vActOutSignature');
                        const vInSig = document.getElementById('vActInSignature');
                        const renderGuardSig = async (fileId, containerEl) => {
                            if (!containerEl) return;
                            containerEl.innerHTML = '';
                            if (!fileId) return;
                            try {
                                const metadataResponse = await ApiClient.get(`/signatures/${fileId}/metadata`);
                                const blob = await ApiClient.blob(`/signatures/${fileId}`);
                                const imgUrl = await new Promise((resolve) => {
                                    const reader = new FileReader();
                                    reader.onload = () => resolve(reader.result);
                                    reader.readAsDataURL(blob);
                                });
                                containerEl.innerHTML = buildSignatureImgHtml(
                                    imgUrl,
                                    metadataResponse.widthPercent,
                                    metadataResponse.yOffset,
                                    { className: 'transition-all duration-300' }
                                );
                            } catch {
                                containerEl.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 8px; color: blue;">Signed</span>`;
                            }
                        };
                        if (vOutSig) await renderGuardSig(p.actualOutSignatureFileId, vOutSig);
                        if (vInSig) await renderGuardSig(p.actualInSignatureFileId, vInSig);

                        vGuardRemarks.innerText = getGuardRemarksText(p);
                        if (['Returned', 'Closed', 'Approved'].includes(p.status)) {
                            vGuardRemarks.classList.remove('bg-gray-200', 'text-gray-600', 'bg-blue-100', 'text-mpiBlue');
                            vGuardRemarks.classList.add('bg-green-100', 'text-green-800');
                        } else if (['Outside', 'Overdue'].includes(p.status)) {
                            vGuardRemarks.classList.remove('bg-gray-200', 'text-gray-600', 'bg-green-100', 'text-green-800');
                            vGuardRemarks.classList.add('bg-blue-100', 'text-mpiBlue');
                        } else {
                            vGuardRemarks.classList.add('bg-gray-200', 'text-gray-600');
                            vGuardRemarks.classList.remove('bg-green-100', 'text-green-800', 'bg-blue-100', 'text-mpiBlue');
                        }
                    } else {
                        guardStatusRow.classList.add('hidden');
                    }
                }

                if(isReviewing) {
                    document.getElementById('printModalContent')?.classList.add('is-reviewing');
                    actionArea.style.display = 'flex';

                    if (currentUser.role === 'Security') {
                        approvalSignatureEditor?.classList.remove('hidden');
                        if (btnApprove) {
                            if (p.status === 'Approved' || p.status === 'Overdue') {
                                btnApprove.innerHTML = '<i class="fas fa-sign-out-alt mr-1"></i> Confirm Time Out';
                            } else if (p.status === 'Outside') {
                                btnApprove.innerHTML = '<i class="fas fa-sign-in-alt mr-1"></i> Confirm Time In';
                            }
                            btnApprove.onclick = async () => {
                                btnApprove.disabled = true;
                                try {
                                    let sigId = null;
                                    if (currentUploadedSig) {
                                        const signature = await window.uploadCurrentSignature();
                                        sigId = signature?.signatureFileId || null;
                                    }
                                    await window.executeSecurityScan(p.controlNo, sigId);
                                    forceCloseModal();
                                } catch (err) {
                                    showToast('Error uploading signature: ' + err.message, 'error');
                                } finally {
                                    btnApprove.disabled = false;
                                }
                            };
                        }
                        if (btnReject) btnReject.classList.add('hidden');
                        resetApprovalSignatureComposer();
                        showSignatureSource('upload');
                    } else {
                        const hradArea = document.getElementById('hradAssignmentArea');
                        const holdBtn = document.getElementById('holdRequestButton');

                        if (p.status === 'Pending HRAD Assignment' || p.status === 'On Hold') {
                            // Bug 5: HRAD vehicle-schedule approval (Ms Rox / Ms Joy) has no signature step
                            // — the drawn signature was never saved, so the panel is hidden here.
                            approvalSignatureEditor?.classList.add('hidden');
                            if (hradArea) {
                                hradArea.classList.remove('hidden');
                                hradArea.classList.add('flex');

                                const scheduleSpan = document.getElementById('hradRequestedSchedule');
                                if (scheduleSpan) {
                                    scheduleSpan.innerText = `${p.expectedOut || 'N/A'}${p.expectedIn && p.expectedIn !== 'N/A' ? ` - ${p.expectedIn}` : ''}`;
                                }
                                const tripTypeSpan = document.getElementById('hradRequestedTripType');
                                if (tripTypeSpan) {
                                    tripTypeSpan.innerText = hradTripTypeLabel(
                                        p.vehicleTripTypeCode ||
                                        p.tripTypeCode ||
                                        getAllowedHradTripTypes(p)[0]
                                    );
                                }
                                setHradScheduleInputsFromPass(p);

                                const vSelect = document.getElementById('hradAssignVehicle');
                                if (vSelect) {
                                    vSelect.innerHTML = '<option value="">Select Vehicle</option>';
                                    (databaseVehicles || []).forEach(v => {
                                        const availability = getVehicleAvailabilityLabel(v, p);
                                        vSelect.innerHTML += `<option value="${materialEscape(v.id)}">${materialEscape(v.name)} (${materialEscape(v.plate)}) — ${materialEscape(availability)}</option>`;
                                    });
                                    if (p.vehicle?.id) vSelect.value = p.vehicle.id;
                                }

                                populateHradAssignDrivers(p.vehicle?.id, p);
                                updateHradAssignmentSummary(p);
                            }
                            if (holdBtn) {
                                const isHradUser = currentUser && (currentUser.id === 'GA120' || currentUser.id === 'GA139');
                                if (isHradUser) {
                                    holdBtn.classList.remove('hidden');
                                } else {
                                    holdBtn.classList.add('hidden');
                                }
                            }
                            if (btnApprove) {
                                btnApprove.innerHTML = '<i class="fas fa-arrow-right mr-1"></i> Assign & Forward';
                                btnApprove.onclick = approveCurrentPass;
                            }
                        } else {
                            // Regular approval flow keeps the digital signature step.
                            approvalSignatureEditor?.classList.remove('hidden');
                            if (hradArea) {
                                hradArea.classList.add('hidden');
                                hradArea.classList.remove('flex');
                            }
                            setHradScheduleInputsFromPass(null);
                            if (holdBtn) holdBtn.classList.add('hidden');
                            if (btnApprove) {
                                btnApprove.innerHTML = '<i class="fas fa-check-circle mr-1"></i> Approve Request';
                                btnApprove.onclick = approveCurrentPass;
                            }
                        }
                        if (btnReject) btnReject.classList.remove('hidden');
                        resetApprovalSignatureComposer();
                        showSignatureSource('upload');
                    }

                    // PRE-FILL USERNAME FOR TRUE LIVE PREVIEW ALIGNMENT
                    let targetContainerId = null;
                    if (currentUser.role === 'Security') {
                        if (p.status === 'Approved' || p.status === 'Overdue') {
                            targetContainerId = isMaterial ? 'sigMatGuardOut' : 'vActOutSignature';
                        } else if (p.status === 'Outside') {
                            targetContainerId = isMaterial ? 'sigMatGuardIn' : 'vActInSignature';
                        }
                    } else {
                        if (p.status === 'Pending Superior') {
                            targetContainerId = isMaterial ? 'sigMatSuperior' : 'sigImm';
                        } else if (p.status === 'Pending President') {
                            targetContainerId = 'sigPres';
                        } else if (p.status === 'Pending PAS') {
                            targetContainerId = isMaterial ? 'sigMatPas' : 'sigPAS';
                        }
                    }

                    if (targetContainerId) {
                        let nameSpanId = targetContainerId + 'Name';
                        if (targetContainerId === 'vActOutSignature') nameSpanId = 'vActOutGuardName';
                        if (targetContainerId === 'vActInSignature') nameSpanId = 'vActInGuardName';
                        const nameSpan = document.getElementById(nameSpanId);
                        if (nameSpan) {
                            nameSpan.innerText = currentUser.name;
                            nameSpan.classList.remove('hidden');
                        }
                        if (targetContainerId.startsWith('sigMat')) {
                            syncMaterialSignatureCopies(targetContainerId);
                        }
                    }

                    const savedSignature = getSavedApprovalSignature(
                        currentUser,
                        p.formTypeCode
                    );
                    if (savedSignature) {
                        currentUploadedSig = savedSignature.img;
                        currentOriginalSignatureData = null;

                        renderSignatureImage(
                            currentUploadedSig,
                            clampSignatureWidth(savedSignature.w),
                            clampSignatureYOffset(savedSignature.y)
                        );

                        document.getElementById('sigSize').value = clampSignatureWidth(savedSignature.w);
                        document.getElementById('sigY').value = clampSignatureYOffset(savedSignature.y);

                        document.getElementById('sigBgOptions').classList.add('hidden');
                        document.getElementById('sigControls').classList.remove('hidden');
                        document.getElementById('saveDefaultSig').checked = true;
                        setSignatureStatus('Saved default signature loaded. Adjust size or upload/draw a replacement if needed.', 'success');
                    }
                } else {
                    document.getElementById('printModalContent')?.classList.remove('is-reviewing');
                    actionArea.style.display = 'none';
                    approvalSignatureEditor?.classList.add('hidden');
                    hideDecisionReasonComposer();
                }
            }
        }

function closeModal() {
            const modal = document.getElementById('printModal');
            modal.classList.add('opacity-0');
            document.getElementById('printModalContent').classList.remove('scale-100');
            document.getElementById('printModalContent').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                currentViewedPassId = null;
                resetApprovalSignatureComposer?.();
                resetDocumentModalLayout();
                hideDecisionRemarks();
                hideDecisionReasonComposer();
            }, 300);
        }

function forceCloseModal() {
            const modal = document.getElementById('printModal');
            const content = document.getElementById('printModalContent');
            if (!modal || !content) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex', 'opacity-0');
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
            currentViewedPassId = null;
            resetApprovalSignatureComposer?.();
            resetDocumentModalLayout();
            hideDecisionRemarks();
            hideDecisionReasonComposer();
        }

async function renderPersonGatePassClone(p) {
    const clone = document.getElementById('printableArea').cloneNode(true);
    clone.id = '';
    clone.classList.remove('hidden');
    clone.classList.add('multi-print-item');

    const setVal = (selector, val) => {
        const el = clone.querySelector(selector);
        if (el) el.innerText = val;
    };

    const compactPersonDateFiled = (value) => {
        if (!value) return 'N/A';
        const textValue = String(value).trim();
        const textualDateMatch = textValue.match(/^([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/);
        if (textualDateMatch) return textualDateMatch[1];
        const parsed = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
        if (Number.isNaN(parsed.getTime())) {
            const isoDateMatch = textValue.match(/^(\d{4}-\d{2}-\d{2})/);
            return isoDateMatch ? isoDateMatch[1] : textValue;
        }
        return parsed.toLocaleDateString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const printableControlNo = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^(GP-ID|TEMP|TMP|ID)-/i.test(raw)) return '';
        return raw.length > 20 ? raw.slice(0, 20) : raw;
    };

    setVal('#vDateF', p.formTypeCode === 'MATERIAL_GATE_PASS' ? p.dateFiled : compactPersonDateFiled(p.dateFiled));
    setVal('#vControlNo', printableControlNo(p.controlNo));
    const cloneAssociateNames = getAssociateNames(p);
    const clonePages = buildAssociateNamePages(cloneAssociateNames);
    // p._associatePageIndex (set by the batch builder when emitting overflow sheets)
    // selects which 5-name page this clone represents; defaults to the first page.
    const clonePage = clonePages[Number(p._associatePageIndex) || 0] || clonePages[0];
    setVal('#vName', clonePage.primary || p.userName);
    const cloneExtra = clone.querySelector('#vAssociatesExtra');
    if (cloneExtra) cloneExtra.innerHTML = renderCompactAssociateNames(clonePage.extra);
    clone.dataset.associatePages = String(clonePages.length);
    setVal('#vDest', p.destination);
    setVal('#vPurp', p.purpose);
    setVal('#vExpOut', p.expectedOut);
    setVal('#vExpInLabel', p.expectedIn);
    setVal('#vReturn', p.willReturn ? 'Yes' : 'No');

    let vehicleString = 'N/A';
    if (p.vehicle) {
        if (p.vehicle.id === 'MANUAL') vehicleString = p.vehicle.name;
        else vehicleString = `${p.vehicle.name} [${p.vehicle.plate}]`;
    }
    setVal('#vDriver', p.vehicle ? p.vehicle.driver : 'N/A');
    setVal('#vPlate', vehicleString);

    const handleSig = async (sigData, selector) => {
        const el = clone.querySelector(selector);
        const nameSpan = clone.querySelector(selector + 'Name');
        if (el) el.innerHTML = '';
        if (nameSpan) { nameSpan.innerText = ''; nameSpan.classList.add('hidden'); }
        if (!sigData) return;

        if (nameSpan) {
            nameSpan.innerText = sigData.name;
            nameSpan.classList.remove('hidden');
        }
        if (sigData.fileId && !sigData.img && isDatabaseSession()) {
            try {
                const blob = await ApiClient.blob(`/signatures/${sigData.fileId}`);
                sigData.img = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
            } catch {}
        }
        if (el) {
            if (sigData.img) {
                el.innerHTML = buildSignatureImgHtml(sigData.img, sigData.w, sigData.y);
            } else {
                el.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 14px; color: blue;">Digitally Signed</span>`;
            }
        }
    };

    await handleSig(p.signatures.imm, '#sigImm');
    await handleSig(p.signatures.pres, '#sigPres');
    await handleSig(p.signatures.pas, '#sigPAS');

    const guardRow = clone.querySelector('.guard-status-row');
    if (guardRow && ['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status)) {
        guardRow.classList.remove('hidden');
        // print:table-row is already applied in css via classes
        const vOut = clone.querySelector('.vActOut');
        const vIn = clone.querySelector('.vActIn');
        const vOutGuardName = clone.querySelector('.vActOutGuardName');
        const vInGuardName = clone.querySelector('.vActInGuardName');
        const vRem = clone.querySelector('.vGuardRemarks');

        const safeFormatTime = (ts) => {
            if (!ts) return '';
            if (typeof ts === 'string' && ts.includes(':') && !ts.includes('-')) return ts;
            const d = new Date(ts);
            if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '';
            return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        };
        if (vOut) vOut.innerText = safeFormatTime(p.actualOut);
        if (vIn) vIn.innerText = safeFormatTime(p.actualIn);
        if (vOutGuardName) vOutGuardName.innerText = getGuardScanName(p, 'TIME_OUT');
        if (vInGuardName) vInGuardName.innerText = getGuardScanName(p, 'TIME_IN');

        const vOutSig = clone.querySelector('.vActOutSignature');
        const vInSig = clone.querySelector('.vActInSignature');
        const renderGuardSig = async (fileId, containerEl) => {
            if (!containerEl) return;
            containerEl.innerHTML = '';
            if (!fileId) return;
            try {
                const metadataResponse = await ApiClient.get(`/signatures/${fileId}/metadata`);
                const blob = await ApiClient.blob(`/signatures/${fileId}`);
                const imgUrl = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result);
                    reader.readAsDataURL(blob);
                });
                containerEl.innerHTML = buildSignatureImgHtml(
                    imgUrl,
                    metadataResponse.widthPercent,
                    metadataResponse.yOffset,
                    { className: 'transition-all duration-300' }
                );
            } catch {
                containerEl.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 8px; color: blue;">Signed</span>`;
            }
        };
        if (vOutSig) await renderGuardSig(p.actualOutSignatureFileId, vOutSig);
        if (vInSig) await renderGuardSig(p.actualInSignatureFileId, vInSig);

        if (vRem) {
            vRem.innerText = getGuardRemarksText(p);
            vRem.className = ['Returned', 'Closed', 'Approved'].includes(p.status) ? 'bg-green-100 text-green-800 px-2 py-0.5 rounded font-bold text-[8px]' : (['Outside', 'Overdue'].includes(p.status) ? 'bg-blue-100 text-mpiBlue px-2 py-0.5 rounded font-bold text-[8px]' : 'bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-bold text-[8px]');
        }
    }

    const qrContainer = clone.querySelector('#qrCodeDisplay');
    const controlNoQR = clone.querySelector('#vControlNoQR');
    const scanTextQR = clone.querySelector('#vScanTextQR');
    const qrBackPage = clone.querySelector('.qr-back-page');

    if (qrBackPage) {
        qrBackPage.remove();
    }

    if (qrContainer) {
        qrContainer.innerHTML = '';

        if (['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status)) {
            if (controlNoQR) {
                controlNoQR.innerHTML = p.controlNo
                    ? `Control No.: <strong>${escapeDocumentText(printableControlNo(p.controlNo))}</strong>`
                    : '';
            }
            if (scanTextQR) {
                const scanControlNo = formatScanControlNo(p);
                scanTextQR.innerHTML = scanControlNo
                    ? `To Scan: <strong>${scanControlNo}</strong>`
                    : '';
            }

            try {
                const qrValue = await loadQrToken(p);
                if (qrValue && typeof QRCode === 'function') {
                    new QRCode(qrContainer, {
                        text: String(qrValue),
                        width: 80,
                        height: 80
                    });
                }
            } catch {}
        }
    }

    return clone;
}

async function renderMaterialGatePassClone(p) {
    const pages = [];
    const itemRows = [...(p.materialItems || [])];
    const pageCount = Math.max(1, Math.ceil(itemRows.length / 8));
    const formDate = p.formDate
        ? new Date(`${String(p.formDate).slice(0, 10)}T00:00:00`).toLocaleDateString()
        : p.dateFiled;
    const controlNo = String(p.controlNo || p.id || '').trim().slice(0, 20);
    const isApprovedOrPast = ['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status);
    let qrValue = '';
    if (isApprovedOrPast) {
        try {
            qrValue = await loadQrToken(p);
        } catch {
            qrValue = '';
        }
    }

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageItems = itemRows.slice(pageIndex * 8, pageIndex * 8 + 8);
        while (pageItems.length < 8) pageItems.push(null);

        const div = document.createElement('div');
        div.className = 'material-print-page multi-print-item';
        div.setAttribute('data-material-page', pageIndex + 1);

        const guardOutSlot = materialSignatureSlot('sigMatGuardOut', pageIndex);
        const guardInSlot = materialSignatureSlot('sigMatGuardIn', pageIndex);

        const rowsHtml = pageItems.map(item => item
            ? `<tr>
                <td>${materialEscape(item.itemNo || '')}</td>
                <td>${materialEscape(item.description)}</td>
                <td class="text-center">${materialEscape(Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }))}</td>
                <td class="text-center">${materialEscape(item.unit)}</td>
            </tr>`
            : '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>')
            .join('');

        div.innerHTML = `
            <!-- Brand Header (Centered relative to the entire page, shifted slightly left of the QR code) -->
            <div class="material-form-header" style="display: flex; align-items: center; justify-content: center; text-align: center; gap: 2.5mm; min-height: 0; width: 100%; margin-bottom: 0.5mm; padding-right: 22mm;">
                <div class="material-form-brand" style="display: flex; align-items: center; justify-content: center; gap: 2.5mm; min-width: 0;">
                    <img src="Frontend/Design/images/logo.png" alt="MPI Logo" style="width: 18mm; height: 8.5mm; object-fit: contain;">
                    <div class="text-left">
                        <h1 style="margin: 0; font-size: 9px; font-weight: 800; line-height: 1.05; letter-spacing: 0.1px; white-space: nowrap;">MORIROKU PHILIPPINES, INC.</h1>
                        <p style="margin: 0.5px 0 0; font-size: 4.6px; line-height: 1.05; color: #4b5563; white-space: nowrap;">115 North Science Avenue, Laguna Technopark 4024, Biñan, Laguna Philippines</p>
                    </div>
                </div>
            </div>

            <!-- Centered Title -->
            <h2 class="font-extrabold text-[9.5px] uppercase tracking-[0.5px] text-center w-full" style="margin: 0 0 1.2mm 0; padding: 0; font-size: 9.5px; line-height: 1; letter-spacing: 0.5px; text-align: center; padding-right: 22mm;">MATERIAL GATE PASS</h2>

            <!-- Underlined Metadata Fields (Restricted width to avoid QR code) -->
            <div class="grid grid-cols-12 gap-x-2 gap-y-1.5 text-[7px] leading-none mb-1.5 w-[74%]">
                <div class="col-span-7 flex items-end">
                    <span class="font-semibold text-gray-500 w-[14%]">TO:</span>
                    <span class="border-b border-black flex-grow pl-1 font-bold">GUARD ON DUTY</span>
                </div>
                <div class="col-span-5 flex items-end">
                    <span class="font-semibold text-gray-500 w-[20%]">DATE:</span>
                    <span class="border-b border-black flex-grow pl-1 font-bold">${materialEscape(formDate)}</span>
                </div>
                <div class="col-span-7 flex items-end">
                    <span class="font-semibold text-gray-500 w-[14%]">FROM:</span>
                    <span class="border-b border-black flex-grow pl-1 font-bold">PERSONNEL &amp; ADMIN. SECTION</span>
                </div>
                <div class="col-span-5 flex items-end">
                    <span class="font-semibold text-gray-500 w-[20%]">PAGE:</span>
                    <span class="border-b border-black flex-grow pl-1 font-mono">${pageIndex + 1} OF ${pageCount}</span>
                </div>
            </div>

            <!-- Absolutely Positioned QR Code + Control Details -->
            <div class="absolute material-front-qr-panel flex flex-col items-center justify-start text-center" style="top: 2mm; right: 3mm; width: 31mm; z-index: 10;">
                <div class="materialQrCodeDisplay mb-0.5 flex items-center justify-center" style="width: 24mm; height: 24mm;"></div>
                <div class="material-front-qr-control">Control No.: ${materialEscape(controlNo)}</div>
                <div class="material-front-qr-scan">To Scan: ${formatScanControlNo(p)}</div>
            </div>

            <!-- Underlined Authorization Statement (Canva Layout) -->
            <div class="flex flex-col text-[7px]" style="margin-top: 1mm; gap: 0.8mm; line-height: 1; width: calc(100% - 35mm);">
                <div class="flex items-end w-full">
                    <span class="whitespace-nowrap text-gray-500 font-semibold mr-1">This is to allow Mr. / Ms.</span>
                    <span class="border-b border-black font-bold flex-grow text-center pb-0.5">${materialEscape(p.authorizedEmployeeName || 'N/A')}</span>
                </div>
                <div class="flex items-end w-full">
                    <span class="whitespace-nowrap text-gray-500 font-semibold mr-1">of</span>
                    <span class="border-b border-black font-bold flex-grow text-center pb-0.5">${materialEscape(p.authorizedDepartmentName || p.userDept || 'N/A')}</span>
                    <span class="whitespace-nowrap text-gray-500 font-semibold ml-1">to bring out the following items:</span>
                </div>
                ${(() => { const extra = getAssociateNames(p).slice(1); return extra.length ? `<div class="flex items-start w-full"><span class="whitespace-nowrap text-gray-500 font-semibold mr-1">with</span><div class="material-associates-extra flex-grow">${renderCompactAssociateNames(extra)}</div></div>` : ''; })()}
            </div>

            <table class="w-full text-[9px] border-collapse border border-gray-900 mt-1 text-left material-items-table material-front-table">
                <thead>
                    <tr class="bg-gray-100 font-bold border-b border-gray-900" style="background-color: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                        <th class="border border-gray-900 p-1 w-[12%]">ITEM NO.</th>
                        <th class="border border-gray-900 p-1 w-[53%]">DESCRIPTION</th>
                        <th class="border border-gray-900 p-1 w-[18%] text-center">QUANTITY</th>
                        <th class="border border-gray-900 p-1 w-[17%] text-center">UNIT</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <!-- Underlined Remarks -->
            <div class="flex items-end text-[7px] leading-tight" style="margin-top: 1.2mm; margin-bottom: 1.1mm;">
                <span class="font-bold text-gray-800 mr-2">REMARKS:</span>
                <span class="border-b border-gray-400 flex-grow pl-1 font-bold pb-0.5">${materialEscape(p.materialRemarks || p.purpose || '—')}</span>
            </div>

            <div class="material-form-signatures pt-1" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; margin-top: 1.4mm; text-align: left; font-size: 6.4px; line-height: 1.05; border-top: 1px solid #111827;">
                <div style="position: relative; min-height: 13.2mm;">
                    <strong style="display: block; text-align: left; font-size: 7px;">Prepared By:</strong>
                    <div class="sig-wrapper sig-mat-prepared material-signature-image" style="height: 6.2mm; display: flex; align-items: end; justify-content: center; margin-bottom: 0.25mm;"></div>
                    <span class="name sig-mat-prepared-name" style="display: block; border-top: 1px solid #111827; border-bottom: none; padding-top: 0.25mm; text-align: center; font-size: 7.5px; font-weight: 700; text-transform: uppercase;"></span>
                </div>
                <div style="position: relative; min-height: 13.2mm;">
                    <strong style="display: block; text-align: left; font-size: 7px;">Noted By:</strong>
                    <div class="sig-wrapper sig-mat-superior material-signature-image" style="height: 6.2mm; display: flex; align-items: end; justify-content: center; margin-bottom: 0.25mm;"></div>
                    <span class="name sig-mat-superior-name" style="display: block; border-top: 1px solid #111827; border-bottom: none; padding-top: 0.25mm; text-align: center; font-size: 7.5px; font-weight: 700; text-transform: uppercase;"></span>
                    <small style="display: block; text-align: center; font-size: 5.4px; margin-top: 0.35mm;">Immediate Superior</small>
                </div>
                <div style="position: relative; min-height: 13.2mm;">
                    <strong style="display: block; text-align: left; font-size: 7px;">Approved By:</strong>
                    <div class="sig-wrapper sig-mat-pas material-signature-image" style="height: 6.2mm; display: flex; align-items: end; justify-content: center; margin-bottom: 0.25mm;"></div>
                    <span class="name sig-mat-pas-name" style="display: block; border-top: 1px solid #111827; border-bottom: none; padding-top: 0.25mm; text-align: center; font-size: 7.5px; font-weight: 700; text-transform: uppercase;"></span>
                    <small style="display: block; text-align: center; font-size: 5.4px; margin-top: 0.35mm;">Personnel &amp; Admin Section</small>
                </div>
            </div>

            <!-- GUARD TRACKING ROW FOR MATERIAL -->
            <div class="guard-status-row hidden" style="display: none; grid-template-columns: 1.15fr 1.15fr 0.7fr; gap: 4mm; margin-top: 2.2mm; align-items: center; width: 100%;">
                <div style="display: flex; align-items: center; gap: 1.5mm; min-width: 0; width: 100%;">
                    <strong style="font-size: 7px; color: #4b5563; font-weight: 700; white-space: nowrap; text-transform: uppercase;">ACTUAL OUT</strong>
                    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; min-width: 0;">
                        <div class="sig-wrapper sig-mat-guard-out guard-scan-sig" ${guardOutSlot.imageAttribute} style="height: 9.5mm; display: flex; align-items: end; justify-content: center; width: 100%;"></div>
                        <span class="guard-scan-time vActOut" style="display: block; text-align: center; font-size: 7px; font-weight: 700; min-height: 3.5mm; line-height: 1;"></span>
                        <div style="width: 100%; border-top: 1px solid #111827; margin-top: 0.2mm; margin-bottom: 0.2mm;"></div>
                        <small class="name sig-mat-guard-out-name guard-scan-name" ${guardOutSlot.nameAttribute} style="display: block; text-align: center; font-size: 5.4px; color: #4b5563; font-weight: bold; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></small>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1.5mm; min-width: 0; width: 100%;">
                    <strong style="font-size: 7px; color: #4b5563; font-weight: 700; white-space: nowrap; text-transform: uppercase;">ACTUAL IN</strong>
                    <div style="flex-grow: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; position: relative; min-width: 0;">
                        <div class="sig-wrapper sig-mat-guard-in guard-scan-sig" ${guardInSlot.imageAttribute} style="height: 9.5mm; display: flex; align-items: end; justify-content: center; width: 100%;"></div>
                        <span class="guard-scan-time vActIn" style="display: block; text-align: center; font-size: 7px; font-weight: 700; min-height: 3.5mm; line-height: 1;"></span>
                        <div style="width: 100%; border-top: 1px solid #111827; margin-top: 0.2mm; margin-bottom: 0.2mm;"></div>
                        <small class="name sig-mat-guard-in-name guard-scan-name" ${guardInSlot.nameAttribute} style="display: block; text-align: center; font-size: 5.4px; color: #4b5563; font-weight: bold; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"></small>
                    </div>
                </div>
                <div style="display: flex; align-items: center; gap: 1.5mm; min-width: 0; justify-content: flex-start;">
                    <strong style="font-size: 7px; color: #4b5563; font-weight: 700; white-space: nowrap; text-transform: uppercase;">REMARKS</strong>
                    <div class="vGuardRemarks document-status-badge status-badge-neutral" style="font-size: 7.5px; font-weight: 800; padding: 1px 4.5px;"></div>
                </div>
            </div>

            <div class="text-[7.5px] text-right text-gray-500 absolute bottom-1.5 right-3 leading-none select-none">Page ${pageIndex + 1} of ${pageCount}</div>
        `;

        const qrContainer = div.querySelector('.materialQrCodeDisplay');
        if (qrContainer && qrValue) {
            try {
                if (typeof QRCode === 'function') {
                    new QRCode(qrContainer, {
                        text: String(qrValue),
                        width: 150,
                        height: 150
                    });
                }
            } catch {}
        } else if (qrContainer) {
            qrContainer.innerHTML = '<span class="text-[6px] text-gray-400">Not Approved</span>';
        }

        const matGuardRow = div.querySelector('.guard-status-row');
        if (matGuardRow && shouldShowGuardStatusRow(p)) {
            matGuardRow.classList.remove('hidden');
            matGuardRow.style.display = 'grid';

            const vOut = div.querySelector('.vActOut');
            const vIn = div.querySelector('.vActIn');
            const vRem = div.querySelector('.vGuardRemarks');

            const safeFormatTime = (ts) => {
                if (!ts) return '—';
                if (typeof ts === 'string' && ts.includes(':') && !ts.includes('-')) return ts;
                const d = new Date(ts);
                if (isNaN(d.getTime()) || d.getFullYear() < 2000) return '—';
                return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
            };
            if (vOut) vOut.innerText = safeFormatTime(p.actualOut);
            if (vIn) vIn.innerText = safeFormatTime(p.actualIn);
            if (vRem) {
                vRem.innerText = getGuardRemarksText(p);
                vRem.className = `vGuardRemarks ${getDocumentStatusBadgeClass(p.status)}`;
            }
        }

        const outGuardSignature = p.actualOutSignatureFileId
            ? {
                name: getGuardScanName(p, 'TIME_OUT'),
                fileId: p.actualOutSignatureFileId,
                w: p.actualOutSignatureWidth || 100,
                y: p.actualOutSignatureYOffset || 0
            }
            : null;
        const inGuardSignature = p.actualInSignatureFileId
            ? {
                name: getGuardScanName(p, 'TIME_IN'),
                fileId: p.actualInSignatureFileId,
                w: p.actualInSignatureWidth || 100,
                y: p.actualInSignatureYOffset || 0
            }
            : null;

        if (outGuardSignature) {
            await handleSig(outGuardSignature, '.sig-mat-guard-out', '.sig-mat-guard-out-name');
        } else {
            const outWrapper = div.querySelector('.sig-mat-guard-out');
            if (outWrapper) outWrapper.innerHTML = '';
            const outName = div.querySelector('.sig-mat-guard-out-name');
            if (outName) outName.innerText = 'Guard';
        }
        if (inGuardSignature) {
            await handleSig(inGuardSignature, '.sig-mat-guard-in', '.sig-mat-guard-in-name');
        } else {
            const inWrapper = div.querySelector('.sig-mat-guard-in');
            if (inWrapper) inWrapper.innerHTML = '';
            const inName = div.querySelector('.sig-mat-guard-in-name');
            if (inName) inName.innerText = 'Guard';
        }

        async function handleSig(sigData, wrapperSelector, nameSelector) {
            const wrapperEls = div.querySelectorAll(wrapperSelector);
            const nameEls = div.querySelectorAll(nameSelector);

            nameEls.forEach(el => {
                if (sigData) {
                    el.innerText = sigData.name;
                    el.classList.remove('hidden');
                }
            });

            if (sigData && sigData.fileId && !sigData.img && isDatabaseSession()) {
                try {
                    const blob = await ApiClient.blob(`/signatures/${sigData.fileId}`);
                    sigData.img = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch {}
            }

            wrapperEls.forEach(el => {
                if (sigData) {
                    if (sigData.img) {
                        el.innerHTML = buildSignatureImgHtml(sigData.img, sigData.w, sigData.y);
                    } else {
                        el.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 11px; color: blue;">Digitally Signed</span>`;
                    }
                }
            });
        }

        await handleSig(p.signatures.imm, '.sig-mat-superior', '.sig-mat-superior-name');
        await handleSig(p.signatures.pas, '.sig-mat-pas', '.sig-mat-pas-name');

        const preparedSignature = p.preparedBySignatureFileId
            ? {
                name: p.userName,
                fileId: p.preparedBySignatureFileId,
                w: p.preparedBySignatureWidth || 100,
                y: p.preparedBySignatureYOffset || 0
            }
            : null;
        if (preparedSignature) {
            await handleSig(preparedSignature, '.sig-mat-prepared', '.sig-mat-prepared-name');
        } else {
            const preparedWrapper = div.querySelector('.sig-mat-prepared');
            if (preparedWrapper) {
                preparedWrapper.innerHTML = '<span style="font-family:serif;font-style:italic;font-size:11px;color:#155CA2;">Digitally Prepared</span>';
            }
        }

        pages.push(div);
    }

    return pages;
}

async function printSelectedLogs() {
    const checked = document.querySelectorAll('#adminLogsTable .log-checkbox:checked');
    const ids = Array.from(checked).map(cb => cb.getAttribute('data-id'));
    if (ids.length === 0) return;

    showToast(`Loading ${ids.length} document(s)...`, 'info');

    try {
        const multiContainer = document.getElementById('multiPrintableArea');
        if (!multiContainer) return;
        multiContainer.innerHTML = '';
        multiContainer.classList.remove('hidden');

        document.getElementById('printableArea')?.classList.add('hidden');
        document.getElementById('materialPrintableArea')?.classList.add('hidden');

        const pagesPairs = [];

        for (const id of ids) {
            const p = await getGatePassDetail(id);
            if (!p) continue;

            const isMaterial = p.formTypeCode === 'MATERIAL_GATE_PASS';
            if (isMaterial) {
                const pages = await renderMaterialGatePassClone(p);
                for (let i = 0; i < pages.length; i++) {
                    pagesPairs.push({ front: pages[i], back: null });
                }
            } else {
                // Phase 11 req5: paginate associates at 5 names per sheet; >5 spills
                // onto continuation A6 sheets. Common case (<=5) = exactly one sheet.
                const associatePages = (typeof buildAssociateNamePages === 'function')
                    ? Math.max(1, buildAssociateNamePages(getAssociateNames(p)).length)
                    : 1;
                for (let ap = 0; ap < associatePages; ap++) {
                    p._associatePageIndex = ap;
                    const front = await renderPersonGatePassClone(p);
                    // Only the first sheet carries the QR back page; continuation
                    // sheets (overflow companions) drop it.
                    const back = ap === 0 ? front.querySelector('.qr-back-page') : null;
                    const existingBack = front.querySelector('.qr-back-page');
                    if (existingBack) front.removeChild(existingBack);

                    // Enforce A6 bounds on Person Pass so it stacks nicely
                    front.style.width = '148mm';
                    front.style.height = '105mm';
                    front.style.border = '1px dashed #ccc';
                    if (back) {
                        back.style.width = '148mm';
                        back.style.height = '105mm';
                        back.style.border = '1px dashed #ccc';
                    }

                    pagesPairs.push({ front, back });
                }
                delete p._associatePageIndex;
            }
        }

        for (let i = 0; i < pagesPairs.length; i += 2) {
            const pair1 = pagesPairs[i];
            const pair2 = pagesPairs[i + 1];
            const a4LayoutStyle = pair2
                ? 'display: grid; grid-template-rows: 148.5mm 148.5mm; align-items: center; justify-items: center; align-content: start; justify-content: center;'
                : 'display: flex; flex-direction: column; gap: 0; align-items: center; justify-content: flex-start;';
            const a4PaddingStyle = pair2
                ? 'padding-top: 0; padding-bottom: 0;'
                : 'padding-top: 4mm; padding-bottom: 0;';

            const a4Front = document.createElement('div');
            a4Front.className = `a4-wrapper is-batch-print${pair2 ? ' has-multiple-passes' : ''}`;
            a4Front.style.cssText = `${a4LayoutStyle} page-break-after: always; width: 210mm; height: 297mm; max-height: 297mm; overflow: hidden; ${a4PaddingStyle} box-sizing: border-box;`;

            pair1.front.style.cssText += `page-break-after: avoid !important; break-after: avoid !important; margin-bottom: ${pair2 ? '0' : '4mm'} !important; box-shadow: none !important; margin-top: 0 !important;`;
            a4Front.appendChild(pair1.front);

            if (pair2) {
                pair2.front.style.cssText += 'page-break-after: avoid !important; break-after: avoid !important; margin-bottom: 0 !important; box-shadow: none !important; margin-top: 0 !important;';
                a4Front.appendChild(pair2.front);
            }
            multiContainer.appendChild(a4Front);

            const hasBack = !!(pair1.back || (pair2 && pair2.back));
            if (hasBack) {
                const a4Back = document.createElement('div');
                a4Back.className = `a4-wrapper is-batch-print${pair2 ? ' has-multiple-passes' : ''}`;
                a4Back.style.cssText = `${a4LayoutStyle} page-break-after: always; width: 210mm; height: 297mm; max-height: 297mm; overflow: hidden; ${a4PaddingStyle} box-sizing: border-box;`;

                if (pair1.back) {
                    pair1.back.style.cssText += `page-break-before: avoid !important; break-before: avoid !important; page-break-after: avoid !important; break-after: avoid !important; margin-bottom: ${pair2 ? '0' : '4mm'} !important; margin-top: 0 !important;`;
                    a4Back.appendChild(pair1.back);
                } else {
                    const empty = document.createElement('div');
                    empty.style.cssText = `height: 105mm; width: 148mm; margin-bottom: ${pair2 ? '0' : '4mm'};`;
                    a4Back.appendChild(empty);
                }

                if (pair2) {
                    if (pair2.back) {
                        pair2.back.style.cssText += 'page-break-before: avoid !important; break-before: avoid !important; page-break-after: avoid !important; break-after: avoid !important; margin-bottom: 0 !important; margin-top: 0 !important;';
                        a4Back.appendChild(pair2.back);
                    } else {
                        const empty = document.createElement('div');
                        empty.style.cssText = 'height: 105mm; width: 148mm; margin-bottom: 0;';
                        a4Back.appendChild(empty);
                    }
                }
                multiContainer.appendChild(a4Back);
            }
        }

        const printSheets = Array.from(multiContainer.querySelectorAll('.a4-wrapper'));
        printSheets.forEach((sheet, index) => {
            const isLastSheet = index === printSheets.length - 1;
            sheet.style.breakAfter = isLastSheet ? 'auto' : 'page';
            sheet.style.pageBreakAfter = isLastSheet ? 'auto' : 'always';
        });

        const modal = document.getElementById('printModal');
        const content = document.getElementById('printModalContent');
        if (modal && content) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('scale-95');
                content.classList.add('scale-100');
            }, 50);
        }

        setTimeout(() => {
            window.print();
        }, 1000); // 1 sec delay to ensure QR & signatures load/paint

    } catch (error) {
        showToast('Error preparing batch print.', 'error');
        console.error(error);
    }
}

window.clamp = clamp;
window.scheduleModalBoxUpdate = scheduleModalBoxUpdate;
window.setModalInteractionState = setModalInteractionState;
window.prepareModalForFloating = prepareModalForFloating;
window.resetDocumentModalLayout = resetDocumentModalLayout;
window.initializeModalDragResize = initializeModalDragResize;
window.toggleMaximizeModal = toggleMaximizeModal;
window.updateModalExpandButton = updateModalExpandButton;
window.renderMaterialBundle = renderMaterialBundle;
window.syncMaterialSignatureCopies = syncMaterialSignatureCopies;
window.viewPass = viewPass;
window.closeModal = closeModal;
window.forceCloseModal = forceCloseModal;
window.setDocumentViewMode = setDocumentViewMode;
window.printCurrentDocument = printCurrentDocument;
window.renderDigitalView = renderDigitalView;
window.printSelectedLogs = printSelectedLogs;
window.updateHradAssignmentSummary = updateHradAssignmentSummary;

function handleHradTripTypeChange(pass) {
    setHradScheduleControls(pass);
    updateHradAssignmentSummary(pass || findGatePassRecord());
}

function handleHradScheduleModeChange(pass) {
    setHradScheduleControls(pass);
    updateHradAssignmentSummary(pass || findGatePassRecord());
}

window.handleHradTripTypeChange = handleHradTripTypeChange;
window.handleHradScheduleModeChange = handleHradScheduleModeChange;

function populateHradAssignDrivers(vehicleId = null, pass = null) {
    const dSelect = document.getElementById('hradAssignDriver');
    if (!dSelect) return;
    dSelect.innerHTML = '<option value="">Select Driver (Optional)</option>';
    (databaseDrivers || []).forEach(d => {
        const availability = getDriverAvailabilityLabel(d.driverId, pass);
        dSelect.innerHTML += `<option value="${materialEscape(d.driverId)}">${materialEscape(d.fullName)} — ${materialEscape(availability)}</option>`;
    });

    if (vehicleId) {
        const vehicle = (databaseVehicles || []).find(v => String(v.id) === String(vehicleId));
        if (vehicle && vehicle.defaultDriverId) {
            dSelect.value = vehicle.defaultDriverId;
        }
    }
    updateHradAssignmentSummary(pass);
}

function handleHradAssignVehicleChange(select) {
    populateHradAssignDrivers(select.value, findGatePassRecord());
}

window.populateHradAssignDrivers = populateHradAssignDrivers;
window.handleHradAssignVehicleChange = handleHradAssignVehicleChange;

function viewFullScreenImage(src) {
    let overlay = document.getElementById('fullScreenImageOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'fullScreenImageOverlay';
        overlay.className = 'fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-4 cursor-zoom-out opacity-0 transition-opacity duration-300 hidden';
        overlay.onclick = function() {
            overlay.classList.add('opacity-0');
            setTimeout(() => overlay.classList.add('hidden'), 300);
        };
        overlay.innerHTML = `
            <img id="fullScreenImageEl" class="max-w-full max-h-full object-contain rounded shadow-2xl transition-transform duration-300 scale-95">
            <button class="absolute top-4 right-4 text-white text-2xl hover:text-gray-300 transition focus:outline-none"><i class="fas fa-times"></i></button>
        `;
        document.body.appendChild(overlay);
    }
    
    const img = document.getElementById('fullScreenImageEl');
    if (img) img.src = src;
    overlay.classList.remove('hidden');
    setTimeout(() => {
        overlay.classList.remove('opacity-0');
        img?.classList.remove('scale-95');
        img?.classList.add('scale-100');
    }, 10);
}
window.viewFullScreenImage = viewFullScreenImage;
window.renderDecisionRemarks = renderDecisionRemarks;
window.hideDecisionRemarks = hideDecisionRemarks;
window.showDecisionReasonComposer = showDecisionReasonComposer;
window.hideDecisionReasonComposer = hideDecisionReasonComposer;
window.readDecisionReason = readDecisionReason;
