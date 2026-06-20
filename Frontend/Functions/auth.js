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

function mapAuthenticatedUser(apiUser) {
    const roles = apiUser.roles || [];

    return {
        id: apiUser.employeeId || apiUser.username,
        accountId: apiUser.id,
        name: apiUser.fullName,
        role: resolveInterfaceRole(roles),
        roles,
        permissions: apiUser.permissions || [],
        dept: apiUser.department || 'System',
        position: apiUser.position || '',
        employeeQrToken: apiUser.employeeQrToken || null,
        mustChangePassword: Boolean(apiUser.mustChangePassword),
        canNoteGatePass: roles.includes('PAS_NOTER')
    };
}

function showAuthenticatedApp(user, showSignedInToast = true) {
    currentUser = user;
    document.getElementById('loginView').style.opacity = '0';

    setTimeout(() => {
        document.getElementById('loginView').classList.add('hidden');
        document.getElementById('appView').classList.remove('hidden');
        document.getElementById('loginView').style.opacity = '1';
    }, 300);

    document.getElementById('navUserName').innerText = user.name;
    document.getElementById('navUserRole').innerText = user.role;
    document.getElementById('initialPasswordBanner')?.classList.toggle(
        'hidden',
        !user.mustChangePassword
    );
    setupRoleAccess(user);
    window.dispatchEvent(new CustomEvent('gatepass:authenticated', {
        detail: { database: ApiClient.isDatabaseSession(), user }
    }));

    if (showSignedInToast) {
        showToast(`Signed in as ${user.name}`);
    }

}

function quickLogin(id, pass) {
    document.getElementById('empId').value = id;
    document.getElementById('empPass').value = pass;
    document.getElementById('loginForm').dispatchEvent(new Event('submit'));
}

async function handleLogin(e) {
    e.preventDefault();

    const form = document.getElementById('loginForm');
    const submitButton = form.querySelector('button[type="submit"]');
    const username = document.getElementById('empId').value.trim();
    const password = document.getElementById('empPass').value;
    const mockUser = mockUsers.find(
        user => user.id === username && user.password === password
    );

    submitButton.disabled = true;
    submitButton.classList.add('opacity-60', 'cursor-wait');

    try {
        if (mockUser) {
            ApiClient.clearAccessToken();
            form.reset();
            showAuthenticatedApp({ ...mockUser, roles: [], permissions: [] });
            return;
        }

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
            error instanceof ApiError ? error.message : 'Unable to connect to the Gate Pass API.',
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
    currentUser = null;
    document.getElementById('appView').classList.add('hidden');
    document.getElementById('loginView').classList.remove('hidden');
    document.getElementById('initialPasswordBanner')?.classList.add('hidden');
    document.getElementById('loginForm').reset();

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
window.quickLogin = quickLogin;
