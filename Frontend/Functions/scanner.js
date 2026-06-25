// Security queue and QR/manual Time Out/Time In scans.
// Phase 8: Global QR — Employee QR as Universal Gate Pass Scanner

var qrCameraStream = null;
var qrCameraAnimationFrame = null;
var qrCameraDetector = null;
var qrCameraLastDetectionAt = 0;
var qrCameraScanning = false;
var qrClientCooldowns = new Map();

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
        showToast('Enter a QR or GP-ID.', 'error');
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

    try {
        const inputButton = document.querySelector('#manualQrInput + button');
        if (inputButton) inputButton.disabled = true;

        const isQrToken = identifier.startsWith('GP1.') || identifier.startsWith('EMP1.');
        
        if (isQrToken) {
            try {
                const parts = identifier.split('.');
                if (parts.length >= 2) {
                    const idVal = parseInt(parts[1], 10);
                    if (identifier.startsWith('GP1.')) {
                        // Per-pass QR — direct to that specific pass (unchanged)
                        viewPass(idVal, true);
                    } else if (identifier.startsWith('EMP1.')) {
                        // === GLOBAL QR LOGIC ===
                        await handleGlobalQrScan(idVal);
                    }
                } else {
                    showToast('Invalid QR payload', 'error');
                }
            } catch (e) {
                showToast('Failed to decode QR', 'error');
            }
        } else if (identifier.startsWith('FRS|')) {
            const parts = identifier.split('|');
            if (parts.length >= 3) {
                viewPass(parts[2], true);
            }
        } else {
            // === MANUAL ENTRY / CONTROL NO PATH (Bug fix included) ===
            await handleManualEntryLookup(identifier);
        }

        input.value = '';
        if (fromCamera) {
            stopQrCamera();
        }
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Lookup failed.', 'error');
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
        const data = await ApiClient.get(`/security/employee/${employeeRecordId}/passes`);
        const active = data.active || [];
        const recent = data.recent || [];
        const employeeName = data.employeeName || 'Employee';

        if (active.length === 1) {
            // Single active pass — go directly to scan mode
            viewPass(active[0].gatePassId, true);
        } else if (active.length > 1) {
            // Multiple active passes — show selection modal
            showPassSelectionModal(active, employeeName);
        } else if (recent.length > 0) {
            // No active passes but has history — show history modal
            showEmployeeHistoryModal(recent, employeeName);
        } else {
            // No passes at all
            showToast('No gate pass records found for this employee.', 'info');
        }
    } catch (error) {
        // Fallback: try the old queue-based lookup if new endpoint unavailable
        try {
            const queue = await ApiClient.get('/security/queue');
            const match = queue.find(item => item.employeeRecordId === employeeRecordId);
            if (match) {
                viewPass(match.gatePassId, true);
            } else {
                showToast('No active gate pass queue for this employee.', 'info');
            }
        } catch {
            showToast('Unable to look up employee passes.', 'error');
        }
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
    } else {
        // Not in active queue — search in history (BUG FIX)
        try {
            const lookup = await ApiClient.request(
                `/form-requests?page=1&pageSize=20&search=${encodeURIComponent(identifier)}`
            );
            const dbMatch = lookup.items.find(item =>
                String(item.gatePassNo).toLowerCase() === searchId ||
                String(item.controlNo || '').toLowerCase() === searchId
            );
            if (dbMatch) {
                // Found in history — open in view-only mode
                showToast('This gate pass is completed. Opening in view-only mode.', 'info');
                viewPass(dbMatch.gatePassId, false);
            } else {
                showToast('ID/Control No. not found in active queue or history.', 'error');
            }
        } catch (err) {
            // If /form-requests is not accessible to Security role,
            // try using the gate pass ID directly as a view-only fallback
            try {
                viewPass(identifier, false);
            } catch {
                showToast('ID/Control No. not found.', 'error');
            }
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
    closeGlobalQrSelectionModal();
    viewPass(gatePassId, true);
}

function closeGlobalQrSelectionModal() {
    const modal = document.getElementById('globalQrPassSelectionModal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.add('hidden');
    }
}

// ============================================================
// GLOBAL QR UI: Employee History Modal (no active passes)
// ============================================================
function showEmployeeHistoryModal(recentPasses, employeeName) {
    const modal = document.getElementById('globalQrHistoryModal');
    const nameEl = document.getElementById('globalQrHistoryName');
    const listEl = document.getElementById('globalQrHistoryList');
    const emptyEl = document.getElementById('globalQrHistoryEmpty');
    if (!modal || !listEl) return;

    nameEl.textContent = employeeName;

    if (recentPasses.length === 0) {
        listEl.innerHTML = '';
        if (emptyEl) emptyEl.classList.remove('hidden');
    } else {
        if (emptyEl) emptyEl.classList.add('hidden');
        listEl.innerHTML = recentPasses.map(pass => {
            const statusColor = getHistoryStatusColor(pass.statusGroup);
            const icon = pass.formTypeName.toUpperCase().includes('MATERIAL')
                ? 'fa-box' : 'fa-user';
            const iconColor = pass.formTypeName.toUpperCase().includes('MATERIAL')
                ? 'text-amber-600' : 'text-mpiBlue';
            const dateStr = pass.dateFiled || '';

            return `
                <button onclick="viewHistoryPass(${pass.gatePassId})"
                        class="w-full text-left p-3 rounded-xl border border-gray-200 hover:border-gray-400 hover:bg-gray-50 transition group flex items-center gap-3">
                    <div class="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                        <i class="fas ${icon} ${iconColor} text-sm"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <span class="font-mono text-xs font-bold text-gray-700">${materialEscape(pass.controlNo || pass.gatePassNo || '')}</span>
                            <span class="px-1.5 py-0.5 rounded text-[9px] font-bold ${statusColor}">${materialEscape(pass.statusName)}</span>
                        </div>
                        <p class="text-[10px] text-gray-500 mt-0.5 truncate">
                            <span class="font-semibold ${iconColor}">${materialEscape(pass.formTypeName)}</span>
                            ${dateStr ? ` · ${materialEscape(dateStr)}` : ''}
                            ${pass.destination ? ` · ${materialEscape(pass.destination)}` : ''}
                        </p>
                    </div>
                    <i class="fas fa-eye text-gray-300 group-hover:text-gray-500 text-xs"></i>
                </button>
            `;
        }).join('');
    }

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
    closeGlobalQrHistoryModal();
    viewPass(gatePassId, false); // view-only
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
        select.innerHTML = devices.length
            ? devices.map((device, index) =>
                `<option value="${device.deviceId}">${device.label || `Camera ${index + 1}`}</option>`
            ).join('')
            : '<option value="">No camera detected</option>';
        if (devices.some(device => device.deviceId === previous)) {
            select.value = previous;
        }
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
            queueItems = queue.map(item => ({
                id: item.gatePassNo,
                dbId: item.gatePassId,
                controlNo: item.controlNo,
                userName: item.fullName,
                willReturn: item.willReturn,
                employeeRecordId: item.employeeRecordId,
                status: gatePassStatusLabels[item.gatePassStatusCode] || item.statusName,
                vehicle: item.vehicleName ? {
                    name: item.vehicleName,
                    plate: item.plateNumber,
                    driver: item.driverName
                } : null
            }));
        } catch (error) {
            queueItems = [];
            showToast(error instanceof ApiError ? error.message : 'Unable to load security queue.', 'error');
        }
    } else {
        queueItems = gatePasses.filter(pass =>
            pass.status === 'Approved' || pass.status === 'Outside'
        );
    }

    document.getElementById('guardQueueList').innerHTML = queueItems.map(pass => {
        const waitingOut = pass.status === 'Approved' || pass.status === 'Waiting OUT';
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-4 py-2 text-xs font-mono font-bold text-mpiBlue">
                    <div>${pass.id}</div>
                    ${pass.controlNo ? `<div class="text-[10px] text-gray-500 font-normal mt-0.5">Control: ${pass.controlNo}</div>` : ''}
                </td>
                <td class="px-4 py-2 text-sm font-semibold">${pass.userName}</td>
                <td class="px-4 py-2 text-xs">${pass.willReturn ? '<span class="text-green-600 font-bold">Yes</span>' : '<span class="text-red-500 font-bold">No (1-Way)</span>'}</td>
                <td class="px-4 py-2"><span class="px-2 py-1 rounded text-[10px] font-bold ${waitingOut ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}">${waitingOut ? 'Waiting OUT' : 'Waiting IN'}</span></td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="4" class="px-4 py-6 text-center text-gray-400 text-xs">Queue is empty. No pending scans.</td></tr>';
}

window.simulateQrScan = simulateQrScan;
window.executeSecurityScan = executeSecurityScan;
window.renderGuardDashboard = renderGuardDashboard;
window.initializeQrCameras = initializeQrCameras;
window.startQrCamera = startQrCamera;
window.stopQrCamera = stopQrCamera;
window.selectGlobalQrPass = selectGlobalQrPass;
window.closeGlobalQrSelectionModal = closeGlobalQrSelectionModal;
window.viewHistoryPass = viewHistoryPass;
window.closeGlobalQrHistoryModal = closeGlobalQrHistoryModal;

window.addEventListener('beforeunload', stopQrCamera);
