// Database-backed system configuration, fleet, and gate-pass logs.

var adminState = {
    users: [],
    departments: [],
    roles: [],
    permissions: [],
    vehicles: [],
    drivers: [],
    userPage: 1,
    userTotalPages: 1
};
const adminUserPageSize = 15;

function canDeleteGatePassLogs() {
    return currentUser?.role === 'System Admin' || currentUser?.role === 'Admin';
}

function adminEscape(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function adminDate(value) {
    if (!value) return '—';
    return new Date(value).toLocaleDateString();
}

function compactRoleCell(user) {
    const roles = user.roleCodes || [];
    if (!roles.length) return '<span class="text-gray-400">—</span>';

    return `
        <button type="button" onclick="showUserRoleDetails(${user.userId})" class="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-bold text-mpiBlue hover:bg-blue-100" title="View all assigned roles">
            <span>${adminEscape(roles[0])}</span>
            ${roles.length > 1 ? `<span class="rounded-full bg-mpiBlue px-1.5 py-0.5 text-[9px] text-white">+${roles.length - 1}</span>` : ''}
        </button>`;
}

function compactDepartmentCell(user) {
    const departments = user.departmentNames || (
        user.departmentName ? [user.departmentName] : []
    );
    if (!departments.length) {
        return '<span class="text-gray-400">System / External</span>';
    }

    return `
        <button type="button" onclick="showUserDepartmentDetails(${user.userId})" class="inline-flex max-w-[240px] items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-700 hover:bg-slate-200" title="View all assigned departments">
            <span class="truncate">${adminEscape(departments[0])}</span>
            ${departments.length > 1 ? `<span class="rounded-full bg-slate-700 px-1.5 py-0.5 text-[9px] text-white">+${departments.length - 1}</span>` : ''}
        </button>`;
}

function showUserRoleDetails(userId) {
    const user = adminState.users.find(item => item.userId === userId);
    if (!user) return;

    adminModal(
        `${user.displayName} — Assigned Roles`,
        `<div class="flex flex-wrap gap-2">${(user.roleCodes || []).map(roleCode =>
            `<span class="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-bold text-mpiBlue">${adminEscape(roleCode)}</span>`
        ).join('') || '<span class="text-sm text-gray-400">No active roles.</span>'}</div>`,
        'Close',
        (event) => {
            event.preventDefault();
            closeAdminEditor();
        });
}

function showUserDepartmentDetails(userId) {
    const user = adminState.users.find(item => item.userId === userId);
    if (!user) return;
    const departments = user.departmentNames || (
        user.departmentName ? [user.departmentName] : []
    );

    adminModal(
        `${user.displayName} — Departments`,
        `<div class="flex flex-wrap gap-2">${departments.map(department =>
            `<span class="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700">${adminEscape(department)}</span>`
        ).join('') || '<span class="text-sm text-gray-400">No assigned department.</span>'}</div>`,
        'Close',
        (event) => {
            event.preventDefault();
            closeAdminEditor();
        });
}

function adminModal(title, body, saveLabel, onSave) {
    let modal = document.getElementById('adminEditorModal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'adminEditorModal';
        modal.className = 'fixed inset-0 z-[90] hidden items-center justify-center bg-gray-900/70 p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
                <div class="flex justify-between items-center border-b px-5 py-4">
                    <h3 id="adminEditorTitle" class="font-bold text-lg text-gray-800"></h3>
                    <button type="button" onclick="closeAdminEditor()" class="text-gray-500 hover:text-red-600"><i class="fas fa-times text-xl"></i></button>
                </div>
                <form id="adminEditorForm" class="p-5 space-y-4">
                    <div id="adminEditorBody"></div>
                    <div class="flex justify-end gap-2 pt-3 border-t">
                        <button type="button" onclick="closeAdminEditor()" class="px-4 py-2 rounded border hover:bg-gray-50">Cancel</button>
                        <button id="adminEditorSave" type="submit" class="px-5 py-2 rounded bg-mpiBlue text-white font-bold hover:bg-mpiDark"></button>
                    </div>
                </form>
            </div>`;
        document.body.appendChild(modal);
    }
    document.getElementById('adminEditorTitle').innerText = title;
    document.getElementById('adminEditorBody').innerHTML = body;
    const saveButton = document.getElementById('adminEditorSave');
    saveButton.innerText = saveLabel;
    saveButton.dataset.defaultLabel = saveLabel;
    saveButton.disabled = false;
    saveButton.classList.remove('opacity-60', 'cursor-not-allowed');
    const form = document.getElementById('adminEditorForm');
    form.dataset.submitting = 'false';
    form.onsubmit = async event => {
        event.preventDefault();
        if (form.dataset.submitting === 'true') return;

        form.dataset.submitting = 'true';
        saveButton.disabled = true;
        saveButton.classList.add('opacity-60', 'cursor-not-allowed');
        saveButton.innerText = 'Saving...';
        try {
            await onSave(event);
        } finally {
            form.dataset.submitting = 'false';
            saveButton.disabled = false;
            saveButton.classList.remove('opacity-60', 'cursor-not-allowed');
            saveButton.innerText = saveButton.dataset.defaultLabel || saveLabel;
        }
    };
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeAdminEditor() {
    const modal = document.getElementById('adminEditorModal');
    modal?.classList.add('hidden');
    modal?.classList.remove('flex');
}

async function loadAdminReferences() {
    if (!isDatabaseSession() || currentUser.role !== 'System Admin') return;
    const [departments, roles, permissions] = await Promise.all([
        ApiClient.get('/admin/departments?includeInactive=true'),
        ApiClient.get('/admin/roles?includeInactive=true'),
        ApiClient.get('/admin/permissions')
    ]);
    adminState.departments = departments;
    adminState.roles = roles.filter(item => item.roleCode !== 'HR_ADMIN');
    adminState.permissions = permissions;

    const deptOptions = departments
        .filter(item => item.isActive)
        .map(item => `<option value="${item.departmentId}">${adminEscape(item.departmentName)}</option>`)
        .join('');
    const logDept = document.getElementById('logFilterDept');
    const userDept = document.getElementById('userFilterDepartment');
    if (logDept) logDept.innerHTML = `<option value="">All Departments</option>${deptOptions}`;
    if (userDept) userDept.innerHTML = `<option value="">All Departments</option>${deptOptions}`;

    const roleFilter = document.getElementById('userFilterRole');
    if (roleFilter) {
        roleFilter.innerHTML = '<option value="">All Roles</option>' +
            adminState.roles.filter(item => item.isActive)
                .map(item => `<option value="${adminEscape(item.roleCode)}">${adminEscape(item.roleName)}</option>`)
                .join('');
    }
}

async function renderAdminLogs(page = 1) {
    currentLogPage = Math.max(page, 1);
    const search = document.getElementById('logFilterName')?.value.trim() || '';
    const date = document.getElementById('logFilterDate')?.value || '';
    const departmentId = document.getElementById('logFilterDept')?.value || '';
    const statusCode = document.getElementById('logFilterStatus')?.value || '';

    if (isDatabaseSession()) {
        try {
            const query = new URLSearchParams({
                page: currentLogPage,
                pageSize: logsPerPage
            });
            if (search) query.set('search', search);
            if (departmentId) query.set('departmentId', departmentId);
            if (statusCode) query.set('statusCode', statusCode);
            if (date) {
                const from = new Date(`${date}T00:00:00`);
                const to = new Date(from);
                to.setDate(to.getDate() + 1);
                query.set('fromAppliedAt', from.toISOString());
                query.set('toAppliedAt', to.toISOString());
            }
            const response = await ApiClient.request(`/gate-pass-requests?${query}`);
            renderDatabaseAdminLogs(response);
        } catch (error) {
            document.getElementById('adminLogsTable').innerHTML =
                '<tr><td colspan="8" class="text-center py-6 text-gray-400">Unable to load gate pass logs.</td></tr>';
            showToast(error instanceof ApiError ? error.message : 'Unable to load gate pass logs.', 'error');
        }
        return;
    }

    const filtered = gatePasses.slice().reverse().filter(pass =>
        (!search || pass.userName.toLowerCase().includes(search.toLowerCase()) || pass.id.toLowerCase().includes(search.toLowerCase())) &&
        (!departmentId || pass.userDept === departmentId) &&
        (!statusCode || pass.status === statusCode)
    );
    renderMockAdminLogsWithActions(filtered);
}

function renderDatabaseAdminLogs(response) {
    const list = response.items.map(mapApiGatePass);
    gatePasses = list;
    document.getElementById('adminLogsTable').innerHTML = list.map(pass => `
        <tr class="hover:bg-gray-50 transition border-b cursor-pointer" onclick="${getViewPassCall(pass)}">
            <td class="px-5 py-2 font-mono text-xs">${adminEscape(pass.id)}</td>
            <td class="px-5 py-2 font-semibold">${adminEscape(pass.userName)}</td>
            <td class="px-5 py-2 text-gray-500 text-xs">${adminEscape(pass.userDept)}</td>
            <td class="px-5 py-2 text-xs font-bold ${pass.willReturn ? 'text-gray-400' : 'text-red-500'}">${pass.willReturn ? 'No' : 'Yes'}</td>
            <td class="px-5 py-2 text-blue-600 font-mono text-xs">${adminEscape(pass.actualOut || '--:--')}</td>
            <td class="px-5 py-2 text-green-600 font-mono text-xs">${adminEscape(pass.actualIn || '--:--')}</td>
            <td class="px-5 py-2 text-[10px]"><span class="px-2 py-1 rounded bg-gray-100">${adminEscape(pass.status)}</span></td>
            <td class="px-5 py-2 text-right">
                ${canDeleteGatePassLogs()
                    ? `<button onclick="event.stopPropagation(); deleteGatePassLog(${pass.dbId})" class="rounded border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50">Delete</button>`
                    : '<span class="text-gray-300">--</span>'}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="8" class="text-center py-6 text-gray-400">No logs match your filters.</td></tr>';

    const start = response.totalCount ? ((response.page - 1) * response.pageSize) + 1 : 0;
    const end = Math.min(response.page * response.pageSize, response.totalCount);
    document.getElementById('logPaginationInfo').innerText =
        `Showing ${start} to ${end} of ${response.totalCount} entries`;
    document.getElementById('logPageIndicator').innerText = response.page;
    document.getElementById('btnPrevPage').disabled = response.page <= 1;
    document.getElementById('btnNextPage').disabled = response.page >= response.totalPages;
}

function renderMockAdminLogs(list) {
    document.getElementById('adminLogsTable').innerHTML = list.map(pass => `
        <tr class="border-b"><td class="px-5 py-2">${adminEscape(pass.id)}</td><td>${adminEscape(pass.userName)}</td><td>${adminEscape(pass.userDept)}</td><td>${pass.willReturn ? 'No' : 'Yes'}</td><td>${pass.actualOut || '—'}</td><td>${pass.actualIn || '—'}</td><td>${adminEscape(pass.status)}</td></tr>
    `).join('') || '<tr><td colspan="7" class="text-center py-6 text-gray-400">No logs found.</td></tr>';
}

function changeLogPage(step) {
    renderAdminLogs(currentLogPage + step);
}

function renderMockAdminLogsWithActions(list) {
    document.getElementById('adminLogsTable').innerHTML = list.map(pass => `
        <tr class="border-b hover:bg-gray-50 transition cursor-pointer" onclick="${getViewPassCall(pass)}">
            <td class="px-5 py-2">${adminEscape(pass.id)}</td>
            <td class="px-5 py-2">${adminEscape(pass.userName)}</td>
            <td class="px-5 py-2">${adminEscape(pass.userDept)}</td>
            <td class="px-5 py-2">${pass.willReturn ? 'No' : 'Yes'}</td>
            <td class="px-5 py-2">${pass.actualOut || '--:--'}</td>
            <td class="px-5 py-2">${pass.actualIn || '--:--'}</td>
            <td class="px-5 py-2">${adminEscape(pass.status)}</td>
            <td class="px-5 py-2 text-right">
                ${canDeleteGatePassLogs()
                    ? `<button onclick="event.stopPropagation(); deleteGatePassLog(${JSON.stringify(pass.id)})" class="rounded border border-red-200 px-2.5 py-1 text-[11px] font-bold text-red-600 hover:bg-red-50">Delete</button>`
                    : '<span class="text-gray-300">--</span>'}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="8" class="text-center py-6 text-gray-400">No logs found.</td></tr>';
}

async function deleteGatePassLog(idOrDbId) {
    const pass = findGatePassRecord(idOrDbId);
    const passLabel = pass?.id || String(idOrDbId);
    if (!confirm(`Delete ${passLabel} from test logs? This also removes it from dashboard history.`)) {
        return;
    }

    if (!isDatabaseSession()) {
        gatePasses = gatePasses.filter(item => item.id !== String(idOrDbId));
        if (String(currentViewedPassId) === String(idOrDbId) ||
            currentViewedPassId === pass?.id) {
            closeModal?.();
        }
        showToast('Test log deleted.');
        renderAdminLogs(currentLogPage);
        refreshDashboards();
        return;
    }

    const dbId = Number(pass?.dbId ?? idOrDbId);
    if (!Number.isFinite(dbId) || dbId <= 0) {
        showToast('Unable to resolve the selected log.', 'error');
        return;
    }

    try {
        await ApiClient.request(`/gate-pass-requests/${dbId}/test-delete`, {
            method: 'DELETE'
        });
        gatePasses = gatePasses.filter(item => item.dbId !== dbId);
        if (String(currentViewedPassId) === String(dbId) ||
            currentViewedPassId === pass?.id) {
            closeModal?.();
        }
        showToast('Test log deleted.');
        await Promise.all([
            renderAdminLogs(currentLogPage),
            loadMyGatePasses().catch(() => null),
            renderApprovalQueue?.().catch(() => null)
        ]);
        refreshDashboards();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to delete test log.', 'error');
    }
}

async function renderAdminUsers(page = 1) {
    if (!isDatabaseSession()) {
        document.getElementById('adminUsersList').innerHTML = mockUsers.map(user => `
            <tr><td class="p-3">${adminEscape(user.id)}</td><td class="p-3">${adminEscape(user.name)}</td><td class="p-3">${adminEscape(user.role)}</td><td class="p-3">${adminEscape(user.dept)}</td><td></td></tr>`).join('');
        return;
    }
    const query = new URLSearchParams({ page, pageSize: adminUserPageSize });
    const search = document.getElementById('userFilterSearch')?.value.trim();
    const role = document.getElementById('userFilterRole')?.value;
    const department = document.getElementById('userFilterDepartment')?.value;
    const status = document.getElementById('userFilterStatus')?.value;
    const hiredFrom = document.getElementById('userFilterHiredFrom')?.value;
    const hiredTo = document.getElementById('userFilterHiredTo')?.value;
    if (search) query.set('search', search);
    if (role) query.set('roleCode', role);
    if (department) query.set('departmentId', department);
    if (status) query.set('accountStatusCode', status);
    else query.delete('accountStatusCode');
    if (hiredFrom) query.set('hiredFrom', hiredFrom);
    if (hiredTo) query.set('hiredTo', hiredTo);

    try {
        const response = await ApiClient.request(`/admin/users?${query}`);
        adminState.users = response.items;
        adminState.userPage = response.page;
        adminState.userTotalPages = response.totalPages;
        document.getElementById('adminUsersCount').innerText =
            `${response.totalCount} account${response.totalCount === 1 ? '' : 's'}`;
        document.getElementById('adminUsersList').innerHTML = response.items.map(user => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-xs font-mono">${adminEscape(user.employeeId || user.username)}</td>
                <td class="p-3"><div class="font-semibold">${adminEscape(user.displayName)}</div><div class="text-[10px] text-gray-400">${adminEscape(user.positionName || user.accountTypeCode)} · Hired ${adminDate(user.dateHired)}</div></td>
                <td class="p-3 text-xs">${compactRoleCell(user)}</td>
                <td class="p-3 text-xs">${compactDepartmentCell(user)}</td>
                <td class="p-3 text-xs"><span class="px-2 py-1 rounded ${user.accountStatusCode === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}">${adminEscape(user.accountStatusCode)}</span></td>
                <td class="p-3 text-right whitespace-nowrap">
                    <button onclick="openUserEditor(${user.userId})" class="text-blue-600 border border-blue-200 px-2 py-1 rounded mr-1"><i class="fas fa-edit"></i></button>
                    ${user.accountStatusCode !== 'ARCHIVED' ? `<button onclick="archiveAdminUser(${user.userId})" class="text-red-600 border border-red-200 px-2 py-1 rounded"><i class="fas fa-archive"></i></button>` : ''}
                </td>
            </tr>`).join('') || '<tr><td colspan="6" class="p-8 text-center text-gray-400">No users match your filters.</td></tr>';
        document.getElementById('userPageIndicator').innerText =
            `${response.page} / ${Math.max(response.totalPages, 1)}`;
        document.getElementById('userPrevPage').disabled = response.page <= 1;
        document.getElementById('userNextPage').disabled = response.page >= response.totalPages;
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to load users.', 'error');
    }
}

function changeUserPage(step) {
    renderAdminUsers(adminState.userPage + step);
}

function userRoleCheckboxes(selected = []) {
    return adminState.roles.filter(role => role.isActive).map(role => `
        <label class="flex items-center gap-2 border rounded p-2 text-xs">
            <input type="checkbox" name="adminUserRoles" value="${adminEscape(role.roleCode)}" ${selected.includes(role.roleCode) ? 'checked' : ''}>
            <span><strong>${adminEscape(role.roleName)}</strong><br><small class="text-gray-400">${adminEscape(role.roleCode)}</small></span>
        </label>`).join('');
}

function openUserEditor(userId = null) {
    const user = adminState.users.find(item => item.userId === userId);
    adminModal(
        user ? 'Edit User Account' : 'Add User Account',
        `<input type="hidden" id="adminUserId" value="${user?.userId || ''}">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label class="text-xs font-bold">Account Type<select id="adminUserType" onchange="handleAdminUserTypeChange()" class="mt-1 w-full border p-2 rounded font-normal">
                ${['EMPLOYEE','SECURITY_AGENCY','SYSTEM'].map(value => `<option ${user?.accountTypeCode === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select></label>
            <label class="text-xs font-bold">Status<select id="adminUserStatus" class="mt-1 w-full border p-2 rounded font-normal">
                ${['ACTIVE','LOCKED','ARCHIVED'].map(value => `<option ${user?.accountStatusCode === value ? 'selected' : ''}>${value}</option>`).join('')}
            </select></label>
            <label id="adminUserEmployeeField" class="text-xs font-bold">Employee ID<input id="adminUserEmployeeId" class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(user?.employeeId || '')}" placeholder="Existing active employee ID"><span class="mt-1 block text-[10px] font-normal text-gray-400">Links this login to an active employee record.</span></label>
            <label class="text-xs font-bold">Login ID / Username<input id="adminUserUsername" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(user?.username || '')}" placeholder="Example: sec-001"></label>
            <label class="text-xs font-bold md:col-span-2">Display Name<input id="adminUserDisplayName" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(user?.displayName || '')}" placeholder="Name shown in the system"></label>
            <label class="text-xs font-bold md:col-span-2">${user ? 'New Password (leave blank to keep)' : 'Initial Password'}<input id="adminUserPassword" type="password" ${user ? '' : 'required'} class="mt-1 w-full border p-2 rounded font-normal"></label>
        </div>
        <div class="mt-4"><p class="text-xs font-bold mb-2">Roles</p><div class="grid grid-cols-1 md:grid-cols-2 gap-2">${userRoleCheckboxes(user?.roleCodes || [])}</div></div>
        <label class="flex items-center gap-2 mt-4 text-xs"><input id="adminUserMustChange" type="checkbox" ${user?.mustChangePassword !== false ? 'checked' : ''}> Require password change</label>`,
        user ? 'Save User' : 'Create User',
        saveAdminUser
    );
    handleAdminUserTypeChange();
}

function handleAdminUserTypeChange() {
    const type = document.getElementById('adminUserType')?.value;
    const field = document.getElementById('adminUserEmployeeField');
    const input = document.getElementById('adminUserEmployeeId');
    if (!field || !input) return;

    const isEmployee = type === 'EMPLOYEE';
    field.classList.toggle('hidden', !isEmployee);
    input.disabled = !isEmployee;
    input.required = isEmployee;
    if (!isEmployee) input.value = '';
}

async function saveAdminUser(event) {
    event.preventDefault();
    const id = document.getElementById('adminUserId').value;
    const roleCodes = [...document.querySelectorAll('input[name="adminUserRoles"]:checked')]
        .map(input => input.value);
    const accountTypeCode = document.getElementById('adminUserType').value;
    const payload = {
        employeeId: accountTypeCode === 'EMPLOYEE'
            ? document.getElementById('adminUserEmployeeId').value.trim() || null
            : null,
        username: document.getElementById('adminUserUsername').value.trim(),
        displayName: document.getElementById('adminUserDisplayName').value.trim(),
        accountTypeCode,
        accountStatusCode: document.getElementById('adminUserStatus').value,
        mustChangePassword: document.getElementById('adminUserMustChange').checked,
        password: document.getElementById('adminUserPassword').value || null,
        roleCodes
    };
    try {
        if (id) await ApiClient.put(`/admin/users/${id}`, payload);
        else await ApiClient.post('/admin/users', payload);
        closeAdminEditor();
        showToast(id ? 'User updated.' : 'User created.');
        await renderAdminUsers(1);
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to save user.', 'error');
    }
}

async function archiveAdminUser(id) {
    if (!confirm('Archive this user account?')) return;
    try {
        await ApiClient.request(`/admin/users/${id}`, { method: 'DELETE' });
        showToast('User archived.');
        await renderAdminUsers(adminState.userPage);
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to archive user.', 'error');
    }
}

async function renderDepartmentsAndRoles() {
    try {
        await loadAdminReferences();
        const deptSearch = document.getElementById('departmentSearch')?.value.toLowerCase() || '';
        const roleSearch = document.getElementById('roleSearch')?.value.toLowerCase() || '';
        document.getElementById('adminDepartmentList').innerHTML = adminState.departments
            .filter(item => !deptSearch || item.departmentName.toLowerCase().includes(deptSearch) || item.departmentCode.toLowerCase().includes(deptSearch))
            .map(item => `<li class="py-3 flex justify-between items-center gap-2">
                <div><div class="font-semibold">${adminEscape(item.departmentName)}</div><div class="text-[10px] text-gray-400">${adminEscape(item.departmentCode)} · ${item.activeEmployeeCount} active employees ${item.isActive ? '' : '· ARCHIVED'}</div></div>
                <div class="whitespace-nowrap"><button onclick="openDepartmentEditor(${item.departmentId})" class="text-blue-600 p-2"><i class="fas fa-edit"></i></button>${item.isActive ? `<button onclick="archiveDepartment(${item.departmentId})" class="text-red-600 p-2"><i class="fas fa-archive"></i></button>` : ''}</div>
            </li>`).join('');
        document.getElementById('adminRoleList').innerHTML = adminState.roles
            .filter(item => !roleSearch || item.roleName.toLowerCase().includes(roleSearch) || item.roleCode.toLowerCase().includes(roleSearch))
            .map(item => `<li class="py-3 flex justify-between items-center gap-2">
                <div><div class="font-semibold">${adminEscape(item.roleName)}</div><div class="text-[10px] text-gray-400">${adminEscape(item.roleCode)} · ${item.activeUserCount} users · ${(item.permissionCodes || []).length} permissions ${item.isActive ? '' : '· ARCHIVED'}</div></div>
                <div class="whitespace-nowrap"><button onclick="openRoleEditor(${item.roleId})" class="text-blue-600 p-2"><i class="fas fa-edit"></i></button>${!item.isSystemRole && item.isActive ? `<button onclick="archiveRole(${item.roleId})" class="text-red-600 p-2"><i class="fas fa-archive"></i></button>` : ''}</div>
            </li>`).join('');
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to load configuration.', 'error');
    }
}

function openDepartmentEditor(id = null) {
    const item = adminState.departments.find(row => row.departmentId === id);
    adminModal(item ? 'Edit Department' : 'Add Department', `
        <input type="hidden" id="departmentId" value="${item?.departmentId || ''}">
        <label class="block text-xs font-bold mb-3">Code<input id="departmentCode" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.departmentCode || '')}"></label>
        <label class="block text-xs font-bold mb-3">Name<input id="departmentName" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.departmentName || '')}"></label>
        <label class="block text-xs font-bold mb-3">Description<textarea id="departmentDescription" class="mt-1 w-full border p-2 rounded font-normal">${adminEscape(item?.description || '')}</textarea></label>
        <label class="flex items-center gap-2 text-xs"><input id="departmentActive" type="checkbox" ${item?.isActive !== false ? 'checked' : ''}> Active</label>`,
        item ? 'Save Department' : 'Create Department',
        saveDepartment);
}

async function saveDepartment(event) {
    event.preventDefault();
    const id = document.getElementById('departmentId').value;
    const payload = {
        departmentCode: document.getElementById('departmentCode').value.trim(),
        departmentName: document.getElementById('departmentName').value.trim(),
        description: document.getElementById('departmentDescription').value.trim() || null,
        isActive: document.getElementById('departmentActive').checked
    };
    try {
        if (id) await ApiClient.put(`/admin/departments/${id}`, payload);
        else await ApiClient.post('/admin/departments', payload);
        closeAdminEditor();
        showToast('Department saved.');
        await renderDepartmentsAndRoles();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to save department.', 'error');
    }
}

async function archiveDepartment(id) {
    if (!confirm('Archive this department? Departments with active employees cannot be archived.')) return;
    try {
        await ApiClient.request(`/admin/departments/${id}`, { method: 'DELETE' });
        showToast('Department archived.');
        await renderDepartmentsAndRoles();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to archive department.', 'error');
    }
}

function openRoleEditor(id = null) {
    const item = adminState.roles.find(row => row.roleId === id);
    const selected = item?.permissionCodes || [];
    adminModal(item ? 'Edit Role' : 'Add Role', `
        <input type="hidden" id="roleId" value="${item?.roleId || ''}">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-xs font-bold">Code<input id="roleCode" required ${item?.isSystemRole ? 'readonly' : ''} class="mt-1 w-full border p-2 rounded font-normal ${item?.isSystemRole ? 'bg-gray-100 text-gray-500' : ''}" value="${adminEscape(item?.roleCode || '')}"></label>
            <label class="text-xs font-bold">Name<input id="roleName" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.roleName || '')}"></label>
        </div>
        <label class="block text-xs font-bold mt-3">Description<textarea id="roleDescription" class="mt-1 w-full border p-2 rounded font-normal">${adminEscape(item?.description || '')}</textarea></label>
        <label class="flex items-center gap-2 text-xs my-3"><input id="roleActive" type="checkbox" ${item?.isActive !== false ? 'checked' : ''}> Active</label>
        <p class="text-xs font-bold mb-2">Permissions</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">${adminState.permissions.map(permission => `
            <label class="flex gap-2 border rounded p-2 text-xs"><input type="checkbox" name="rolePermissions" value="${adminEscape(permission.permissionCode)}" ${selected.includes(permission.permissionCode) ? 'checked' : ''}><span><strong>${adminEscape(permission.permissionCode)}</strong><br><small class="text-gray-400">${adminEscape(permission.description || '')}</small></span></label>`).join('')}</div>`,
        item ? 'Save Role' : 'Create Role',
        saveRole);
}

