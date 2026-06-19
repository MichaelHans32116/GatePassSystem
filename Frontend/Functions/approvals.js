// Approval queue, signature upload, and approval actions.

var databaseApprovalQueue = [];

async function uploadCurrentSignature() {
    if (!currentUploadedSig) return null;

    const formData = new FormData();
    formData.append('file', dataUrlToBlob(currentUploadedSig), 'signature.png');
    formData.append('widthPercent', document.getElementById('sigSize').value || '100');
    formData.append('yOffset', document.getElementById('sigY').value || '0');
    return ApiClient.post('/signatures', formData);
}

async function approveCurrentPass() {
    if (currentUser.role === 'System Admin') return;

    if (!isDatabaseSession()) {
        approveCurrentMockPass();
        return;
    }

    const pass = gatePasses.find(item => item.id === currentViewedPassId);
    if (!pass) return;

    const approveButton = document.getElementById('approveRequestButton');
    if (approveButton) approveButton.disabled = true;
    try {
        const signature = await uploadCurrentSignature();
        await ApiClient.post(`/approvals/${pass.dbId}/approve`, {
            signatureFileId: signature?.signatureFileId || null,
            comment: null
        });
        showToast('Document Approved!');
        closeModal();
        await Promise.all([renderApprovalQueue(), loadMyGatePasses()]);
        refreshDashboards();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to approve document.', 'error');
    } finally {
        if (approveButton) approveButton.disabled = false;
    }
}

async function rejectCurrentPass() {
    if (!isDatabaseSession()) {
        const pass = gatePasses.find(item => item.id === currentViewedPassId);
        if (!pass) return;
        const reason = window.prompt('Reason for rejection:');
        if (!reason?.trim()) return;
        pass.status = 'Rejected';
        showToast('Document Rejected.', 'error');
        closeModal();
        refreshDashboards();
        return;
    }

    const pass = gatePasses.find(item => item.id === currentViewedPassId);
    if (!pass) return;
    const reason = window.prompt('Reason for rejection:');
    if (!reason?.trim()) return;

    try {
        await ApiClient.post(`/approvals/${pass.dbId}/reject`, {
            signatureFileId: null,
            comment: reason.trim()
        });
        showToast('Document Rejected.', 'error');
        closeModal();
        await renderApprovalQueue();
        refreshDashboards();
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to reject document.', 'error');
    }
}

function approveCurrentMockPass() {
    const pass = gatePasses.find(item => item.id === currentViewedPassId);
    if (!pass) return;

    const sigWidth = document.getElementById('sigSize').value;
    const sigY = document.getElementById('sigY').value;
    const saveCheck = document.getElementById('saveDefaultSig');

    currentUser.savedSignature = saveCheck?.checked
        ? { img: currentUploadedSig, w: sigWidth, y: sigY }
        : null;

    const sigObj = {
        name: currentUser.name,
        img: currentUploadedSig,
        w: sigWidth,
        y: sigY
    };

    if (pass.status === 'Pending Superior') {
        pass.signatures.imm = sigObj;
        pass.status = pass.requiresPresidentApproval ? 'Pending President' : 'Pending PAS';
    } else if (pass.status === 'Pending President') {
        pass.signatures.pres = sigObj;
        pass.status = 'Pending PAS';
    } else if (pass.status === 'Pending PAS') {
        pass.signatures.pas = sigObj;
        pass.status = 'Approved';
    }

    showToast('Document Approved!');
    closeModal();
    refreshDashboards();
}

async function renderApprovalQueue() {
    if (!currentUser) return;

    if (isDatabaseSession()) {
        const canApprove = currentUser.permissions.some(permission =>
            ['gatepass.approve.superior', 'gatepass.approve.president', 'gatepass.note.pas'].includes(permission)
        );
        if (!canApprove) {
            updateApprovalQueueDisplay([]);
            return;
        }

        try {
            databaseApprovalQueue = await ApiClient.get('/approvals/queue');
            const queuePasses = databaseApprovalQueue.map(item => ({
                id: item.gatePassNo,
                dbId: item.gatePassId,
                userName: item.fullName,
                userDept: item.departmentName,
                destination: item.destination,
                purpose: item.purpose,
                expectedOut: formatDateTime(item.expectedOutAt, false),
                expectedIn: item.expectedInAt ? formatDateTime(item.expectedInAt, false) : 'N/A',
                status: gatePassStatusLabels[`PENDING_${item.approvalStepCode}`],
                vehicle: null,
                signatures: { imm: null, pres: null, pas: null },
                willReturn: Boolean(item.expectedInAt)
            }));
            queuePasses.forEach((pass) => {
                const index = gatePasses.findIndex(item => item.dbId === pass.dbId);
                if (index >= 0) gatePasses[index] = { ...gatePasses[index], ...pass };
                else gatePasses.push(pass);
            });
            updateApprovalQueueDisplay(queuePasses);
        } catch (error) {
            updateApprovalQueueDisplay([]);
            if (error.status !== 403) {
                showToast(error instanceof ApiError ? error.message : 'Unable to load approvals.', 'error');
            }
        }
        return;
    }

    let toApprove = [];
    if (currentUser.role === 'Immediate Superior') {
        toApprove = toApprove.concat(gatePasses.filter(pass =>
            pass.status === 'Pending Superior' && pass.userDept === currentUser.dept
        ));
    }
    if (currentUser.role === 'President') {
        toApprove = toApprove.concat(gatePasses.filter(pass => pass.status === 'Pending President'));
    }
    if (currentUser.canNoteGatePass) {
        toApprove = toApprove.concat(gatePasses.filter(pass => pass.status === 'Pending PAS'));
    }
    updateApprovalQueueDisplay(toApprove);
}

function updateApprovalQueueDisplay(toApprove) {
    const badge = document.getElementById('navApprovalBadge');
    if (toApprove.length > 0) {
        badge.innerText = toApprove.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    document.getElementById('approvalList').innerHTML = toApprove.map(pass => `
        <div class="bg-white border p-4 rounded shadow-sm flex flex-col justify-between">
            <div class="mb-3">
                <div class="flex justify-between"><h3 class="font-bold text-sm">${pass.userName}</h3><span class="text-[9px] bg-yellow-100 px-1 rounded">${pass.status}</span></div>
                <p class="text-xs text-gray-500 mb-1">Dest: ${pass.destination}</p>
                <p class="text-xs text-gray-500">Department: ${pass.userDept || 'N/A'}</p>
            </div>
            <button onclick="viewPass('${pass.id}', true)" class="w-full bg-blue-50 text-mpiBlue text-xs font-bold py-2 rounded hover:bg-mpiBlue hover:text-white transition">Review Document</button>
        </div>
    `).join('') || '<div class="col-span-2 text-center py-10 text-gray-400">No pending approvals.</div>';
}

window.approveCurrentPass = approveCurrentPass;
window.rejectCurrentPass = rejectCurrentPass;
window.renderApprovalQueue = renderApprovalQueue;
