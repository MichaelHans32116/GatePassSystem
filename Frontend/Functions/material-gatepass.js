// Material Gate Pass form, employee lookup, item rows, and prepared-by signature.

var materialEmployeeDirectory = [];
var selectedMaterialEmployee = null;
var materialEmployeeSearchTimer = null;
var preparedSignatureState = null;
var preparedSignatureOriginalData = null;
var materialSignaturePadState = { drawing: false, lastX: 0, lastY: 0 };

function materialEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function selectRequestFormType(formTypeCode) {
    const isMaterial = formTypeCode === 'MATERIAL_GATE_PASS';
    resetAllSignatureState?.();
    document.getElementById('applyForm')?.classList.toggle('hidden', isMaterial);
    document.getElementById('materialApplyForm')?.classList.toggle('hidden', !isMaterial);

    const personButton = document.getElementById('formTypePersonButton');
    const materialButton = document.getElementById('formTypeMaterialButton');
    personButton?.classList.toggle('active', !isMaterial);
    materialButton?.classList.toggle('active', isMaterial);
    personButton?.classList.toggle('border-mpiBlue', !isMaterial);
    personButton?.classList.toggle('border-transparent', isMaterial);
    materialButton?.classList.toggle('border-mpiBlue', isMaterial);
    materialButton?.classList.toggle('border-transparent', !isMaterial);

    document.getElementById('pageTitle').innerText =
        isMaterial ? 'New Material Gate Pass' : 'New Person Gate Pass';

    if (isMaterial) {
        renderRequesterDepartmentSelectors?.();
        initializeMaterialGatePassForm();
        loadMaterialEmployees();
    } else {
        updateApprovalRoutePreview?.();
    }
}

function initializeMaterialGatePassForm() {
    const dateInput = document.getElementById('materialFormDate');
    if (dateInput && !dateInput.value) {
        const now = new Date();
        const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
        dateInput.value = localDate.toISOString().slice(0, 10);
    }

    const body = document.getElementById('materialItemsBody');
    if (body && body.children.length === 0) {
        addMaterialItemRow();
    }

    const routeText = document.getElementById('materialApprovalRouteText');
    if (routeText) {
        const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
        routeText.innerText = (activeUser?.roles || []).includes(
            'IMMEDIATE_SUPERIOR'
        )
            ? 'PAS'
            : 'Immediate Superior → PAS';
    }
}

async function loadMaterialEmployees() {
    const input = document.getElementById('materialAuthorizedEmployeeSearch');
    if (!input || !isDatabaseSession()) return;
    if (materialEmployeeDirectory.length > 0) {
        renderMaterialEmployeeSuggestions();
        return;
    }

    try {
        materialEmployeeDirectory = await ApiClient.get('/employees?limit=100');
        renderMaterialEmployeeSuggestions();
    } catch (error) {
        const suggestions = document.getElementById('materialEmployeeSuggestions');
        if (suggestions) {
            suggestions.innerHTML = '<div class="px-3 py-2 text-xs text-red-500">Unable to load employees</div>';
        }
        showToast(
            error instanceof ApiError ? error.message : 'Unable to load active employees.',
            'error'
        );
    }
}

function materialEmployeeLabel(employee) {
    if (!employee) return '';
    return `${employee.fullName} (${employee.employeeId})`;
}

function materialEmployeeMeta(employee) {
    if (!employee) return '';
    return [employee.departmentName, employee.positionName].filter(Boolean).join(' · ');
}

function selectMaterialEmployee(employee) {
    selectedMaterialEmployee = employee || null;
    const hidden = document.getElementById('materialAuthorizedEmployee');
    const search = document.getElementById('materialAuthorizedEmployeeSearch');
    const suggestions = document.getElementById('materialEmployeeSuggestions');
    if (hidden) hidden.value = employee ? String(employee.employeeRecordId) : '';
    if (search) search.value = employee ? materialEmployeeLabel(employee) : '';
    suggestions?.classList.add('hidden');
    updateMaterialAuthorizedDepartment();
}

