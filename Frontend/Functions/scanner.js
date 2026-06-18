// QR scanner, manual scan, Time Out, and Time In logic.

function simulateQrScan() {
            if(currentUser.role !== 'Security') return;
            const gpId = document.getElementById('manualQrInput').value; const p = gatePasses.find(x => x.id === gpId);
            if (!p) { showToast('Invalid ID', 'error'); return; }

            const nowTime = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            if (p.status === 'Approved' && p.scanCount === 0) {
                p.scanCount = 1; p.actualOut = nowTime;
                if (p.willReturn) {
                    p.status = 'Outside';
                    if(p.vehicle) p.vehicle.status = 'In Use';
                    showToast(`TIME OUT RECORDED: ${p.userName}. Waiting for return.`);
                } else {
                    p.status = 'Closed';
                    showToast(`1-WAY PASS: ${p.userName} Time Out Recorded. Closed.`);
                }
            }
            else if (p.status === 'Outside' && p.scanCount === 1) {
                p.scanCount = 2; p.actualIn = nowTime; p.status = 'Returned';
                if(p.vehicle) p.vehicle.status = 'Available';
                showToast(`TIME IN RECORDED. Closed.`);
            }
            else showToast(`Transaction Failed. Status: ${p.status}`, 'error');

            document.getElementById('manualQrInput').value = '';
            refreshDashboards();
        }

function renderGuardDashboard() {
    const queueItems = gatePasses.filter((pass) =>
        pass.status === 'Approved' || pass.status === 'Outside'
    );

    document.getElementById('guardQueueList').innerHTML = queueItems.map((pass) => {
        const badgeColor = pass.status === 'Approved'
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-blue-100 text-blue-800';
        const queueStatus = pass.status === 'Approved' ? 'Waiting OUT' : 'Waiting IN';
        return `
            <tr class="border-b hover:bg-gray-50">
                <td class="px-4 py-2 text-xs font-mono font-bold text-mpiBlue">${pass.id}</td>
                <td class="px-4 py-2 text-sm font-semibold">${pass.userName}</td>
                <td class="px-4 py-2 text-xs">${pass.willReturn ? '<span class="text-green-600 font-bold">Yes</span>' : '<span class="text-red-500 font-bold">No (1-Way)</span>'}</td>
                <td class="px-4 py-2"><span class="px-2 py-1 rounded text-[10px] font-bold ${badgeColor}">${queueStatus}</span></td>
            </tr>
        `;
    }).join('') || '<tr><td colspan="4" class="px-4 py-6 text-center text-gray-400 text-xs">Queue is empty. No pending scans.</td></tr>';
}

window.simulateQrScan = simulateQrScan;
window.renderGuardDashboard = renderGuardDashboard;
