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
            if (!container) return; // Guard clause in case container is missing
            const toast = document.createElement('div');
            const colors = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-gray-800');
            const icon = type === 'success' ? 'fa-check' : (type === 'error' ? 'fa-exclamation' : 'fa-info');
            toast.className = `${colors} text-white px-5 py-3 rounded shadow-lg flex items-center space-x-3 transform transition-all duration-300 translate-x-full opacity-0 pointer-events-auto`;

            toast.innerHTML = `
                <i class="fas ${icon}"></i>
                <span class="text-sm font-medium">${message}</span>
            `;

            container.appendChild(toast);

            requestAnimationFrame(() => {
                toast.classList.remove('translate-x-full', 'opacity-0');
            });

            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
}

function appConfirm(title, message, type = 'danger') {
    return new Promise((resolve) => {
        const modal = document.getElementById('appConfirmModal');
        const content = document.getElementById('appConfirmModalContent');
        const titleEl = document.getElementById('appConfirmTitle');
        const messageEl = document.getElementById('appConfirmMessage');
        const iconEl = document.getElementById('appConfirmIcon');
        const okBtn = document.getElementById('appConfirmOkBtn');
        const cancelBtn = document.getElementById('appConfirmCancelBtn');

        if (!modal) {
            // Fallback to native confirm if HTML is missing
            resolve(confirm(`${title}\n\n${message}`));
            return;
        }

        titleEl.textContent = title;
        messageEl.textContent = message;

        if (type === 'danger') {
            iconEl.className = 'flex-shrink-0 w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600';
            iconEl.innerHTML = '<i class="fas fa-exclamation-triangle text-xl"></i>';
            okBtn.className = 'text-sm font-bold bg-red-600 text-white px-5 py-2 rounded-lg hover:bg-red-700 transition-colors shadow-sm';
            okBtn.textContent = 'Delete';
        } else {
            iconEl.className = 'flex-shrink-0 w-10 h-10 rounded-full bg-mpiBlue/10 flex items-center justify-center text-mpiBlue';
            iconEl.innerHTML = '<i class="fas fa-question-circle text-xl"></i>';
            okBtn.className = 'text-sm font-bold bg-mpiBlue text-white px-5 py-2 rounded-lg hover:bg-mpiDark transition-colors shadow-sm';
            okBtn.textContent = 'OK';
        }

        const cleanup = () => {
            modal.classList.remove('opacity-100');
            modal.classList.add('opacity-0');
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
            }, 200);
            okBtn.onclick = null;
            cancelBtn.onclick = null;
        };

        okBtn.onclick = () => {
            cleanup();
            resolve(true);
        };

        cancelBtn.onclick = () => {
            cleanup();
            resolve(false);
        };

        modal.classList.remove('hidden');
        modal.classList.add('flex');
        
        // Trigger animation
        requestAnimationFrame(() => {
            modal.classList.remove('opacity-0');
            modal.classList.add('opacity-100');
            content.classList.remove('scale-95');
            content.classList.add('scale-100');
        });
    });
}

// ── Notification state ──────────────────────────────────────────────────────
// Tracks notification IDs that have already produced a toast in this session
// so the 10-second poll never shows the same alert twice.
const seenNotificationIds = new Set();
let isInitialNotificationLoad = true;
let isGuardDashboardRefreshRunning = false;

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

    // Reset notification session tracking
    seenNotificationIds.clear();
    isInitialNotificationLoad = true;

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
            await checkUnreadNotifications();
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

    // Poll for new notifications every 10 seconds
    window.setInterval(() => {
        if (currentUser && isDatabaseSession() && currentUser.role !== 'Security') {
            checkUnreadNotifications();
        }
    }, 10000);

    window.setInterval(async () => {
        if (
            !currentUser ||
            currentUser.role !== 'Security' ||
            getVisibleSectionId() !== 'sec-guardScan' ||
            isGuardDashboardRefreshRunning
        ) {
            return;
        }

        isGuardDashboardRefreshRunning = true;
        try {
            await renderGuardDashboard();
        } catch (error) {
            console.error('Failed to refresh security queue.', error);
        } finally {
            isGuardDashboardRefreshRunning = false;
        }
    }, 15000);

    // Close notification dropdown when clicking outside
    document.addEventListener('click', (e) => {
        const wrapper = document.getElementById('notificationBellWrapper');
        const dropdown = document.getElementById('notificationDropdown');
        if (wrapper && dropdown && !wrapper.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });
});

