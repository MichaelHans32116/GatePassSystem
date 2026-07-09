// Security queue and QR/manual Time Out/Time In scans.
// Phase 8: Global QR — Employee QR as Universal Gate Pass Scanner

var qrCameraStream = null;
var qrCameraAnimationFrame = null;
var qrCameraDetector = null;
var qrCameraLastDetectionAt = 0;
var qrCameraScanning = false;
var qrClientCooldowns = new Map();
const activeGuardQueueStatusCodes = new Set(['APPROVED', 'OUTSIDE', 'OVERDUE']);

let guardQueueCurrentPage = 1;
window.changeGuardQueuePage = function(page) { guardQueueCurrentPage = page; renderGuardDashboard(); };

function isActiveGuardQueueItem(pass) {
    const statusCode = String(pass?.statusCode || '').trim().toUpperCase();
    const statusLabel = String(pass?.status || '').trim().toUpperCase();
    return activeGuardQueueStatusCodes.has(statusCode) ||
        statusLabel === 'WAITING OUT' ||
        statusLabel === 'WAITING IN';
}

function isWaitingOutGuardQueueItem(pass) {
    const statusCode = String(pass?.statusCode || '').trim().toUpperCase();
    const statusLabel = String(pass?.status || '').trim().toUpperCase();
    if (statusCode) {
        return statusCode === 'APPROVED';
    }
    return statusLabel === 'APPROVED' || statusLabel === 'WAITING OUT';
}

async function executeSecurityScan(identifier, signatureFileId = null) {
    if (!isDatabaseSession()) {
        simulateMockQrScan(identifier);
        return;
    }
    
    try {
        const isQrToken = identifier.startsWith('GP1.') || identifier.startsWith('EMP1.') || identifier.startsWith('FRS|');
        const result = await ApiClient.post('/security/scans', {
            qrToken: isQrToken ? identifier : null,
            manualGatePassNo: isQrToken ? null : identifier,
            signatureFileId: signatureFileId
        });
        const recorded = result.resultCode.includes('RECORDED');
        const ignored = result.resultCode === 'NO_ACTIVE_GATE_PASS_IGNORED';
        const cooldown = result.resultCode === 'SCAN_COOLDOWN';
        showToast(
            result.message,
            recorded ? 'success' : ignored || cooldown ? 'info' : 'error'
        );
        if (typeof refreshApplicationState === 'function') {
            await refreshApplicationState('security-scan');
        } else {
            await renderGuardDashboard();
        }
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Scan failed.', 'error');
    }
}

