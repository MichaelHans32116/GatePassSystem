// Database-backed authentication and browser session handling.

function togglePassword() {
    const passInput = document.getElementById('empPass');
    const eyeIcon = document.getElementById('eyeIcon');

    if (passInput.type === 'password') {
        passInput.type = 'text';
        eyeIcon.classList.remove('fa-eye');
        eyeIcon.classList.add('fa-eye-slash');
    } else {
        passInput.type = 'password';
        eyeIcon.classList.remove('fa-eye-slash');
        eyeIcon.classList.add('fa-eye');
    }
}

function resolveInterfaceRole(roles) {
    const roleSet = new Set(roles || []);

    if (roleSet.has('SYSTEM_ADMIN')) return 'System Admin';
    if (roleSet.has('SECURITY')) return 'Security';
    if (roleSet.has('PRESIDENT')) return 'President';
    if (roleSet.has('PAS_NOTER')) return 'PAS Noter';
    if (roleSet.has('IMMEDIATE_SUPERIOR')) return 'Immediate Superior';
    if (roleSet.has('DRIVER')) return 'Driver';
    return 'Associate';
}

function resolveInterfaceRoleLabel(roles) {
    const roleSet = new Set(roles || []);
    const labels = [];

    if (roleSet.has('SYSTEM_ADMIN')) labels.push('System Admin');
    if (roleSet.has('SECURITY')) labels.push('Security');
    if (roleSet.has('PRESIDENT')) labels.push('President');
    if (roleSet.has('IMMEDIATE_SUPERIOR')) labels.push('Immediate Superior');
    if (roleSet.has('PAS_NOTER')) labels.push('PAS');
    if (roleSet.has('DRIVER')) labels.push('Driver');

    return labels.length > 0 ? labels.join(' / ') : 'Associate';
}

function mapAuthenticatedUser(apiUser) {
    const roles = apiUser.roles || [];

    return {
        id: apiUser.employeeId || apiUser.username,
        accountId: apiUser.id,
        name: apiUser.fullName,
        role: resolveInterfaceRole(roles),
        roleLabel: resolveInterfaceRoleLabel(roles),
        roles,
        permissions: apiUser.permissions || [],
        departmentId: apiUser.departmentId || null,
        dept: apiUser.department || (
            (apiUser.requestableDepartments || []).length > 1
                ? 'Multiple Departments'
                : 'System'
        ),
        managedDepartments: apiUser.managedDepartments || [],
        requestableDepartments: apiUser.requestableDepartments || [],
        position: apiUser.position || '',
        employeeQrToken: apiUser.employeeQrToken || null,
        mustChangePassword: Boolean(apiUser.mustChangePassword),
        canNoteGatePass: roles.includes('PAS_NOTER')
    };
}

function updateAuthenticatedShell(user) {
    document.getElementById('navUserName').innerText = user.name;
    document.getElementById('navUserRole').innerText = user.roleLabel || user.role;
}

function renderRequesterDepartmentSelectors() {
    const requestable = currentUser?.requestableDepartments || [];
    const needsSelection = !currentUser?.departmentId && requestable.length > 0;
    const options = [
        '<option value="">-- Select department --</option>',
        ...requestable.map(department =>
            `<option value="${department.departmentId}">${department.departmentName}</option>`
        )
    ].join('');

    [
        ['personRequesterDepartmentGroup', 'personRequesterDepartment'],
        ['materialRequesterDepartmentGroup', 'materialRequesterDepartment']
    ].forEach(([groupId, selectId]) => {
        const group = document.getElementById(groupId);
        const select = document.getElementById(selectId);
        group?.classList.toggle('hidden', !needsSelection);
        if (!select) return;
        select.required = needsSelection;
        select.disabled = !needsSelection;
        if (needsSelection) {
            const previous = select.value;
            select.innerHTML = options;
            if (requestable.some(item =>
                String(item.departmentId) === previous
            )) {
                select.value = previous;
            }
        } else {
            select.innerHTML = '';
        }
    });
}

