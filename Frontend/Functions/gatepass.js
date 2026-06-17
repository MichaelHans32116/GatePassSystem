// Gate pass form and request status logic.

function setNowTime(inputId) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            document.getElementById(inputId).value = timeStr;
        }

function handleVehicleChange(sel) {
            if(sel.value === 'others') {
                document.getElementById('gpDriver').value = '';
                document.getElementById('manualVehicleFields').classList.remove('hidden');
                document.getElementById('gpManualVehicle').required = true;
                document.getElementById('gpManualDriver').required = true;
            } else {
                document.getElementById('manualVehicleFields').classList.add('hidden');
                document.getElementById('gpManualVehicle').required = false;
                document.getElementById('gpManualDriver').required = false;
                const s = mockVehicles.find(v => v.id === sel.value);
                document.getElementById('gpDriver').value = s ? s.driver : '';
            }
        }

function toggleExpectedIn(show) {
            document.getElementById('gpExpectedIn').required = show;
            document.getElementById('gpExpectedIn').disabled = !show;
            if(!show) document.getElementById('gpExpectedIn').value = '';
        }

function requiresSuperiorApproval(user) {
            // Associates need their immediate superior first.
            // Immediate Superiors do NOT approve their own request.
            return user.role === 'Associate';
        }

function requiresPresidentApproval(user, hasCompanyVehicle) {
            // If an Immediate Superior applies, approval must go to the President/VP.
            // Company vehicle usage also requires President/VP approval.
            return user.role === 'Immediate Superior' || hasCompanyVehicle === true;
        }

function getInitialRequestStatus(user, hasCompanyVehicle) {
            if (requiresSuperiorApproval(user)) return 'Pending Superior';
            if (requiresPresidentApproval(user, hasCompanyVehicle)) return 'Pending President';
            return 'Pending PAS';
        }

function updateApprovalRoutePreview() {
            const isVehicleNeeded = document.getElementById('gpNeedVehicle').checked;
            const routeText = document.getElementById('routeApprovalText');
            if (!routeText || !currentUser) return;

            const steps = [];
            if (requiresSuperiorApproval(currentUser)) steps.push('Immediate Superior');
            if (requiresPresidentApproval(currentUser, isVehicleNeeded)) steps.push('President / VP');
            steps.push('PAS / HR');

            routeText.innerText = steps.join(' → ');
        }

function toggleVehicleFields() {
            const isNeeded = document.getElementById('gpNeedVehicle').checked;
            document.getElementById('vehicleFields').style.display = isNeeded ? 'flex' : 'none';
            document.getElementById('gpVehicle').required = isNeeded;
            if(!isNeeded) {
                document.getElementById('gpVehicle').value = '';
                handleVehicleChange(document.getElementById('gpVehicle'));
            }
            updateApprovalRoutePreview();
        }

function submitGatePass(e) {
            e.preventDefault();
            const isV = document.getElementById('gpNeedVehicle').checked;
            const willReturnBool = document.querySelector('input[name="gpWillReturn"]:checked').value === 'yes';

            const selectedV = document.getElementById('gpVehicle').value;
            let customVehicleInfo = null;

            if (isV && selectedV === 'others') {
                customVehicleInfo = {
                    id: 'MANUAL',
                    name: document.getElementById('gpManualVehicle').value,
                    plate: 'N/A', // handled inside name
                    driver: document.getElementById('gpManualDriver').value,
                    status: 'In Use'
                };
            } else if (isV) {
                customVehicleInfo = mockVehicles.find(v => v.id === selectedV);
            }

            const newPass = {
                id: 'GP-' + Math.floor(100000 + Math.random() * 900000),
                userId: currentUser.id, userName: currentUser.name, userDept: currentUser.dept,
                dateFiled: new Date().toLocaleDateString(),
                destination: document.getElementById('gpDestination').value,
                expectedOut: document.getElementById('gpExpectedOut').value,
                expectedIn: document.getElementById('gpExpectedIn').value || 'N/A',
                purpose: document.getElementById('gpPurpose').value,
                vehicle: customVehicleInfo,
                status: getInitialRequestStatus(currentUser, isV),
                requiresSuperiorApproval: requiresSuperiorApproval(currentUser),
                requiresPresidentApproval: requiresPresidentApproval(currentUser, isV),
                signatures: { imm: null, pres: null, pas: null },
                scanCount: 0, actualOut: null, actualIn: null,
                willReturn: willReturnBool
            };
            gatePasses.push(newPass); e.target.reset(); toggleVehicleFields();
            showToast("Request Submitted!"); switchSection('dashBoard');
        }

