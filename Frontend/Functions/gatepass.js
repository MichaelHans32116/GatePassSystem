// Gate pass form, API mapping, and request dashboard.

var databaseVehicles = [];
var databaseDrivers = [];

const gatePassStatusLabels = {
    DRAFT: 'Draft',
    PENDING_SUPERIOR: 'Pending Superior',
    PENDING_HRAD_ASSIGN: 'Pending HRAD Assignment',
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

function findGatePassRecord(idOrDbId = currentViewedPassId) {
    const numericId = Number(idOrDbId);
    const searchStr = String(idOrDbId || '').trim().toLowerCase();
    return gatePasses.find(pass =>
        String(pass.id).toLowerCase() === searchStr ||
        String(pass.controlNo || '').toLowerCase() === searchStr ||
        (Number.isFinite(numericId) && pass.dbId === numericId)
    );
}

function getGatePassViewKey(pass) {
    const dbId = Number(pass?.dbId);
    return Number.isFinite(dbId) && dbId > 0
        ? dbId
        : String(pass?.id || '');
}

function getViewPassCall(pass, isReviewing = false) {
    const viewKey = getGatePassViewKey(pass);
    const serializedKey = typeof viewKey === 'number'
        ? String(viewKey)
        : JSON.stringify(viewKey).replaceAll('"', '&quot;');
    return `viewPass(${serializedKey}${isReviewing ? ', true' : ''})`;
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
            w: Number(step.signatureWidthPercent) > 0
                ? Number(step.signatureWidthPercent)
                : 100,
            y: Number.isFinite(Number(step.signatureYOffset))
                ? Number(step.signatureYOffset)
                : 0
        };
        if (step.approvalStepCode === 'SUPERIOR') signatures.imm = signature;
        if (step.approvalStepCode === 'PRESIDENT') signatures.pres = signature;
        if (step.approvalStepCode === 'PAS') signatures.pas = signature;
    });
    return signatures;
}

function mapGatePassScans(scans = []) {
    return scans.map(scan => ({
        scanId: scan.scanId,
        gatePassId: scan.gatePassId,
        scannedByUserId: scan.scannedByUserId,
        guardName: scan.guardName || '',
        scanMethodCode: scan.scanMethodCode || '',
        scanActionCode: scan.scanActionCode || '',
        resultCode: scan.resultCode || '',
        message: scan.message || '',
        scannedAt: scan.scannedAt || null
    }));
}

function getLatestScanByAction(scans = [], actionCode) {
    return scans
        .filter(scan =>
            scan.scanActionCode === actionCode ||
            scan.resultCode === `${actionCode}_RECORDED`
        )
        .sort((a, b) => new Date(b.scannedAt || 0) - new Date(a.scannedAt || 0))[0] || null;
}