function getRequesterDepartmentId(formTypeCode) {
    if (currentUser?.departmentId) {
        return currentUser.departmentId;
    }

    const selectId = formTypeCode === 'MATERIAL_GATE_PASS'
        ? 'materialRequesterDepartment'
        : 'personRequesterDepartment';
    const selected = Number(document.getElementById(selectId)?.value);
    return Number.isFinite(selected) && selected > 0 ? selected : null;
}

function showAuthenticatedApp(user, showSignedInToast = true) {
    clearTransientApplicationState?.();
    resetRequestForms?.();
    currentUser = user;
    renderRequesterDepartmentSelectors();
    document.getElementById('loginView').style.opacity = '0';

    setTimeout(() => {
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('appView').classList.remove('hidden');
        document.getElementById('loginView').style.opacity = '1';
    }, 300);

    updateAuthenticatedShell(user);
    setupRoleAccess(user);
    window.dispatchEvent(new CustomEvent('gatepass:authenticated', {
        detail: { database: ApiClient.isDatabaseSession(), user }
    }));

    if (showSignedInToast) {
        showToast(`Signed in as ${user.name}`);
    }

}

async function refreshAuthenticatedProfile() {
    if (!ApiClient.hasAccessToken()) return null;

    try {
        const apiUser = await ApiClient.data('/auth/me');
        const user = mapAuthenticatedUser(apiUser);
        currentUser = user;
        updateAuthenticatedShell(user);
        return user;
    } catch {
        ApiClient.clearAccessToken();
        currentUser = null;
        return null;
    }
}

async function handleLogin(e) {
    e.preventDefault();

    const form = document.getElementById('loginForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const username = document.getElementById('empId').value.trim();
    const password = document.getElementById('empPass').value;

    submitButton.disabled = true;
    submitButton.classList.add('opacity-60', 'cursor-wait');

    try {
        const result = await ApiClient.data('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ username, password })
        });

        ApiClient.setAccessToken(result.accessToken);
        form.reset();
        showAuthenticatedApp(mapAuthenticatedUser(result.user));
    } catch (error) {
        ApiClient.clearAccessToken();
        showToast(
            error instanceof ApiError ? error.message : 'Unable to connect to the Form Request API.',
            'error'
        );
    } finally {
        submitButton.disabled = false;
        submitButton.classList.remove('opacity-60', 'cursor-wait');
    }
}

async function restoreAuthenticatedSession() {
    if (!ApiClient.hasAccessToken()) return;

    try {
        const apiUser = await ApiClient.data('/auth/me');
        showAuthenticatedApp(mapAuthenticatedUser(apiUser), false);
    } catch {
        ApiClient.clearAccessToken();
    }
}

async function logout() {
    if (ApiClient.hasAccessToken()) {
        try {
            await ApiClient.request('/auth/logout', { method: 'POST' });
        } catch {
            // Local token cleanup remains authoritative for the browser session.
        }
    }
    ApiClient.clearAccessToken();
    clearTransientApplicationState?.();
    resetRequestForms?.();
    currentUser = null;
    window.isGuestCalendarView = false;
    document.getElementById('appView').classList.add('hidden');
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('loginForm').reset();

    const guestLogin = document.getElementById('navItemGuestLogin');
    if (guestLogin) guestLogin.style.display = 'none';
    const logoutBtn = document.getElementById('logoutButton');
    if (logoutBtn) logoutBtn.style.display = 'block';

    if (
        window.innerWidth < 768 &&
        !document.getElementById('sidebar').classList.contains('-translate-x-full')
    ) {
        toggleSidebar();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
    document.getElementById('logoutButton')?.addEventListener('click', logout);
    restoreAuthenticatedSession();
});

window.togglePassword = togglePassword;
window.handleLogin = handleLogin;
window.logout = logout;
window.refreshAuthenticatedProfile = refreshAuthenticatedProfile;
window.renderRequesterDepartmentSelectors = renderRequesterDepartmentSelectors;
window.getRequesterDepartmentId = getRequesterDepartmentId;
