// User Manual — role-gated, slide-based (Canva-style) guide.
// Renders into #umRoot when the "User Manual" section opens. Users first pick a
// guide (only the ones allowed by their role/permission are shown), then step
// through it one slide at a time, left-to-right — no long scrolling.

var umState = { manualId: null, index: 0 };

// ─── Role / permission helpers ───────────────────────────────────────
function umUser() {
    return (typeof currentUser !== 'undefined' && currentUser) ? currentUser : null;
}
function umHasRoleCode(codes) {
    var u = umUser(); if (!u) return false;
    var roles = u.roles || [];
    return codes.some(function (c) { return roles.indexOf(c) >= 0; });
}
function umRoleIs(labels) {
    var u = umUser(); if (!u) return false;
    return labels.indexOf(u.role) >= 0;
}
function umCanRequest() {
    return umRoleIs(['Associate', 'Driver', 'Immediate Superior']) ||
        umHasRoleCode(['ASSOCIATE', 'DRIVER', 'IMMEDIATE_SUPERIOR']);
}
function umIsApprover() {
    return umRoleIs(['Immediate Superior', 'President']) ||
        umHasRoleCode(['IMMEDIATE_SUPERIOR', 'PRESIDENT']);
}
function umIsHrad() {
    var u = umUser();
    return (u && u.canNoteGatePass === true) ||
        umRoleIs(['HRAD / HR Admin', 'HRAD Noter', 'HRAD']) ||
        umHasRoleCode(['PAS_NOTER', 'TRUCK_SCHEDULE_MANAGER']);
}
function umIsGuard() { return umRoleIs(['Security']) || umHasRoleCode(['SECURITY']); }
function umIsAdmin() { return umRoleIs(['System Admin']) || umHasRoleCode(['SYSTEM_ADMIN']); }

