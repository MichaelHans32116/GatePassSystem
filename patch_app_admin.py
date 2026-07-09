import os

# app.js
with open('Frontend/Functions/app.js', 'r', encoding='utf-8') as f:
    app_js = f.read()

if 'GLOBAL_PAGE_SIZE' not in app_js:
    app_js = app_js.replace('// Core logic, DOM events, UI flow, caching, form submission.', '// Core logic, DOM events, UI flow, caching, form submission.\n\nwindow.GLOBAL_PAGE_SIZE = 10;')
    with open('Frontend/Functions/app.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write(app_js)

# admin.js
with open('Frontend/Functions/admin.js', 'r', encoding='utf-8') as f:
    admin_js = f.read()

if 'adminLogsPage' not in admin_js:
    admin_js = "let adminLogsPage = 1;\nwindow.changeAdminLogsPage = function(page) { adminLogsPage = page; renderAdminDashboard(); };\nlet adminUsersPage = 1;\nwindow.changeAdminUsersPage = function(page) { adminUsersPage = page; renderAdminDashboard(); };\nlet adminFleetPage = 1;\nwindow.changeAdminFleetPage = function(page) { adminFleetPage = page; renderAdminMasterLists(); };\nlet adminDriverPage = 1;\nwindow.changeAdminDriverPage = function(page) { adminDriverPage = page; renderAdminMasterLists(); };\n" + admin_js
    
    admin_js = admin_js.replace("document.getElementById('adminLogsTable').innerHTML = list.map(pass => `", "const startIndexLogs = (adminLogsPage - 1) * window.GLOBAL_PAGE_SIZE;\n    const paginatedLogs = list.slice(startIndexLogs, startIndexLogs + window.GLOBAL_PAGE_SIZE);\n\n    document.getElementById('adminLogsTable').innerHTML = paginatedLogs.map(pass => `")
    admin_js = admin_js.replace("    }).join('') || '<tr><td colspan=\"6\" class=\"px-6 py-4 text-center text-sm text-gray-500\">No gate passes found for this period.</td></tr>';", "    }).join('') || '<tr><td colspan=\"6\" class=\"px-6 py-4 text-center text-sm text-gray-500\">No gate passes found for this period.</td></tr>';\n    if (window.renderPaginationControls) window.renderPaginationControls(list.length, adminLogsPage, window.GLOBAL_PAGE_SIZE, 'adminLogsPagination', 'changeAdminLogsPage');")

    admin_js = admin_js.replace("document.getElementById('adminUsersList').innerHTML = users.map(u => `", "const startIndexUsers = (adminUsersPage - 1) * window.GLOBAL_PAGE_SIZE;\n    const paginatedUsers = users.slice(startIndexUsers, startIndexUsers + window.GLOBAL_PAGE_SIZE);\n\n    document.getElementById('adminUsersList').innerHTML = paginatedUsers.map(u => `")
    admin_js = admin_js.replace("    }).join('');\n}", "    }).join('');\n    if (window.renderPaginationControls) window.renderPaginationControls(users.length, adminUsersPage, window.GLOBAL_PAGE_SIZE, 'adminUsersPagination', 'changeAdminUsersPage');\n}")

    admin_js = admin_js.replace("document.getElementById('adminFleetList').innerHTML = fleet.map(v => `", "const startIndexFleet = (adminFleetPage - 1) * window.GLOBAL_PAGE_SIZE;\n    const paginatedFleet = fleet.slice(startIndexFleet, startIndexFleet + window.GLOBAL_PAGE_SIZE);\n\n    document.getElementById('adminFleetList').innerHTML = paginatedFleet.map(v => `")
    admin_js = admin_js.replace("        </tr>\n    `).join('');\n    document.getElementById('adminDriverList').innerHTML = drivers.map(d => `", "        </tr>\n    `).join('');\n    if (window.renderPaginationControls) window.renderPaginationControls(fleet.length, adminFleetPage, window.GLOBAL_PAGE_SIZE, 'adminFleetPagination', 'changeAdminFleetPage');\n\n    const startIndexDriver = (adminDriverPage - 1) * window.GLOBAL_PAGE_SIZE;\n    const paginatedDrivers = drivers.slice(startIndexDriver, startIndexDriver + window.GLOBAL_PAGE_SIZE);\n\n    document.getElementById('adminDriverList').innerHTML = paginatedDrivers.map(d => `")
    admin_js = admin_js.replace("        </tr>\n    `).join('');\n}", "        </tr>\n    `).join('');\n    if (window.renderPaginationControls) window.renderPaginationControls(drivers.length, adminDriverPage, window.GLOBAL_PAGE_SIZE, 'adminDriverPagination', 'changeAdminDriverPage');\n}")

    with open('Frontend/Functions/admin.js', 'w', encoding='utf-8', newline='\n') as f:
        f.write(admin_js)

print("Patch applied for app and admin")