async function saveRole(event) {
    event.preventDefault();
    const id = document.getElementById('roleId').value;
    const payload = {
        roleCode: document.getElementById('roleCode').value.trim(),
        roleName: document.getElementById('roleName').value.trim(),
        description: document.getElementById('roleDescription').value.trim() || null,
        isActive: document.getElementById('roleActive').checked,
        permissionCodes: [...document.querySelectorAll('input[name="rolePermissions"]:checked')].map(input => input.value)
    };
    try {
        if (id) await ApiClient.put(`/admin/roles/${id}`, payload);
        else await ApiClient.post('/admin/roles', payload);
        closeAdminEditor();
        showToast('Role saved.');
        await renderDepartmentsAndRoles();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to save role.', 'error');
    }
}

async function archiveRole(id) {
    if (!confirm('Archive this role? Assigned roles cannot be archived.')) return;
    try {
        await ApiClient.request(`/admin/roles/${id}`, { method: 'DELETE' });
        showToast('Role archived.');
        await renderDepartmentsAndRoles();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to archive role.', 'error');
    }
}

async function renderAdminFleet() {
    if (!isDatabaseSession()) {
        const mockDrivers = mockVehicles.map((vehicle, index) => ({
            driverId: index + 1,
            fullName: vehicle.driver,
            driverTypeCode: 'EXTERNAL',
            licenseNumber: null,
            licenseExpiryDate: null
        }));
        adminState.vehicles = mockVehicles.map((vehicle, index) => ({
            vehicleId: index + 1,
            vehicleName: vehicle.name,
            plateNumber: vehicle.plate,
            defaultDriverId: index + 1,
            availabilityStatusCode: vehicle.status.toUpperCase().replaceAll(' ', '_')
        }));
        adminState.drivers = mockDrivers;
        document.getElementById('adminFleetList').innerHTML = adminState.vehicles.map(vehicle => `
            <tr class="border-b"><td class="p-3 font-semibold">${adminEscape(vehicle.vehicleName)}</td><td class="p-3 font-mono text-xs">${adminEscape(vehicle.plateNumber)}</td><td class="p-3 text-xs">${adminEscape(mockDrivers.find(driver => driver.driverId === vehicle.defaultDriverId)?.fullName || 'Unassigned')}</td><td class="p-3 text-xs">${adminEscape(vehicle.availabilityStatusCode.replaceAll('_', ' '))}</td><td class="p-3 text-right"><span class="text-[11px] text-gray-400">Mock</span></td></tr>
        `).join('') || '<tr><td colspan="5" class="p-6 text-center text-gray-400">No active vehicles.</td></tr>';
        document.getElementById('adminDriverList').innerHTML = mockDrivers.map(driver => `
            <tr class="border-b"><td class="p-3 font-semibold">${adminEscape(driver.fullName)}</td><td class="p-3 text-xs">${adminEscape(driver.driverTypeCode)}</td><td class="p-3 text-xs">${adminEscape(driver.licenseNumber || '—')}</td><td class="p-3 text-xs">${adminDate(driver.licenseExpiryDate)}</td><td class="p-3 text-right"><span class="text-[11px] text-gray-400">Mock</span></td></tr>
        `).join('') || '<tr><td colspan="5" class="p-6 text-center text-gray-400">No active drivers.</td></tr>';
        return;
    }

    try {
        const [vehicles, drivers] = await Promise.all([
            ApiClient.get('/vehicles'),
            ApiClient.get('/drivers')
        ]);
        adminState.vehicles = vehicles;
        adminState.drivers = drivers;
        const driverMap = new Map(drivers.map(driver => [driver.driverId, driver.fullName]));
        document.getElementById('adminFleetList').innerHTML = vehicles.map(vehicle => `
            <tr class="border-b"><td class="p-3 font-semibold">${adminEscape(vehicle.vehicleName)}</td><td class="p-3 font-mono text-xs">${adminEscape(vehicle.plateNumber)}</td><td class="p-3 text-xs">${adminEscape(driverMap.get(vehicle.defaultDriverId) || 'Unassigned')}</td><td class="p-3 text-xs">${adminEscape(vehicle.availabilityStatusCode)}</td><td class="p-3 text-right"><button onclick="openVehicleEditor(${vehicle.vehicleId})" class="text-blue-600 border px-2 py-1 rounded mr-1"><i class="fas fa-edit"></i></button><button onclick="archiveVehicle(${vehicle.vehicleId})" class="text-red-600 border px-2 py-1 rounded"><i class="fas fa-archive"></i></button></td></tr>
        `).join('') || '<tr><td colspan="5" class="p-6 text-center text-gray-400">No active vehicles.</td></tr>';
        document.getElementById('adminDriverList').innerHTML = drivers.map(driver => `
            <tr class="border-b"><td class="p-3 font-semibold">${adminEscape(driver.fullName)}</td><td class="p-3 text-xs">${adminEscape(driver.driverTypeCode)}</td><td class="p-3 text-xs">${adminEscape(driver.licenseNumber || '—')}</td><td class="p-3 text-xs">${adminDate(driver.licenseExpiryDate)}</td><td class="p-3 text-right"><button onclick="openDriverEditor(${driver.driverId})" class="text-blue-600 border px-2 py-1 rounded mr-1"><i class="fas fa-edit"></i></button><button onclick="archiveDriver(${driver.driverId})" class="text-red-600 border px-2 py-1 rounded"><i class="fas fa-archive"></i></button></td></tr>
        `).join('') || '<tr><td colspan="5" class="p-6 text-center text-gray-400">No active drivers.</td></tr>';
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to load fleet.', 'error');
    }
}

