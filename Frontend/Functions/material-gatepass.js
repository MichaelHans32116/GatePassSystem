// Material Gate Pass form, employee lookup, item rows, and prepared-by signature.

var materialEmployeeDirectory = [];
var selectedMaterialEmployee = null;
var materialEmployeeSearchTimer = null;
var preparedSignatureState = null;
var preparedSignatureOriginalData = null;
var materialSignaturePadState = { drawing: false, lastX: 0, lastY: 0 };
var materialProofState = { file1: null, file2: null };

function materialEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

// ----- Associates / Companions multi-row picker (Phase 11 req5) -----
// Shared by both the Person form (#personAssociatesBody) and Material form (#materialAssociatesBody).
// Each row is a self-contained employee typeahead. Selected value is stored on the row as
// dataset.employeeId / dataset.departmentId / dataset.name. Reuses GET /employees like the
// authorized-employee picker. Max 19 additional companions per form.
var associateDirectoryCache = [];
var associateRowSeq = 0;
var associateSearchTimers = {};

function associateBodyId(formTypeCode) {
    return formTypeCode === 'MATERIAL_GATE_PASS' ? 'materialAssociatesBody' : 'personAssociatesBody';
}

function associateEmptyId(formTypeCode) {
    return formTypeCode === 'MATERIAL_GATE_PASS' ? 'materialAssociatesEmpty' : 'personAssociatesEmpty';
}

async function ensureAssociateDirectory() {
    if (associateDirectoryCache.length > 0 || !isDatabaseSession()) return;
    try {
        associateDirectoryCache = await ApiClient.get('/employees?limit=100');
    } catch {
        associateDirectoryCache = [];
    }
}

// Bug 10: keep the companions dropdown short and relevant. Require a couple of
// characters before searching, rank prefix matches (name/ID/last name) ahead of
// loose substring hits, and cap the list to a small, scannable set.
var ASSOCIATE_SUGGESTION_LIMIT = 6;
var ASSOCIATE_SEARCH_MIN_CHARS = 2;

function filterAssociateEmployees(term) {
    const needle = (term || '').trim().toLowerCase();
    const source = associateDirectoryCache || [];
    if (needle.length < ASSOCIATE_SEARCH_MIN_CHARS) return [];

    const scored = [];
    for (const employee of source) {
        const name = (employee.fullName || '').toLowerCase();
        const empId = (employee.employeeId || '').toLowerCase();
        const dept = (employee.departmentName || '').toLowerCase();
        let rank = -1;
        if (name.startsWith(needle) || empId.startsWith(needle)) {
            rank = 0; // strongest: full name or ID starts with the term
        } else if (name.split(/\s+/).some(word => word.startsWith(needle))) {
            rank = 1; // a name word starts with the term (e.g. surname)
        } else if (name.includes(needle) || empId.includes(needle) || dept.includes(needle)) {
            rank = 2; // loose substring match anywhere
        }
        if (rank >= 0) scored.push({ employee, rank });
    }
    scored.sort((a, b) => a.rank - b.rank); // stable: preserves cache order within a rank
    return scored.slice(0, ASSOCIATE_SUGGESTION_LIMIT).map(s => s.employee);
}

function updateAssociatesEmptyHint(formTypeCode) {
    const body = document.getElementById(associateBodyId(formTypeCode));
    const hint = document.getElementById(associateEmptyId(formTypeCode));
    if (hint) hint.classList.toggle('hidden', !!body && body.children.length > 0);
}