window.addEventListener('gatepass:authenticated', async () => {
    await refreshApplicationState('authenticated', { resetState: true });
});

// ── Notification System ─────────────────────────────────────────────────────

/**
 * Polls the backend for unread notifications. Only shows toast alerts for
 * notifications the user hasn't already seen in this session.
 * On initial load, it seeds the seenNotificationIds set WITHOUT toasting
 * so old unreads don't flood the screen on page refresh.
 */
async function checkUnreadNotifications() {
    if (!currentUser) return;
    try {
        const res = await ApiClient.get('/notifications/unread');
        const notifications = Array.isArray(res) ? res : (res && res.items ? res.items : []);

        // Update the bell badge count (always reflects true unread count)
        updateNotificationBadge(notifications.length);

        if (notifications.length > 0) {
            if (isInitialNotificationLoad) {
                // First load after login/refresh: seed seen IDs without toasting
                notifications.forEach(n => seenNotificationIds.add(n.notificationId));
                isInitialNotificationLoad = false;
            } else {
                // Subsequent polls: only toast truly new (unseen) notifications
                const newNotifications = notifications.filter(
                    n => !seenNotificationIds.has(n.notificationId)
                );
                newNotifications.forEach(notif => {
                    seenNotificationIds.add(notif.notificationId);
                    showToast(`${notif.title}: ${notif.message}`, 'info');
                });
            }
        } else {
            isInitialNotificationLoad = false;
        }

        // Refresh the dropdown panel content
        await refreshNotificationDropdown();
    } catch (err) {
        console.error('Failed to check unread notifications:', err);
    }
}

/**
 * Updates the red badge count on the bell icon.
 */
function updateNotificationBadge(count) {
    const badge = document.getElementById('notificationBadge');
    if (!badge) return;
    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
}

/**
 * Fetches all notifications (read + unread, last 50) and renders them
 * into the dropdown list.
 */
async function refreshNotificationDropdown() {
    if (!currentUser) return;
    const listEl = document.getElementById('notificationList');
    if (!listEl) return;

    try {
        const res = await ApiClient.get('/notifications/all');
        const all = Array.isArray(res) ? res : (res && res.items ? res.items : []);

        if (all.length === 0) {
            listEl.innerHTML = `
                <div class="px-4 py-8 text-center text-gray-400 text-sm">
                    <i class="fas fa-bell-slash text-2xl mb-2 block"></i>
                    No notifications yet.
                </div>`;
            return;
        }

        listEl.innerHTML = all.map(n => {
            const isUnread = !n.isRead;
            const typeIcon = getNotificationIcon(n.notificationTypeCode);
            const timeAgo = formatTimeAgo(n.createdAt);
            return `
                <div class="px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition cursor-default ${isUnread ? 'bg-blue-50/60' : ''}">
                    <div class="flex-shrink-0 mt-0.5">
                        <span class="inline-flex items-center justify-center w-8 h-8 rounded-full ${typeIcon.bgClass}">
                            <i class="fas ${typeIcon.icon} ${typeIcon.textClass} text-xs"></i>
                        </span>
                    </div>
                    <div class="flex-1 min-w-0">
                        <p class="text-sm ${isUnread ? 'font-semibold text-gray-800' : 'text-gray-600'}">
                            ${escapeHtml(n.title)}
                        </p>
                        <p class="text-xs text-gray-500 mt-0.5 line-clamp-2">${escapeHtml(n.message)}</p>
                        <p class="text-[10px] text-gray-400 mt-1"><i class="far fa-clock mr-1"></i>${timeAgo}</p>
                    </div>
                    ${isUnread ? '<span class="flex-shrink-0 w-2 h-2 bg-blue-500 rounded-full mt-2"></span>' : ''}
                </div>`;
        }).join('');
    } catch (err) {
        console.error('Failed to load notification list:', err);
    }
}

/**
 * Returns icon config based on notification type code.
 */