function clearSelectedMaterialEmployee() {
    selectedMaterialEmployee = null;
    const hidden = document.getElementById('materialAuthorizedEmployee');
    if (hidden) hidden.value = '';
    updateMaterialAuthorizedDepartment();
}

function getFilteredMaterialEmployees() {
    const term = (document.getElementById('materialAuthorizedEmployeeSearch')?.value || '')
        .trim()
        .toLowerCase();
    const source = materialEmployeeDirectory || [];
    if (!term) return source.slice(0, 10);
    return source
        .filter(employee =>
            employee.fullName?.toLowerCase().includes(term) ||
            employee.employeeId?.toLowerCase().includes(term) ||
            employee.departmentName?.toLowerCase().includes(term)
        )
        .slice(0, 10);
}

function renderMaterialEmployeeSuggestions() {
    const suggestions = document.getElementById('materialEmployeeSuggestions');
    if (!suggestions) return;
    const list = getFilteredMaterialEmployees();
    suggestions.innerHTML = list.map(employee => `
        <button type="button" class="block w-full px-3 py-2 text-left hover:bg-blue-50" onclick="selectMaterialEmployeeById(${employee.employeeRecordId})">
            <span class="block text-xs font-bold text-gray-800">${materialEscape(materialEmployeeLabel(employee))}</span>
            <span class="block text-[10px] text-gray-500">${materialEscape(materialEmployeeMeta(employee))}</span>
        </button>
    `).join('') || '<div class="px-3 py-2 text-xs text-red-500">No active employee found.</div>';
}

function showMaterialEmployeeSuggestions() {
    const suggestions = document.getElementById('materialEmployeeSuggestions');
    if (!suggestions) return;
    renderMaterialEmployeeSuggestions();
    suggestions.classList.remove('hidden');
}

async function searchMaterialEmployees(term) {
    if (!isDatabaseSession()) return;
    const query = term?.trim();
    if (!query || query.length < 2) {
        renderMaterialEmployeeSuggestions();
        return;
    }
    try {
        const results = await ApiClient.get(`/employees?search=${encodeURIComponent(query)}&limit=20`);
        const byId = new Map(materialEmployeeDirectory.map(employee => [
            String(employee.employeeRecordId),
            employee
        ]));
        results.forEach(employee => byId.set(String(employee.employeeRecordId), employee));
        materialEmployeeDirectory = Array.from(byId.values());
        renderMaterialEmployeeSuggestions();
        showMaterialEmployeeSuggestions();
    } catch {
        renderMaterialEmployeeSuggestions();
    }
}

function handleMaterialEmployeeSearchInput(event) {
    const value = event.target.value.trim();
    if (
        selectedMaterialEmployee &&
        value !== materialEmployeeLabel(selectedMaterialEmployee)
    ) {
        clearSelectedMaterialEmployee();
    }
    renderMaterialEmployeeSuggestions();
    showMaterialEmployeeSuggestions();
    clearTimeout(materialEmployeeSearchTimer);
    materialEmployeeSearchTimer = setTimeout(() => {
        searchMaterialEmployees(value);
    }, 250);
}

function handleMaterialEmployeeSearchKeydown(event) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const first = getFilteredMaterialEmployees()[0];
    if (first) selectMaterialEmployee(first);
}

function selectMaterialEmployeeById(employeeRecordId) {
    const employee = materialEmployeeDirectory.find(item =>
        Number(item.employeeRecordId) === Number(employeeRecordId)
    );
    if (employee) selectMaterialEmployee(employee);
}

function renderMaterialEmployeeOptions() {
    const select = document.getElementById('materialAuthorizedEmployee');
    if (!select) return;
    const selected = select.value;
    select.innerHTML =
        '<option value="">-- Select active employee --</option>' +
        materialEmployeeDirectory.map(employee =>
            `<option value="${employee.employeeRecordId}" data-department="${materialEscape(employee.departmentName)}">${materialEscape(employee.fullName)} (${materialEscape(employee.employeeId)}) — ${materialEscape(employee.departmentName)}</option>`
        ).join('');

    const preferred = materialEmployeeDirectory.find(employee =>
        String(employee.employeeRecordId) === selected ||
        employee.employeeId === currentUser?.id
    );
    if (preferred) select.value = String(preferred.employeeRecordId);
    updateMaterialAuthorizedDepartment();
}

