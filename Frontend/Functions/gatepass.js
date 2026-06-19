// Gate pass form, API mapping, and request dashboard.

var databaseVehicles = [];
var databaseDrivers = [];

const gatePassStatusLabels = {
    DRAFT: 'Draft',
    PENDING_SUPERIOR: 'Pending Superior',
    PENDING_PRESIDENT: 'Pending President',
    PENDING_PAS: 'Pending PAS',
    APPROVED: 'Approved',
    OUTSIDE: 'Outside',
    OVERDUE: 'Overdue',
    RETURNED: 'Returned',
    CLOSED: 'Closed',
    REJECTED: 'Rejected',
    CANCELLED: 'Cancelled',
    EXPIRED: 'Expired'
};

function isDatabaseSession() {
    return ApiClient.isDatabaseSession();
}

function formatDateTime(value, includeDate = true) {
    if (!value) return 'N/A';
    const date = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleString([], includeDate
        ? { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
        : { hour: '2-digit', minute: '2-digit' });
}

function mapApprovalSignatures(steps = []) {
    const signatures = { imm: null, pres: null, pas: null };
    steps.forEach((step) => {
        if (step.approvalStatusCode !== 'APPROVED') return;
        const signature = {
            name: step.approverName,
            img: step.signatureUrl || null,
            fileId: step.signatureFileId || null,
            w: 100,
            y: 0
        };
        if (step.approvalStepCode === 'SUPERIOR') signatures.imm = signature;
        if (step.approvalStepCode === 'PRESIDENT') signatures.pres = signature;
        if (step.approvalStepCode === 'PAS') signatures.pas = signature;
    });
    return signatures;
}

function mapApiGatePass(record) {
    const status = gatePassStatusLabels[record.gatePassStatusCode] || record.statusName || record.gatePassStatusCode;
    const vehicle = record.vehicleId || record.vehicleName
        ? {
            id: String(record.vehicleId || ''),
            name: record.vehicleName || 'Company Vehicle',
            plate: record.plateNumber || '',
            driver: record.driverName || 'Unassigned',
            status: record.gatePassStatusCode === 'OUTSIDE' ? 'In Use' : 'Reserved'
        }
        : null;
    const steps = record.approvalSteps || [];

    return {
        id: record.gatePassNo,
        dbId: record.gatePassId,
        userId: record.requesterUserId,
        userName: record.fullName,
        userDept: record.departmentName,
        position: record.positionName,
        dateFiled: formatDateTime(record.appliedAt || record.createdAt),
        destination: record.destination,
        expectedOut: formatDateTime(record.expectedOutAt),
        expectedIn: record.expectedInAt ? formatDateTime(record.expectedInAt) : 'N/A',
        purpose: record.purpose,
        vehicle,
        status,
        statusCode: record.gatePassStatusCode,
        requiresSuperiorApproval: steps.some(step => step.approvalStepCode === 'SUPERIOR'),
        requiresPresidentApproval: steps.some(step => step.approvalStepCode === 'PRESIDENT'),
        signatures: mapApprovalSignatures(steps),
        approvalSteps: steps,
        scanCount: (record.scans || []).filter(scan =>
            scan.resultCode === 'TIME_OUT_RECORDED' || scan.resultCode === 'TIME_IN_RECORDED'
        ).length,
        actualOut: record.actualOutAt ? formatDateTime(record.actualOutAt, false) : null,
        actualIn: record.actualInAt ? formatDateTime(record.actualInAt, false) : null,
        willReturn: record.willReturn !== false,
        qrToken: record.qrToken || null
    };
}

function setNowTime(inputId) {
    const now = new Date();
    document.getElementById(inputId).value =
        now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function handleVehicleChange(sel) {
    if (sel.value === 'others') {
        document.getElementById('gpDriver').value = '';
        document.getElementById('manualVehicleFields').classList.remove('hidden');
        document.getElementById('gpManualVehicle').required = true;
        document.getElementById('gpManualDriver').required = true;
        return;
    }

    document.getElementById('manualVehicleFields').classList.add('hidden');
    document.getElementById('gpManualVehicle').required = false;
    document.getElementById('gpManualDriver').required = false;
    const vehicles = isDatabaseSession() ? databaseVehicles : mockVehicles;
    const selected = vehicles.find(vehicle => String(vehicle.id) === String(sel.value));
    document.getElementById('gpDriver').value = selected?.driver || '';
}

function toggleExpectedIn(show) {
    const expectedIn = document.getElementById('gpExpectedIn');
    expectedIn.required = show;
    expectedIn.disabled = !show;
    if (!show) expectedIn.value = '';
}

function requiresSuperiorApproval(user) {
    return !(user.roles || []).includes('IMMEDIATE_SUPERIOR');
}

function requiresPresidentApproval(user, hasCompanyVehicle) {
    return (user.roles || []).includes('IMMEDIATE_SUPERIOR') ||
        hasCompanyVehicle === true;
}

function getInitialRequestStatus(user, hasCompanyVehicle) {
    if (requiresSuperiorApproval(user)) return 'Pending Superior';
    if (requiresPresidentApproval(user, hasCompanyVehicle)) return 'Pending President';
    return 'Pending PAS';
}

function updateApprovalRoutePreview() {
    const isVehicleNeeded = document.getElementById('gpNeedVehicle').checked;
    const routeText = document.getElementById('routeApprovalText');
    if (!routeText || !currentUser) return;

    const steps = [];
    if (requiresSuperiorApproval(currentUser)) steps.push('Immediate Superior');
    if (requiresPresidentApproval(currentUser, isVehicleNeeded)) steps.push('President / VP');
    steps.push('PAS / HR');
    routeText.innerText = steps.join(' → ');
}

function toggleVehicleFields() {
    const isNeeded = document.getElementById('gpNeedVehicle').checked;
    document.getElementById('vehicleFields').style.display = isNeeded ? 'flex' : 'none';
    document.getElementById('gpVehicle').required = isNeeded;
    if (!isNeeded) {
        document.getElementById('gpVehicle').value = '';
        handleVehicleChange(document.getElementById('gpVehicle'));
    }
    updateApprovalRoutePreview();
}

function localDateTimeFromTime(timeValue) {
    if (!timeValue) return null;
    const [hours, minutes] = timeValue.split(':').map(Number);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    return date;
}

async function submitGatePass(e) {
    e.preventDefault();

    if (!isDatabaseSession()) {
        submitMockGatePass(e);
        return;
    }

    const form = e.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const needsVehicle = document.getElementById('gpNeedVehicle').checked;
    const willReturn = document.querySelector('input[name="gpWillReturn"]:checked').value === 'yes';
    const vehicleSelection = document.getElementById('gpVehicle').value;
    const expectedOut = localDateTimeFromTime(document.getElementById('gpExpectedOut').value);
    const expectedIn = willReturn
        ? localDateTimeFromTime(document.getElementById('gpExpectedIn').value)
        : null;

    if (expectedIn && expectedIn <= expectedOut) {
        showToast('Expected Time In must be later than Expected Time Out.', 'error');
        return;
    }

    const isManual = needsVehicle && vehicleSelection === 'others';
    const payload = {
        destination: document.getElementById('gpDestination').value.trim(),
        purpose: document.getElementById('gpPurpose').value.trim(),
        expectedOutAt: expectedOut.toISOString(),
        expectedInAt: expectedIn?.toISOString() || null,
        willReturn,
        vehicleUsageCode: needsVehicle ? (isManual ? 'PRIVATE' : 'COMPANY') : 'NONE',
        vehicleId: needsVehicle && !isManual ? Number(vehicleSelection) : null,
        privateVehicleDetails: isManual
            ? `${document.getElementById('gpManualVehicle').value.trim()} / Driver: ${document.getElementById('gpManualDriver').value.trim()}`
            : null,
        driverId: needsVehicle && !isManual
            ? databaseVehicles.find(vehicle => String(vehicle.id) === String(vehicleSelection))?.driverId || null
            : null
    };

    submitButton.disabled = true;
    submitButton.classList.add('opacity-60', 'cursor-wait');
    try {
        const created = await ApiClient.post('/gate-pass-requests', payload);
        form.reset();
        toggleVehicleFields();
        showToast(`Request ${created.gatePass.gatePassNo} submitted.`);
        await loadMyGatePasses();
        switchSection('dashBoard');
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to submit gate pass.', 'error');
    } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-60', 'cursor-wait');
    }
}

function submitMockGatePass(e) {
    const isV = document.getElementById('gpNeedVehicle').checked;
    const willReturnBool = document.querySelector('input[name="gpWillReturn"]:checked').value === 'yes';
    const selectedV = document.getElementById('gpVehicle').value;
    let customVehicleInfo = null;

    if (isV && selectedV === 'others') {
        customVehicleInfo = {
            id: 'MANUAL',
            name: document.getElementById('gpManualVehicle').value,
            plate: 'N/A',
            driver: document.getElementById('gpManualDriver').value,
            status: 'In Use'
        };
    } else if (isV) {
        customVehicleInfo = mockVehicles.find(vehicle => vehicle.id === selectedV);
    }

    gatePasses.push({
        id: `GP-${Math.floor(100000 + Math.random() * 900000)}`,
        userId: currentUser.id,
        userName: currentUser.name,
        userDept: currentUser.dept,
        dateFiled: new Date().toLocaleDateString(),
        destination: document.getElementById('gpDestination').value,
        expectedOut: document.getElementById('gpExpectedOut').value,
        expectedIn: document.getElementById('gpExpectedIn').value || 'N/A',
        purpose: document.getElementById('gpPurpose').value,
        vehicle: customVehicleInfo,
        status: getInitialRequestStatus(currentUser, isV),
        requiresSuperiorApproval: requiresSuperiorApproval(currentUser),
        requiresPresidentApproval: requiresPresidentApproval(currentUser, isV),
        signatures: { imm: null, pres: null, pas: null },
        scanCount: 0,
        actualOut: null,
        actualIn: null,
        willReturn: willReturnBool
    });
    e.target.reset();
    toggleVehicleFields();
    showToast('Request Submitted!');
    switchSection('dashBoard');
}

async function loadFleetReferences() {
    if (!isDatabaseSession()) {
        databaseVehicles = [];
        initializeGatePassForm();
        return;
    }

    try {
        const [vehicles, drivers] = await Promise.all([
            ApiClient.get('/vehicles'),
            ApiClient.get('/drivers')
        ]);
        databaseDrivers = drivers;
        databaseVehicles = vehicles.map((vehicle) => {
            const driver = drivers.find(item => item.driverId === vehicle.defaultDriverId);
            return {
                id: vehicle.vehicleId,
                name: vehicle.vehicleName,
                plate: vehicle.plateNumber,
                driver: driver?.fullName || 'Unassigned',
                driverId: driver?.driverId || null,
                status: gatePassStatusLabels[vehicle.availabilityStatusCode] || vehicle.availabilityStatusCode
            };
        });
        initializeGatePassForm();
        renderAdminTables();
        renderFleetStatusWidget();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to load fleet references.', 'error');
    }
}

function initializeGatePassForm() {
    const vehicleSelect = document.getElementById('gpVehicle');
    if (!vehicleSelect) return;
    const vehicles = isDatabaseSession() ? databaseVehicles : mockVehicles;

    vehicleSelect.innerHTML =
        '<option value="">-- Select --</option>' +
        vehicles.map((vehicle) =>
            `<option value="${vehicle.id}" ${vehicle.status !== 'AVAILABLE' && vehicle.status !== 'Available' ? 'disabled' : ''}>${vehicle.name} (${vehicle.plate}) — ${vehicle.status}</option>`
        ).join('') +
        '<option value="others" class="font-bold text-mpiBlue">Private / Manual Entry</option>';
}

async function loadMyGatePasses() {
    if (!isDatabaseSession()) return;
    const response = await ApiClient.request('/gate-pass-requests/my?page=1&pageSize=100');
    gatePasses = response.items.map(mapApiGatePass);
}

async function loadAllGatePasses(page = 1, pageSize = 100, search = '') {
    if (!isDatabaseSession()) return null;
    const query = new URLSearchParams({ page, pageSize });
    if (search) query.set('search', search);
    const response = await ApiClient.request(`/gate-pass-requests?${query}`);
    gatePasses = response.items.map(mapApiGatePass);
    return response;
}

async function getGatePassDetail(id) {
    const existing = gatePasses.find(pass => pass.id === id || pass.dbId === Number(id));
    if (!isDatabaseSession()) return existing || null;

    const dbId = existing?.dbId || Number(id);
    const detail = await ApiClient.get(`/gate-pass-requests/${dbId}`);
    const mapped = mapApiGatePass(detail);
    const index = gatePasses.findIndex(pass => pass.dbId === mapped.dbId);
    if (index >= 0) gatePasses[index] = mapped;
    else gatePasses.push(mapped);
    return mapped;
}

async function loadQrToken(pass) {
    if (!isDatabaseSession() || !pass?.dbId) return pass?.id || null;
    const qr = await ApiClient.get(`/gate-pass-requests/${pass.dbId}/qr`);
    pass.qrToken = qr.qrToken;
    return qr.qrToken;
}

async function renderStandardDashboard() {
    renderFleetStatusWidget();
    document.getElementById('btnNewRequest').style.display =
        currentUser.role === 'President' ? 'none' : 'block';

    try {
        if (isDatabaseSession()) await loadMyGatePasses();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to load gate pass records.', 'error');
    }

    const myPasses = isDatabaseSession()
        ? gatePasses
        : gatePasses.filter(pass => pass.userId === currentUser.id);
    document.getElementById('cntPending').innerText =
        myPasses.filter(pass => pass.status.startsWith('Pending')).length;
    document.getElementById('cntApproved').innerText =
        myPasses.filter(pass => ['Approved', 'Outside', 'Overdue'].includes(pass.status)).length;
    document.getElementById('cntCompleted').innerText =
        myPasses.filter(pass => ['Returned', 'Closed'].includes(pass.status)).length;

    document.getElementById('myPassesTableBody').innerHTML = myPasses.map((pass) => `
        <tr class="hover:bg-gray-50 transition border-b cursor-pointer" onclick="viewPass('${pass.id}')">
            <td class="px-4 md:px-5 py-3 font-mono text-mpiBlue text-xs font-bold">${pass.id}</td>
            <td class="px-4 md:px-5 py-3">${pass.dateFiled}</td>
            <td class="px-4 md:px-5 py-3 truncate max-w-[150px] md:max-w-[200px]">${pass.destination}</td>
            <td class="px-4 md:px-5 py-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${['Approved'].includes(pass.status) ? 'bg-green-100 text-green-800' : (['Returned', 'Closed'].includes(pass.status) ? 'bg-gray-200 text-gray-700' : (pass.status === 'Outside' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'))}">${pass.status}</span></td>
            <td class="px-4 md:px-5 py-3 text-right"><button class="text-mpiBlue hover:underline text-xs"><i class="fas fa-eye"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="px-5 py-8 text-center text-gray-400">No records found.</td></tr>';
}

window.isDatabaseSession = isDatabaseSession;
window.mapApiGatePass = mapApiGatePass;
window.setNowTime = setNowTime;
window.handleVehicleChange = handleVehicleChange;
window.toggleExpectedIn = toggleExpectedIn;
window.requiresSuperiorApproval = requiresSuperiorApproval;
window.requiresPresidentApproval = requiresPresidentApproval;
window.getInitialRequestStatus = getInitialRequestStatus;
window.updateApprovalRoutePreview = updateApprovalRoutePreview;
window.toggleVehicleFields = toggleVehicleFields;
window.submitGatePass = submitGatePass;
window.initializeGatePassForm = initializeGatePassForm;
window.loadFleetReferences = loadFleetReferences;
window.loadMyGatePasses = loadMyGatePasses;
window.loadAllGatePasses = loadAllGatePasses;
window.getGatePassDetail = getGatePassDetail;
window.loadQrToken = loadQrToken;
window.renderStandardDashboard = renderStandardDashboard;