function openVehicleEditor(id = null) {
    const item = adminState.vehicles.find(row => row.vehicleId === id);
    adminModal(item ? 'Edit Vehicle' : 'Add Vehicle', `
        <input type="hidden" id="vehicleId" value="${item?.vehicleId || ''}">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-xs font-bold">Vehicle Name<input id="vehicleName" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.vehicleName || '')}"></label>
            <label class="text-xs font-bold">Plate Number<input id="vehiclePlate" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.plateNumber || '')}"></label>
            <label class="text-xs font-bold">Type<input id="vehicleType" class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.vehicleType || '')}"></label>
            <label class="text-xs font-bold">Capacity<input id="vehicleCapacity" type="number" min="1" class="mt-1 w-full border p-2 rounded font-normal" value="${item?.capacity || ''}"></label>
            <label class="text-xs font-bold">Default Driver<select id="vehicleDriver" class="mt-1 w-full border p-2 rounded font-normal"><option value="">Unassigned</option>${adminState.drivers.map(driver => `<option value="${driver.driverId}" ${item?.defaultDriverId === driver.driverId ? 'selected' : ''}>${adminEscape(driver.fullName)}</option>`).join('')}</select></label>
            <label class="text-xs font-bold">Status<select id="vehicleStatus" class="mt-1 w-full border p-2 rounded font-normal">${['AVAILABLE','MAINTENANCE','UNAVAILABLE'].map(status => `<option ${item?.vehicleStatusCode === status ? 'selected' : ''}>${status}</option>`).join('')}</select></label>
        </div>
        <label class="block text-xs font-bold mt-3">Remarks<textarea id="vehicleRemarks" class="mt-1 w-full border p-2 rounded font-normal">${adminEscape(item?.remarks || '')}</textarea></label>`,
        item ? 'Save Vehicle' : 'Create Vehicle',
        saveVehicle);
}