async function addAssociateRow(formTypeCode, values = {}) {
    const body = document.getElementById(associateBodyId(formTypeCode));
    if (!body) return;
    if (body.children.length >= 19) {
        showToast('Maximum of 19 additional companions reached.', 'error');
        return;
    }
    await ensureAssociateDirectory();

    const rowId = 'assocRow' + (++associateRowSeq);
    const row = document.createElement('div');
    row.className = 'associate-row flex items-start gap-2 px-4 py-2';
    row.id = rowId;
    row.dataset.employeeId = values.employeeId ? String(values.employeeId) : '';
    row.dataset.departmentId = values.departmentId ? String(values.departmentId) : '';
    row.dataset.name = values.name || '';
    row.innerHTML = `
        <div class="relative flex-1">
            <input type="text" autocomplete="off" data-associate-search class="w-full rounded border border-gray-300 bg-white p-2 text-xs focus:border-mpiBlue focus:ring-1 focus:ring-mpiBlue" placeholder="Type employee ID or name..." value="${materialEscape(values.name || '')}" oninput="handleAssociateSearchInput('${rowId}')" onfocus="showAssociateSuggestions('${rowId}')" onkeydown="handleAssociateSearchKeydown(event, '${rowId}')">
            <div data-associate-suggestions class="absolute z-30 mt-1 hidden max-h-48 w-full overflow-y-auto rounded border border-gray-200 bg-white shadow-lg"></div>
            <p data-associate-meta class="mt-1 text-[10px] text-gray-400">Select an active employee.</p>
        </div>
        <button type="button" onclick="removeAssociateRow('${rowId}', '${formTypeCode}')" class="rounded p-2 text-red-500 hover:bg-red-50" title="Remove companion"><i class="fas fa-trash"></i></button>`;
    body.appendChild(row);
    updateAssociatesEmptyHint(formTypeCode);
}

function removeAssociateRow(rowId, formTypeCode) {
    document.getElementById(rowId)?.remove();
    clearTimeout(associateSearchTimers[rowId]);
    delete associateSearchTimers[rowId];
    updateAssociatesEmptyHint(formTypeCode);
}

function renderAssociateSuggestions(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const search = row.querySelector('[data-associate-search]');
    const box = row.querySelector('[data-associate-suggestions]');
    if (!box) return;
    const term = (search?.value || '').trim();
    if (term.length < ASSOCIATE_SEARCH_MIN_CHARS) {
        box.innerHTML = `<div class="px-3 py-2 text-[11px] text-gray-400">Type at least ${ASSOCIATE_SEARCH_MIN_CHARS} characters to search…</div>`;
        return;
    }
    const list = filterAssociateEmployees(term);
    box.innerHTML = list.map(employee => `
        <button type="button" class="block w-full px-3 py-2 text-left hover:bg-blue-50" onclick="selectAssociate('${rowId}', ${employee.employeeRecordId})">
            <span class="block text-xs font-bold text-gray-800">${materialEscape(employee.fullName)} (${materialEscape(employee.employeeId)})</span>
            <span class="block text-[10px] text-gray-500">${materialEscape([employee.departmentName, employee.positionName].filter(Boolean).join(' · '))}</span>
        </button>`).join('') ||
        '<div class="px-3 py-2 text-xs text-red-500">No active employee found.</div>';
}

function showAssociateSuggestions(rowId) {
    const row = document.getElementById(rowId);
    const box = row?.querySelector('[data-associate-suggestions]');
    if (!box) return;
    renderAssociateSuggestions(rowId);
    box.classList.remove('hidden');
}

function handleAssociateSearchInput(rowId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    // Editing the text invalidates a prior selection.
    row.dataset.employeeId = '';
    row.dataset.departmentId = '';
    row.dataset.name = '';
    renderAssociateSuggestions(rowId);
    showAssociateSuggestions(rowId);
    const value = row.querySelector('[data-associate-search]')?.value || '';
    clearTimeout(associateSearchTimers[rowId]);
    associateSearchTimers[rowId] = setTimeout(() => searchAssociateEmployees(rowId, value), 250);
}

function handleAssociateSearchKeydown(event, rowId) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const search = document.getElementById(rowId)?.querySelector('[data-associate-search]');
    const first = filterAssociateEmployees(search?.value)[0];
    if (first) selectAssociate(rowId, first.employeeRecordId);
}

async function searchAssociateEmployees(rowId, term) {
    if (!isDatabaseSession()) return;
    const query = (term || '').trim();
    if (query.length < 2) { renderAssociateSuggestions(rowId); return; }
    try {
        const results = await ApiClient.get(`/employees?search=${encodeURIComponent(query)}&limit=20`);
        const byId = new Map(associateDirectoryCache.map(e => [String(e.employeeRecordId), e]));
        results.forEach(e => byId.set(String(e.employeeRecordId), e));
        associateDirectoryCache = Array.from(byId.values());
        renderAssociateSuggestions(rowId);
        showAssociateSuggestions(rowId);
    } catch {
        renderAssociateSuggestions(rowId);
    }
}