function updateMaterialAuthorizedDepartment() {
    const select = document.getElementById('materialAuthorizedEmployee');
    const display = document.getElementById('materialAuthorizedDepartment');
    if (!select || !display) return;
    const employee = materialEmployeeDirectory.find(item =>
        String(item.employeeRecordId) === select.value
    );
    display.innerText = employee
        ? `${employee.departmentName} · ${employee.positionName}`
        : 'Department appears after selecting an employee.';
}

function updateMaterialAuthorizedDepartment() {
    const hidden = document.getElementById('materialAuthorizedEmployee');
    const display = document.getElementById('materialAuthorizedDepartment');
    if (!hidden || !display) return;
    const employee = materialEmployeeDirectory.find(item =>
        String(item.employeeRecordId) === hidden.value
    );
    display.innerText = employee
        ? materialEmployeeMeta(employee)
        : 'Type and select an active employee.';
}

function validateMaterialAuthorizedEmployee() {
    const hidden = document.getElementById('materialAuthorizedEmployee');
    const search = document.getElementById('materialAuthorizedEmployeeSearch');
    const employee = materialEmployeeDirectory.find(item =>
        String(item.employeeRecordId) === hidden?.value
    );
    if (!employee || search?.value.trim() !== materialEmployeeLabel(employee)) {
        clearSelectedMaterialEmployee();
        showToast('Select an active employee from the search results.', 'error');
        search?.focus();
        return null;
    }
    return employee;
}

function addMaterialItemRow(values = {}) {
    const body = document.getElementById('materialItemsBody');
    if (!body || body.children.length >= 20) {
        if (body?.children.length >= 20) {
            showToast('Maximum of 20 material items reached.', 'error');
        }
        return;
    }

    const row = document.createElement('tr');
    row.className = 'border-b last:border-b-0';
    row.innerHTML = `
        <td class="material-line-number px-3 py-2 text-center text-xs font-bold text-gray-400"></td>
        <td class="px-3 py-2"><input data-material-field="itemNo" maxlength="80" class="w-full rounded border border-gray-300 p-2 text-xs" value="${materialEscape(values.itemNo || '')}"></td>
        <td class="px-3 py-2"><input data-material-field="description" maxlength="500" required class="w-full rounded border border-gray-300 p-2 text-xs" value="${materialEscape(values.description || '')}"></td>
        <td class="px-3 py-2"><input data-material-field="quantity" type="number" min="0.001" max="999999999.999" step="0.001" required class="w-full rounded border border-gray-300 p-2 text-xs" value="${materialEscape(values.quantity || '1')}"></td>
        <td class="px-3 py-2"><input data-material-field="unit" maxlength="50" required class="w-full rounded border border-gray-300 p-2 text-xs" value="${materialEscape(values.unit || 'pc')}"></td>
        <td class="px-3 py-2 text-center"><button type="button" onclick="removeMaterialItemRow(this)" class="rounded p-2 text-red-500 hover:bg-red-50" title="Remove item"><i class="fas fa-trash"></i></button></td>`;
    body.appendChild(row);
    renumberMaterialItemRows();
}

function removeMaterialItemRow(button) {
    const body = document.getElementById('materialItemsBody');
    if (!body) return;
    if (body.children.length <= 1) {
        showToast('A material gate pass needs at least one item.', 'error');
        return;
    }
    button.closest('tr')?.remove();
    renumberMaterialItemRows();
}

function renumberMaterialItemRows() {
    document.querySelectorAll('#materialItemsBody tr').forEach((row, index) => {
        const line = row.querySelector('.material-line-number');
        if (line) line.innerText = String(index + 1);
    });
}