async function simulateQrScan(identifierOverride = null, fromCamera = false) {
    const canScan = currentUser.role === 'Security';
    if (!canScan) return;
    const input = document.getElementById('manualQrInput');
    const identifier = (identifierOverride || input.value).trim();
    if (!identifier) {
        showToast('Enter a QR or Control No.', 'error');
        return;
    }

    if (!isDatabaseSession()) {
        const pass = gatePasses.find(item => item.id === identifier || item.id.endsWith('-' + identifier));
        if (pass) {
            viewPass(pass.id, true);
        } else {
            showToast('Invalid ID', 'error');
        }
        input.value = '';
        return;
    }

    let success = false;
    try {
        const inputButton = document.querySelector('#manualQrInput + button');
        if (inputButton) inputButton.disabled = true;

        const isQrToken = identifier.startsWith('GP1.') || identifier.startsWith('EMP1.');
        console.log(`[simulateQrScan] Scanned identifier: "${identifier}", isQrToken: ${isQrToken}`);
        
        if (isQrToken) {
            try {
                const parts = identifier.split('.');
                console.log(`[simulateQrScan] QR parts:`, parts);
                if (parts.length >= 2) {
                    const idVal = parseInt(parts[1], 10);
                    console.log(`[simulateQrScan] Parsed ID value: ${idVal}`);
                    if (identifier.startsWith('GP1.')) {
                        // Per-pass QR — direct to that specific pass (unchanged)
                        viewPass(idVal, true);
                        success = true;
                    } else if (identifier.startsWith('EMP1.')) {
                        // === GLOBAL QR LOGIC ===
                        success = await handleGlobalQrScan(idVal);
                    }
                } else {
                    showToast('Invalid QR payload', 'error');
                }
            } catch (e) {
                console.error(`[simulateQrScan] Error decoding QR:`, e);
                showToast('Failed to decode QR', 'error');
            }
        } else if (identifier.startsWith('FRS|')) {
            const parts = identifier.split('|');
            console.log(`[simulateQrScan] FRS parts:`, parts);
            const frsId = parts.length >= 3 ? (parts[2] || '').trim() : '';
            if (frsId) {
                viewPass(frsId, true);
                success = true;
            } else {
                showToast('Invalid QR payload', 'error');
            }
        } else {
            // === MANUAL ENTRY / RAW EMPLOYEE ID PATH ===
            try {
                console.log(`[simulateQrScan] Attempting manual lookup for employee ID: "${identifier}"`);
                // First, check if the identifier is an Employee ID
                const empData = await ApiClient.get(`/security/employee/by-id/${encodeURIComponent(identifier)}/passes`);
                console.log(`[simulateQrScan] Employee lookup data:`, empData);
                success = await processGlobalQrData(empData);
            } catch (err) {
                console.warn(`[simulateQrScan] Employee ID lookup failed, trying Control/GP No:`, err);
                // Not an Employee ID (or API failed), fallback to Control No lookup
                success = await handleManualEntryLookup(identifier);
            }
        }

        input.value = '';
        if (fromCamera) {
            if (success) {
                stopQrCamera();
            } else {
                if (typeof qrClientCooldowns !== 'undefined' && qrClientCooldowns.has(identifier)) {
                    qrClientCooldowns.delete(identifier);
                }
                resumeQrScanning();
            }
        }
    } catch (error) {
        console.error(`[simulateQrScan] Lookup failed with error:`, error);
        showToast(error instanceof ApiError ? error.message : 'Lookup failed.', 'error');
        if (fromCamera) {
            if (typeof qrClientCooldowns !== 'undefined' && qrClientCooldowns.has(identifier)) {
                qrClientCooldowns.delete(identifier);
            }
            resumeQrScanning();
        }
    } finally {
        const inputButton = document.querySelector('#manualQrInput + button');
        if (inputButton) inputButton.disabled = false;
    }
}

// ============================================================
// GLOBAL QR: Employee QR scan handler
// ============================================================
async function handleGlobalQrScan(employeeRecordId) {
    try {
        console.log(`[handleGlobalQrScan] Querying passes for record ID: ${employeeRecordId}`);
        const data = await ApiClient.get(`/security/employee/${employeeRecordId}/passes`);
        console.log(`[handleGlobalQrScan] Passes data returned:`, data);
        return await processGlobalQrData(data);
    } catch (error) {
        console.warn(`[handleGlobalQrScan] API query failed for record ID ${employeeRecordId}, falling back to queue match:`, error);
        // Fallback: try the old queue-based lookup if new endpoint unavailable
        try {
            const queue = await ApiClient.get('/security/queue');
            const match = queue.find(item => item.employeeRecordId === employeeRecordId);
            if (match) {
                viewPass(match.gatePassId, true);
                return true;
            } else {
                showToast('No active gate pass queue for this employee.', 'info');
                return false;
            }
        } catch {
            showToast('Unable to look up employee passes.', 'error');
            return false;
        }
    }
}

async function processGlobalQrData(data) {
    const active = data.active || [];
    const recent = data.recent || [];
    const employeeName = data.employeeName || 'Employee';

    if (active.length === 1 && recent.length === 0) {
        // Single active pass — go directly to scan mode
        viewPass(active[0].gatePassId, true);
        return true;
    } else if (active.length > 0 || recent.length > 0) {
        // Show a tabbed record modal so pending/active records stay visible first.
        showEmployeeHistoryModal(active, recent, employeeName);
        return true;
    } else {
        // No passes at all
        showToast('No gate pass records found for this employee.', 'info');
        return false;
    }
}

// ============================================================
// MANUAL ENTRY: Control No / GP No lookup (Bug fix)
// ============================================================
async function handleManualEntryLookup(identifier) {
    const queue = await ApiClient.get('/security/queue');
    const searchId = String(identifier).toLowerCase();
    const match = queue.find(item => {
        const gpId = String(item.gatePassNo).toLowerCase();
        const ctrlId = String(item.controlNo || '').toLowerCase();
        return gpId === searchId || ctrlId === searchId;
    });

    if (match) {
        // Found in active queue — open in scan/review mode
        viewPass(match.gatePassId, true);
        return true;
    } else {
        // Not in active queue — search in history using the new security lookup endpoint
        try {
            const lookupId = await ApiClient.get(`/security/passes/lookup/${encodeURIComponent(identifier)}`);
            if (lookupId) {
                showToast('This gate pass is completed. Opening in view-only mode.', 'info');
                viewPass(lookupId, false);
                return true;
            } else {
                showToast('Not found in queue or history.', 'info');
                return false;
            }
        } catch (err) {
            showToast('ID/Control No. not found.', 'error');
            return false;
        }
    }
}

