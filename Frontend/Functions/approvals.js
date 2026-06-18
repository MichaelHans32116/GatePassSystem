// Approval queue and approval actions.

function approveCurrentPass() {
            if(currentUser.role === 'System Admin') return;
            const p = gatePasses.find(x => x.id === currentViewedPassId);

            const sigWidth = document.getElementById('sigSize').value;
            const sigY = document.getElementById('sigY').value;
            const saveCheck = document.getElementById('saveDefaultSig');

            // Save settings as default if checked
            if (saveCheck && saveCheck.checked) {
                currentUser.savedSignature = {
                    img: currentUploadedSig,
                    w: sigWidth,
                    y: sigY
                };
            } else {
                currentUser.savedSignature = null;
            }

            const sigObj = {
                name: currentUser.name,
                img: currentUploadedSig,
                w: sigWidth,
                y: sigY
            };

            if (p.status === 'Pending Superior') { p.signatures.imm = sigObj; p.status = p.requiresPresidentApproval ? 'Pending President' : 'Pending PAS'; }
            else if (p.status === 'Pending President') { p.signatures.pres = sigObj; p.status = 'Pending PAS'; }
            else if (p.status === 'Pending PAS') { p.signatures.pas = sigObj; p.status = 'Approved'; }

            showToast("Document Approved!"); closeModal(); refreshDashboards();
        }

function renderApprovalQueue() {
    let toApprove = [];
    if (currentUser.role === 'Immediate Superior') {
        toApprove = toApprove.concat(
            gatePasses.filter((pass) =>
                pass.status === 'Pending Superior' && pass.userDept === currentUser.dept
            )
        );
    }
    if (currentUser.role === 'President') {
        toApprove = toApprove.concat(
            gatePasses.filter((pass) => pass.status === 'Pending President')
        );
    }
    if (currentUser.canNoteGatePass) {
        toApprove = toApprove.concat(
            gatePasses.filter((pass) => pass.status === 'Pending PAS')
        );
    }

    const badge = document.getElementById('navApprovalBadge');
    if (toApprove.length > 0) {
        badge.innerText = toApprove.length;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    document.getElementById('approvalList').innerHTML = toApprove.map((pass) => `
        <div class="bg-white border p-4 rounded shadow-sm flex flex-col justify-between">
            <div class="mb-3">
                <div class="flex justify-between"><h3 class="font-bold text-sm">${pass.userName}</h3><span class="text-[9px] bg-yellow-100 px-1 rounded">${pass.status}</span></div>
                <p class="text-xs text-gray-500 mb-1">Dest: ${pass.destination}</p>
                <p class="text-xs text-gray-500">Vehicle: ${pass.vehicle ? pass.vehicle.name : 'N/A'}</p>
            </div>
            <button onclick="viewPass('${pass.id}', true)" class="w-full bg-blue-50 text-mpiBlue text-xs font-bold py-2 rounded hover:bg-mpiBlue hover:text-white transition">Review Document</button>
        </div>
    `).join('') || '<div class="col-span-2 text-center py-10 text-gray-400">No pending approvals.</div>';
}

window.approveCurrentPass = approveCurrentPass;
window.renderApprovalQueue = renderApprovalQueue;
