// Application startup and cross-feature dashboard refresh.
function updateDate() {
    const options = {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    };
    const display = document.getElementById('currentDateDisplay');
    if (display) display.innerText = new Date().toLocaleDateString('en-US', options);
}

function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            const colors = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-gray-800');
            const icon = type === 'success' ? 'fa-check' : (type === 'error' ? 'fa-exclamation' : 'fa-info');
            toast.className = `${colors} text-white px-5 py-3 rounded shadow-lg flex items-center space-x-3 transform transition-all duration-300 translate-x-full opacity-0 pointer-events-auto`;
            toast.innerHTML = `<i class="fas ${icon}"></i> <span class="text-sm font-medium">${message}</span>`;
            container.appendChild(toast);
            setTimeout(() => toast.classList.remove('translate-x-full', 'opacity-0'), 10);
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

function clearTransientApplicationState() {
    gatePasses = [];
    currentViewedPassId = null;
    currentLogPage = 1;

    if (typeof databaseApprovalQueue !== 'undefined') {
        databaseApprovalQueue = [];
    }
    if (typeof databaseVehicles !== 'undefined') {
        databaseVehicles = [];
    }
    if (typeof databaseDrivers !== 'undefined') {
        databaseDrivers = [];
    }
    if (typeof materialEmployeeDirectory !== 'undefined') {
        materialEmployeeDirectory = [];
    }

    forceCloseModal?.();
}

function resetRequestForms() {
    document.getElementById('applyForm')?.reset();
    document.getElementById('materialApplyForm')?.reset();
    document.getElementById('materialItemsBody')?.replaceChildren();
    toggleVehicleFields?.();
    initializeMaterialGatePassForm?.();
    resetAllSignatureState?.();
    renderRequesterDepartmentSelectors?.();
}

function getVisibleSectionId() {
    return document.querySelector('.view-section:not(.hidden)')?.id || null;
}

async function renderVisibleSection() {
    const visibleSectionId = getVisibleSectionId();

    if (visibleSectionId === 'sec-dashBoard') {
        await refreshDashboards();
        return;
    }

    if (visibleSectionId === 'sec-approvals') {
        await renderApprovalQueue();
        return;
    }

    if (visibleSectionId === 'sec-guardScan') {
        await renderGuardDashboard();
        return;
    }

    if (visibleSectionId === 'sec-applyPass') {
        const isMaterialView =
            !document.getElementById('materialApplyForm')?.classList.contains('hidden');
        if (isMaterialView) {
            await loadMaterialEmployees();
            initializeMaterialGatePassForm?.();
        } else {
            initializeGatePassForm?.();
            updateApprovalRoutePreview?.();
        }
        return;
    }

    if (visibleSectionId === 'sec-adminPanel') {
        renderAdminTables?.();
    }
}

async function refreshApplicationState(reason = 'general', options = {}) {
    const shouldResetState = options.resetState === true;
    const shouldReloadUserProfile = options.reloadUserProfile === true;

    if (shouldResetState) {
        clearTransientApplicationState();
        resetRequestForms();
    }

    if (
        shouldReloadUserProfile &&
        ApiClient.hasAccessToken() &&
        typeof refreshAuthenticatedProfile === 'function'
    ) {
        const refreshedUser = await refreshAuthenticatedProfile();
        if (!refreshedUser) return;
    }

    if (!currentUser) return;

    try {
        await loadFleetReferences();

        if (isDatabaseSession() && currentUser.role !== 'Security') {
            await loadMyGatePasses();
        }

        await renderApprovalQueue();
        await renderVisibleSection();
    } catch (error) {
        showToast(
            error instanceof ApiError
                ? error.message
                : `Unable to refresh application state (${reason}).`,
            'error'
        );
    }
}

async function refreshDashboards() {
    if (!currentUser) return;

    const guardWrapper = document.getElementById('guardDashWrapper');
    const standardWrapper = document.getElementById('standardDashWrapper');

    if (currentUser.role === 'Security') {
        standardWrapper.classList.add('hidden');
        guardWrapper.classList.remove('hidden');
        await renderGuardDashboard();
    } else {
        standardWrapper.classList.remove('hidden');
        guardWrapper.classList.add('hidden');
        await renderStandardDashboard();
    }
}

document.addEventListener('DOMContentLoaded', () => {
    updateDate();
    window.setInterval(updateDate, 60000);
    initializeModalDragResize();
    setupSignaturePad();
    initializeSignatureControls();
    initializeGatePassForm();
    renderAdminTables();
});

window.addEventListener('gatepass:authenticated', async () => {
    await refreshApplicationState('authenticated', { resetState: true });
});

window.updateDate = updateDate;
window.showToast = showToast;
window.refreshDashboards = refreshDashboards;
window.refreshApplicationState = refreshApplicationState;