// ============================================================
// GLOBAL QR UI: Pass Selection Modal (multiple active passes)
// ============================================================
function showPassSelectionModal(activePasses, employeeName) {
    const modal = document.getElementById('globalQrPassSelectionModal');
    const nameEl = document.getElementById('globalQrSelectionName');
    const listEl = document.getElementById('globalQrSelectionList');
    if (!modal || !listEl) return;

    nameEl.textContent = employeeName;
    listEl.innerHTML = activePasses.map(pass => {
        const isWaitingOut = (pass.statusName || '').toUpperCase().includes('APPROVED');
        const statusLabel = isWaitingOut ? 'Waiting OUT' : 'Waiting IN';
        const statusClass = isWaitingOut
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-blue-100 text-blue-800';
        const icon = pass.formTypeName.toUpperCase().includes('MATERIAL')
            ? 'fa-box' : 'fa-user';
        const iconColor = pass.formTypeName.toUpperCase().includes('MATERIAL')
            ? 'text-amber-600' : 'text-mpiBlue';

        return `
            <button onclick="selectGlobalQrPass(${pass.gatePassId})"
                    class="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition group flex items-center gap-3">
                <div class="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center">
                    <i class="fas ${icon} ${iconColor} text-sm"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2">
                        <span class="font-mono text-xs font-bold text-gray-800">${materialEscape(pass.controlNo || pass.gatePassNo || '')}</span>
                        <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${statusClass}">${statusLabel}</span>
                    </div>
                    <p class="text-[10px] text-gray-500 mt-0.5 truncate">
                        <span class="font-semibold ${iconColor}">${materialEscape(pass.formTypeName)}</span>
                        ${pass.destination ? ` · ${materialEscape(pass.destination)}` : ''}
                    </p>
                </div>
                <i class="fas fa-chevron-right text-gray-300 group-hover:text-blue-500 text-xs"></i>
            </button>
        `;
    }).join('');

    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function selectGlobalQrPass(gatePassId) {
    openGlobalQrRecord(gatePassId, true);
}

function closeGlobalQrSelectionModal() {
    const modal = document.getElementById('globalQrPassSelectionModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

function normalizeGlobalQrStatus(value) {
    return String(value || '').trim().toUpperCase();
}

function getGlobalQrPendingStatusLabel(pass) {
    const statusCode = normalizeGlobalQrStatus(pass?.statusCode);
    const statusGroup = normalizeGlobalQrStatus(pass?.statusGroup);
    const statusName = normalizeGlobalQrStatus(pass?.statusName);

    if (statusGroup === 'PENDING' || statusCode.startsWith('PENDING') || statusName.startsWith('PENDING')) {
        return 'Pending';
    }

    if (statusCode === 'APPROVED' || statusName === 'APPROVED' || statusName === 'WAITING OUT') {
        return 'Waiting OUT';
    }

    if (statusCode === 'OUTSIDE' || statusCode === 'OVERDUE' || statusName === 'WAITING IN') {
        return 'Waiting IN';
    }

    return pass?.statusName || 'Pending';
}

function getGlobalQrPendingBadgeClass(pass) {
    const statusCode = normalizeGlobalQrStatus(pass?.statusCode);
    const statusGroup = normalizeGlobalQrStatus(pass?.statusGroup);

    if (statusGroup === 'PENDING' || statusCode.startsWith('PENDING')) {
        return 'bg-amber-100 text-amber-800';
    }

    if (statusCode === 'APPROVED') {
        return 'bg-yellow-100 text-yellow-800';
    }

    if (statusCode === 'OUTSIDE' || statusCode === 'OVERDUE') {
        return 'bg-blue-100 text-blue-800';
    }

    return 'bg-gray-100 text-gray-700';
}

function getGlobalQrRecordIcon(pass) {
    const formType = String(pass?.formTypeName || '').toUpperCase();
    return formType.includes('MATERIAL') ? 'fa-box' : 'fa-user';
}

function getGlobalQrRecordIconColor(pass) {
    return String(pass?.formTypeName || '').toUpperCase().includes('MATERIAL')
        ? 'text-amber-600'
        : 'text-mpiBlue';
}

function renderGlobalQrPendingCard(pass) {
    const badgeClass = getGlobalQrPendingBadgeClass(pass);
    const statusLabel = getGlobalQrPendingStatusLabel(pass);
    const icon = getGlobalQrRecordIcon(pass);
    const iconColor = getGlobalQrRecordIconColor(pass);

    return `
        <button type="button" onclick="openGlobalQrRecord(${pass.gatePassId}, true)"
                class="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-blue-400 hover:bg-blue-50 transition group flex items-center gap-3">
            <div class="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 group-hover:bg-blue-100 flex items-center justify-center">
                <i class="fas ${icon} ${iconColor} text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-mono text-xs font-bold text-gray-800">${materialEscape(pass.controlNo || pass.gatePassNo || '')}</span>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${badgeClass}">${materialEscape(statusLabel)}</span>
                </div>
                <p class="text-[10px] text-gray-500 mt-0.5 truncate">
                    <span class="font-semibold ${iconColor}">${materialEscape(pass.formTypeName || 'Gate Pass')}</span>
                    ${pass.destination ? ` · ${materialEscape(pass.destination)}` : ''}
                </p>
            </div>
            <i class="fas fa-chevron-right text-gray-300 group-hover:text-blue-500 text-xs"></i>
        </button>
    `;
}

function renderGlobalQrClosedCard(pass) {
    const statusColor = getHistoryStatusColor(pass.statusGroup);
    const icon = getGlobalQrRecordIcon(pass);
    const iconColor = getGlobalQrRecordIconColor(pass);
    const dateStr = pass.completedAt || pass.dateFiled || '';

    return `
        <button type="button" onclick="openGlobalQrRecord(${pass.gatePassId}, false)"
                class="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition group flex items-center gap-3">
            <div class="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                <i class="fas ${icon} ${iconColor} text-sm"></i>
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-mono text-xs font-bold text-gray-700">${materialEscape(pass.controlNo || pass.gatePassNo || '')}</span>
                    <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${statusColor}">${materialEscape(pass.statusName || 'Closed')}</span>
                </div>
                <p class="text-[10px] text-gray-500 mt-0.5 truncate">
                    <span class="font-semibold ${iconColor}">${materialEscape(pass.formTypeName || 'Gate Pass')}</span>
                    ${dateStr ? ` · ${materialEscape(dateStr)}` : ''}
                    ${pass.destination ? ` · ${materialEscape(pass.destination)}` : ''}
                </p>
            </div>
            <i class="fas fa-eye text-gray-300 group-hover:text-gray-500 text-xs"></i>
        </button>
    `;
}

function openGlobalQrRecord(gatePassId, isReviewing) {
    closeGlobalQrHistoryModal();
    closeGlobalQrSelectionModal();
    viewPass(gatePassId, isReviewing);
}

// ============================================================
// GLOBAL QR UI: Employee records modal (pending + closed)
// ============================================================
function toGlobalQrTime(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) ? time : 0;
}

function switchGlobalQrHistoryTab(tab) {
    const modal = document.getElementById('globalQrHistoryModal');
    if (!modal) return;

    const normalizedTab = tab === 'closed' ? 'closed' : 'pending';
    const pendingBtn = document.getElementById('globalQrPendingTabButton');
    const closedBtn = document.getElementById('globalQrClosedTabButton');
    const pendingPanel = document.getElementById('globalQrPendingPanel');
    const closedPanel = document.getElementById('globalQrClosedPanel');

    modal.dataset.activeTab = normalizedTab;

    if (pendingPanel) pendingPanel.classList.toggle('hidden', normalizedTab !== 'pending');
    if (closedPanel) closedPanel.classList.toggle('hidden', normalizedTab !== 'closed');

    if (pendingBtn) {
        pendingBtn.className = normalizedTab === 'pending'
            ? 'flex items-center gap-2 rounded-full border border-mpiBlue bg-mpiBlue px-4 py-2 text-xs font-bold text-white shadow-sm transition'
            : 'flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50 hover:text-gray-800';
    }

    if (closedBtn) {
        closedBtn.className = normalizedTab === 'closed'
            ? 'flex items-center gap-2 rounded-full border border-slate-700 bg-slate-700 px-4 py-2 text-xs font-bold text-white shadow-sm transition'
            : 'flex items-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-2 text-xs font-bold text-gray-600 transition hover:bg-gray-50 hover:text-gray-800';
    }
}

function showEmployeeHistoryModal(activePasses, recentPasses, employeeName) {
    const modal = document.getElementById('globalQrHistoryModal');
    const nameEl = document.getElementById('globalQrHistoryName');
    const pendingListEl = document.getElementById('globalQrPendingList');
    const closedListEl = document.getElementById('globalQrClosedList');
    const pendingCountEl = document.getElementById('globalQrPendingCount');
    const closedCountEl = document.getElementById('globalQrClosedCount');
    const emptyEl = document.getElementById('globalQrHistoryEmpty');
    if (!modal || !pendingListEl || !closedListEl) return;

    nameEl.textContent = employeeName;

    const sortedPending = [...(activePasses || [])].sort((a, b) => {
        const aPriority = normalizeGlobalQrStatus(a?.statusGroup) === 'PENDING' || normalizeGlobalQrStatus(a?.statusCode).startsWith('PENDING') ? 0 : 1;
        const bPriority = normalizeGlobalQrStatus(b?.statusGroup) === 'PENDING' || normalizeGlobalQrStatus(b?.statusCode).startsWith('PENDING') ? 0 : 1;
        if (aPriority !== bPriority) return aPriority - bPriority;

        const aTime = toGlobalQrTime(a?.expectedOut || a?.dateFiled);
        const bTime = toGlobalQrTime(b?.expectedOut || b?.dateFiled);
        if (aTime !== bTime) return aTime - bTime;

        return Number(a?.gatePassId || 0) - Number(b?.gatePassId || 0);
    });

    const sortedClosed = [...(recentPasses || [])].sort((a, b) => {
        const aTime = toGlobalQrTime(a?.completedAt || a?.dateFiled);
        const bTime = toGlobalQrTime(b?.completedAt || b?.dateFiled);
        if (aTime !== bTime) return bTime - aTime;
        return Number(b?.gatePassId || 0) - Number(a?.gatePassId || 0);
    });

    if (pendingCountEl) pendingCountEl.textContent = String(sortedPending.length);
    if (closedCountEl) closedCountEl.textContent = String(sortedClosed.length);

    pendingListEl.innerHTML = sortedPending.length > 0
        ? sortedPending.map(renderGlobalQrPendingCard).join('')
        : `
            <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                <i class="fas fa-hourglass-half text-lg text-gray-300 mb-2"></i>
                <p class="text-sm font-semibold text-gray-600">No pending or active passes right now.</p>
                <p class="mt-1 text-xs text-gray-400">Any waiting in, waiting out, or active record will appear here first.</p>
            </div>
        `;

    closedListEl.innerHTML = sortedClosed.length > 0
        ? sortedClosed.map(renderGlobalQrClosedCard).join('')
        : `
            <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-center">
                <i class="fas fa-inbox text-lg text-gray-300 mb-2"></i>
                <p class="text-sm font-semibold text-gray-600">No closed records yet.</p>
                <p class="mt-1 text-xs text-gray-400">Completed gate pass history will show up here.</p>
            </div>
        `;

    if (emptyEl) {
        const hasAnyRecords = sortedPending.length > 0 || sortedClosed.length > 0;
        emptyEl.classList.toggle('hidden', hasAnyRecords);
    }

    const initialTab = sortedPending.length > 0 ? 'pending' : 'closed';
    switchGlobalQrHistoryTab(initialTab);
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
}

function getHistoryStatusColor(statusGroup) {
    switch ((statusGroup || '').toUpperCase()) {
        case 'COMPLETED': return 'bg-green-100 text-green-700';
        case 'TERMINAL': return 'bg-red-100 text-red-700';
        default: return 'bg-gray-200 text-gray-600';
    }
}

function viewHistoryPass(gatePassId) {
    openGlobalQrRecord(gatePassId, false); // view-only
}

function closeGlobalQrHistoryModal() {
    const modal = document.getElementById('globalQrHistoryModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

// ============================================================
// QR Camera management (unchanged from Phase 7)
// ============================================================
function setQrCameraStatus(message, type = 'muted') {
    const status = document.getElementById('qrCameraStatus');
    if (!status) return;
    status.className = 'text-[10px]';
    status.classList.add(
        type === 'error'
            ? 'text-red-600'
            : type === 'success'
                ? 'text-green-700'
                : type === 'info'
                    ? 'text-mpiBlue'
                    : 'text-gray-500'
    );
    status.innerText = message;
}

function renderCameraButtons(devices, activeDeviceId) {
    const container = document.getElementById('qrCameraButtonsContainer');
    if (!container) return;

    if (!devices.length) {
        container.innerHTML = `<span class="text-xs text-gray-500"><i class="fas fa-info-circle mr-1"></i>No camera detected</span>`;
        return;
    }

    container.innerHTML = devices.map((device, index) => {
        const label = device.label || `Camera ${index + 1}`;
        const isSelected = device.deviceId === activeDeviceId;
        const isBack = /back|rear|environment/i.test(label);
        const isFront = /front|user/i.test(label);

        let iconClass = 'fa-camera';
        if (isBack) iconClass = 'fa-redo-alt'; // flip indicator
        if (isFront) iconClass = 'fa-user-circle'; // selfie indicator

        const btnClass = isSelected
            ? 'bg-mpiBlue text-white border-mpiBlue ring-2 ring-blue-200'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50';

        return `
            <button type="button"
                onclick="switchCameraDevice('${materialEscape(device.deviceId)}')"
                class="border rounded-lg px-3 py-2 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${btnClass}"
                title="${materialEscape(label)}">
                <i class="fas ${iconClass}"></i>
                <span>${materialEscape(label)}</span>
            </button>
        `;
    }).join('');
}

async function switchCameraDevice(deviceId) {
    const select = document.getElementById('qrCameraSelect');
    if (!select) return;
    select.value = deviceId;

    const devices = (await navigator.mediaDevices.enumerateDevices())
        .filter(device => device.kind === 'videoinput');
    renderCameraButtons(devices, deviceId);

    if (qrCameraScanning) {
        await startQrCamera();
    }
}

async function initializeQrCameras() {
    const select = document.getElementById('qrCameraSelect');
    if (!select || !navigator.mediaDevices?.enumerateDevices) {
        setQrCameraStatus(
            'Camera needs localhost/HTTPS.',
            'error'
        );
        return;
    }

    const hasBarcodeDetector = 'BarcodeDetector' in window;
    const hasJsQr = typeof window.jsQR === 'function';
    if (!hasBarcodeDetector && !hasJsQr) {
        setQrCameraStatus(
            'QR reader not ready. Refresh or use manual entry.',
            'error'
        );
        return;
    }

    try {
        if (hasBarcodeDetector) {
            const formats = await BarcodeDetector.getSupportedFormats();
            if (formats.includes('qr_code')) {
                qrCameraDetector = new BarcodeDetector({ formats: ['qr_code'] });
            }
        }

        const devices = (await navigator.mediaDevices.enumerateDevices())
            .filter(device => device.kind === 'videoinput');
        const previous = select.value;
        let activeId = previous || (devices.length ? devices[0].deviceId : '');

        select.innerHTML = devices.length
            ? devices.map((device, index) =>
                `<option value="${materialEscape(device.deviceId)}">${materialEscape(device.label || `Camera ${index + 1}`)}</option>`
            ).join('')
            : '<option value="">No camera detected</option>';

        if (devices.some(device => device.deviceId === previous)) {
            select.value = previous;
            activeId = previous;
        } else if (devices.length) {
            select.value = devices[0].deviceId;
            activeId = devices[0].deviceId;
        }

        renderCameraButtons(devices, activeId);

        setQrCameraStatus(
            devices.length
                ? `${devices.length} camera${devices.length === 1 ? '' : 's'} detected.`
                : 'No camera detected.',
            devices.length ? 'info' : 'error'
        );
    } catch (error) {
        setQrCameraStatus(`Unable to enumerate cameras: ${error.message}`, 'error');
    }
}

async function startQrCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
        setQrCameraStatus('Camera unavailable. Use localhost/HTTPS.', 'error');
        return;
    }

    stopQrCamera();
    const selectedDeviceId = document.getElementById('qrCameraSelect')?.value;
    const constraints = {
        audio: false,
        video: selectedDeviceId
            ? { deviceId: { exact: selectedDeviceId } }
            : { facingMode: { ideal: 'environment' } }
    };

    try {
        qrCameraStream = await navigator.mediaDevices.getUserMedia(constraints);
        const video = document.getElementById('qrCameraVideo');
        video.srcObject = qrCameraStream;
        await video.play();
        video.classList.remove('hidden');
        document.getElementById('qrCameraPlaceholder')?.classList.add('hidden');
        document.getElementById('qrScanLine')?.classList.remove('hidden');
        document.getElementById('startQrCameraButton').disabled = true;
        document.getElementById('stopQrCameraButton').disabled = false;
        qrCameraScanning = true;
        setQrCameraStatus('Camera active. Hold QR in frame.', 'success');
        await initializeQrCameras();
        scanQrCameraFrame();
    } catch (error) {
        stopQrCamera();
        setQrCameraStatus(
            error.name === 'NotAllowedError'
                ? 'Camera permission denied.'
                : `Unable to start camera: ${error.message}`,
            'error'
        );
    }
}

async function scanQrCameraFrame() {
    if (!qrCameraScanning) return;

    const video = document.getElementById('qrCameraVideo');
    const now = performance.now();
    if (video?.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
        now - qrCameraLastDetectionAt > 250) {
        qrCameraLastDetectionAt = now;
        try {
            let rawValue = null;
            if (qrCameraDetector) {
                const results = await qrCameraDetector.detect(video);
                rawValue = results.find(result => result.rawValue)?.rawValue || null;
            } else if (typeof window.jsQR === 'function') {
                const canvas = document.getElementById('qrCameraCanvas');
                const context = canvas.getContext('2d', { willReadFrequently: true });
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                context.drawImage(video, 0, 0, canvas.width, canvas.height);
                const image = context.getImageData(0, 0, canvas.width, canvas.height);
                rawValue = window.jsQR(
                    image.data,
                    image.width,
                    image.height,
                    { inversionAttempts: 'attemptBoth' }
                )?.data || null;
            }

            if (rawValue && qrCameraScanning) {
                const clientCooldownUntil =
                    qrClientCooldowns.get(rawValue) || 0;
                if (clientCooldownUntil > Date.now()) {
                    qrCameraAnimationFrame =
                        requestAnimationFrame(scanQrCameraFrame);
                    return;
                }
                qrClientCooldowns.set(rawValue, Date.now() + 30000); // 30s cooldown for this specific QR
                
                // Clean up expired client-side cooldowns
                for (const [key, expiry] of qrClientCooldowns.entries()) {
                    if (expiry <= Date.now()) {
                        qrClientCooldowns.delete(key);
                    }
                }

                qrCameraScanning = false;
                setQrCameraStatus('QR detected. Checking queue...', 'info');
                await simulateQrScan(rawValue, true);
                return;
            }
        } catch {
            // A frame can fail while the camera is warming up; continue scanning.
        }
    }

    qrCameraAnimationFrame = requestAnimationFrame(scanQrCameraFrame);
}

function stopQrCamera() {
    qrCameraScanning = false;
    if (qrCameraAnimationFrame) {
        cancelAnimationFrame(qrCameraAnimationFrame);
        qrCameraAnimationFrame = null;
    }
    qrCameraStream?.getTracks().forEach(track => track.stop());
    qrCameraStream = null;

    const video = document.getElementById('qrCameraVideo');
    if (video) {
        video.pause();
        video.srcObject = null;
        video.classList.add('hidden');
    }
    document.getElementById('qrCameraPlaceholder')?.classList.remove('hidden');
    document.getElementById('qrScanLine')?.classList.add('hidden');
    const startButton = document.getElementById('startQrCameraButton');
    const stopButton = document.getElementById('stopQrCameraButton');
    if (startButton) startButton.disabled = false;
    if (stopButton) stopButton.disabled = true;
}

function resumeQrScanning() {
    if (qrCameraStream && !qrCameraScanning) {
        qrCameraScanning = true;
        setQrCameraStatus('Camera active. Hold QR in frame.', 'success');
        scanQrCameraFrame();
    }
}

function simulateMockQrScan(gatePassNo) {
    const pass = gatePasses.find(item => item.id === gatePassNo);
    if (!pass) {
        showToast('Invalid ID', 'error');
        return;
    }

    const nowTime = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
    });
    if (pass.status === 'Approved' && pass.scanCount === 0) {
        pass.scanCount = 1;
        pass.actualOut = nowTime;
        if (pass.willReturn) {
            pass.status = 'Outside';
            if (pass.vehicle) pass.vehicle.status = 'In Use';
            showToast(`TIME OUT RECORDED: ${pass.userName}. Waiting for return.`);
        } else {
            pass.status = 'Closed';
            showToast(`1-WAY PASS: ${pass.userName} Time Out Recorded. Closed.`);
        }
    } else if (pass.status === 'Outside' && pass.scanCount === 1) {
        pass.scanCount = 2;
        pass.actualIn = nowTime;
        pass.status = 'Returned';
        if (pass.vehicle) pass.vehicle.status = 'Available';
        showToast('TIME IN RECORDED. Closed.');
    } else {
        showToast(`Transaction Failed. Status: ${pass.status}`, 'error');
    }

    document.getElementById('manualQrInput').value = '';
    refreshDashboards();
}