function readMaterialItems() {
    return [...document.querySelectorAll('#materialItemsBody tr')].map(row => ({
        itemNo: row.querySelector('[data-material-field="itemNo"]').value.trim() || null,
        description: row.querySelector('[data-material-field="description"]').value.trim(),
        quantity: Number(row.querySelector('[data-material-field="quantity"]').value),
        unit: row.querySelector('[data-material-field="unit"]').value.trim()
    }));
}

function preparedSignaturePrefix(formTypeCode) {
    return formTypeCode === 'MATERIAL_GATE_PASS' ? 'material' : '';
}

function resetMaterialPreparedSignatureState(options = {}) {
    preparedSignatureState = null;
    preparedSignatureOriginalData = null;

    if (options.clearDirectory === true) {
        materialEmployeeDirectory = [];
    }

    const input = document.getElementById('materialPreparedSignatureUpload');
    const fileName = document.getElementById('materialPreparedSignatureFileName');
    const selectedFileRow = document.getElementById('materialPreparedSignatureFileRow');
    const mode = document.getElementById('materialPreparedSignatureBgMode');
    const threshold = document.getElementById('materialPreparedSignatureBgThreshold');
    const thresholdValue = document.getElementById('materialPreparedSignatureBgThresholdValue');
    const bgOptions = document.getElementById('materialPreparedSignatureBgOptions');
    const canvas = document.getElementById('materialSignaturePad');
    const uploadPanel = document.getElementById('materialSignatureUploadPanel');
    const drawPanel = document.getElementById('materialSignatureDrawPanel');
    const uploadButton = document.getElementById('btnMaterialSignatureUploadPanel');
    const drawButton = document.getElementById('btnMaterialSignatureDrawPanel');

    if (input) input.value = '';
    if (fileName) fileName.innerText = '';
    selectedFileRow?.classList.add('hidden');
    if (mode) mode.value = 'none';
    if (threshold) threshold.value = 20;
    if (thresholdValue) thresholdValue.innerText = '20';
    bgOptions?.classList.add('hidden');
    uploadPanel?.classList.remove('hidden');
    drawPanel?.classList.add('hidden');
    uploadButton?.classList.add('bg-mpiBlue', 'text-white');
    uploadButton?.classList.remove('bg-white', 'text-mpiBlue', 'border');
    drawButton?.classList.remove('bg-mpiBlue', 'text-white');
    drawButton?.classList.add('bg-white', 'text-mpiBlue', 'border', 'border-blue-200');

    if (canvas) {
        const ctx = canvas.getContext('2d');
        ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }

    renderPreparedSignaturePreview('MATERIAL_GATE_PASS');
    setMaterialPreparedSignatureStatus('Choose an image or draw your signature.', 'muted');
}

function setMaterialPreparedSignatureStatus(message, type = 'muted') {
    const status = document.getElementById('materialPreparedSignatureStatus');
    if (!status) return;

    status.className = 'mt-2 text-[10px] leading-relaxed';
    if (type === 'success') status.classList.add('text-green-700', 'font-semibold');
    else if (type === 'error') status.classList.add('text-red-600', 'font-semibold');
    else if (type === 'info') status.classList.add('text-mpiBlue', 'font-semibold');
    else status.classList.add('text-gray-500');

    status.innerText = message;
}