function selectAssociate(rowId, employeeRecordId) {
    const row = document.getElementById(rowId);
    if (!row) return;
    const employee = associateDirectoryCache.find(e => Number(e.employeeRecordId) === Number(employeeRecordId));
    if (!employee) return;

    // Prevent adding yourself as a companion
    const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
    if (activeUser && employee.employeeId && employee.employeeId === activeUser.id) {
        alert('You cannot add yourself as a companion.');
        const search = row.querySelector('[data-associate-search]');
        if (search) search.value = '';
        return;
    }

    // Prevent duplicate companions
    const body = row.parentElement;
    if (body) {
        const siblingRows = [...body.querySelectorAll('.associate-row')];
        const isDuplicate = siblingRows.some(sibling =>
            sibling.id !== rowId &&
            sibling.dataset.employeeId &&
            String(sibling.dataset.employeeId) === String(employee.employeeRecordId)
        );
        if (isDuplicate) {
            alert('This companion has already been added.');
            const search = row.querySelector('[data-associate-search]');
            if (search) search.value = '';
            return;
        }
    }
    row.dataset.employeeId = String(employee.employeeRecordId);
    row.dataset.departmentId = employee.departmentId != null ? String(employee.departmentId) : '';
    row.dataset.name = employee.fullName || '';
    const search = row.querySelector('[data-associate-search]');
    const meta = row.querySelector('[data-associate-meta]');
    const box = row.querySelector('[data-associate-suggestions]');
    if (search) search.value = `${employee.fullName} (${employee.employeeId})`;
    if (meta) meta.innerText = [employee.departmentName, employee.positionName].filter(Boolean).join(' · ') || 'Active employee selected.';
    box?.classList.add('hidden');
}

// Collect confirmed companion rows as {employeeId, departmentId, name}. Rows without a
// confirmed selection are skipped (and reported once by the submit caller via validateAssociates).
function collectAssociates(formTypeCode) {
    const body = document.getElementById(associateBodyId(formTypeCode));
    if (!body) return [];
    return [...body.querySelectorAll('.associate-row')]
        .filter(row => row.dataset.employeeId && row.dataset.name)
        .map(row => ({
            employeeId: Number(row.dataset.employeeId),
            departmentId: row.dataset.departmentId ? Number(row.dataset.departmentId) : null,
            name: row.dataset.name
        }));
}

function hasUnconfirmedAssociateRows(formTypeCode) {
    const body = document.getElementById(associateBodyId(formTypeCode));
    if (!body) return false;
    return [...body.querySelectorAll('.associate-row')]
        .some(row => {
            if (row.dataset.employeeId) return false; // already confirmed
            const inputVal = (row.querySelector('[data-associate-search]')?.value || '').trim();
            if (!inputVal) return false; // empty rows are silently skipped by collectAssociates
            // Try to auto-confirm if the display text still matches a cached employee
            // (handles the rare case where oninput cleared dataset.employeeId after selection).
            const match = associateDirectoryCache.find(e =>
                `${e.fullName} (${e.employeeId})` === inputVal ||
                (e.fullName || '').toLowerCase() === inputVal.toLowerCase()
            );
            if (match) {
                selectAssociate(row.id, match.employeeRecordId);
                return false;
            }
            return true; // genuinely unconfirmed row
        });
}

function resetAssociateRows(formTypeCode) {
    const body = document.getElementById(associateBodyId(formTypeCode));
    if (body) body.innerHTML = '';
    updateAssociatesEmptyHint(formTypeCode);
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

    const vehCheck = document.getElementById('matNeedVehicle');
    if (vehCheck) vehCheck.checked = false;
    const vehFields = document.getElementById('matVehicleFields');
    if (vehFields) vehFields.classList.add('hidden');
    updateMaterialRouteText();
    resetMaterialProofState();
}