function getNotificationIcon(typeCode) {
    const code = (typeCode || '').toUpperCase();
    if (code.includes('APPROVE') || code.includes('COMPLETE') || code.includes('SUCCESS'))
        return { icon: 'fa-check', bgClass: 'bg-green-100', textClass: 'text-green-600' };
    if (code.includes('REJECT') || code.includes('DENIED') || code.includes('ERROR'))
        return { icon: 'fa-times', bgClass: 'bg-red-100', textClass: 'text-red-600' };
    if (code.includes('WARN') || code.includes('PENDING') || code.includes('REMIND'))
        return { icon: 'fa-exclamation-triangle', bgClass: 'bg-amber-100', textClass: 'text-amber-600' };
    if (code.includes('SCAN') || code.includes('GUARD'))
        return { icon: 'fa-qrcode', bgClass: 'bg-purple-100', textClass: 'text-purple-600' };
    // Default: info
    return { icon: 'fa-info', bgClass: 'bg-blue-100', textClass: 'text-blue-600' };
}

/**
 * Returns a human-readable relative time string.
 */
function formatTimeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    if (diffSec < 60) return 'just now';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Escapes HTML to prevent XSS.
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text || ''));
    return div.innerHTML;
}

/**
 * Toggles the notification dropdown panel visibility.
 */
async function toggleNotificationDropdown() {
    const dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) return;
    const isHidden = dropdown.classList.contains('hidden');
    dropdown.classList.toggle('hidden');
    if (isHidden) {
        // Refresh the panel content when opening
        await refreshNotificationDropdown();

        // If there are unread notifications, automatically mark them as read in the backend
        const badge = document.getElementById('notificationBadge');
        if (badge && !badge.classList.contains('hidden')) {
            try {
                await ApiClient.post('/notifications/mark-read', {});
                updateNotificationBadge(0);
            } catch (err) {
                console.error('Failed to automatically mark notifications as read:', err);
            }
        }
    }
}

/**
 * Marks all notifications as read, clears badge, and refreshes the dropdown.
 */
async function markAllNotificationsAsRead() {
    if (!currentUser) return;
    try {
        await ApiClient.post('/notifications/mark-read', {});
        updateNotificationBadge(0);
        await refreshNotificationDropdown();
    } catch (err) {
        console.error('Failed to mark notifications as read:', err);
        showToast('Failed to mark notifications as read.', 'error');
    }
}

window.updateDate = updateDate;
window.showToast = showToast;
window.refreshDashboards = refreshDashboards;
window.refreshApplicationState = refreshApplicationState;
window.checkUnreadNotifications = checkUnreadNotifications;
window.toggleNotificationDropdown = toggleNotificationDropdown;
window.markAllNotificationsAsRead = markAllNotificationsAsRead;

function renderPaginationControls(totalItems, currentPage, pageSize, containerId, onPageChangeCallbackName) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (totalItems <= pageSize) {
        container.innerHTML = '';
        return;
    }
    
    const totalPages = Math.ceil(totalItems / pageSize);
    const startIdx = (currentPage - 1) * pageSize + 1;
    const endIdx = Math.min(currentPage * pageSize, totalItems);
    
    let html = `
    <div class="flex justify-between items-center w-full px-4 py-3 bg-white border-t border-gray-200 sm:px-6">
        <div class="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
                <p class="text-sm text-gray-700">
                    Showing <span class="font-medium">${startIdx}</span> to <span class="font-medium">${endIdx}</span> of <span class="font-medium">${totalItems}</span> results
                </p>
            </div>
            <div>
                <nav class="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                    <button onclick="${onPageChangeCallbackName}(${currentPage - 1})" ${currentPage === 1 ? 'disabled class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-gray-100 text-sm font-medium text-gray-400 cursor-not-allowed"' : 'class="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"'}>
                        <span class="sr-only">Previous</span>
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button onclick="${onPageChangeCallbackName}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-gray-100 text-sm font-medium text-gray-400 cursor-not-allowed"' : 'class="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50"'}>
                        <span class="sr-only">Next</span>
                        <i class="fas fa-chevron-right"></i>
                    </button>
                </nav>
            </div>
        </div>
        <div class="flex items-center justify-between w-full sm:hidden">
            <button onclick="${onPageChangeCallbackName}(${currentPage - 1})" ${currentPage === 1 ? 'disabled class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-400 bg-gray-100"' : 'class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"'}>
                Previous
            </button>
            <span class="text-sm text-gray-700">Page ${currentPage} of ${totalPages}</span>
            <button onclick="${onPageChangeCallbackName}(${currentPage + 1})" ${currentPage === totalPages ? 'disabled class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-400 bg-gray-100"' : 'class="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"'}>
                Next
            </button>
        </div>
    </div>`;
    
    container.innerHTML = html;
}
window.renderPaginationControls = renderPaginationControls;