function showMaterialPreparedSignatureSource(source) {
    const uploadPanel = document.getElementById('materialSignatureUploadPanel');
    const drawPanel = document.getElementById('materialSignatureDrawPanel');
    const uploadButton = document.getElementById('btnMaterialSignatureUploadPanel');
    const drawButton = document.getElementById('btnMaterialSignatureDrawPanel');

    if (source === 'draw') {
        uploadPanel?.classList.add('hidden');
        drawPanel?.classList.remove('hidden');
        drawButton?.classList.add('bg-mpiBlue', 'text-white');
        drawButton?.classList.remove('bg-white', 'text-mpiBlue', 'border');
        uploadButton?.classList.remove('bg-mpiBlue', 'text-white');
        uploadButton?.classList.add('bg-white', 'text-mpiBlue', 'border', 'border-blue-200');
        requestAnimationFrame(resizeMaterialPreparedSignatureCanvas);
        setMaterialPreparedSignatureStatus('Draw the prepared-by signature, then use it.', 'info');
        return;
    }

    drawPanel?.classList.add('hidden');
    uploadPanel?.classList.remove('hidden');
    uploadButton?.classList.add('bg-mpiBlue', 'text-white');
    uploadButton?.classList.remove('bg-white', 'text-mpiBlue', 'border');
    drawButton?.classList.remove('bg-mpiBlue', 'text-white');
    drawButton?.classList.add('bg-white', 'text-mpiBlue', 'border', 'border-blue-200');
    if (!preparedSignatureOriginalData && !preparedSignatureState) {
        setMaterialPreparedSignatureStatus('Choose an image or switch to Draw Signature.', 'muted');
    }
}

