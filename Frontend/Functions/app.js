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

function refreshDashboards() {
    if (!currentUser) return;

    const guardWrapper = document.getElementById('guardDashWrapper');
    const standardWrapper = document.getElementById('standardDashWrapper');

    if (currentUser.role === 'Security') {
        standardWrapper.classList.add('hidden');
        guardWrapper.classList.remove('hidden');
        renderGuardDashboard();
    } else {
        standardWrapper.classList.remove('hidden');
        guardWrapper.classList.add('hidden');
        renderStandardDashboard();
    }

    renderApprovalQueue();
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

window.updateDate = updateDate;
window.showToast = showToast;
window.refreshDashboards = refreshDashboards;
