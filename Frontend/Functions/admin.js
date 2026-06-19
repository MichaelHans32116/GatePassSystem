// Admin logs, users, departments, vehicles, and pagination.

async function renderAdminLogs(page = 1) {
            currentLogPage = page;
            const searchVal = document.getElementById('logFilterName').value.toLowerCase();
            const rawDateVal = document.getElementById('logFilterDate').value;
            const deptVal = document.getElementById('logFilterDept').value;

            let formattedDate = "";
            if (rawDateVal) formattedDate = new Date(rawDateVal).toLocaleDateString();

            if (isDatabaseSession()) {
                try {
                    const response = await loadAllGatePasses(page, logsPerPage, searchVal);
                    renderDatabaseAdminLogs(response);
                } catch (error) {
                    document.getElementById('adminLogsTable').innerHTML =
                        '<tr><td colspan="7" class="text-center py-6 text-gray-400">Records are unavailable for this account.</td></tr>';
                    if (error.status !== 403) {
                        showToast(error instanceof ApiError ? error.message : 'Unable to load gate pass logs.', 'error');
                    }
                }
                return;
            }

            let filteredList = gatePasses.slice().reverse().filter(p => {
                const matchesSearch = p.userName.toLowerCase().includes(searchVal) || p.id.toLowerCase().includes(searchVal);
                const matchesDate = formattedDate === "" || p.dateFiled === formattedDate;
                let matchesDept = true;
                if (currentUser.role === 'System Admin') matchesDept = deptVal === "" || p.userDept === deptVal;
                else matchesDept = p.userDept === currentUser.dept;
                return matchesSearch && matchesDate && matchesDept;
            });

            const totalItems = filteredList.length;
            const totalPages = Math.ceil(totalItems / logsPerPage) || 1;
            if (currentLogPage < 1) currentLogPage = 1;
            if (currentLogPage > totalPages) currentLogPage = totalPages;

            const startIndex = (currentLogPage - 1) * logsPerPage;
            const paginatedList = filteredList.slice(startIndex, startIndex + logsPerPage);

            document.getElementById('adminLogsTable').innerHTML = paginatedList.map(p => `
                <tr class="hover:bg-gray-50 transition border-b cursor-pointer" onclick="viewPass('${p.id}')">
                    <td class="px-5 py-2 font-mono text-xs">${p.id}</td>
                    <td class="px-5 py-2 font-semibold">${p.userName}</td>
                    <td class="px-5 py-2 text-gray-500 text-xs">${p.userDept}</td>
                    <td class="px-5 py-2 text-xs font-bold ${p.willReturn ? 'text-gray-400' : 'text-red-500'}">${p.willReturn ? 'Yes' : 'No'}</td>
                    <td class="px-5 py-2 text-blue-600 font-mono text-xs">${p.actualOut || '--:--'}</td>
                    <td class="px-5 py-2 text-green-600 font-mono text-xs">${p.actualIn || '--:--'}</td>
                    <td class="px-5 py-2 text-[10px]"><span class="px-2 py-1 rounded bg-gray-100">${p.status}</span></td>
                </tr>
            `).join('') || '<tr><td colspan="7" class="text-center py-6 text-gray-400">No logs match your filter.</td></tr>';

            const endItem = Math.min(startIndex + logsPerPage, totalItems);
            document.getElementById('logPaginationInfo').innerText = totalItems > 0 ? `Showing ${startIndex + 1} to ${endItem} of ${totalItems} entries` : 'Showing 0 entries';
            document.getElementById('logPageIndicator').innerText = currentLogPage;
            document.getElementById('btnPrevPage').disabled = currentLogPage === 1;
            document.getElementById('btnNextPage').disabled = currentLogPage === totalPages;
        }