// Normalize the associates/companions list for a gate pass (Phase 11 req5).
// Returns [{ employeeId, departmentId, name }] where index 0 is the PRIMARY associate.
// Falls back to the requester (Person) or authorized employee (Material) when the
// backend has not (yet) returned an explicit associates array, so printing always works.
function mapGatePassAssociates(record) {
    const raw = Array.isArray(record.associates) ? record.associates : [];
    const normalized = raw
        .map(item => ({
            employeeId: item.employeeId ?? item.employeeRecordId ?? null,
            departmentId: item.departmentId ?? null,
            name: (item.name || item.fullName || '').trim()
        }))
        .filter(item => item.name);
    const isMaterial = (record.formTypeCode || 'PERSON_GATE_PASS') === 'MATERIAL_GATE_PASS';
    if (normalized.length > 0) {
        // Person passes store ONLY the additional companions (the requester is never
        // an associate row), so the requester must lead the list as the primary name.
        // Material passes already seed line_no=1 with the authorized employee.
        if (!isMaterial) {
            const requesterName = (record.fullName || '').trim();
            if (requesterName && normalized[0].name !== requesterName) {
                normalized.unshift({
                    employeeId: null,
                    departmentId: record.authorizedDepartmentId || null,
                    name: requesterName
                });
            }
        }
        return normalized;
    }

    const primaryName = (isMaterial
        ? (record.authorizedEmployeeName || record.fullName)
        : record.fullName) || '';
    return primaryName
        ? [{ employeeId: null, departmentId: record.authorizedDepartmentId || null, name: primaryName.trim() }]
        : [];
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
    const scans = mapGatePassScans(record.scans || []);
    const timeOutScan = getLatestScanByAction(scans, 'TIME_OUT');
    const timeInScan = getLatestScanByAction(scans, 'TIME_IN');

    return {
        id: record.gatePassNo,
        gatePassNo: record.gatePassNo,
        dbId: record.gatePassId,
        controlNo: record.controlNo || record.gatePassNo,
        formTypeCode: record.formTypeCode || 'PERSON_GATE_PASS',
        formName: record.formName || 'Person Gate Pass',
        formDate: record.formDate || record.expectedOutAt,
        userId: record.requesterUserId,
        userName: record.fullName,
        userDept: record.departmentName,
        position: record.positionName,
        preparedBySignatureFileId: record.preparedBySignatureFileId || null,
        authorizedEmployeeId: record.authorizedEmployeeId || null,
        authorizedEmployeeNo: record.authorizedEmployeeNo || null,
        authorizedEmployeeName: record.authorizedEmployeeName || null,
        authorizedDepartmentId: record.authorizedDepartmentId || null,
        authorizedDepartmentName: record.authorizedDepartmentName || null,
        associates: mapGatePassAssociates(record),
        materialRemarks: record.materialRemarks || '',
        materialItems: record.materialItems || [],
        proofFileIds: record.proofFileIds || [],
        dateFiled: formatDateTime(record.appliedAt || record.createdAt),
        destination: record.destination,
        expectedOut: formatDateTime(record.expectedOutAt, false),
        expectedIn: record.expectedInAt ? formatDateTime(record.expectedInAt, false) : 'N/A',
        purpose: record.purpose,
        privateVehicleDetails: record.privateVehicleDetails || '',
        vehicle,
        status,
        statusCode: record.gatePassStatusCode,
        requiresSuperiorApproval: steps.some(step => step.approvalStepCode === 'SUPERIOR'),
        requiresPresidentApproval: steps.some(step => step.approvalStepCode === 'PRESIDENT'),
        signatures: mapApprovalSignatures(steps),
        approvalSteps: steps,
        scans,
        scanCount: (record.scans || []).filter(scan =>
            scan.resultCode === 'TIME_OUT_RECORDED' || scan.resultCode === 'TIME_IN_RECORDED'
        ).length,
        actualOut: record.actualOutAt ? formatDateTime(record.actualOutAt, false) : null,
        actualIn: record.actualInAt ? formatDateTime(record.actualInAt, false) : null,
        actualOutSignatureFileId: record.actualOutSignatureFileId || null,
        actualInSignatureFileId: record.actualInSignatureFileId || null,
        preparedBySignatureWidth: record.preparedBySignatureWidth || null,
        preparedBySignatureYOffset: record.preparedBySignatureYOffset || null,
        actualOutSignatureWidth: record.actualOutSignatureWidth || null,
        actualOutSignatureYOffset: record.actualOutSignatureYOffset || null,
        actualInSignatureWidth: record.actualInSignatureWidth || null,
        actualInSignatureYOffset: record.actualInSignatureYOffset || null,
        actualOutGuardName: timeOutScan?.guardName || '',
        actualInGuardName: timeInScan?.guardName || '',
        willReturn: record.willReturn !== false,
        qrToken: record.qrToken || null
    };
}

