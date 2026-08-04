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
            `<option value="${escapeHtml(department.departmentId)}">${escapeHtml(department.departmentName)}</option>`
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
    // An authenticated session is always the private calendar (with the past-records
    // toggle), even if this browser previously opened the public guest calendar.
    window.isGuestCalendarView = false;
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

    if (user.mustChangePassword) {
        showToast('Your account is still using its initial password. Use Change Password in the menu to replace it.', 'warning');
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

function showChangePasswordError(message) {
    const error = document.getElementById('changePasswordError');
    if (!error) return;
    error.textContent = message;
    error.classList.remove('hidden');
}

function openChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    const error = document.getElementById('changePasswordError');
    if (!modal || !form) return;

    form.reset();
    if (error) {
        error.textContent = '';
        error.classList.add('hidden');
    }
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('currentPassword')?.focus();
}

function closeChangePasswordModal() {
    const modal = document.getElementById('changePasswordModal');
    const form = document.getElementById('changePasswordForm');
    if (modal) {
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
    }
    form?.reset();
}

async function handleChangePassword(event) {
    event.preventDefault();

    const currentPassword = document.getElementById('currentPassword')?.value || '';
    const newPassword = document.getElementById('newPassword')?.value || '';
    const confirmPassword = document.getElementById('confirmPassword')?.value || '';
    const submitButton = document.getElementById('changePasswordSubmitButton');

    if (!currentPassword) {
        showChangePasswordError('Current password is required.');
        return;
    }
    if (!newPassword.trim() || newPassword.length < 8 || newPassword.length > 128) {
        showChangePasswordError('New password must be 8 to 128 characters.');
        return;
    }
    if (newPassword !== confirmPassword) {
        showChangePasswordError('New password and confirmation do not match.');
        return;
    }

    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';
        submitButton.classList.add('opacity-60', 'cursor-wait');
    }

    try {
        await ApiClient.data('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ currentPassword, newPassword, confirmPassword })
        });
        closeChangePasswordModal();
        await logout();
        showToast('Password changed and saved. Sign in again using your new password.', 'success');
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) return;
        showChangePasswordError(
            error instanceof ApiError
                ? error.message
                : 'Unable to save the password. Please check the API connection.'
        );
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Save Password';
            submitButton.classList.remove('opacity-60', 'cursor-wait');
        }
    }
}

async function logout() {
    closeChangePasswordModal();
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
    window.playLoginEntrance?.();

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
    document.getElementById('changePasswordButton')?.addEventListener('click', openChangePasswordModal);
    document.getElementById('changePasswordCloseButton')?.addEventListener('click', closeChangePasswordModal);
    document.getElementById('changePasswordCancelButton')?.addEventListener('click', closeChangePasswordModal);
    document.getElementById('changePasswordForm')?.addEventListener('submit', handleChangePassword);
    document.getElementById('changePasswordModal')?.addEventListener('click', closeChangePasswordModal);
    restoreAuthenticatedSession();
});

window.togglePassword = togglePassword;
window.handleLogin = handleLogin;
window.logout = logout;
window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;
window.refreshAuthenticatedProfile = refreshAuthenticatedProfile;
window.renderRequesterDepartmentSelectors = renderRequesterDepartmentSelectors;
window.getRequesterDepartmentId = getRequesterDepartmentId;