async function saveVehicle(event) {
    event.preventDefault();
    const id = document.getElementById('vehicleId').value;
    const payload = {
        vehicleName: document.getElementById('vehicleName').value.trim(),
        plateNumber: document.getElementById('vehiclePlate').value.trim(),
        vehicleType: document.getElementById('vehicleType').value.trim() || null,
        capacity: Number(document.getElementById('vehicleCapacity').value) || null,
        defaultDriverId: Number(document.getElementById('vehicleDriver').value) || null,
        vehicleStatusCode: document.getElementById('vehicleStatus').value,
        remarks: document.getElementById('vehicleRemarks').value.trim() || null
    };
    try {
        if (id) await ApiClient.put(`/vehicles/${id}`, payload);
        else await ApiClient.post('/vehicles', payload);
        closeAdminEditor();
        showToast('Vehicle saved.');
        await loadFleetReferences();
        await renderAdminFleet();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to save vehicle.', 'error');
    }
}

async function archiveVehicle(id) {
    if (!confirm('Archive this vehicle?')) return;
    try {
        await ApiClient.request(`/vehicles/${id}`, { method: 'DELETE' });
        showToast('Vehicle archived.');
        await loadFleetReferences();
        await renderAdminFleet();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to archive vehicle.', 'error');
    }
}