function renderPreparedSignaturePreview(formTypeCode) {
    if (formTypeCode !== 'MATERIAL_GATE_PASS') return;
    const preview = document.getElementById('materialPreparedSignaturePreview');
    const clear = document.getElementById('materialPreparedSignatureClear');
    const dataUrl = preparedSignatureState;
    if (preview) {
        preview.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="Prepared signature preview">` : '';
        preview.classList.toggle('hidden', !dataUrl);
    }
    clear?.classList.toggle('hidden', !dataUrl);
}

async function processMaterialPreparedSignature(showMessage = true) {
    if (!preparedSignatureOriginalData) return;

    let mode = document.getElementById('materialPreparedSignatureBgMode')?.value || 'none';
    const threshold = parseInt(
        document.getElementById('materialPreparedSignatureBgThreshold')?.value || '20',
        10
    );

    try {
        if (mode === 'none') {
            preparedSignatureState = preparedSignatureOriginalData;
        } else if (mode === 'aiServer' && isDatabaseSession()) {
            preparedSignatureState = await removeBackgroundWithPython(preparedSignatureOriginalData);
        } else {
            const image = await loadImageFromDataUrl(preparedSignatureOriginalData);
            let effectiveMode = mode;
            if (mode === 'aiServer') {
                effectiveMode = 'autoSmart';
            }
            preparedSignatureState = removeSignatureBackground(image, {
                mode: effectiveMode,
                threshold
            });
        }

        renderPreparedSignaturePreview('MATERIAL_GATE_PASS');
        document.getElementById('materialPreparedSignatureBgOptions')?.classList.remove('hidden');
        setMaterialPreparedSignatureStatus(
            mode === 'none'
                ? 'Prepared-by signature attached.'
                : 'Prepared-by signature cleaned and previewed.',
            'success'
        );
        if (showMessage) {
            showToast('Prepared-by signature preview updated.');
        }
    } catch {
        const image = await loadImageFromDataUrl(preparedSignatureOriginalData);
        preparedSignatureState = removeSignatureBackground(image, {
            mode: 'autoSmart',
            threshold
        });
        renderPreparedSignaturePreview('MATERIAL_GATE_PASS');
        document.getElementById('materialPreparedSignatureBgOptions')?.classList.remove('hidden');
        setMaterialPreparedSignatureStatus('Local auto cleanup used instead.', 'info');
    }
}

async function handlePreparedSignatureUpload(event, formTypeCode) {
    if (formTypeCode !== 'MATERIAL_GATE_PASS') {
        event.target.value = '';
        return;
    }

    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        showToast('Use a PNG or JPEG signature up to 5 MB.', 'error');
        event.target.value = '';
        return;
    }

    try {
        preparedSignatureOriginalData = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });

        const fileName = document.getElementById('materialPreparedSignatureFileName');
        const selectedFileRow = document.getElementById('materialPreparedSignatureFileRow');
        if (fileName) fileName.innerText = file.name;
        selectedFileRow?.classList.remove('hidden');
        document.getElementById('materialPreparedSignatureBgMode').value = 'autoSmart';
        document.getElementById('materialPreparedSignatureBgThreshold').value = 20;
        document.getElementById('materialPreparedSignatureBgThresholdValue').innerText = '20';
        document.getElementById('materialPreparedSignatureBgOptions')?.classList.remove('hidden');
        await processMaterialPreparedSignature();
    } catch {
        showToast('Unable to process that signature image.', 'error');
        event.target.value = '';
    }
}

function clearPreparedSignature(formTypeCode) {
    if (formTypeCode !== 'MATERIAL_GATE_PASS') return;
    resetMaterialPreparedSignatureState();
}

async function uploadPreparedSignature(formTypeCode) {
    if (formTypeCode !== 'MATERIAL_GATE_PASS') return null;
    const dataUrl = preparedSignatureState;
    if (!dataUrl) return null;
    const formData = new FormData();
    formData.append('file', dataUrlToBlob(dataUrl), 'prepared-signature.png');
    formData.append('widthPercent', '100');
    formData.append('yOffset', '0');
    const uploaded = await ApiClient.post('/signatures', formData);
    return uploaded.signatureFileId;
}

async function submitMaterialGatePass(event) {
    event.preventDefault();
    if (!isDatabaseSession()) {
        showToast('Backend connection is required for material requests.', 'error');
        return;
    }

    const form = event.target;
    const submitButton = form.querySelector('button[type="submit"]');
    const requesterDepartmentId =
        getRequesterDepartmentId?.('MATERIAL_GATE_PASS') || null;
    if (!currentUser?.departmentId && !requesterDepartmentId) {
        showToast('Select the requesting department.', 'error');
        return;
    }
    const authorizedEmployee = validateMaterialAuthorizedEmployee();
    if (!authorizedEmployee) return;

    const items = readMaterialItems();
    if (items.some(item =>
        !item.description || !item.unit || !Number.isFinite(item.quantity) || item.quantity <= 0
    )) {
        showToast('Complete the description, quantity, and unit for every item.', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.classList.add('opacity-60', 'cursor-wait');
    try {
        const signatureFileId = await uploadPreparedSignature('MATERIAL_GATE_PASS');
        const created = await ApiClient.post('/form-requests/material', {
            requesterDepartmentId,
            authorizedEmployeeId: authorizedEmployee.employeeRecordId,
            formDate: document.getElementById('materialFormDate').value,
            remarks: document.getElementById('materialRemarks').value.trim() || null,
            preparedBySignatureFileId: signatureFileId,
            items
        });

        form.reset();
        clearSelectedMaterialEmployee();
        document.getElementById('materialItemsBody').innerHTML = '';
        clearPreparedSignature('MATERIAL_GATE_PASS');
        initializeMaterialGatePassForm();
        renderMaterialEmployeeSuggestions();
        showToast(`Material request ${created.gatePass.controlNo} submitted.`);
        await refreshApplicationState('submit-material-request');
        await switchSection('dashBoard');
    } catch (error) {
        showToast(
            error instanceof ApiError ? error.message : 'Unable to submit material request.',
            'error'
        );
    } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-60', 'cursor-wait');
    }
}

function resizeMaterialPreparedSignatureCanvas() {
    const canvas = document.getElementById('materialSignaturePad');
    if (!canvas) return;
    const existing = canvas.toDataURL('image/png');
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    if (rect.width <= 0) return;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(170 * dpr);
    canvas.style.height = '170px';
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    if (existing && existing.length > 1000) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, rect.width, 170);
        img.src = existing;
    }
}

function setupMaterialPreparedSignaturePad() {
    const canvas = document.getElementById('materialSignaturePad');
    if (!canvas) return;
    resizeMaterialPreparedSignatureCanvas();

    const getPoint = event => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top
        };
    };

    const start = event => {
        event.preventDefault();
        materialSignaturePadState.drawing = true;
        const point = getPoint(event);
        materialSignaturePadState.lastX = point.x;
        materialSignaturePadState.lastY = point.y;
    };

    const move = event => {
        if (!materialSignaturePadState.drawing) return;
        event.preventDefault();
        const ctx = canvas.getContext('2d');
        const point = getPoint(event);
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = '#020617';
        ctx.beginPath();
        ctx.moveTo(materialSignaturePadState.lastX, materialSignaturePadState.lastY);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        materialSignaturePadState.lastX = point.x;
        materialSignaturePadState.lastY = point.y;
    };

    const end = () => {
        materialSignaturePadState.drawing = false;
    };

    canvas.addEventListener('pointerdown', start);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointerleave', end);
    window.addEventListener('resize', resizeMaterialPreparedSignatureCanvas);
}

function clearMaterialPreparedSignaturePad() {
    const canvas = document.getElementById('materialSignaturePad');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setMaterialPreparedSignatureStatus('Signature pad cleared.', 'muted');
}

function useMaterialPreparedDrawnSignature() {
    const canvas = document.getElementById('materialSignaturePad');
    if (!canvas) return;
    if (isSignatureCanvasBlank(canvas)) {
        setMaterialPreparedSignatureStatus('Draw a signature before using it.', 'error');
        showToast('Please draw a prepared-by signature first.', 'error');
        return;
    }

    preparedSignatureOriginalData = null;
    preparedSignatureState = canvas.toDataURL('image/png');
    renderPreparedSignaturePreview('MATERIAL_GATE_PASS');
    document.getElementById('materialPreparedSignatureBgOptions')?.classList.add('hidden');
    setMaterialPreparedSignatureStatus('Drawn prepared-by signature added.', 'success');
    showToast('Prepared-by signature preview updated.');
}

function initializeMaterialPreparedSignatureControls() {
    const mode = document.getElementById('materialPreparedSignatureBgMode');
    const threshold = document.getElementById('materialPreparedSignatureBgThreshold');

    mode?.addEventListener('change', function() {
        processMaterialPreparedSignature();
    });

    threshold?.addEventListener('input', function() {
        document.getElementById('materialPreparedSignatureBgThresholdValue').innerText = this.value;
        if (mode?.value !== 'none') processMaterialPreparedSignature(false);
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initializeMaterialGatePassForm();
    setupMaterialPreparedSignaturePad();
    initializeMaterialPreparedSignatureControls();
    resetMaterialPreparedSignatureState();
    document.addEventListener('click', event => {
        if (!event.target.closest('#materialAuthorizedEmployeeSearch') &&
            !event.target.closest('#materialEmployeeSuggestions')) {
            document.getElementById('materialEmployeeSuggestions')?.classList.add('hidden');
        }
    });
});

window.selectRequestFormType = selectRequestFormType;
window.loadMaterialEmployees = loadMaterialEmployees;
window.handleMaterialEmployeeSearchInput = handleMaterialEmployeeSearchInput;
window.handleMaterialEmployeeSearchKeydown = handleMaterialEmployeeSearchKeydown;
window.showMaterialEmployeeSuggestions = showMaterialEmployeeSuggestions;
window.selectMaterialEmployeeById = selectMaterialEmployeeById;
window.updateMaterialAuthorizedDepartment = updateMaterialAuthorizedDepartment;
window.addMaterialItemRow = addMaterialItemRow;
window.removeMaterialItemRow = removeMaterialItemRow;
window.handlePreparedSignatureUpload = handlePreparedSignatureUpload;
window.clearPreparedSignature = clearPreparedSignature;
window.uploadPreparedSignature = uploadPreparedSignature;
window.submitMaterialGatePass = submitMaterialGatePass;
window.showMaterialPreparedSignatureSource = showMaterialPreparedSignatureSource;
window.clearMaterialPreparedSignaturePad = clearMaterialPreparedSignaturePad;
window.useMaterialPreparedDrawnSignature = useMaterialPreparedDrawnSignature;
window.resetMaterialPreparedSignatureState = resetMaterialPreparedSignatureState;
