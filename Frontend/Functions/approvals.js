// Approval queue, signature upload, and approval actions.

var databaseApprovalQueue = [];

// Caches the most recent /signatures upload for the current approval session so a
// retried approval (after a transient failure) reuses the same file instead of
// uploading a fresh one each time and orphaning the previous upload. Reset per pass
// by resetApprovalSignatureComposer().
var lastSignatureUpload = null;

async function uploadCurrentSignature() {
    if (!currentUploadedSig) return null;

    const widthPercent = document.getElementById('sigSize').value || '100';
    const yOffset = document.getElementById('sigY').value || '0';
    const cacheKey = `${currentUploadedSig}|${widthPercent}|${yOffset}`;

    if (lastSignatureUpload && lastSignatureUpload.key === cacheKey) {
        return lastSignatureUpload.result;
    }

    const formData = new FormData();
    formData.append('file', dataUrlToBlob(currentUploadedSig), 'signature.png');
    formData.append('widthPercent', widthPercent);
    formData.append('yOffset', yOffset);
    const result = await ApiClient.post('/signatures', formData);
    lastSignatureUpload = { key: cacheKey, result };
    return result;
}

async function approveCurrentPass() {
    if (currentUser.role === 'System Admin') return;

    if (!isDatabaseSession()) {
        approveCurrentMockPass();
        return;
    }

    const pass = findGatePassRecord();
    if (!pass) return;
    const sigWidth = document.getElementById('sigSize')?.value || 100;
    const sigY = document.getElementById('sigY')?.value || 0;
    const saveCheck = document.getElementById('saveDefaultSig');

    const approveButton = document.getElementById('approveRequestButton');
    if (approveButton) approveButton.disabled = true;
    try {
        const isHRADorAdmin = currentUser && (
            currentUser.role === 'System Admin' || 
            currentUser.roles.includes('PAS_NOTER') ||
            ['GA120', 'GA150', 'GA133', 'GA139', 'GA409', 'GA407'].includes(currentUser.id)
        );

        let vehicleId = null;
        let driverId = null;
        let tripType = null;
        let putOnHold = null;

        if (isHRADorAdmin && (pass.status === 'Pending HRAD Assignment' || pass.status === 'On Hold')) {
            vehicleId = Number(document.getElementById('hradAssignVehicle').value) || null;
            driverId = Number(document.getElementById('hradAssignDriver').value) || null;
            if (!vehicleId) {
                showToast('Select an available company vehicle before forwarding.', 'error');
                return;
            }
        }

        const signature = await uploadCurrentSignature();
        const approveComment = (document.getElementById('decisionReasonInput')?.value || '').trim();
        await ApiClient.post(`/approvals/${pass.dbId}/approve`, {
            signatureFileId: signature?.signatureFileId || null,
            comment: approveComment || null,
            vehicleId,
            driverId,
            tripType,
            putOnHold
        });
        if (saveCheck?.checked && currentUploadedSig) {
            saveApprovalSignaturePreference(
                { img: currentUploadedSig, w: sigWidth, y: sigY },
                currentUser,
                pass.formTypeCode
            );
        } else {
            clearSavedApprovalSignature(currentUser, pass.formTypeCode);
        }
        showToast('Form request approved.');
        closeModal();
        await refreshApplicationState('approve-request');
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to approve document.', 'error');
    } finally {
        if (approveButton) approveButton.disabled = false;
    }
}

async function holdCurrentPass() {
    const pass = findGatePassRecord();
    if (!pass) return;

    const composer = document.getElementById('decisionReasonComposer');
    // First click: reveal the inline composer and wait for the user to type a reason.
    if (composer && composer.classList.contains('hidden')) {
        showDecisionReasonComposer('Reason / Remarks for placing on hold', { required: true });
        return;
    }
    const comment = readDecisionReason();
    if (comment === null) return; // required-but-empty; inline error already shown

    const holdButton = document.getElementById('holdRequestButton');
    if (holdButton) holdButton.disabled = true;

    try {
        await ApiClient.post(`/approvals/${pass.dbId}/approve`, {
            signatureFileId: null,
            comment: comment || 'Put on hold by HR.',
            putOnHold: true
        });
        showToast('Request put on hold.');
        closeModal();
        await refreshApplicationState('hold-request');
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to put request on hold.', 'error');
    } finally {
        if (holdButton) holdButton.disabled = false;
    }
}

async function rejectCurrentPass() {
    const pass = findGatePassRecord();
    if (!pass) return;

    const composer = document.getElementById('decisionReasonComposer');
    // First click: reveal the inline composer; rejection reason is required.
    if (composer && composer.classList.contains('hidden')) {
        showDecisionReasonComposer('Reason for rejection', { required: true });
        return;
    }
    const reason = readDecisionReason();
    if (!reason) return; // null (empty+required) or blank -> inline error already shown

    if (!isDatabaseSession()) {
        pass.status = 'Rejected';
        showToast('Form request rejected.', 'error');
        closeModal();
        refreshDashboards();
        return;
    }

    try {
        await ApiClient.post(`/approvals/${pass.dbId}/reject`, {
            signatureFileId: null,
            comment: reason
        });
        showToast('Form request rejected.', 'error');
        closeModal();
        await refreshApplicationState('reject-request');
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to reject document.', 'error');
    }
}