function openDriverEditor(id = null) {
    const item = adminState.drivers.find(row => row.driverId === id);
    adminModal(item ? 'Edit Driver' : 'Add Driver', `
        <input type="hidden" id="driverId" value="${item?.driverId || ''}">
        <label class="block text-xs font-bold mb-3">Full Name<input id="driverName" required class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.fullName || '')}"></label>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label class="text-xs font-bold">Driver Type<select id="driverType" onchange="handleDriverTypeChange()" class="mt-1 w-full border p-2 rounded font-normal">${['EMPLOYEE','EXTERNAL'].map(type => `<option ${item?.driverTypeCode === type ? 'selected' : ''}>${type}</option>`).join('')}</select></label>
            <label id="driverEmployeeRecordField" class="text-xs font-bold">Employee Database Record ID<input id="driverEmployeeRecord" type="number" min="1" class="mt-1 w-full border p-2 rounded font-normal" value="${item?.employeeRecordId || ''}"><span class="mt-1 block text-[10px] font-normal text-gray-400">Required only when the driver is an MPI employee.</span></label>
            <label class="text-xs font-bold">License Number<input id="driverLicense" class="mt-1 w-full border p-2 rounded font-normal" value="${adminEscape(item?.licenseNumber || '')}"></label>
            <label class="text-xs font-bold">License Expiry<input id="driverExpiry" type="date" class="mt-1 w-full border p-2 rounded font-normal" value="${item?.licenseExpiryDate ? item.licenseExpiryDate.slice(0, 10) : ''}"></label>
        </div>`,
        item ? 'Save Driver' : 'Create Driver',
        saveDriver);
    handleDriverTypeChange();
}

