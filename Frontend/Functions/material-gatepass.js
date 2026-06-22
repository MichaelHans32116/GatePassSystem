// Material Gate Pass form, employee lookup, item rows, and prepared-by signature.

var materialEmployeeDirectory = [];
var preparedSignatureState = {
    PERSON_GATE_PASS: null,
    MATERIAL_GATE_PASS: null
};

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
}

async function loadMaterialEmployees() {
    const select = document.getElementById('materialAuthorizedEmployee');
    if (!select || !isDatabaseSession()) return;
    if (materialEmployeeDirectory.length > 0) {
        renderMaterialEmployeeOptions();
        return;
    }

    try {
        materialEmployeeDirectory = await ApiClient.get('/employees?limit=100');
        renderMaterialEmployeeOptions();
    } catch (error) {
        select.innerHTML = '<option value="">Unable to load employees</option>';
        showToast(
            error instanceof ApiError ? error.message : 'Unable to load active employees.',
            'error'
        );
    }
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
    return formTypeCode === 'MATERIAL_GATE_PASS' ? 'material' : 'person';
}

async function handlePreparedSignatureUpload(event, formTypeCode) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 5 * 1024 * 1024) {
        showToast('Use a PNG or JPEG signature up to 5 MB.', 'error');
        event.target.value = '';
        return;
    }

    try {
        const original = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
        const image = await loadImageFromDataUrl(original);
        const cleaned = removeSignatureBackground(image, {
            mode: 'autoSmart',
            threshold: 20
        });
        preparedSignatureState[formTypeCode] = cleaned;
        renderPreparedSignaturePreview(formTypeCode);
        showToast('Prepared-by signature attached.');
    } catch {
        showToast('Unable to process that signature image.', 'error');
        event.target.value = '';
    }
}

function renderPreparedSignaturePreview(formTypeCode) {
    const prefix = preparedSignaturePrefix(formTypeCode);
    const preview = document.getElementById(`${prefix}PreparedSignaturePreview`);
    const clear = document.getElementById(`${prefix}PreparedSignatureClear`);
    const dataUrl = preparedSignatureState[formTypeCode];
    if (preview) {
        preview.innerHTML = dataUrl ? `<img src="${dataUrl}" alt="Prepared signature preview">` : '';
        preview.classList.toggle('hidden', !dataUrl);
    }
    clear?.classList.toggle('hidden', !dataUrl);
}

function clearPreparedSignature(formTypeCode) {
    preparedSignatureState[formTypeCode] = null;
    const prefix = preparedSignaturePrefix(formTypeCode);
    const input = document.getElementById(`${prefix}PreparedSignatureUpload`);
    if (input) input.value = '';
    renderPreparedSignaturePreview(formTypeCode);
}

async function uploadPreparedSignature(formTypeCode) {
    const dataUrl = preparedSignatureState[formTypeCode];
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
            authorizedEmployeeId: Number(document.getElementById('materialAuthorizedEmployee').value),
            formDate: document.getElementById('materialFormDate').value,
            remarks: document.getElementById('materialRemarks').value.trim() || null,
            preparedBySignatureFileId: signatureFileId,
            items
        });

        form.reset();
        document.getElementById('materialItemsBody').innerHTML = '';
        clearPreparedSignature('MATERIAL_GATE_PASS');
        initializeMaterialGatePassForm();
        renderMaterialEmployeeOptions();
        showToast(`Material request ${created.gatePass.controlNo} submitted.`);
        await loadMyGatePasses();
        switchSection('dashBoard');
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

document.addEventListener('DOMContentLoaded', initializeMaterialGatePassForm);
window.addEventListener('gatepass:authenticated', loadMaterialEmployees);

window.selectRequestFormType = selectRequestFormType;
window.loadMaterialEmployees = loadMaterialEmployees;
window.updateMaterialAuthorizedDepartment = updateMaterialAuthorizedDepartment;
window.addMaterialItemRow = addMaterialItemRow;
window.removeMaterialItemRow = removeMaterialItemRow;
window.handlePreparedSignatureUpload = handlePreparedSignatureUpload;
window.clearPreparedSignature = clearPreparedSignature;
window.uploadPreparedSignature = uploadPreparedSignature;
window.submitMaterialGatePass = submitMaterialGatePass;