function setNowTime(inputId) {
    const now = new Date();
    document.getElementById(inputId).value =
        now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function populateDriverOptions(selectedDriverId = null) {
    const driverSelect = document.getElementById('gpDriver');
    if (!driverSelect) return;

    if (!isDatabaseSession()) {
        driverSelect.innerHTML = '<option value="">Auto-assigned in demo mode</option>';
        driverSelect.disabled = true;
        return;
    }

    driverSelect.innerHTML =
        '<option value="">Unassigned</option>' +
        databaseDrivers.map(driver =>
            `<option value="${driver.driverId}" ${driver.driverId === selectedDriverId ? 'selected' : ''}>${adminEscape(driver.fullName)}</option>`
        ).join('');
    driverSelect.disabled = false;
}

function handleVehicleChange(sel) {
    if (sel.value === 'others') {
        populateDriverOptions();
        document.getElementById('gpDriver').disabled = true;
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
    populateDriverOptions(selected?.driverId || null);
    document.getElementById('gpDriver').disabled = !selected;
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
    if (isVehicleNeeded) steps.push('HRAD Assignment');
    if (requiresPresidentApproval(currentUser, isVehicleNeeded)) steps.push('President');
    steps.push('PAS');
    routeText.innerText = steps.join(' -> ');
}

function toggleVehicleFields() {
    const vehicleFields = document.getElementById('vehicleFields');
    const tripTypeField = document.getElementById('employeeTripTypeField');
    const hradFields = document.getElementById('hradVehicleAssignmentFields');
    const vehicleSelect = document.getElementById('gpVehicle');
    const driverSelect = document.getElementById('gpDriver');
    const manualFields = document.getElementById('manualVehicleFields');
    const manualVehicle = document.getElementById('gpManualVehicle');
    const manualDriver = document.getElementById('gpManualDriver');

    if (vehicleFields) vehicleFields.style.display = 'none';
    if (tripTypeField) tripTypeField.style.display = 'none';
    if (hradFields) hradFields.style.display = 'none';
    if (manualFields) manualFields.classList.add('hidden');

    if (vehicleSelect) {
        vehicleSelect.value = '';
        vehicleSelect.required = false;
    }
    if (driverSelect) {
        driverSelect.value = '';
        driverSelect.required = false;
        driverSelect.disabled = true;
    }
    if (manualVehicle) {
        manualVehicle.value = '';
        manualVehicle.required = false;
    }
    if (manualDriver) {
        manualDriver.value = '';
        manualDriver.required = false;
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
    const expectedOut = localDateTimeFromTime(document.getElementById('gpExpectedOut').value);
    const expectedIn = willReturn
        ? localDateTimeFromTime(document.getElementById('gpExpectedIn').value)
        : null;
    const requesterDepartmentId =
        getRequesterDepartmentId?.('PERSON_GATE_PASS') || null;

    if (!currentUser?.departmentId && !requesterDepartmentId) {
        showToast('Select the requesting department.', 'error');
        return;
    }

    if (expectedIn && expectedIn <= expectedOut) {
        showToast('Expected Time In must be later than Expected Time Out.', 'error');
        return;
    }

    if (typeof hasUnconfirmedAssociateRows === 'function' && hasUnconfirmedAssociateRows('PERSON_GATE_PASS')) {
        showToast('Pick an employee for every companion row, or remove the empty rows.', 'error');
        return;
    }
    const associates = typeof collectAssociates === 'function' ? collectAssociates('PERSON_GATE_PASS') : [];

    let vehicleUsageCode = 'NONE';
    let vehicleId = null;
    let driverId = null;
    let privateVehicleDetails = null;

    if (needsVehicle) {
        vehicleUsageCode = 'COMPANY';
        privateVehicleDetails = 'Company Vehicle Needed';
    }

    const payload = {
        requesterDepartmentId,
        destination: document.getElementById('gpDestination').value.trim(),
        purpose: document.getElementById('gpPurpose').value.trim(),
        expectedOutAt: expectedOut.toISOString(),
        expectedInAt: expectedIn?.toISOString() || null,
        willReturn,
        vehicleUsageCode,
        vehicleId,
        privateVehicleDetails,
        driverId,
        associates
    };

    submitButton.disabled = true;
    submitButton.classList.add('opacity-60', 'cursor-wait');
    try {
        const created = await ApiClient.post('/gate-pass-requests', payload);
        form.reset();
        if (typeof resetAssociateRows === 'function') resetAssociateRows('PERSON_GATE_PASS');
        toggleVehicleFields();
        showToast(`Request ${created.gatePass.controlNo || created.gatePass.gatePassNo} submitted.`);
        await refreshApplicationState('submit-person-request');
        await switchSection('dashBoard');
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
    let customVehicleInfo = null;

    if (isV) {
        customVehicleInfo = {
            id: '',
            name: 'Company Vehicle',
            plate: 'Pending HRAD Assignment',
            driver: 'Unassigned',
            status: 'Requested'
        };
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
    if (!isDatabaseSession() && !window.isGuestCalendarView) {
        databaseVehicles = [];
        databaseDrivers = [];
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
                vehicleType: vehicle.vehicleType,
                type: vehicle.vehicleType,
                driver: driver?.fullName || 'Unassigned',
                driverId: driver?.driverId || null,
                defaultDriverId: vehicle.defaultDriverId || null,
                status: gatePassStatusLabels[vehicle.availabilityStatusCode] || vehicle.availabilityStatusCode
            };
        });
        populateDriverOptions();
        initializeGatePassForm();
        renderAdminTables();
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            databaseVehicles = [];
            databaseDrivers = [];
            initializeGatePassForm();
            return;
        }
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
            `<option value="${adminEscape(vehicle.id)}" ${vehicle.status !== 'AVAILABLE' && vehicle.status !== 'Available' ? 'disabled' : ''}>${adminEscape(vehicle.name)} (${adminEscape(vehicle.plate)}) — ${adminEscape(vehicle.status)}</option>`
        ).join('') +
        '<option value="others" class="font-bold text-mpiBlue">Private / Manual Entry</option>';
}

async function loadMyGatePasses() {
    if (!isDatabaseSession()) return;
    const response = await ApiClient.request('/form-requests/my?page=1&pageSize=100');
    gatePasses = response.items.map(mapApiGatePass);
}

async function loadAllGatePasses(page = 1, pageSize = 100, search = '') {
    if (!isDatabaseSession()) return null;
    const query = new URLSearchParams({ page, pageSize });
    if (search) query.set('search', search);
    const response = await ApiClient.request(`/form-requests?${query}`);
    gatePasses = response.items.map(mapApiGatePass);
    return response;
}

async function getGatePassDetail(id) {
    const existing = findGatePassRecord(id);
    if (!isDatabaseSession()) return existing || null;

    let dbId = Number(existing?.dbId ?? id);
    if (!Number.isFinite(dbId) || dbId <= 0) {
        if (typeof id === 'string' && id.trim()) {
            const lookup = await ApiClient.request(
                `/form-requests?page=1&pageSize=20&search=${encodeURIComponent(id.trim())}`
            );
            const match = lookup.items
                .map(mapApiGatePass)
                .find(pass => pass.id === id);
            if (!match?.dbId) {
                return null;
            }
            const index = gatePasses.findIndex(pass => pass.dbId === match.dbId);
            if (index >= 0) gatePasses[index] = match;
            else gatePasses.push(match);
            dbId = match.dbId;
        } else {
            return null;
        }
    }

    const detail = await ApiClient.get(`/form-requests/${dbId}`);
    const mapped = mapApiGatePass(detail);
    const index = gatePasses.findIndex(pass => pass.dbId === mapped.dbId);
    if (index >= 0) gatePasses[index] = mapped;
    else gatePasses.push(mapped);
    return mapped;
}

async function loadQrToken(pass) {
    const passId = pass?.dbId || pass?.id;
    if (!isDatabaseSession() || !passId) return pass?.id || null;
    const qr = await ApiClient.get(`/form-requests/${passId}/qr`);
    pass.qrToken = qr.qrToken;
    return qr.qrToken;
}

async function renderStandardDashboard() {
    renderMyEmployeeQr();
    document.getElementById('btnNewRequest').style.display =
        currentUser.role === 'President' ? 'none' : 'block';

    const dashboardSearch = (document.getElementById('myPassSearch')?.value || '')
        .trim()
        .toLowerCase();
    const myPasses = isDatabaseSession()
        ? gatePasses
        : gatePasses.filter(pass => pass.userId === currentUser.id);
    const visiblePasses = dashboardSearch
        ? myPasses.filter(pass => [
            pass.controlNo,
            pass.id,
            pass.formName,
            pass.status,
            pass.destination,
            pass.authorizedEmployeeName,
            pass.userDept
        ].some(value => String(value || '').toLowerCase().includes(dashboardSearch)))
        : myPasses;
    document.getElementById('cntPending').innerText =
        myPasses.filter(pass => pass.status.startsWith('Pending')).length;
    document.getElementById('cntApproved').innerText =
        myPasses.filter(pass => ['Approved', 'Outside', 'Overdue'].includes(pass.status)).length;
    document.getElementById('cntCompleted').innerText =
        myPasses.filter(pass => ['Returned', 'Closed'].includes(pass.status)).length;

    document.getElementById('myPassesTableBody').innerHTML = visiblePasses.map((pass) => `
        <tr class="hover:bg-gray-50 transition border-b cursor-pointer" onclick="${getViewPassCall(pass)}">
            <td class="px-4 md:px-5 py-3 font-mono text-mpiBlue text-xs font-bold">${materialEscape(pass.controlNo || pass.id)}</td>
            <td class="px-4 md:px-5 py-3">${pass.dateFiled}</td>
            <td class="px-4 md:px-5 py-3 max-w-[220px]"><span class="block text-[9px] font-bold uppercase tracking-wide ${pass.formTypeCode === 'MATERIAL_GATE_PASS' ? 'text-amber-600' : 'text-mpiBlue'}">${materialEscape(pass.formName)}</span><span class="block truncate text-xs text-gray-600">${materialEscape(pass.formTypeCode === 'MATERIAL_GATE_PASS' ? (pass.authorizedEmployeeName || 'Material release') : pass.destination)}</span></td>
            <td class="px-4 md:px-5 py-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${['Approved'].includes(pass.status) ? 'bg-green-100 text-green-800' : (['Returned', 'Closed'].includes(pass.status) ? 'bg-gray-200 text-gray-700' : (pass.status === 'Outside' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'))}">${pass.status}</span></td>
            <td class="px-4 md:px-5 py-3 text-right"><button class="text-mpiBlue hover:underline text-xs"><i class="fas fa-eye"></i></button></td>
        </tr>
    `).join('') || '<tr><td colspan="5" class="px-5 py-8 text-center text-gray-400">No records match your search.</td></tr>';
}

function renderMyEmployeeQr() {
    const card = document.getElementById('myEmployeeQrCard');
    const container = document.getElementById('myEmployeeQrCode');
    if (!card || !container) return;

    const token = currentUser?.employeeQrToken;
    card.classList.toggle('hidden', !token);
    container.innerHTML = '';
    if (!token || typeof window.QRCode !== 'function') return;

    new QRCode(container, {
        text: token,
        width: 132,
        height: 132,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    const employeeId = document.getElementById('myEmployeeQrId');
    if (employeeId) employeeId.innerText = currentUser.id;
}

function getEmployeeQrViewportSize() {
    const viewport = window.visualViewport;
    return {
        width: Math.floor(viewport?.width || window.innerWidth || 0),
        height: Math.floor(viewport?.height || window.innerHeight || 0)
    };
}

function getEmployeeQrDialogMetrics() {
    const panel = document.getElementById('employeeQrDialogPanel');
    const container = document.getElementById('employeeQrDialogCode');
    const { width: viewportWidth, height: viewportHeight } = getEmployeeQrViewportSize();

    if (panel) {
        panel.style.maxWidth = `${Math.min(Math.max(viewportWidth - 24, 0), 520)}px`;
    }

    const panelStyles = panel ? window.getComputedStyle(panel) : null;
    const containerStyles = container ? window.getComputedStyle(container) : null;
    const panelPaddingX = panelStyles
        ? parseFloat(panelStyles.paddingLeft) + parseFloat(panelStyles.paddingRight)
        : 32;
    const containerPaddingX = containerStyles
        ? parseFloat(containerStyles.paddingLeft) + parseFloat(containerStyles.paddingRight)
        : 24;
    const panelWidth = panel?.clientWidth || Math.min(viewportWidth - 24, 520);
    const widthLimit = panelWidth - panelPaddingX - containerPaddingX - 6;
    const heightReserve = viewportHeight < 700 ? 210 : 250;
    const heightLimit = viewportHeight - heightReserve;
    const qrSize = Math.max(0, Math.floor(Math.min(widthLimit, heightLimit, 420)));

    return { qrSize };
}

function renderExpandedEmployeeQr() {
    const dialog = document.getElementById('employeeQrDialog');
    const container = document.getElementById('employeeQrDialogCode');
    const employeeId = document.getElementById('employeeQrDialogId');
    const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
    const token = activeUser?.employeeQrToken;
    if (!dialog || dialog.classList.contains('hidden') || !container) return;
    if (!token || typeof window.QRCode !== 'function') return;

    const { qrSize } = getEmployeeQrDialogMetrics();
    if (qrSize <= 0) return;
    container.innerHTML = '';
    new QRCode(container, {
        text: token,
        width: qrSize,
        height: qrSize,
        colorDark: '#0f172a',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    if (employeeId) employeeId.innerText = currentUser.id || '';
}

function toggleEmployeeQrDialog(forceOpen) {
    const dialog = document.getElementById('employeeQrDialog');
    const token = currentUser?.employeeQrToken;
    if (!dialog) return;

    const shouldOpen = typeof forceOpen === 'boolean'
        ? forceOpen
        : dialog.classList.contains('hidden');

    if (!shouldOpen) {
        dialog.classList.add('hidden', 'pointer-events-none');
        dialog.classList.remove('flex');
        document.body.classList.remove('overflow-hidden');
        return;
    }

    if (!token || typeof window.QRCode !== 'function') return;

    dialog.classList.remove('hidden', 'pointer-events-none');
    dialog.classList.add('flex');
    document.body.classList.add('overflow-hidden');
    requestAnimationFrame(() => requestAnimationFrame(renderExpandedEmployeeQr));
}

function closeEmployeeQrDialog() {
    toggleEmployeeQrDialog(false);
}

function initializeEmployeeQrCard() {
    const dialog = document.getElementById('employeeQrDialog');
    if (dialog && !dialog.dataset.boundDismiss) {
        dialog.addEventListener('click', event => {
            if (event.target === dialog) {
                closeEmployeeQrDialog();
            }
        });
        dialog.dataset.boundDismiss = 'true';
    }
}

document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
        closeEmployeeQrDialog();
    }
});

document.addEventListener('DOMContentLoaded', initializeEmployeeQrCard);
window.addEventListener('resize', renderExpandedEmployeeQr);
window.visualViewport?.addEventListener('resize', renderExpandedEmployeeQr);

window.isDatabaseSession = isDatabaseSession;
window.mapApiGatePass = mapApiGatePass;
window.mapGatePassAssociates = mapGatePassAssociates;
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
window.renderMyEmployeeQr = renderMyEmployeeQr;
window.toggleEmployeeQrDialog = toggleEmployeeQrDialog;
window.closeEmployeeQrDialog = closeEmployeeQrDialog;
window.renderExpandedEmployeeQr = renderExpandedEmployeeQr;
window.findGatePassRecord = findGatePassRecord;
window.getGatePassViewKey = getGatePassViewKey;
window.getViewPassCall = getViewPassCall;