function handleDriverTypeChange() {
    const type = document.getElementById('driverType')?.value;
    const field = document.getElementById('driverEmployeeRecordField');
    const input = document.getElementById('driverEmployeeRecord');
    if (!field || !input) return;

    const isEmployee = type === 'EMPLOYEE';
    field.classList.toggle('hidden', !isEmployee);
    input.disabled = !isEmployee;
    input.required = isEmployee;
    if (!isEmployee) input.value = '';
}

async function saveDriver(event) {
    event.preventDefault();
    const id = document.getElementById('driverId').value;
    const driverTypeCode = document.getElementById('driverType').value;
    const payload = {
        employeeRecordId: driverTypeCode === 'EMPLOYEE'
            ? Number(document.getElementById('driverEmployeeRecord').value) || null
            : null,
        fullName: document.getElementById('driverName').value.trim(),
        driverTypeCode,
        licenseNumber: document.getElementById('driverLicense').value.trim() || null,
        licenseExpiryDate: document.getElementById('driverExpiry').value || null
    };
    try {
        if (id) await ApiClient.put(`/drivers/${id}`, payload);
        else await ApiClient.post('/drivers', payload);
        closeAdminEditor();
        showToast('Driver saved.');
        await loadFleetReferences();
        await renderAdminFleet();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to save driver.', 'error');
    }
}