// ─── Content helpers ─────────────────────────────────────────────────
function umShot(label) {
    return '<div class="um-shot">Screenshot ' + label + '</div>';
}
// Real screenshot, click to enlarge. `caption` is optional small text under the image.
function umImg(slug, alt, caption) {
    var src = 'Frontend/Design/images/manual/' + slug + '.jpg';
    return '<figure class="um-figure">' +
        '<img src="' + src + '" alt="' + umEsc(alt) + '" class="um-img" onclick="umZoom(this.src, this.alt)" loading="lazy">' +
        (caption ? '<figcaption class="um-caption">' + umEsc(caption) + '</figcaption>' : '') +
        '</figure>';
}
function umZoom(src, alt) {
    var overlay = document.getElementById('umZoomOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'umZoomOverlay';
        overlay.className = 'um-zoom-overlay';
        overlay.onclick = function () { overlay.classList.remove('um-zoom-open'); };
        overlay.innerHTML = '<img class="um-zoom-img">';
        document.body.appendChild(overlay);
    }
    overlay.querySelector('img').src = src;
    overlay.querySelector('img').alt = alt || '';
    overlay.classList.add('um-zoom-open');
}
function umEsc(v) {
    return String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Manual definitions (each has an access test + ordered slides) ────
function umManuals() {
    return [
        {
            id: 'overview', title: 'System Overview', icon: 'fa-circle-info',
            desc: 'What the system is, the gate pass types, and how approval works.',
            access: function () { return true; },
            slides: [
                { t: 'Welcome to the FormRequest System', h:
                    '<p>An internal web app that digitizes the entire <b>gate pass</b> process: request, approval, printing, and monitoring entry/exit at the gate.</p>' +
                    '<ul class="list-disc ml-5 mt-2 space-y-1"><li>Digital approvals with <b>e-signatures</b>.</li><li>A <b>QR code</b> on every approved pass for one-scan Time Out / Time In.</li><li>A <b>calendar</b> for vehicle and driver schedules.</li><li>A full <b>audit trail</b>.</li></ul>' },
                { t: 'Gate Pass Types', h:
                    '<div class="grid sm:grid-cols-2 gap-3"><div class="border border-gray-200 rounded p-3"><b>Person Gate Pass</b><p class="text-xs text-gray-500 mt-1">For personnel leaving the premises. QR Time Out / Time In. May include a company vehicle.</p></div><div class="border border-gray-200 rounded p-3"><b>Material Gate Pass</b><p class="text-xs text-gray-500 mt-1">For releasing items, with an itemized release list.</p></div></div>' +
                    '<p class="text-xs text-gray-500 mt-3"><b>Trip type</b> (company vehicle): <i>Hatid at Sundo</i> (round trip), <i>Hatid lang</i> (drop-off), or <i>Sundo lang</i> (pick-up). The requester\'s choice is final and is locked at assignment.</p>' },
                { t: 'Roles', h:
                    '<ul class="space-y-1 text-sm"><li><b>Requester</b>: creates requests.</li><li><b>Immediate Superior</b>: first digital approver; skipped when the requester is an immediate superior.</li><li><b>HRAD</b>: assigns the company vehicle, driver, and schedule.</li><li><b>PAS</b>: final digital noting.</li><li><b>President</b>: final physical signature on printed company vehicle forms.</li><li><b>Security Guard</b>: scans QR; Time Out / In.</li><li><b>System Administrator</b>: users, master lists, audit logs.</li></ul>' },
                { t: 'Approval Flow', h:
                    '<ol class="list-decimal ml-5 space-y-1 text-sm"><li>The requester submits the request.</li><li>The Immediate Superior approves. This step is skipped when the requester is an immediate superior.</li><li>HRAD Assignment follows, for company vehicle requests only.</li><li>PAS Noting is the final digital step; the request then becomes APPROVED and the QR code is issued.</li><li>For a company vehicle, the President signs the printed form by hand as the final approval.</li></ol>' +
                    '<p class="text-sm mt-2">There is no digital President approval step; the President signs the printed company vehicle form physically.</p>' +
                    '<p class="text-sm mt-2"><b>Pending to Approved:</b> it stays <b>Pending</b> on the calendar until fully approved, then the "Pending" label disappears and the QR code is issued.</p>' },
                { t: 'System Architecture', h:
                    '<p class="text-sm">Three parts talk to each other:</p>' +
                    '<pre class="text-[11px] leading-snug bg-gray-50 border border-gray-200 rounded p-3 overflow-x-auto text-gray-700 mt-2">BROWSER (the UI, index.html)\nconnects over HTTPS to the API SERVER (the logic, ASP.NET Core),\nwhich uses SQL to reach the DATABASE (storage, MariaDB/XAMPP)</pre>' +
                    '<p class="text-xs text-gray-500 mt-2">The browser talks to the API; the API reads/writes the database and generates QR codes.</p>' },
                { t: 'Ready to get started', h:
                    '<p class="text-sm">Open the guide for your role from the previous screen: <b>Requester</b>, <b>Approver</b>, <b>HRAD</b>, <b>Security Guard</b>, or <b>Administrator</b>. Each contains real, step-by-step screenshots from the system.</p>' },
            ]
        },
        {
            id: 'requester', title: 'Requester Guide', icon: 'fa-user-pen',
            desc: 'How to create a request, check its status, and print the pass.',
            access: umCanRequest,
            slides: [
                { t: 'Requester Guide', h: '<p>For any employee who needs to leave the premises, use a vehicle, or release items. Follow these steps in order.</p>' },
                { t: 'Step 1: Log in', h: '<p>Log in with your <b>name</b> or <b>Employee ID</b> and your <b>password</b>. You may type your full name, a leading part of your name, or any individual part of your name; capitalization does not matter. To change your password, click the profile chip (your name and avatar) at the top right of the screen to open the Change Password dialog.</p>' + umImg('r1-login', 'Login screen') },
                { t: 'Step 2: Choose the type', h: '<p>On the dashboard, choose the gate pass type: <b>Person</b>, <b>Vehicle</b>, or <b>Material</b>. On a mobile phone, the New Form Request button appears at the top of the dashboard.</p>' + umImg('r2-dashboard', 'Dashboard with Gate Pass buttons') },
                { t: 'Step 3: Fill in the details', h: '<p>Enter the name, date, time, <b>purpose</b>, and <b>destination</b>. If a company vehicle is needed, select the <b>trip type</b>. In the Associates section, choose <b>Kasama ako</b> if you are going out too (the default), or <b>Para sa iba lang</b> if you stay inside and the pass covers only the listed associates; at least one associate is then required. Tick the <b>Employee</b> checkbox on a companion row to pick from the employee directory, or leave it unticked and type the name of an outside companion such as a visitor or an OJT. Pressing Enter on a finished row adds the next companion row.</p>' + umImg('r3-request-form', 'Request form filled in') },
                { t: 'Step 4: Submit', h: '<p>Click <b>Submit</b> and wait for approval from your superior or the person in charge.</p>' },
                { t: 'Step 5: Check the status', h: '<p>Open <b>My Requests</b> to see whether the request is <b>Pending</b>, <b>Approved</b>, or <b>Rejected</b>. You may also tap a statistic card on the dashboard to filter the request table; tapping the same card again clears the filter.</p>' + umImg('r4-my-requests', 'My Requests list') },
                { t: 'Step 6: Print', h: '<p>Once <b>Approved</b>, a <b>Print</b> button appears. Click it to produce the formal pass with the <b>QR code</b> and signatures.</p>' + umImg('r5-printable-form', 'Printable gate pass form with QR code') + '<p class="text-xs text-gray-500 mt-2">Tip: print only when Approved, and keep the QR clear for the guard to scan.</p>' },
            ]
        },
        {
            id: 'approver', title: 'Approver Guide', icon: 'fa-check-double',
            desc: 'For Immediate Superiors: reviewing, signing, and approving digitally.',
            access: umIsApprover,
            slides: [
                { t: 'Approver Guide', h: '<p>For an Immediate Superior: you decide whether to permit an employee\'s request digitally. For a company vehicle, the President signs the final printed form physically.</p>' },
                { t: 'Step 1: Open the Approval Dashboard', h: '<p>Log in and go to the <b>Approval Dashboard</b> to see pending requests. Users with approval duties also see a <b>For Your Approval</b> card on the main dashboard showing the pending approval count; tapping it opens the Approvals page.</p>' + umImg('ap1-dashboard', 'Approval dashboard with pending requests') },
                { t: 'Step 2: Click Review', h: '<p>Click <b>Review</b> beside the requester\'s name to open the request.</p>' + umImg('ap2-review-click', 'Reviewing a request in the list') },
                { t: 'Step 3: Read the details', h: '<p>Check the destination, purpose, and (if any) the schedule in the Document Review view.</p>' + umImg('ap3-review-details', 'Document review with request details') },
                { t: 'Step 4: Sign', h: '<p>Apply your <b>e-signature</b> on the digital canvas, using a mouse or a touchscreen.</p>' + umImg('ap4-signature-pad', 'Signature pad') },
                { t: 'Step 5: Approve or Reject', h: '<p>Click <b>Approve</b>. If it cannot proceed, click <b>Reject</b> and give a clear reason.</p>' + umImg('ap5-approve', 'Approve or Reject buttons') + '<p class="text-xs text-gray-500 mt-2">After you approve, it moves to the next applicable digital step (HRAD Assignment for company vehicle requests, then PAS Noting). President approval is a physical signature on the printed company vehicle form.</p>' },
            ]
        },
        {
            id: 'hrad', title: 'Vehicle Scheduling (HRAD)', icon: 'fa-calendar-alt',
            desc: 'Assign vehicles and drivers, and manage recurring schedules.',
            access: umIsHrad,
            slides: [
                { t: 'HRAD Guide', h: '<p>You control the vehicle, driver, and schedule for requests that need a company vehicle. The HRAD vehicle assigners are Joy (GA120), Roxanne Encinada (GA139), and Myla Mae Abarquez (GA412).</p>' },
                { t: 'Step 1: Open the calendar', h: '<p>Open the <b>Schedule Calendar</b> (monthly view). The <b>Request Service Schedule</b> button routes to the standard New Request form with Company Vehicle already ticked.</p>' + umImg('h1-calendar', 'Monthly calendar view') },
                { t: 'Step 2: Find pending schedules', h: '<p>Requests that need a company vehicle appear as a <b>Pending Schedule</b> on the calendar.</p>' + umImg('h2-pending-schedule', 'Pending schedule on the calendar') },
                { t: 'Step 3: Assign vehicle and driver', h: '<p>Click the request to open the assignment modal. It shows the requested schedule window, the trip type (Hatid, Sundo, or Both, with a note when the requester is not aboard), and vehicle and driver availability. Pick the <b>vehicle</b> and <b>driver</b>. The <b>trip type is locked</b> to the requester\'s choice; you may still choose <i>straight</i> or <i>split</i> scheduling for a round trip.</p>' + umImg('h3-assignment-modal', 'HRAD assignment modal with trip type locked') },
                { t: 'Step 4: Save', h: '<p>Save to update the calendar. It stays <b>Pending</b> until fully approved, then the "Pending" label disappears.</p>' + '<p class="text-xs text-gray-500 mt-2">A split schedule is stored as two separate reservation windows, so the calendar keeps the gap vacant. The system refuses the assignment when the selected vehicle or driver is already booked in any requested window, including recurring fixed runs.</p>' },
                { t: 'Fixed / recurring schedules', h: '<p>For recurring trips, click <b>Manage Fixed Schedules</b>.</p>' + umImg('h4-fixed-schedules', 'Manage Fixed Schedules modal') },
                { t: 'Adding a fixed schedule', h: '<p>Set the vehicle, driver, day of week, and time for the recurring trip.</p>' + umImg('h5-fixed-schedule-form', 'Fixed schedule form') },
                { t: 'Saved fixed schedule', h: '<p>The recurring trip now appears automatically every week; there is no need to re-enter it.</p>' + umImg('h6-fixed-schedule-saved', 'Saved fixed schedule list') + '<p class="text-xs text-gray-500 mt-2">Logistics/PPC staff see <b>trucks only</b> here.</p>' },
            ]
        },
        {
            id: 'guard', title: 'Security Guard Guide', icon: 'fa-qrcode',
            desc: 'Scan passes and record Time Out / Time In.',
            access: umIsGuard,
            slides: [
                { t: 'Security Guard Guide', h: '<p>You ensure only authorized people enter and exit.</p>' },
                { t: 'Step 1: Open the scanner', h: '<p>Log in with your security account on a tablet or computer; you land directly on the <b>QR scanner</b> page. You can open the queue dashboard through the <b>View Dashboard</b> button on the scanner page.</p>' + umImg('g1-scanner-page', 'Guard scanner page') },
                { t: 'Step 2: Scan the QR', h: '<p>Present the printed gate pass to the camera and wait for a result.</p>' + umImg('g2-scan-result-a', 'Scanning a gate pass') },
                { t: 'Step 3: Read the result', h: '<p><b>GREEN</b> means valid and Approved; <b>RED</b> means Rejected or expired. The scanned pass details appear on screen.</p>' + umImg('g3-scan-result-b', 'A scanned gate pass on a mobile device') },
                { t: 'Step 4: Mark OUT / IN', h: '<p>Click <b>Mark as OUT</b> on exit and <b>Mark as IN</b> on return; both are saved automatically.</p>' + umImg('g4-mark-in', 'Marking a pass as IN') + '<p class="text-xs text-gray-500 mt-2">If the QR won\'t read, type the <b>Control No.</b> from the form.</p>' },
            ]
        },
        {
            id: 'admin', title: 'Administrator Guide', icon: 'fa-user-shield',
            desc: 'Manage users, master lists, audit logs, and the technical setup.',
            access: umIsAdmin,
            slides: [
                { t: 'Administrator Guide', h: '<p>You maintain users and master data.</p>' },
                { t: 'Step 1: Admin Panel', h: '<p>Go to the <b>Admin Panel</b>.</p>' + umImg('ad1-admin-panel', 'Admin panel dashboard') },
                { t: 'Step 2: User Management', h: '<p>Add employees, reset passwords, or deactivate resigned users.</p>' + umImg('ad2-user-management', 'User management page') },
                { t: 'Step 3: Master Lists', h: '<p>Update <b>Trucks</b>, <b>Drivers</b>, and <b>Destinations</b>.</p>' + umImg('ad3-master-lists', 'Master list settings') },
                { t: 'Step 4: Audit Trail', h: '<p>Use the <b>Audit Trail</b> to trace who approved or changed records.</p>' + umImg('ad4-audit-trail', 'Audit trail and system logs') },
                { t: 'Technical setup (IT)', h: '<p class="text-sm">Front end: Vanilla JS + Tailwind. Back end: ASP.NET Core 8 (C#), Dapper, stored procedures. Database: MariaDB via XAMPP. Auth: case-insensitive name or Employee ID plus password, returning a JWT. Digital approval steps: SUPERIOR, then HRAD_ASSIGN, then PAS. President approval is a physical signature on the printed company vehicle form.</p>' },
            ]
        },
    ];
}

function umAvailableManuals() {
    return umManuals().filter(function (m) {
        try { return m.access(); } catch (e) { return false; }
    });
}
function umFindManual(id) {
    return umManuals().filter(function (m) { return m.id === id; })[0] || null;
}

// ─── Rendering ───────────────────────────────────────────────────────
function initUserManual() {
    umState.manualId = null;
    umState.index = 0;
    umRenderPicker();
}

function umRenderPicker() {
    var root = document.getElementById('umRoot');
    if (!root) return;
    var manuals = umAvailableManuals();
    var cards = manuals.map(function (m) {
        return '<button type="button" onclick="umOpenManual(\'' + m.id + '\')" ' +
            'class="text-left border border-gray-200 rounded-lg p-4 hover:bg-gray-50 hover:border-gray-300 transition flex gap-3 items-start">' +
            '<i class="fas ' + m.icon + ' text-gray-400 mt-0.5 w-5 text-center"></i>' +
            '<span><span class="block font-semibold text-gray-800 text-sm">' + umEsc(m.title) + '</span>' +
            '<span class="block text-xs text-gray-500 mt-0.5">' + umEsc(m.desc) + '</span></span></button>';
    }).join('');

    root.innerHTML =
        '<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-6 md:p-8">' +
            '<div class="border-b border-gray-200 pb-4 mb-5">' +
                '<h2 class="text-xl font-bold text-gray-800"><i class="fas fa-book mr-2 text-gray-500"></i>User Manual</h2>' +
                '<p class="text-sm text-gray-500 mt-1">Select a guide. Only the guides for your role are shown. Each opens as a step-by-step slideshow.</p>' +
            '</div>' +
            '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' + (cards || '<p class="text-sm text-gray-400">No guides available for your role.</p>') + '</div>' +
        '</div>';
}

function umOpenManual(id) {
    umState.manualId = id;
    umState.index = 0;
    umRenderSlide(1);
}

function umGoTo(delta) {
    var m = umFindManual(umState.manualId);
    if (!m) return;
    var next = umState.index + delta;
    if (next < 0 || next >= m.slides.length) return;
    umState.index = next;
    umRenderSlide(delta);
}

function umBackToPicker() {
    umState.manualId = null;
    umRenderPicker();
}

function umRenderSlide(dir) {
    var root = document.getElementById('umRoot');
    var m = umFindManual(umState.manualId);
    if (!root || !m) return;
    var total = m.slides.length;
    var i = umState.index;
    var slide = m.slides[i];
    var anim = dir < 0 ? 'um-anim-prev' : 'um-anim-next';

    var dots = m.slides.map(function (_, k) {
        return '<button type="button" onclick="umJump(' + k + ')" aria-label="Slide ' + (k + 1) + '" ' +
            'class="um-dot' + (k === i ? ' um-dot-active' : '') + '"></button>';
    }).join('');

    root.innerHTML =
        '<div class="bg-white rounded-lg shadow-sm border border-gray-200 p-5 md:p-6">' +
            '<div class="flex items-center justify-between mb-4">' +
                '<button type="button" onclick="umBackToPicker()" class="text-xs font-semibold text-gray-500 hover:text-gray-800 transition"><i class="fas fa-chevron-left mr-1"></i>All guides</button>' +
                '<div class="text-xs text-gray-500"><i class="fas ' + m.icon + ' mr-1 text-gray-400"></i>' + umEsc(m.title) + '</div>' +
                '<div class="text-xs font-semibold text-gray-400">' + (i + 1) + ' / ' + total + '</div>' +
            '</div>' +
            '<div class="um-stage border border-gray-200 rounded-lg p-6 md:p-8 bg-white">' +
                '<div class="' + anim + '">' +
                    '<h3 class="text-lg font-bold text-gray-800 mb-3">' + umEsc(slide.t) + '</h3>' +
                    '<div class="text-sm text-gray-600 leading-relaxed um-slide-body">' + slide.h + '</div>' +
                '</div>' +
            '</div>' +
            '<div class="flex items-center justify-between mt-4">' +
                '<button type="button" onclick="umGoTo(-1)" ' + (i === 0 ? 'disabled' : '') + ' class="um-navbtn"><i class="fas fa-arrow-left mr-1.5"></i>Previous</button>' +
                '<div class="um-dots">' + dots + '</div>' +
                (i === total - 1
                    ? '<button type="button" onclick="umBackToPicker()" class="um-navbtn um-navbtn-primary">Done<i class="fas fa-check ml-1.5"></i></button>'
                    : '<button type="button" onclick="umGoTo(1)" class="um-navbtn um-navbtn-primary">Next<i class="fas fa-arrow-right ml-1.5"></i></button>') +
            '</div>' +
        '</div>';
}

function umJump(k) {
    var m = umFindManual(umState.manualId);
    if (!m || k < 0 || k >= m.slides.length) return;
    var dir = k >= umState.index ? 1 : -1;
    umState.index = k;
    umRenderSlide(dir);
}

// Arrow-key navigation while a slide is open and the manual section is visible.
document.addEventListener('keydown', function (e) {
    if (!umState.manualId) return;
    var sec = document.getElementById('sec-userManual');
    if (!sec || sec.classList.contains('hidden')) return;
    if (e.key === 'ArrowRight') { umGoTo(1); }
    else if (e.key === 'ArrowLeft') { umGoTo(-1); }
});

window.initUserManual = initUserManual;
window.umOpenManual = umOpenManual;
window.umGoTo = umGoTo;
window.umJump = umJump;
window.umBackToPicker = umBackToPicker;