function updateMaterialRouteText() {
    const routeText = document.getElementById('materialApprovalRouteText');
    if (!routeText) return;
    const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
    const isSuperior = (activeUser?.roles || []).includes('IMMEDIATE_SUPERIOR');
    const needsVehicle = document.getElementById('matNeedVehicle')?.checked;
    if (isSuperior) {
        routeText.innerText = needsVehicle ? 'HRAD Assignment → PAS' : 'PAS';
    } else {
        routeText.innerText = needsVehicle
            ? 'Immediate Superior → HRAD Assignment → PAS'
            : 'Immediate Superior → PAS';
    }
}

function toggleMaterialVehicleFields() {
    const checked = document.getElementById('matNeedVehicle')?.checked;
    const fields = document.getElementById('matVehicleFields');
    if (fields) fields.classList.toggle('hidden', !checked);
    updateMaterialRouteText();
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
    if (typeof renderMaterialProofSlots === 'function') renderMaterialProofSlots();
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

    if (hasUnconfirmedAssociateRows('MATERIAL_GATE_PASS')) {
        showToast('Pick an employee for every companion row, or remove the empty rows.', 'error');
        return;
    }
    const associates = collectAssociates('MATERIAL_GATE_PASS');

    // Photo Proof validation (at least 1 photo proof is required!)
    let hasAnyPhoto = false;
    for (let i = 1; i <= items.length; i++) {
        if (materialProofState['file' + i]) {
            hasAnyPhoto = true;
            break;
        }
    }
    if (!hasAnyPhoto) {
        showToast('At least 1 photo proof is required for Material Gate Pass.', 'error');
        return;
    }

    submitButton.disabled = true;
    submitButton.classList.add('opacity-60', 'cursor-wait');
    try {
        const signatureFileId = await uploadPreparedSignature('MATERIAL_GATE_PASS');
        
        // Upload photo proofs dynamically up to the number of items
        const proofFileIds = [];
        for (let i = 1; i <= items.length; i++) {
            const file = materialProofState['file' + i];
            if (file) {
                const fid = await uploadMaterialProofFile(file);
                if (fid) proofFileIds.push(fid);
            }
        }

        const needsVehicle = document.getElementById('matNeedVehicle')?.checked;
        const created = await ApiClient.post('/form-requests/material', {
            requesterDepartmentId,
            authorizedEmployeeId: authorizedEmployee.employeeRecordId,
            formDate: document.getElementById('materialFormDate').value,
            remarks: document.getElementById('materialRemarks').value.trim() || null,
            vehicleUsageCode: needsVehicle ? 'COMPANY' : 'NONE',
            preparedBySignatureFileId: signatureFileId,
            proofFileIds,
            items,
            associates
        });

        form.reset();
        clearSelectedMaterialEmployee();
        document.getElementById('materialItemsBody').innerHTML = '';
        resetAssociateRows('MATERIAL_GATE_PASS');
        clearPreparedSignature('MATERIAL_GATE_PASS');
        resetMaterialProofState();
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
        // Close any open companion-row suggestion box when clicking outside its row.
        document.querySelectorAll('.associate-row [data-associate-suggestions]').forEach(box => {
            if (!box.closest('.associate-row').contains(event.target)) {
                box.classList.add('hidden');
            }
        });
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
window.toggleMaterialVehicleFields = toggleMaterialVehicleFields;
window.showMaterialPreparedSignatureSource = showMaterialPreparedSignatureSource;
window.clearMaterialPreparedSignaturePad = clearMaterialPreparedSignaturePad;
window.useMaterialPreparedDrawnSignature = useMaterialPreparedDrawnSignature;
window.resetMaterialPreparedSignatureState = resetMaterialPreparedSignatureState;
window.addAssociateRow = addAssociateRow;
window.removeAssociateRow = removeAssociateRow;
window.handleAssociateSearchInput = handleAssociateSearchInput;
window.handleAssociateSearchKeydown = handleAssociateSearchKeydown;
window.showAssociateSuggestions = showAssociateSuggestions;
window.selectAssociate = selectAssociate;
window.collectAssociates = collectAssociates;
window.hasUnconfirmedAssociateRows = hasUnconfirmedAssociateRows;
window.resetAssociateRows = resetAssociateRows;

function previewMaterialProof(idx, input) {
    const file = input.files[0];
    if (file) {
        if (file.size > 5 * 1024 * 1024) {
            showToast('Photo proof file must be less than 5 MB.', 'error');
            input.value = '';
            clearMaterialProof(idx);
            return;
        }
        materialProofState['file' + idx] = file;
        renderMaterialProofSlots();
    }
}

function clearMaterialProof(idx, event) {
    if (event) event.stopPropagation();
    materialProofState['file' + idx] = null;
    renderMaterialProofSlots();
}

async function uploadMaterialProofFile(file) {
    if (!file) return null;
    const formData = new FormData();
    formData.append('file', file);
    formData.append('widthPercent', '100');
    formData.append('yOffset', '0');
    formData.append('compress', 'true');
    const uploaded = await ApiClient.post('/signatures', formData);
    return uploaded.signatureFileId;
}

function resetMaterialProofState() {
    materialProofState = {};
    renderMaterialProofSlots();
}

function triggerMaterialProofUpload(idx) {
    const input = document.getElementById('materialProofFile' + idx);
    if (input) input.click();
}

function renderMaterialProofSlots() {
    const container = document.getElementById('materialProofSlotsContainer');
    if (!container) return;

    // Revoke object URLs created by the previous render so blob references are not leaked.
    if (Array.isArray(window._materialProofObjectUrls)) {
        window._materialProofObjectUrls.forEach(url => URL.revokeObjectURL(url));
    }
    window._materialProofObjectUrls = [];

    // Get current number of items
    const itemsCount = readMaterialItems().length;
    const maxPhotos = Math.max(1, itemsCount); // At least 1 slot

    // Update help text
    const helpText = document.getElementById('materialProofHelpText');
    if (helpText) {
        helpText.innerText = `Provide at least 1 photo, and up to ${maxPhotos} photo(s) as proof (matching the number of items).`;
    }

    // Clean state variables beyond current maxPhotos
    let droppedPhoto = false;
    for (let key in materialProofState) {
        const num = parseInt(key.replace('file', ''), 10);
        if (num > maxPhotos) {
            if (materialProofState[key]) droppedPhoto = true;
            delete materialProofState[key];
        }
    }
    if (droppedPhoto && typeof showToast === 'function') {
        showToast('A proof photo was removed because it no longer matches an item row.', 'info');
    }

    // Render slots
    let html = '';
    for (let i = 1; i <= maxPhotos; i++) {
        const fileObj = materialProofState['file' + i];
        const hasFile = !!fileObj;
        const isRequired = i === 1;
        let imgSrc = '';
        if (hasFile) {
            imgSrc = URL.createObjectURL(fileObj);
            window._materialProofObjectUrls.push(imgSrc);
        }

        html += `
            <div class="relative border-2 border-dashed border-gray-300 rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer hover:border-mpiBlue transition bg-white group min-h-[120px]" onclick="triggerMaterialProofUpload(${i})">
                <input type="file" id="materialProofFile${i}" accept="image/*" class="hidden" onchange="previewMaterialProof(${i}, this)">
                <div id="materialProofEmpty${i}" class="text-center ${hasFile ? 'hidden' : ''}">
                    <i class="fas fa-camera text-gray-400 text-xl mb-1 group-hover:text-mpiBlue transition"></i>
                    <p class="text-[10px] font-semibold text-gray-600">Photo ${i} ${isRequired ? '(Required)' : '(Optional)'}</p>
                    <p class="text-[8px] text-gray-400">Click to upload/capture</p>
                </div>
                <div id="materialProofPreviewContainer${i}" class="absolute inset-0 rounded-lg overflow-hidden bg-white ${hasFile ? '' : 'hidden'}">
                    <img id="materialProofImg${i}" class="w-full h-full object-cover" ${hasFile ? `src="${imgSrc}"` : ''}>
                    <button type="button" onclick="clearMaterialProof(${i}, event)" class="absolute top-1.5 right-1.5 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] hover:bg-red-700 transition shadow z-10"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
}

window.previewMaterialProof = previewMaterialProof;
window.clearMaterialProof = clearMaterialProof;
window.uploadMaterialProofFile = uploadMaterialProofFile;
window.resetMaterialProofState = resetMaterialProofState;
window.triggerMaterialProofUpload = triggerMaterialProofUpload;
window.renderMaterialProofSlots = renderMaterialProofSlots;