async function archiveDriver(id) {
    if (!confirm('Archive this driver?')) return;
    try {
        await ApiClient.request(`/drivers/${id}`, { method: 'DELETE' });
        showToast('Driver archived.');
        await loadFleetReferences();
        await renderAdminFleet();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to archive driver.', 'error');
    }
}

async function switchAdminTab(tabId) {
    document.querySelectorAll('.admin-tab').forEach(button => {
        button.classList.remove('text-mpiBlue', 'border-b-2', 'border-mpiBlue');
        button.classList.add('text-gray-500');
    });
    const button = document.getElementById(`tab-${tabId}`);
    button?.classList.add('text-mpiBlue', 'border-b-2', 'border-mpiBlue');
    document.querySelectorAll('.admin-tab-content').forEach(content => content.classList.add('hidden'));
    document.getElementById(`admin-${tabId}`)?.classList.remove('hidden');

    if (tabId === 'logs') await renderAdminLogs(1);
    if (tabId === 'users') {
        await loadAdminReferences();
        await renderAdminUsers(1);
    }
    if (tabId === 'fleet') await renderAdminFleet();
    if (tabId === 'depts') await renderDepartmentsAndRoles();
}

function renderAdminTables() {
    if (!isDatabaseSession()) {
        renderAdminUsers(1);
        return;
    }
    if (currentUser?.role === 'System Admin') {
        loadAdminReferences().catch(() => {});
    }
}

window.renderAdminLogs = renderAdminLogs;
window.changeLogPage = changeLogPage;
window.switchAdminTab = switchAdminTab;
window.renderAdminTables = renderAdminTables;
window.renderAdminUsers = renderAdminUsers;
window.changeUserPage = changeUserPage;
window.showUserRoleDetails = showUserRoleDetails;
window.showUserDepartmentDetails = showUserDepartmentDetails;
window.openUserEditor = openUserEditor;
window.handleAdminUserTypeChange = handleAdminUserTypeChange;
window.archiveAdminUser = archiveAdminUser;
window.renderDepartmentsAndRoles = renderDepartmentsAndRoles;
window.openDepartmentEditor = openDepartmentEditor;
window.archiveDepartment = archiveDepartment;
window.openRoleEditor = openRoleEditor;
window.archiveRole = archiveRole;
window.renderAdminFleet = renderAdminFleet;
window.deleteGatePassLog = deleteGatePassLog;
window.openVehicleEditor = openVehicleEditor;
window.archiveVehicle = archiveVehicle;
window.openDriverEditor = openDriverEditor;
window.handleDriverTypeChange = handleDriverTypeChange;
window.archiveDriver = archiveDriver;
window.closeAdminEditor = closeAdminEditor;
