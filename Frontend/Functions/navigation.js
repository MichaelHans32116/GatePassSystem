// Sidebar, role navigation, and section switching.

function toggleSidebar() {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebarOverlay');
            sidebar.classList.toggle('-translate-x-full');
            overlay.classList.toggle('hidden');
        }

function setupRoleAccess(user) {
            // Reset visibility
            document.getElementById('navItemApply').style.display = 'flex';
            const allowedCalendarUserIds = ['GA125', 'GA120', 'GA150', 'GA133', 'GA139', 'GA409', 'GA407', 'GA136'];
            const hasCalendarAccess = allowedCalendarUserIds.includes(user.id) || 
                                     user.role === 'System Admin' || 
                                     user.role === 'President' || 
                                     user.role === 'Security' || 
                                     user.role === 'PAS' || 
                                     user.role === 'HRAD' ||
                                     user.canNoteGatePass ||
                                     (user.roles && user.roles.includes('TRUCK_SCHEDULE_MANAGER'));
            if (hasCalendarAccess) {
                document.getElementById('navItemSchedule').style.display = 'flex';
            } else {
                document.getElementById('navItemSchedule').style.display = 'none';
            }
            document.getElementById('navGroupApprovals').style.display = 'block';
            document.getElementById('navGroupSecurity').style.display = 'none';
            document.getElementById('navGroupAdmin').style.display = 'block';
            document.getElementById('navGroupHRAD').style.display = 'none';
            document.getElementById('navItemDashboard').style.display = 'flex';

            const guestLogin = document.getElementById('navItemGuestLogin');
            if (guestLogin) guestLogin.style.display = 'none';
            const logoutBtn = document.getElementById('logoutButton');
            if (logoutBtn) logoutBtn.style.display = 'block';

            // Un-hide all admin tabs by default
            document.getElementById('tab-users').style.display = 'inline-block';
            document.getElementById('tab-fleet').style.display = 'inline-block';
            document.getElementById('tab-depts').style.display = 'inline-block';

            if (user.role === 'Security') {
                document.getElementById('navGroupSecurity').style.display = 'block';
                document.getElementById('navItemDashboard').style.display = 'flex';
                document.getElementById('navItemApply').style.display = 'none';
                document.getElementById('navGroupApprovals').style.display = 'none';
                document.getElementById('navGroupAdmin').style.display = 'none';
                switchSection('dashBoard');
            }
            else if (user.role === 'System Admin') {
                document.getElementById('navGroupApprovals').style.display = 'none';
                document.getElementById('navGroupSecurity').style.display = 'none';
                document.getElementById('navAdminLabel').innerText = "System Configuration";
                document.getElementById('filterDeptContainer').style.display = 'block';
                // IT / System Admin should land on the Dashboard by default, not System Logs.
                switchSection('dashBoard');
            }
            else if (user.role === 'President') {
                document.getElementById('navItemApply').style.display = 'none'; // No form for president
                document.getElementById('navGroupSecurity').style.display = 'none';
                document.getElementById('navAdminLabel').innerText = "Department Logs";
                document.getElementById('tab-users').style.display = 'none';
                document.getElementById('tab-fleet').style.display = 'none';
                document.getElementById('tab-depts').style.display = 'none';
                document.getElementById('filterDeptContainer').style.display = 'none';
                switchSection('dashBoard');
            }
            else {
                // Associates / Immediate Superiors / HR
                document.getElementById('navGroupSecurity').style.display = 'none';

                if (user.role === 'Associate' || user.role === 'Driver') {
                    document.getElementById('navGroupApprovals').style.display = 'none';
                    document.getElementById('navGroupAdmin').style.display = 'none';
                } else {
                    document.getElementById('navGroupAdmin').style.display = 'block';
                    document.getElementById('navAdminLabel').innerText = "Department Logs";
                    document.getElementById('tab-users').style.display = 'none';
                    document.getElementById('tab-fleet').style.display = 'none';
                    document.getElementById('tab-depts').style.display = 'none';
                    document.getElementById('filterDeptContainer').style.display = 'none';

                    if(user.canNoteGatePass) {
                        document.getElementById('navGroupHRAD').style.display = 'block';
                        document.getElementById('tab-fleet').style.display = 'inline-block';
                    }
                }
                switchSection('dashBoard');
            }
        }

async function switchSection(targetId) {
            const sectionTargetId = targetId === 'fleetManagement'
                ? 'adminPanel'
                : targetId;
            if (sectionTargetId !== 'guardScan') stopQrCamera?.();
            document.querySelectorAll('.nav-item').forEach(link => link.classList.remove('active'));
            const targetLink = document.querySelector(`.nav-item[data-target="${targetId}"]`);
            if(targetLink) targetLink.classList.add('active');

            // auto close sidebar on mobile after clicking
            if(window.innerWidth < 768 && !document.getElementById('sidebar').classList.contains('-translate-x-full')) {
                toggleSidebar();
            }

            const titles = {
                'dashBoard':'Overview Dashboard', 'applyPass':'New Form Request',
                'approvals':'Workflow Approvals', 'guardScan':'Security QR Scanner',
                'fleetManagement': 'Vehicles & Drivers',
                'scheduleCalendar': 'Vehicle Schedule Calendar',
                'adminPanel': currentUser && currentUser.role === 'System Admin' ? 'System Configuration' : 'Department Logs'
            };
            document.getElementById('pageTitle').innerText = titles[targetId] || 'System';

            document.querySelectorAll('.view-section').forEach(sec => sec.classList.add('hidden'));
            const targetSec = document.getElementById('sec-' + sectionTargetId);
            if(targetSec) {
                targetSec.classList.remove('hidden');
                targetSec.classList.remove('fade-in'); void targetSec.offsetWidth; targetSec.classList.add('fade-in');
            }

            if(sectionTargetId === 'applyPass') {
                selectRequestFormType('PERSON_GATE_PASS');
            }
            await refreshApplicationState('switch-section');
            if(sectionTargetId === 'guardScan') initializeQrCameras();
            if(sectionTargetId === 'adminPanel') {
                if(targetId === 'fleetManagement') {
                    switchAdminTab('fleet');
                } else {
                    switchAdminTab('logs');
                    renderAdminLogs(1);
                }
            }
            if(sectionTargetId === 'scheduleCalendar') initializeScheduleCalendar();
        }


function setNavigationForAdminTab(tabId) {
            const navTarget = tabId === 'fleet' ? 'fleetManagement' : 'adminPanel';
            document.querySelectorAll('.nav-item').forEach(link => link.classList.remove('active'));
            document.querySelector(`.nav-item[data-target="${navTarget}"]`)?.classList.add('active');

            const title = tabId === 'fleet'
                ? 'Vehicles & Drivers'
                : (currentUser && currentUser.role === 'System Admin' ? 'System Configuration' : 'Department Logs');
            const titleEl = document.getElementById('pageTitle');
            if (titleEl) titleEl.innerText = title;
        }


window.toggleSidebar = toggleSidebar;
window.setupRoleAccess = setupRoleAccess;
window.switchSection = switchSection;
window.setNavigationForAdminTab = setNavigationForAdminTab;