async function cancelCurrentPass() {
    const pass = findGatePassRecord();
    if (!pass) return;

    const area = document.getElementById('cancelGatePassArea');
    // First click: expand the cancel area and wait for the user to type a reason.
    if (area && area.classList.contains('hidden')) {
        area.classList.remove('hidden');
        area.classList.add('flex');
        document.getElementById('cancelGatePassRemarks')?.focus();
        return;
    }

    const remarksInput = document.getElementById('cancelGatePassRemarks');
    const resultBox = document.getElementById('decisionRemarksResult');
    const remarks = (remarksInput?.value || '').trim();
    if (!remarks) {
        showToast('A cancellation remark is required.', 'error');
        remarksInput?.focus();
        return;
    }

    if (!window.confirm('Cancel this gate pass? This action cannot be undone.')) {
        return;
    }

    const cancelButton = document.getElementById('cancelGatePassButton');
    if (cancelButton) cancelButton.disabled = true;
    try {
        await ApiClient.post(`/approvals/${pass.dbId}/cancel`, {
            remarks
        });
        if (resultBox) {
            resultBox.className =
                'text-xs rounded-lg border p-3 border-rose-200 bg-rose-50 text-rose-800';
            resultBox.innerHTML =
                `<i class="fas fa-ban mr-1"></i> Gate pass cancelled. Remarks: <strong>${escapeDocumentText(remarks)}</strong>`;
            resultBox.classList.remove('hidden');
        }
        showToast('Gate pass cancelled.', 'error');
        closeModal();
        await refreshApplicationState('cancel-request');
    } catch (error) {
        showToast(error instanceof ApiError ? error.message : 'Unable to cancel gate pass.', 'error');
    } finally {
        if (cancelButton) cancelButton.disabled = false;
    }
}

function approveCurrentMockPass() {
    const pass = findGatePassRecord();
    if (!pass) return;

    const sigWidth = document.getElementById('sigSize').value;
    const sigY = document.getElementById('sigY').value;
    const saveCheck = document.getElementById('saveDefaultSig');

    const sigObj = {
        name: currentUser.name,
        img: currentUploadedSig,
        w: sigWidth,
        y: sigY
    };

    if (saveCheck?.checked && currentUploadedSig) {
        saveApprovalSignaturePreference(
            { img: currentUploadedSig, w: sigWidth, y: sigY },
            currentUser,
            pass.formTypeCode
        );
    } else {
        clearSavedApprovalSignature(currentUser, pass.formTypeCode);
    }

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

    showToast('Form request approved.');
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
            databaseApprovalQueue = [];
            updateApprovalQueueDisplay([]);
            return;
        }

        try {
            databaseApprovalQueue = await ApiClient.get('/approvals/queue');
            const queuePasses = databaseApprovalQueue.map(item => ({
                id: item.gatePassNo,
                gatePassNo: item.gatePassNo,
                dbId: item.gatePassId,
                controlNo: item.controlNo || item.gatePassNo,
                formTypeCode: item.formTypeCode || 'PERSON_GATE_PASS',
                formName: item.formName || 'Person Gate Pass',
                userName: item.fullName,
                userDept: item.departmentName,
                destination: item.destination,
                purpose: item.purpose,
                authorizedEmployeeName: item.authorizedEmployeeName || null,
                authorizedDepartmentName: item.authorizedDepartmentName || null,
                materialRemarks: item.materialRemarks || '',
                materialItems: [],
                expectedOut: formatDateTime(item.expectedOutAt, false),
                expectedIn: item.expectedInAt ? formatDateTime(item.expectedInAt, false) : 'N/A',
                status: gatePassStatusLabels[`PENDING_${item.approvalStepCode}`],
                vehicle: null,
                signatures: { imm: null, pres: null, pas: null },
                willReturn: Boolean(item.expectedInAt)
            }));
            updateApprovalQueueDisplay(queuePasses);
        } catch (error) {
            databaseApprovalQueue = [];
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
                <div class="mb-2 flex items-start justify-between gap-2"><div><span class="text-[9px] font-bold uppercase tracking-wide ${pass.formTypeCode === 'MATERIAL_GATE_PASS' ? 'text-amber-600' : 'text-mpiBlue'}">${materialEscape(pass.formName || 'Form Request')}</span><h3 class="font-bold text-sm">${materialEscape(pass.userName)}</h3></div><span class="whitespace-nowrap rounded bg-yellow-100 px-1 text-[9px]">${materialEscape(pass.status)}</span></div>
                <p class="mb-1 font-mono text-[10px] font-bold text-gray-500">Control: ${materialEscape(pass.controlNo || pass.id)}</p>
                <p class="text-xs text-gray-500 mb-1">${pass.formTypeCode === 'MATERIAL_GATE_PASS' ? `For: ${materialEscape(pass.authorizedEmployeeName || 'N/A')}` : `Destination: ${materialEscape(pass.destination)}`}</p>
                <p class="text-xs text-gray-500">Department: ${materialEscape(pass.formTypeCode === 'MATERIAL_GATE_PASS' ? (pass.authorizedDepartmentName || pass.userDept || 'N/A') : (pass.userDept || 'N/A'))}</p>
            </div>
            <button onclick="${getViewPassCall(pass, true)}" class="w-full bg-blue-50 text-mpiBlue text-xs font-bold py-2 rounded hover:bg-mpiBlue hover:text-white transition">Review Document</button>
        </div>
    `).join('') || '<div class="col-span-2 text-center py-10 text-gray-400">No pending approvals.</div>';
}

window.approveCurrentPass = approveCurrentPass;
window.rejectCurrentPass = rejectCurrentPass;
window.holdCurrentPass = holdCurrentPass;
window.cancelCurrentPass = cancelCurrentPass;
window.renderApprovalQueue = renderApprovalQueue;
window.uploadCurrentSignature = uploadCurrentSignature;