function initializeGatePassForm() {
    const vehicleSelect = document.getElementById('gpVehicle');
    if (!vehicleSelect) return;

    vehicleSelect.innerHTML =
        '<option value="">-- Select --</option>' +
        mockVehicles.map((vehicle) =>
            `<option value="${vehicle.id}">${vehicle.name} (${vehicle.plate})</option>`
        ).join('') +
        '<option value="others" class="font-bold text-mpiBlue">Others (Manual Entry)</option>';
}

function renderStandardDashboard() {
    renderFleetStatusWidget();

    document.getElementById('btnNewRequest').style.display =
        currentUser.role === 'President' ? 'none' : 'block';

    const myPasses = gatePasses.filter((pass) => pass.userId === currentUser.id);
    document.getElementById('cntPending').innerText =
        myPasses.filter((pass) => pass.status.includes('Pending')).length;
    document.getElementById('cntApproved').innerText =
        myPasses.filter((pass) => pass.status === 'Approved').length;
    document.getElementById('cntCompleted').innerText =
        myPasses.filter((pass) => pass.status === 'Returned' || pass.status === 'Closed').length;

    document.getElementById('myPassesTableBody').innerHTML = myPasses
        .slice()
        .reverse()
        .map((pass) => `
            <tr class="hover:bg-gray-50 transition border-b cursor-pointer" onclick="viewPass('${pass.id}')">
                <td class="px-4 md:px-5 py-3 font-mono text-mpiBlue text-xs font-bold">${pass.id}</td>
                <td class="px-4 md:px-5 py-3">${pass.dateFiled}</td>
                <td class="px-4 md:px-5 py-3 truncate max-w-[150px] md:max-w-[200px]">${pass.destination}</td>
                <td class="px-4 md:px-5 py-3"><span class="px-2 py-1 rounded text-[10px] font-bold ${['Approved'].includes(pass.status) ? 'bg-green-100 text-green-800' : (['Returned', 'Closed'].includes(pass.status) ? 'bg-gray-200 text-gray-700' : (pass.status === 'Outside' ? 'bg-blue-100 text-blue-800' : 'bg-yellow-100 text-yellow-800'))}">${pass.status}</span></td>
                <td class="px-4 md:px-5 py-3 text-right"><button class="text-mpiBlue hover:underline text-xs"><i class="fas fa-eye"></i></button></td>
            </tr>
        `)
        .join('') || '<tr><td colspan="5" class="px-5 py-8 text-center text-gray-400">No records found.</td></tr>';
}

window.setNowTime = setNowTime;
window.handleVehicleChange = handleVehicleChange;
window.toggleExpectedIn = toggleExpectedIn;
window.requiresSuperiorApproval = requiresSuperiorApproval;
window.requiresPresidentApproval = requiresPresidentApproval;
window.getInitialRequestStatus = getInitialRequestStatus;
window.updateApprovalRoutePreview = updateApprovalRoutePreview;
window.toggleVehicleFields = toggleVehicleFields;
window.submitGatePass = submitGatePass;
window.initializeGatePassForm = initializeGatePassForm;
window.renderStandardDashboard = renderStandardDashboard;