async function renderGuardDashboard() {
    let queueItems;
    if (isDatabaseSession()) {
        try {
            const queue = await ApiClient.get('/security/queue');
            queueItems = queue
                .map(item => ({
                    id: item.gatePassNo,
                    dbId: item.gatePassId,
                    controlNo: item.controlNo,
                    userName: item.fullName,
                    willReturn: item.willReturn,
                    employeeRecordId: item.employeeRecordId,
                    statusCode: item.gatePassStatusCode,
                    status: gatePassStatusLabels[item.gatePassStatusCode] || item.statusName,
                    vehicle: item.vehicleName ? {
                        name: item.vehicleName,
                        plate: item.plateNumber,
                        driver: item.driverName
                    } : null
                }))
                .filter(isActiveGuardQueueItem);
        } catch (error) {
            queueItems = [];
            showToast(error instanceof ApiError ? error.message : 'Unable to load security queue.', 'error');
        }
    } else {
        queueItems = gatePasses.filter(isActiveGuardQueueItem);
    }

    const startIndex = (guardQueueCurrentPage - 1) * window.GLOBAL_PAGE_SIZE;
    const paginatedQueue = queueItems.slice(startIndex, startIndex + window.GLOBAL_PAGE_SIZE);

    document.getElementById('guardQueueList').innerHTML = paginatedQueue.map(pass => {
        const waitingOut = isWaitingOutGuardQueueItem(pass);
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-4 py-2 text-xs font-mono font-bold text-mpiBlue">
                    <div>${materialEscape(pass.id)}</div>
                    ${pass.controlNo ? `<div class="text-[10px] text-gray-500 font-normal mt-0.5">Control: ${materialEscape(pass.controlNo)}</div>` : ''}
                </td>
                <td class="px-4 py-2 text-sm font-semibold">${materialEscape(pass.userName)}</td>
                <td class="px-4 py-2 text-xs">${pass.willReturn ? '<span class="text-green-600 font-bold">Yes</span>' : '<span class="text-red-500 font-bold">No (1-Way)</span>'}</td>
                <td class="px-4 py-2"><span class="px-2 py-1 rounded text-[10px] font-bold ${waitingOut ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}">${waitingOut ? 'Waiting OUT' : 'Waiting IN'}</span></td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="4" class="px-4 py-6 text-center text-gray-400 text-xs">Queue is empty. No pending scans.</td></tr>';
    
    if (window.renderPaginationControls) {
        window.renderPaginationControls(queueItems.length, guardQueueCurrentPage, window.GLOBAL_PAGE_SIZE, 'guardQueuePagination', 'changeGuardQueuePage');
    }
}

window.simulateQrScan = simulateQrScan;
window.executeSecurityScan = executeSecurityScan;
window.renderGuardDashboard = renderGuardDashboard;
window.initializeQrCameras = initializeQrCameras;
window.startQrCamera = startQrCamera;
window.stopQrCamera = stopQrCamera;
window.resumeQrScanning = resumeQrScanning;
window.switchCameraDevice = switchCameraDevice;
window.selectGlobalQrPass = selectGlobalQrPass;
window.closeGlobalQrSelectionModal = closeGlobalQrSelectionModal;
window.switchGlobalQrHistoryTab = switchGlobalQrHistoryTab;
window.openGlobalQrRecord = openGlobalQrRecord;
window.viewHistoryPass = viewHistoryPass;
window.closeGlobalQrHistoryModal = closeGlobalQrHistoryModal;

window.addEventListener('beforeunload', stopQrCamera);