function renderDatabaseAdminLogs(response) {
    const list = response.items.map(mapApiGatePass);
    document.getElementById('adminLogsTable').innerHTML = list.map(p => `
        <tr class="hover:bg-gray-50 transition border-b cursor-pointer" onclick="viewPass('${p.id}')">
            <td class="px-5 py-2 font-mono text-xs">${p.id}</td>
            <td class="px-5 py-2 font-semibold">${p.userName}</td>
            <td class="px-5 py-2 text-gray-500 text-xs">${p.userDept}</td>
            <td class="px-5 py-2 text-xs font-bold ${p.willReturn ? 'text-gray-400' : 'text-red-500'}">${p.willReturn ? 'No' : 'Yes'}</td>
            <td class="px-5 py-2 text-blue-600 font-mono text-xs">${p.actualOut || '--:--'}</td>
            <td class="px-5 py-2 text-green-600 font-mono text-xs">${p.actualIn || '--:--'}</td>
            <td class="px-5 py-2 text-[10px]"><span class="px-2 py-1 rounded bg-gray-100">${p.status}</span></td>
        </tr>
    `).join('') || '<tr><td colspan="7" class="text-center py-6 text-gray-400">No logs match your filter.</td></tr>';

    const start = response.totalCount ? ((response.page - 1) * response.pageSize) + 1 : 0;
    const end = Math.min(response.page * response.pageSize, response.totalCount);
    document.getElementById('logPaginationInfo').innerText =
        `Showing ${start} to ${end} of ${response.totalCount} entries`;
    document.getElementById('logPageIndicator').innerText = response.page;
    document.getElementById('btnPrevPage').disabled = response.page <= 1;
    document.getElementById('btnNextPage').disabled = response.page >= response.totalPages;
}

function changeLogPage(step) { renderAdminLogs(currentLogPage + step); }

function switchAdminTab(tabId) {
            document.querySelectorAll('.admin-tab').forEach(b => { b.classList.remove('text-mpiBlue', 'border-b-2', 'border-mpiBlue'); b.classList.add('text-gray-500'); });
            const btn = document.getElementById('tab-' + tabId);
            if(btn) btn.classList.add('text-mpiBlue', 'border-b-2', 'border-mpiBlue');
            document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById('admin-' + tabId).classList.remove('hidden');
        }

function renderAdminTables() {
            document.getElementById('adminUsersList').innerHTML = mockUsers.map(u => `
                <tr class="border-b"><td class="p-3 text-xs font-mono">${u.id}</td><td class="p-3 font-semibold text-sm">${u.name}</td><td class="p-3 text-xs">${u.role}</td><td class="p-3 text-xs">${u.dept}</td><td class="p-3 text-right"><button class="text-blue-500 hover:text-blue-700 text-xs mr-3 border border-blue-200 px-2 py-1 rounded"><i class="fas fa-edit"></i> Edit</button> <button class="text-red-500 hover:text-red-700 text-xs border border-red-200 px-2 py-1 rounded"><i class="fas fa-archive"></i> Archive</button></td></tr>
            `).join('');
            const vehicles = isDatabaseSession() ? databaseVehicles : mockVehicles;
            document.getElementById('adminFleetList').innerHTML = vehicles.map(v => `
                <tr class="border-b"><td class="p-3 font-semibold text-sm">${v.name}</td><td class="p-3 text-xs font-mono">${v.plate}</td><td class="p-3 text-xs text-gray-600">${v.driver}</td><td class="p-3 text-xs">${v.status}</td><td class="p-3 text-right"><button class="text-blue-500 hover:text-blue-700 text-xs mr-3 border border-blue-200 px-2 py-1 rounded"><i class="fas fa-edit"></i> Edit</button> <button class="text-red-500 hover:text-red-700 text-xs border border-red-200 px-2 py-1 rounded"><i class="fas fa-trash"></i></button></td></tr>
            `).join('');
        }

function renderFleetStatusWidget() {
    const fleetWidget = document.getElementById('hrFleetWidget');
    if (!fleetWidget) return;

    if (!currentUser.canNoteGatePass) {
        fleetWidget.classList.add('hidden');
        return;
    }

    fleetWidget.classList.remove('hidden');
    const vehicles = isDatabaseSession() ? databaseVehicles : mockVehicles;
    document.getElementById('fleetGridContainer').innerHTML = vehicles.map((vehicle) => `
        <div class="border rounded p-3 text-sm flex justify-between items-center ${vehicle.status === 'Available' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}">
            <div><p class="font-bold text-gray-800">${vehicle.name}</p><p class="text-[10px] text-gray-500">${vehicle.driver}</p></div>
            <span class="text-[10px] font-bold px-2 py-1 rounded ${vehicle.status === 'Available' ? 'bg-green-200 text-green-800' : 'bg-red-200 text-red-800'}">${vehicle.status}</span>
        </div>
    `).join('');
}

window.renderAdminLogs = renderAdminLogs;
window.changeLogPage = changeLogPage;
window.switchAdminTab = switchAdminTab;
window.renderAdminTables = renderAdminTables;
window.renderFleetStatusWidget = renderFleetStatusWidget;
