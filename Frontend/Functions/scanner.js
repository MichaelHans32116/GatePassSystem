// Security queue and QR/manual Time Out/Time In scans.

var qrCameraStream = null;
var qrCameraAnimationFrame = null;
var qrCameraDetector = null;
var qrCameraLastDetectionAt = 0;
var qrCameraScanning = false;
var qrClientCooldowns = new Map();

async function executeSecurityScan(identifier) {
    if (!isDatabaseSession()) {
        simulateMockQrScan(identifier);
        return;
    }
    
    try {
        const isQrToken = identifier.startsWith('GP1.') || identifier.startsWith('EMP1.') || identifier.startsWith('FRS|');
        const result = await ApiClient.post('/security/scans', {
            qrToken: isQrToken ? identifier : null,
            manualGatePassNo: isQrToken ? null : identifier
        });
        const recorded = result.resultCode.includes('RECORDED');
        const ignored = result.resultCode === 'NO_ACTIVE_GATE_PASS_IGNORED';
        const cooldown = result.resultCode === 'SCAN_COOLDOWN';
        showToast(
            result.message,
            recorded ? 'success' : ignored || cooldown ? 'info' : 'error'
        );
        await renderGuardDashboard();
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
                const payload = identifier.slice(4);
                const decoded = atob(payload);
                const parsed = JSON.parse(decoded);
                if (parsed.dbId) {
                    viewPass(parsed.dbId, true);
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
            const queue = await ApiClient.get('/security/queue');
            const match = queue.find(item => item.gatePassNo === identifier || item.gatePassNo.endsWith('-' + identifier));
            if (match) {
                viewPass(match.gatePassId, true);
            } else {
                showToast('ID not found in active queue.', 'error');
            }
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
                qrClientCooldowns.delete(rawValue);
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
                userName: item.fullName,
                willReturn: item.willReturn,
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
        const waitingOut = pass.status === 'Approved';
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-4 py-2 text-xs font-mono font-bold text-mpiBlue">${pass.id}</td>
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

window.addEventListener('beforeunload', stopQrCamera);
