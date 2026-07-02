// Vehicle Schedule Calendar — monthly grid, filters, day modal, Excel export.

// ─── State ───────────────────────────────────────────────────────────
var scheduleCurrentYear = new Date().getFullYear();
var scheduleCurrentMonth = new Date().getMonth(); // 0-based
var scheduleData = [];
var scheduleFilters = { date: '', driverId: '', vehicleId: '', status: '', search: '' };
var scheduleSelectedDay = null; // YYYY-MM-DD of clicked day

// ─── Helpers ─────────────────────────────────────────────────────────
function schedFmtDate(d) {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dy = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dy}`;
}

function schedParseDateLocal(iso) {
    const parts = iso.split('T')[0].split('-');
    return new Date(+parts[0], +parts[1] - 1, +parts[2]);
}

function schedFormatTime12(timeStr) {
    if (!timeStr) return '';
    const [h, m] = timeStr.split(':');
    let hour = parseInt(h, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    hour = hour % 12 || 12;
    return `${hour}:${m} ${ampm}`;
}

function schedGetWeekNumber(d) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = dt.getUTCDay() || 7;
    dt.setUTCDate(dt.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
    return Math.ceil(((dt - yearStart) / 86400000 + 1) / 7);
}

function schedGetMonday(d) {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    dt.setDate(diff);
    dt.setHours(0, 0, 0, 0);
    return dt;
}

function schedGetSaturday(d) {
    const mon = schedGetMonday(d);
    const sat = new Date(mon);
    sat.setDate(mon.getDate() + 5);
    return sat;
}

function schedMonthName(m) {
    return ['January','February','March','April','May','June','July','August','September','October','November','December'][m];
}

function schedDayName(d) {
    return ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][d];
}

function schedShortDay(d) {
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d];
}

// ─── Event colour helpers ────────────────────────────────────────────
function schedEventPillClass(entry) {
    if (entry.statusCode === 'PENDING' || entry.statusCode === 'PENDING_SUPERIOR' || entry.statusCode === 'PENDING_PRESIDENT' || entry.statusCode === 'PENDING_PAS') {
        return 'bg-amber-100 text-amber-800 border-amber-200';
    }
    if (entry.scheduleSource === 'FIXED') {
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    }
    if (entry.statusCode === 'CANCELLED') {
        return 'bg-red-100 text-red-800 border-red-200';
    }
    return 'bg-blue-100 text-blue-800 border-blue-200';
}

function schedStatusBadge(code) {
    const map = {
        'FIXED':     'bg-emerald-100 text-emerald-700',
        'PENDING':   'bg-amber-100 text-amber-700',
        'PENDING_SUPERIOR': 'bg-amber-100 text-amber-700',
        'PENDING_PRESIDENT':'bg-amber-100 text-amber-700',
        'PENDING_PAS':'bg-amber-100 text-amber-700',
        'RESERVED':  'bg-blue-100 text-blue-700',
        'IN_USE':    'bg-indigo-100 text-indigo-700',
        'RETURNED':  'bg-gray-100 text-gray-600',
        'CANCELLED': 'bg-red-100 text-red-700',
        'APPROVED':  'bg-teal-100 text-teal-700'
    };
    const cls = map[code] || 'bg-gray-100 text-gray-600';
    const label = (code || 'Unknown').replace(/_/g, ' ');
    return `<span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${cls}">${label}</span>`;
}

// ─── Filtering ───────────────────────────────────────────────────────
function schedFilteredData() {
    const f = scheduleFilters;
    return scheduleData.filter(entry => {
        if (f.driverId && String(entry.driverId) !== String(f.driverId)) return false;
        if (f.vehicleId && String(entry.vehicleId) !== String(f.vehicleId)) return false;
        if (f.status) {
            if (f.status === 'PENDING') {
                const pendingCodes = ['PENDING','PENDING_SUPERIOR','PENDING_PRESIDENT','PENDING_PAS'];
                if (!pendingCodes.includes(entry.statusCode)) return false;
            } else if (String(entry.statusCode) !== f.status && String(entry.scheduleSource) !== f.status) {
                return false;
            }
        }
        if (f.search) {
            const q = f.search.toLowerCase();
            const haystack = [entry.requesterName, entry.title, entry.destination, entry.controlNo, entry.vehicleName, entry.driverName]
                .filter(Boolean).join(' ').toLowerCase();
            if (!haystack.includes(q)) return false;
        } else {
            // Hide past schedules if no search is active
            if (entry.scheduleDate) {
                const datePart = entry.scheduleDate.split('T')[0];
                const endPart = entry.endTime ? entry.endTime : '23:59:59';
                const eventEnd = new Date(`${datePart}T${endPart}`);
                if (eventEnd < new Date()) return false;
            }
        }
        return true;
    });
}

function schedEventsForDate(dateStr) {
    return schedFilteredData().filter(e => {
        const d = e.scheduleDate ? e.scheduleDate.split('T')[0] : '';
        return d === dateStr;
    });
}

// ─── Public filter actions ───────────────────────────────────────────
function applyScheduleFilters() {
    scheduleFilters.date = document.getElementById('schedFilterDate')?.value || '';
    scheduleFilters.driverId = document.getElementById('schedFilterDriver')?.value || '';
    scheduleFilters.vehicleId = document.getElementById('schedFilterVehicle')?.value || '';
    scheduleFilters.status = document.getElementById('schedFilterStatus')?.value || '';
    scheduleFilters.search = document.getElementById('schedFilterSearch')?.value || '';

    // Jump to date if specified
    if (scheduleFilters.date) {
        const parts = scheduleFilters.date.split('-');
        const jumpYear = parseInt(parts[0], 10);
        const jumpMonth = parseInt(parts[1], 10) - 1;
        if (jumpYear !== scheduleCurrentYear || jumpMonth !== scheduleCurrentMonth) {
            scheduleCurrentYear = jumpYear;
            scheduleCurrentMonth = jumpMonth;
            loadAndRenderScheduleMonth();
            return;
        }
    }

    renderScheduleCalendar();
}

function clearScheduleFilters() {
    scheduleFilters = { date: '', driverId: '', vehicleId: '', status: '', search: '' };
    const ids = ['schedFilterDate','schedFilterDriver','schedFilterVehicle','schedFilterStatus','schedFilterSearch'];
    ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    renderScheduleCalendar();
}

// ─── Populate filter dropdowns ───────────────────────────────────────
function populateScheduleFilterDropdowns() {
    const driverSel = document.getElementById('schedFilterDriver');
    const vehicleSel = document.getElementById('schedFilterVehicle');
    if (!driverSel || !vehicleSel) return;

    // Drivers
    driverSel.innerHTML = '<option value="">All Drivers</option>';
    (databaseDrivers || []).forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.driverId;
        opt.textContent = d.fullName;
        driverSel.appendChild(opt);
    });

    // Vehicles
    vehicleSel.innerHTML = '<option value="">All Vehicles</option>';
    (databaseVehicles || []).forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = `${v.name} (${v.plate})`;
        vehicleSel.appendChild(opt);
    });
}

// ─── Initialize ──────────────────────────────────────────────────────
async function initializeScheduleCalendar() {
    populateScheduleFilterDropdowns();
    syncScheduleExportWeekInput();
    
    // Check if current user is an authorized HR manager
    const authorizedHR = ['GA120', 'GA150', 'GA133', 'GA139', 'GA409', 'GA407'];
    const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
    const btn = document.getElementById('btnManageFixedSchedules');
    if (btn) {
        if (activeUser && authorizedHR.includes(activeUser.id)) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
        }
    }

    const btnRequest = document.getElementById('btnRequestServiceSchedule');
    if (btnRequest) {
        if (activeUser && (activeUser.id === 'GA125' || activeUser.id === 'GA407')) {
            btnRequest.classList.remove('hidden');
        } else {
            btnRequest.classList.add('hidden');
        }
    }

    await loadAndRenderScheduleMonth();
}

async function loadAndRenderScheduleMonth() {
    const firstDay = new Date(scheduleCurrentYear, scheduleCurrentMonth, 1);
    const lastDay = new Date(scheduleCurrentYear, scheduleCurrentMonth + 1, 0);

    // Expand range to cover full grid weeks (prev/next month tails)
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - gridStart.getDay());
    const gridEnd = new Date(lastDay);
    const remain = 6 - gridEnd.getDay();
    gridEnd.setDate(gridEnd.getDate() + remain);

    await loadScheduleData(schedFmtDate(gridStart), schedFmtDate(gridEnd));
    renderScheduleCalendar();
    syncScheduleExportWeekInput();
}

// ─── Data Loading ────────────────────────────────────────────────────
async function loadScheduleData(from, to) {
    if (!isDatabaseSession() && !window.isGuestCalendarView) return;
    try {
        const params = new URLSearchParams();
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const data = await ApiClient.get(`/fleet/schedule?${params}`);
        scheduleData = Array.isArray(data) ? data : [];
    } catch (error) {
        scheduleData = [];
        if (!(error instanceof ApiError && error.status === 401)) {
            showToast(error instanceof ApiError ? error.message : 'Unable to load schedule data.', 'error');
        }
    }
}

// ─── Calendar Render ─────────────────────────────────────────────────
function renderScheduleCalendar() {
    const grid = document.getElementById('schedCalendarGrid');
    const titleEl = document.getElementById('schedMonthTitle');
    if (!grid || !titleEl) return;

    titleEl.textContent = `${schedMonthName(scheduleCurrentMonth)} ${scheduleCurrentYear}`;

    const firstDay = new Date(scheduleCurrentYear, scheduleCurrentMonth, 1);
    const lastDay = new Date(scheduleCurrentYear, scheduleCurrentMonth + 1, 0);
    const startDow = firstDay.getDay(); // 0 = Sunday

    // Build array of dates for grid
    const cells = [];
    const gridStart = new Date(firstDay);
    gridStart.setDate(gridStart.getDate() - startDow);

    const totalCells = Math.ceil((startDow + lastDay.getDate()) / 7) * 7;
    for (let i = 0; i < totalCells; i++) {
        const d = new Date(gridStart);
        d.setDate(gridStart.getDate() + i);
        cells.push(d);
    }

    const todayStr = schedFmtDate(new Date());
    const highlightStr = scheduleFilters.date || '';

    let html = '';
    cells.forEach((cellDate, idx) => {
        const dateStr = schedFmtDate(cellDate);
        const isCurrentMonth = cellDate.getMonth() === scheduleCurrentMonth;
        const isToday = dateStr === todayStr;
        const isHighlighted = dateStr === highlightStr;
        const events = schedEventsForDate(dateStr);

        const borderClasses = [];
        if (idx % 7 !== 6) borderClasses.push('border-r');
        if (idx < cells.length - 7) borderClasses.push('border-b');
        borderClasses.push('border-gray-100');

        const bgClass = isHighlighted ? 'bg-blue-50/60' : (isToday ? 'bg-amber-50/40' : '');

        html += `<div class="min-h-[100px] p-1.5 cursor-pointer hover:bg-gray-50 transition ${borderClasses.join(' ')} ${bgClass}" onclick="openScheduleDayModal('${dateStr}')">`;

        // Date number
        const dateNumClass = isCurrentMonth ? 'text-gray-800' : 'text-gray-300';
        const todayRing = isToday ? 'bg-mpiBlue text-white rounded-full w-7 h-7 flex items-center justify-center text-xs font-bold' : `text-xs font-semibold ${dateNumClass}`;
        html += `<div class="mb-1"><span class="${todayRing}">${cellDate.getDate()}</span></div>`;

        // Event pills (max 3)
        const maxPills = 3;
        const visibleEvents = events.slice(0, maxPills);
        visibleEvents.forEach(ev => {
            const pillCls = schedEventPillClass(ev);
            const timeLabel = ev.startTime ? schedFormatTime12(ev.startTime) : '';
            html += `<div class="text-[9px] leading-tight truncate px-1.5 py-0.5 rounded border mb-0.5 ${pillCls}" title="${schedEscape(ev.title || ev.vehicleName || '')}">`;
            html += `${timeLabel ? schedEscape(timeLabel) + ' ' : ''}${schedEscape(ev.vehicleName || ev.title || '')}`;
            html += `</div>`;
        });

        if (events.length > maxPills) {
            html += `<div class="text-[9px] text-gray-400 font-medium px-1.5">+${events.length - maxPills} more</div>`;
        }

        html += `</div>`;
    });

    grid.innerHTML = html;
}

// ─── Month Navigation ────────────────────────────────────────────────
function navigateScheduleMonth(dir) {
    scheduleCurrentMonth += dir;
    if (scheduleCurrentMonth > 11) { scheduleCurrentMonth = 0; scheduleCurrentYear++; }
    if (scheduleCurrentMonth < 0) { scheduleCurrentMonth = 11; scheduleCurrentYear--; }
    loadAndRenderScheduleMonth();
}

// ─── Day Detail Modal ────────────────────────────────────────────────
// Day-view mode: 'grid' renders the Excel-style per-day layout (vehicles as columns,
// time slots as rows); 'list' keeps the compact card list. Defaults to grid.
var scheduleDayView = 'grid';
// Grid section toggle: 'vehicle' shows regular cars, 'truck' shows trucks/commercial.
var schedDayGridType = 'vehicle';

function setScheduleDayView(mode) {
    scheduleDayView = mode === 'list' ? 'list' : 'grid';
    if (scheduleSelectedDay) openScheduleDayModal(scheduleSelectedDay);
}

function setScheduleDayGridType(type) {
    schedDayGridType = (type === 'truck') ? 'truck' : 'vehicle';
    if (scheduleSelectedDay) openScheduleDayModal(scheduleSelectedDay);
}

function schedEscape(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// 'FFA9D18E' (ExcelJS ARGB) -> '#A9D18E' so the on-screen grid uses the exact same
// colours as the downloaded workbook.
function schedArgbToHex(argb) {
    const s = String(argb || '').replace(/[^0-9a-fA-F]/g, '');
    if (s.length === 8) return '#' + s.slice(2);
    if (s.length === 6) return '#' + s;
    return '#ffffff';
}

// Pick black/white text for legibility on a given fill when the colour map has no explicit
// font colour (e.g. the dark BRV fill ships its own white).
function schedReadableTextColor(hex) {
    const m = /^#?([0-9a-fA-F]{6})$/.exec(hex || '');
    if (!m) return '#0f172a';
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
    return luminance < 140 ? '#ffffff' : '#0f172a';
}

function schedEventTooltip(ev) {
    const parts = [];
    if (ev.startTime) {
        parts.push(ev.endTime
            ? `${schedFormatTime12(ev.startTime)} – ${schedFormatTime12(ev.endTime)}`
            : schedFormatTime12(ev.startTime));
    }
    if (ev.vehicleName) parts.push(`${ev.vehicleName}${ev.plateNumber ? ' (' + ev.plateNumber + ')' : ''}`);
    if (ev.driverName) parts.push(`Driver: ${ev.driverName}`);
    if (ev.requesterName) parts.push(`Requested by: ${ev.requesterName}`);
    if (ev.destination) parts.push(`To: ${ev.destination}`);
    if (ev.controlNo) parts.push(`Control: ${ev.controlNo}`);
    if (ev.statusCode) parts.push(`Status: ${String(ev.statusCode).replace(/_/g, ' ')}`);
    return parts.join('\n');
}

// Build a [slot][vehicle] render matrix mirroring buildVehicleSheetsV2 placement:
// MORNING MEETING / LUNCH BREAK span every vehicle column; other events occupy their
// vehicle column across their time-slot range. Cells are either undefined (empty),
// 'skip' (covered by a rowspan/colspan above) or a block descriptor.
function schedBuildDayMatrix(vehicles, timeSlots, dayEvents) {
    const nCols = vehicles.length;
    const nRows = timeSlots.length;
    const matrix = Array.from({ length: nRows }, () => Array(nCols).fill(undefined));

    const rangeFree = (r1, r2, c1, c2) => {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) if (matrix[r][c] !== undefined) return false;
        }
        return true;
    };
    const fillSkip = (r1, r2, c1, c2) => {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) matrix[r][c] = 'skip';
        }
    };

    ['MORNING MEETING', 'LUNCH BREAK'].forEach(label => {
        const ev = dayEvents.find(e =>
            schedNormalizeKey(schedEventLabel(e)).includes(schedNormalizeKey(label)));
        if (!ev) return;
        const range = schedEventRangeForSlots(ev, timeSlots);
        if (!range || !rangeFree(range.first, range.last, 0, nCols - 1)) return;
        fillSkip(range.first, range.last, 0, nCols - 1);
        matrix[range.first][0] = {
            type: 'special',
            label,
            rowspan: range.last - range.first + 1,
            colspan: nCols
        };
    });

    vehicles.forEach((vehicle, vi) => {
        const events = dayEvents
            .filter(ev => schedEventMatchesVehicle(ev, vehicle))
            .filter(ev => {
                const label = schedNormalizeKey(schedEventLabel(ev));
                return !label.includes('MORNINGMEETING') && !label.includes('LUNCHBREAK');
            })
            .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

        events.forEach(ev => {
            const range = schedEventRangeForSlots(ev, timeSlots);
            if (!range || !rangeFree(range.first, range.last, vi, vi)) return;
            const style = schedVehicleStyle(vehicle, vi);
            const fill = schedArgbToHex(style.fill);
            fillSkip(range.first, range.last, vi, vi);
            matrix[range.first][vi] = {
                type: 'event',
                ev,
                rowspan: range.last - range.first + 1,
                fill,
                fontColor: style.fontColor ? schedArgbToHex(style.fontColor) : schedReadableTextColor(fill)
            };
        });
    });

    return matrix;
}

const SCHED_AFTER_HOURS_MIN = 16 * 60 + 30; // 4:30 PM — shaded "closed" band, matches Excel

function schedRenderScheduleGrid(heading, vehicles, timeSlots, dayEvents) {
    if (!vehicles.length) return '';
    const matrix = schedBuildDayMatrix(vehicles, timeSlots, dayEvents);

    let head = '<th class="sched-grid-time-head">TIME</th>';
    vehicles.forEach((vehicle, vi) => {
        const style = schedVehicleStyle(vehicle, vi);
        const bg = schedArgbToHex(style.fill);
        const fc = style.fontColor ? schedArgbToHex(style.fontColor) : schedReadableTextColor(bg);
        const name = String(vehicle?.name || '').toUpperCase();
        const plate = String(vehicle?.plate || '').toUpperCase();
        const driver = schedDriverLabel(vehicle?.driver);
        const sub = [plate, driver].filter(Boolean).join(' · ');
        head += `<th class="sched-grid-vh" style="background:${bg};color:${fc}">
            <span class="sched-grid-vh-name">${schedEscape(name)}</span>
            ${sub ? `<span class="sched-grid-vh-sub">${schedEscape(sub)}</span>` : ''}
        </th>`;
    });

    let rows = '';
    timeSlots.forEach((slot, ri) => {
        const afterHours = slot.start >= SCHED_AFTER_HOURS_MIN;
        let tds = '';
        for (let vi = 0; vi < vehicles.length; vi++) {
            const cell = matrix[ri][vi];
            if (cell === 'skip') continue;
            if (cell === undefined) {
                tds += `<td class="sched-grid-cell${afterHours ? ' sched-grid-after' : ''}"></td>`;
            } else if (cell.type === 'special') {
                tds += `<td class="sched-grid-special" rowspan="${cell.rowspan}" colspan="${cell.colspan}">${schedEscape(cell.label)}</td>`;
            } else {
                const ev = cell.ev;
                tds += `<td class="sched-grid-event" rowspan="${cell.rowspan}" style="background:${cell.fill};color:${cell.fontColor}" title="${schedEscape(schedEventTooltip(ev))}">
                    <span class="sched-grid-event-title">${schedEscape(schedEventLabel(ev))}</span>
                </td>`;
            }
        }
        rows += `<tr><td class="sched-grid-time${afterHours ? ' sched-grid-time-after' : ''}">${schedEscape(slot.label)}</td>${tds}</tr>`;
    });

    return `
    <div class="sched-grid-wrap">
        ${heading ? `<div class="sched-grid-heading">${heading}</div>` : ''}
        <div class="sched-grid-scroll">
            <table class="sched-grid-table">
                <thead><tr>${head}</tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
    </div>`;
}

function schedRenderDayList(events) {
    const sorted = [...events].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
    let listHtml = '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">';
    sorted.forEach(ev => {
        const timeRange = ev.startTime && ev.endTime
            ? `${schedFormatTime12(ev.startTime)} – ${schedFormatTime12(ev.endTime)}`
            : (ev.startTime ? schedFormatTime12(ev.startTime) : 'All Day');

        listHtml += `
        <div class="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition">
            <div class="flex items-start justify-between mb-1.5">
                <div class="flex items-center gap-2">
                    <i class="fas fa-clock text-gray-400 text-xs"></i>
                    <span class="text-xs font-bold text-gray-700">${schedEscape(timeRange)}</span>
                </div>
                ${schedStatusBadge(ev.statusCode)}
            </div>
            <div class="ml-5 space-y-1">
                <div class="text-sm font-semibold text-gray-800">${schedEscape(ev.title || 'Untitled')}</div>
                <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                    <span><i class="fas fa-car mr-1 text-gray-400"></i>${schedEscape(ev.vehicleName || '—')} ${ev.plateNumber ? '(' + schedEscape(ev.plateNumber) + ')' : ''}</span>
                    <span><i class="fas fa-user mr-1 text-gray-400"></i>${schedEscape(ev.driverName || '—')}</span>
                </div>
                ${ev.description ? `<div class="text-xs text-gray-500 mt-0.5">${schedEscape(ev.description)}</div>` : ''}
                ${ev.scheduleSource === 'RESERVATION' ? `
                <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 mt-1 pt-1 border-t border-gray-100">
                    ${ev.requesterName ? `<span><i class="fas fa-user-tag mr-1 text-gray-400"></i>${schedEscape(ev.requesterName)}</span>` : ''}
                    ${ev.destination ? `<span><i class="fas fa-map-marker-alt mr-1 text-gray-400"></i>${schedEscape(ev.destination)}</span>` : ''}
                    ${ev.controlNo ? `<span><i class="fas fa-hashtag mr-1 text-gray-400"></i>${schedEscape(ev.controlNo)}</span>` : ''}
                </div>` : ''}
            </div>
        </div>`;
    });
    return listHtml + '</div>';
}

function openScheduleDayModal(dateStr) {
    scheduleSelectedDay = dateStr;
    syncScheduleExportWeekInput();
    const modal = document.getElementById('scheduleDayModal');
    const titleEl = document.getElementById('scheduleDayModalTitle');
    const bodyEl = document.getElementById('scheduleDayModalBody');
    const countEl = document.getElementById('scheduleDayModalCount');
    if (!modal || !titleEl || !bodyEl) return;

    const d = schedParseDateLocal(dateStr);
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    titleEl.textContent = `Schedule for ${d.toLocaleDateString('en-US', opts)}`;

    const events = schedEventsForDate(dateStr);
    if (countEl) countEl.textContent = `${events.length} ${events.length === 1 ? 'entry' : 'entries'}`;

    const toggle = `
        <div class="sched-view-toggle">
            <button type="button" class="${scheduleDayView === 'grid' ? 'active' : ''}" onclick="setScheduleDayView('grid')"><i class="fas fa-table-cells mr-1"></i>Grid</button>
            <button type="button" class="${scheduleDayView === 'list' ? 'active' : ''}" onclick="setScheduleDayView('list')"><i class="fas fa-list-ul mr-1"></i>List</button>
        </div>`;

    if (events.length === 0) {
        bodyEl.innerHTML = `${toggle}
            <div class="py-12 text-center">
                <i class="fas fa-calendar-day text-4xl text-gray-200 mb-3"></i>
                <p class="text-sm text-gray-400">No scheduled entries for this day.</p>
            </div>`;
    } else if (scheduleDayView === 'list') {
        bodyEl.innerHTML = toggle + schedRenderDayList(events);
    } else {
        const vehicles = schedMonitoringVehicles();
        const vehicleSlots = schedBuildTimeSlots('vehicle');
        const trucks = schedTruckVehicles();
        const truckSlots = schedBuildTimeSlots('truck');

        const dayLabel = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

        const gridTypeTabs = `
            <div class="flex gap-1.5 mb-3">
                <button onclick="setScheduleDayGridType('vehicle')" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition ${schedDayGridType === 'vehicle' ? 'bg-mpiBlue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                    <i class="fas fa-car-side"></i> Vehicles
                </button>
                <button onclick="setScheduleDayGridType('truck')" class="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded transition ${schedDayGridType === 'truck' ? 'bg-mpiBlue text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                    <i class="fas fa-truck"></i> Trucks
                </button>
            </div>`;

        let gridHtml = '';
        if (schedDayGridType === 'truck') {
            if (trucks.length) {
                gridHtml = schedRenderScheduleGrid(
                    `<i class="fas fa-truck text-mpiBlue"></i> Truck Schedule — ${schedEscape(dayLabel)}`,
                    trucks, truckSlots, events);
            }
        } else {
            if (vehicles.length) {
                gridHtml = schedRenderScheduleGrid(
                    `<i class="fas fa-car-side text-mpiBlue"></i> Vehicle Monitoring — ${schedEscape(dayLabel)}`,
                    vehicles, vehicleSlots, events);
            }
        }

        // Fall back to the list when there are no vehicle columns to render a grid into.
        bodyEl.innerHTML = toggle + gridTypeTabs + (gridHtml || schedRenderDayList(events));
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeScheduleDayModal() {
    const modal = document.getElementById('scheduleDayModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
}

// ─── Excel Export ────────────────────────────────────────────────────
const scheduleVehicleColorMap = [
    { keys: ['HONDA CRV', 'NOV8084'], fill: 'FFA9D18E', width: 13 },
    { keys: ['HONDA ACCORD', 'DAH7724'], fill: 'FFF4B183', width: 23.5 },
    { keys: ['HONDA HRV', 'DBP7296'], fill: 'FF9DC3E6', width: 25 },
    { keys: ['HONDA BRV', 'DAZ7569'], fill: 'FF404040', width: 25.5, fontColor: 'FFFFFFFF' },
    { keys: ['TOYOTA INNOVA', 'WVO408'], fill: 'FFFFD966', width: 20.75 },
    { keys: ['HONDA CITY', 'VHF561'], fill: 'FFD0AAE8', width: 24.5 },
    { keys: ['FLEXI VAN', 'NAW3504'], fill: 'FF93D9D6', width: 13 },
    { keys: ['ISUZU', 'CANTER', 'ZJE745'], fill: 'FFB8FEC9', width: 13 },
    { keys: ['MITSUBISHI', 'FUSO', 'DAV3864'], fill: 'FFFCE4D6', width: 13 }
];

const scheduleFallbackColors = [
    'FFA9D18E', 'FFF4B183', 'FF9DC3E6', 'FFFFD966', 'FFD0AAE8',
    'FF93D9D6', 'FFE2F0D9', 'FFFFE699', 'FFEADCF8'
];

function schedNormalizeKey(value) {
    return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function schedExcelFill(argb) {
    return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function schedExcelBorder(style = 'thin') {
    return {
        top: { style },
        bottom: { style },
        left: { style },
        right: { style }
    };
}

function schedVehicleStyle(vehicle, index = 0) {
    const key = `${schedNormalizeKey(vehicle?.name)} ${schedNormalizeKey(vehicle?.plate)}`;
    const match = scheduleVehicleColorMap.find(item =>
        item.keys.some(matchKey => key.includes(schedNormalizeKey(matchKey)))
    );
    return match || {
        fill: scheduleFallbackColors[index % scheduleFallbackColors.length],
        width: 18
    };
}

function schedDriverLabel(driverName) {
    const value = String(driverName || '').trim().toUpperCase();
    if (!value || value === 'UNASSIGNED') return 'ADMIN';
    if (value.includes('JONATHAN')) return 'JONATHAN T.';
    if (value.includes('GERONIMO')) return 'GERONIMO L.';
    if (value.includes('FRANCIS') || value.includes('REFE')) return 'F. REFE';
    if (value.includes('JOHN')) return 'JOHN V.';
    if (value.includes('ALEX')) return 'ALEX';
    if (value.includes('ALVIN')) return 'ALVIN';
    return value.split(/\s+/).slice(0, 2).join(' ');
}

function schedVehicleHeader(vehicle, compact = false) {
    const plate = String(vehicle?.plate || '').toUpperCase();
    const driver = schedDriverLabel(vehicle?.driver);
    if (compact) {
        return `${String(vehicle?.name || '').toUpperCase()}\n(${plate} / ${driver})`;
    }
    return `${String(vehicle?.name || '').toUpperCase()}\n${plate} ${driver}`;
}

function schedVehicleSortKey(vehicle) {
    const key = schedNormalizeKey(`${vehicle?.name || ''} ${vehicle?.plate || ''}`);
    const order = ['HONDACRV', 'HONDAACCORD', 'HONDAHRV', 'HONDABRV', 'TOYOTAINNOVA', 'HONDACITY', 'FLEXIVAN'];
    const idx = order.findIndex(item => key.includes(item));
    return idx >= 0 ? idx : 100;
}

function schedTruckSortKey(vehicle) {
    const key = schedNormalizeKey(`${vehicle?.name || ''} ${vehicle?.plate || ''}`);
    const order = ['ISUZUCANTER', 'MITSUBISHIFUSO', 'FLEXIVAN'];
    const idx = order.findIndex(item => key.includes(item));
    return idx >= 0 ? idx : 100;
}

function schedIsTruckPlanVehicle(vehicle) {
    const key = schedNormalizeKey(`${vehicle?.name || ''} ${vehicle?.plate || ''}`);
    return key.includes('ISUZU') ||
        key.includes('CANTER') ||
        key.includes('FUSO') ||
        key.includes('MITSUBISHI') ||
        key.includes('FLEXIVAN') ||
        key.includes('NAW3504');
}

function schedIsMonitoringVehicle(vehicle) {
    const key = schedNormalizeKey(`${vehicle?.name || ''} ${vehicle?.plate || ''}`);
    return !key.includes('ISUZU') && !key.includes('CANTER') && !key.includes('FUSO') && !key.includes('MITSUBISHI');
}

function schedMonitoringVehicles() {
    return [...(databaseVehicles || [])]
        .filter(schedIsMonitoringVehicle)
        .sort((a, b) => schedVehicleSortKey(a) - schedVehicleSortKey(b) || String(a.name).localeCompare(String(b.name)));
}

function schedTruckVehicles() {
    const found = [...(databaseVehicles || [])]
        .filter(schedIsTruckPlanVehicle)
        .sort((a, b) => schedTruckSortKey(a) - schedTruckSortKey(b) || String(a.name).localeCompare(String(b.name)));

    if (found.length) return found;

    return [
        { id: 'TRUCK-ISUZU', name: 'ISUZU - CANTER', plate: 'ZJE 745', driver: 'ALEX' },
        { id: 'TRUCK-FUSO', name: 'MITSUBISHI - FUSO', plate: 'DAV 3864', driver: 'ALVIN' },
        { id: 'TRUCK-FLEXI', name: 'FLEXI VAN', plate: 'NAW 3504', driver: 'ADMIN' }
    ];
}

function schedTimeToMinutes(timeStr) {
    if (!timeStr) return null;
    const [h, m] = String(timeStr).substring(0, 5).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
}

function schedBuildTimeSlots(kind) {
    const starts = [];
    if (kind === 'vehicle') {
        starts.push([5, 30], [6, 0], [6, 30], [7, 30]);
        for (let h = 8; h <= 18; h++) {
            starts.push([h, 0], [h, 30]);
        }
    } else {
        for (let h = 7; h <= 18; h++) {
            starts.push([h, 30]);
            if (h < 18) starts.push([h + 1, 0]);
        }
    }

    return starts.map(([h, m]) => {
        const endTotal = h * 60 + m + 30;
        const eh = Math.floor(endTotal / 60);
        const em = endTotal % 60;
        const fmt = (hr, mn) => `${hr}:${String(mn).padStart(2, '0')}`;
        return {
            label: `${fmt(h, m)} ~ ${fmt(eh, em)}`,
            start: h * 60 + m,
            end: endTotal,
            startKey: fmt(h, m),
            endKey: fmt(eh, em)
        };
    });
}

function schedEventRangeForSlots(event, slots) {
    const start = schedTimeToMinutes(event.startTime);
    const end = schedTimeToMinutes(event.endTime) || (start === null ? null : start + 30);
    if (start === null || end === null) return null;
    const indexes = slots
        .map((slot, index) => (start < slot.end && end > slot.start ? index : -1))
        .filter(index => index >= 0);
    if (!indexes.length) return null;
    return { first: indexes[0], last: indexes[indexes.length - 1] };
}

function schedEventMatchesVehicle(event, vehicle) {
    if (event.vehicleId && vehicle?.id && String(event.vehicleId) === String(vehicle.id)) return true;
    const eventPlate = schedNormalizeKey(event.plateNumber);
    const vehiclePlate = schedNormalizeKey(vehicle?.plate);
    if (eventPlate && vehiclePlate && eventPlate === vehiclePlate) return true;
    const eventName = schedNormalizeKey(event.vehicleName);
    const vehicleName = schedNormalizeKey(vehicle?.name);
    return Boolean(eventName && vehicleName && (eventName.includes(vehicleName) || vehicleName.includes(eventName)));
}

function schedEventLabel(event) {
    return String(event.title || event.destination || event.requesterName || event.description || 'Reserved').trim();
}

function schedApplyCellBase(cell, options = {}) {
    cell.border = options.border || schedExcelBorder('thin');
    cell.alignment = {
        horizontal: options.horizontal || 'center',
        vertical: options.vertical || 'middle',
        wrapText: options.wrapText !== false
    };
    cell.font = options.font || { name: 'Calibri', size: 10, bold: true };
}

function schedTryMerge(ws, startRow, startCol, endRow, endCol) {
    if (startRow === endRow && startCol === endCol) return true;
    try {
        ws.mergeCells(startRow, startCol, endRow, endCol);
        return true;
    } catch {
        return false;
    }
}

function schedStyleMergedBlock(ws, startRow, startCol, endRow, endCol, fill, font = {}) {
    for (let r = startRow; r <= endRow; r++) {
        for (let c = startCol; c <= endCol; c++) {
            const cell = ws.getCell(r, c);
            cell.fill = schedExcelFill(fill);
            cell.border = schedExcelBorder('thin');
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
            cell.font = { name: 'Calibri', size: font.size || 10, bold: font.bold !== false, color: { argb: font.color || 'FF000000' } };
        }
    }
}

function getWeeksForMonth(year, month) {
    const weeks = [];
    const firstDay = new Date(year, month, 1);
    const day = firstDay.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    const currentMonday = new Date(firstDay);
    currentMonday.setDate(firstDay.getDate() + diff);

    let weekIndex = 1;
    const lastDay = new Date(year, month + 1, 0);
    while (currentMonday <= lastDay) {
        const saturday = new Date(currentMonday);
        saturday.setDate(currentMonday.getDate() + 5);
        
        weeks.push({
            weekNum: weekIndex,
            monday: new Date(currentMonday),
            saturday: saturday
        });
        
        currentMonday.setDate(currentMonday.getDate() + 7);
        weekIndex++;
    }
    return weeks;
}

function formatWeekRange(monday, saturday) {
    const mMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mStr = `${mMonths[monday.getMonth()]} ${monday.getDate()}`;
    const sStr = `${mMonths[saturday.getMonth()]} ${saturday.getDate()}`;
    const yearStr = monday.getFullYear() === saturday.getFullYear() 
        ? monday.getFullYear() 
        : `${monday.getFullYear()}/${saturday.getFullYear()}`;
    return `${mStr} - ${sStr}, ${yearStr}`;
}

function syncScheduleExportWeekInput() {
    const select = document.getElementById('schedExportWeek');
    if (!select) return;

    const prevSelectedVal = select.value;
    select.innerHTML = '';

    const weeks = getWeeksForMonth(scheduleCurrentYear, scheduleCurrentMonth);
    weeks.forEach(w => {
        const val = schedFmtDate(w.monday);
        const text = `Week ${w.weekNum} (${formatWeekRange(w.monday, w.saturday)})`;
        const option = document.createElement('option');
        option.value = val;
        option.text = text;
        select.appendChild(option);
    });

    if (scheduleSelectedDay) {
        const targetDate = schedParseDateLocal(scheduleSelectedDay);
        const mondayStr = schedFmtDate(schedGetMonday(targetDate));
        select.value = mondayStr;
    } else if (prevSelectedVal && Array.from(select.options).some(o => o.value === prevSelectedVal)) {
        select.value = prevSelectedVal;
    } else {
        const today = new Date();
        if (today.getFullYear() === scheduleCurrentYear && today.getMonth() === scheduleCurrentMonth) {
            const todayMondayStr = schedFmtDate(schedGetMonday(today));
            if (Array.from(select.options).some(o => o.value === todayMondayStr)) {
                select.value = todayMondayStr;
            }
        }
    }
}

function schedGetExportMonday() {
    const select = document.getElementById('schedExportWeek');
    if (select && select.value) {
        const parts = select.value.split('-');
        return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    }
    const refDate = scheduleSelectedDay
        ? schedParseDateLocal(scheduleSelectedDay)
        : new Date(scheduleCurrentYear, scheduleCurrentMonth, new Date().getDate());
    return schedGetMonday(refDate);
}

async function exportScheduleExcel(format) {
    if (typeof ExcelJS === 'undefined') {
        showToast('ExcelJS library not loaded. Please refresh and try again.', 'error');
        return;
    }

    const monday = schedGetExportMonday();
    const saturday = schedGetSaturday(monday);

    // Ensure data is loaded for the week
    const weekFrom = schedFmtDate(monday);
    const weekTo = schedFmtDate(saturday);
    await loadScheduleData(weekFrom, weekTo);

    const weekData = scheduleData.filter(e => {
        const d = e.scheduleDate ? e.scheduleDate.split('T')[0] : '';
        return d >= weekFrom && d <= weekTo;
    });

    const weekNum = schedGetWeekNumber(monday);
    const wb = new ExcelJS.Workbook();
    wb.creator = 'MPI Form Request System';
    wb.created = new Date();

    if (format === 'vehicle' || format === 'both') {
        buildVehicleSheetsV2(wb, monday, saturday, weekData, weekNum);
    }
    if (format === 'truck' || format === 'both') {
        buildTruckSheetV2(wb, monday, saturday, weekData, weekNum);
    }

    // Trigger download
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Vehicle_Schedule_${weekFrom}_to_${weekTo}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Excel file downloaded successfully!', 'success');
}

function buildVehicleSheetsV2(wb, monday, saturday, weekData, weekNum) {
    const vehicleList = schedMonitoringVehicles();
    const timeSlots = schedBuildTimeSlots('vehicle');
    const totalCols = Math.max(8, vehicleList.length + 1);

    for (let dayOff = 0; dayOff <= 5; dayOff++) {
        const dayDate = new Date(monday);
        dayDate.setDate(monday.getDate() + dayOff);
        const dateStr = schedFmtDate(dayDate);
        const dayName = schedDayName(dayDate.getDay());
        const dayEvents = weekData.filter(e => (e.scheduleDate || '').split('T')[0] === dateStr);
        const ws = wb.addWorksheet(dayName);

        ws.views = [{ showGridLines: false }];
        ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
        ws.getColumn(1).width = 23.9;
        vehicleList.forEach((vehicle, index) => {
            ws.getColumn(index + 2).width = schedVehicleStyle(vehicle, index).width || 13;
        });
        for (let c = vehicleList.length + 2; c <= totalCols; c++) {
            ws.getColumn(c).width = 13;
        }

        [1, 2].forEach(rowNo => { ws.getRow(rowNo).height = 15; });
        ws.getRow(3).height = 18.75;
        ws.getRow(4).height = 23.25;
        ws.getRow(5).height = 75.75;
        ws.getRow(6).height = 15.75;
        timeSlots.forEach((_, index) => {
            ws.getRow(7 + index).height = index >= timeSlots.length - 2 ? 21 : 25.5;
        });

        const titleCell = ws.getCell(1, 1);
        titleCell.value = `VEHICLE MONITORING SCHEDULE FOR ${dayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}`;
        titleCell.fill = schedExcelFill('FFFFF2CC');
        titleCell.font = { name: 'Calibri', size: 20, bold: true };
        titleCell.alignment = { horizontal: 'left', vertical: 'center' };
        schedTryMerge(ws, 1, 1, 2, totalCols);

        schedStyleMergedBlock(ws, 3, 1, 6, 1, 'FFC6E0B4', { size: 18 });
        ws.getCell(3, 1).value = `WEEK ${weekNum}`;
        schedTryMerge(ws, 3, 1, 6, 1);

        schedStyleMergedBlock(ws, 3, 2, 4, totalCols, 'FFDDEBF7', { size: 20 });
        ws.getCell(3, 2).value = dayName;
        schedTryMerge(ws, 3, 2, 4, totalCols);

        vehicleList.forEach((vehicle, index) => {
            const col = index + 2;
            const style = schedVehicleStyle(vehicle, index);
            const headerFontSize = schedNormalizeKey(vehicle?.name).includes('HRV') ? 10 : 14;

            schedStyleMergedBlock(ws, 5, col, 5, col, style.fill, {
                size: headerFontSize,
                color: style.fontColor || 'FF000000'
            });
            ws.getCell(5, col).value = schedVehicleHeader(vehicle);

            schedStyleMergedBlock(ws, 6, col, 6, col, style.fill, {
                size: 11,
                color: style.fontColor || 'FF000000'
            });
            ws.getCell(6, col).value = 'PLAN';
        });

        timeSlots.forEach((slot, index) => {
            const rowNo = 7 + index;
            const timeCell = ws.getCell(rowNo, 1);
            timeCell.value = slot.label;
            schedApplyCellBase(timeCell, { font: { name: 'Calibri', size: 16, bold: true } });

            vehicleList.forEach((_, vehicleIndex) => {
                const cell = ws.getCell(rowNo, vehicleIndex + 2);
                schedApplyCellBase(cell, { font: { name: 'Calibri', size: 10, bold: true } });
                if (slot.start >= 16 * 60 + 30) {
                    cell.fill = schedExcelFill('FF262626');
                }
            });
        });

        const occupied = new Set();
        const markOccupied = (r1, c1, r2, c2) => {
            for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) occupied.add(`${r}:${c}`);
            }
        };
        const isOccupied = (r1, c1, r2, c2) => {
            for (let r = r1; r <= r2; r++) {
                for (let c = c1; c <= c2; c++) {
                    if (occupied.has(`${r}:${c}`)) return true;
                }
            }
            return false;
        };

        ['MORNING MEETING', 'LUNCH BREAK'].forEach(label => {
            const event = dayEvents.find(ev => schedNormalizeKey(schedEventLabel(ev)).includes(schedNormalizeKey(label)));
            if (!event) return;
            const range = schedEventRangeForSlots(event, timeSlots);
            if (!range) return;
            const startRow = 7 + range.first;
            const endRow = 7 + range.last;
            if (isOccupied(startRow, 2, endRow, totalCols)) return;
            schedStyleMergedBlock(ws, startRow, 2, endRow, totalCols, 'FFFFFFFF', {
                size: label === 'LUNCH BREAK' ? 22 : 16,
                color: 'FFFF0000'
            });
            ws.getCell(startRow, 2).value = label;
            schedTryMerge(ws, startRow, 2, endRow, totalCols);
            markOccupied(startRow, 2, endRow, totalCols);
        });

        vehicleList.forEach((vehicle, vehicleIndex) => {
            const col = vehicleIndex + 2;
            const style = schedVehicleStyle(vehicle, vehicleIndex);
            const events = dayEvents
                .filter(ev => schedEventMatchesVehicle(ev, vehicle))
                .filter(ev => {
                    const label = schedNormalizeKey(schedEventLabel(ev));
                    return !label.includes('MORNINGMEETING') && !label.includes('LUNCHBREAK');
                })
                .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

            events.forEach(event => {
                const range = schedEventRangeForSlots(event, timeSlots);
                if (!range) return;
                const startRow = 7 + range.first;
                const endRow = 7 + range.last;
                if (isOccupied(startRow, col, endRow, col)) return;
                schedStyleMergedBlock(ws, startRow, col, endRow, col, style.fill, {
                    size: schedEventLabel(event).length > 60 ? 9 : 11,
                    color: style.fontColor || 'FF000000'
                });
                ws.getCell(startRow, col).value = schedEventLabel(event);
                schedTryMerge(ws, startRow, col, endRow, col);
                markOccupied(startRow, col, endRow, col);
            });
        });
    }
}

function buildTruckSheetV2(wb, monday, saturday, weekData, weekNum) {
    const truckList = schedTruckVehicles();
    const timeSlots = schedBuildTimeSlots('truck');
    const days = Array.from({ length: 6 }, (_, dayOff) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + dayOff);
        return date;
    });
    const totalCols = 1 + days.length * truckList.length;
    const ws = wb.addWorksheet('Plan');

    ws.views = [{ showGridLines: false }];
    ws.pageSetup = { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 };
    ws.getColumn(1).width = 23.85;
    for (let c = 2; c <= totalCols; c++) {
        ws.getColumn(c).width = 13;
    }

    ws.getRow(1).height = 26.25;
    ws.getRow(2).height = 14.45;
    [3, 4, 6].forEach(rowNo => { ws.getRow(rowNo).height = 23.45; });
    ws.getRow(5).height = 56.25;
    timeSlots.forEach((_, index) => { ws.getRow(7 + index).height = 25.5; });

    const monthA = monday.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const monthB = saturday.toLocaleDateString('en-US', { month: 'short' }).toUpperCase();
    const rangeLabel = monthA === monthB
        ? `${monthA}. ${String(monday.getDate()).padStart(2, '0')}-${String(saturday.getDate()).padStart(2, '0')}, ${saturday.getFullYear()}`
        : `${monthA}. ${String(monday.getDate()).padStart(2, '0')} - ${monthB}. ${String(saturday.getDate()).padStart(2, '0')}, ${saturday.getFullYear()}`;

    schedStyleMergedBlock(ws, 1, 1, 2, totalCols, 'FFFFD966', { size: 20 });
    ws.getCell(1, 1).value = `LOGISTICS TRUCK SCHEDULE: ${rangeLabel}`;
    schedTryMerge(ws, 1, 1, 2, totalCols);

    schedStyleMergedBlock(ws, 3, 1, 6, 1, 'FFC6E0B4', { size: 18 });
    ws.getCell(3, 1).value = `WEEK ${weekNum}`;
    schedTryMerge(ws, 3, 1, 6, 1);

    days.forEach((dayDate, dayIndex) => {
        const startCol = 2 + dayIndex * truckList.length;
        const endCol = startCol + truckList.length - 1;
        schedStyleMergedBlock(ws, 3, startCol, 3, endCol, 'FFDDEBF7', { size: 16 });
        ws.getCell(3, startCol).value = schedDayName(dayDate.getDay());
        schedTryMerge(ws, 3, startCol, 3, endCol);

        schedStyleMergedBlock(ws, 4, startCol, 4, endCol, 'FFDDEBF7', { size: 16 });
        ws.getCell(4, startCol).value = `${dayDate.getMonth() + 1}-${dayDate.getDate()}`;
        schedTryMerge(ws, 4, startCol, 4, endCol);

        truckList.forEach((truck, truckIndex) => {
            const col = startCol + truckIndex;
            const style = schedVehicleStyle(truck, truckIndex + 7);
            const fontSize = schedNormalizeKey(truck?.name).includes('FLEXI') ? 10 : 14;
            schedStyleMergedBlock(ws, 5, col, 5, col, style.fill, {
                size: fontSize,
                color: style.fontColor || 'FF000000'
            });
            ws.getCell(5, col).value = schedVehicleHeader(truck, true);
            schedStyleMergedBlock(ws, 6, col, 6, col, style.fill, {
                size: 11,
                color: style.fontColor || 'FF000000'
            });
            ws.getCell(6, col).value = 'PLAN';
        });
    });

    timeSlots.forEach((slot, index) => {
        const rowNo = 7 + index;
        const timeCell = ws.getCell(rowNo, 1);
        timeCell.value = slot.label;
        schedApplyCellBase(timeCell, { font: { name: 'Calibri', size: 16, bold: true } });
        for (let c = 2; c <= totalCols; c++) {
            const cell = ws.getCell(rowNo, c);
            schedApplyCellBase(cell, { font: { name: 'Calibri', size: 10, bold: true } });
            if (slot.start >= 16 * 60 + 30) {
                cell.fill = schedExcelFill('FF262626');
            }
        }
    });

    const occupied = new Set();
    const markOccupied = (r1, c1, r2, c2) => {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) occupied.add(`${r}:${c}`);
        }
    };
    const isOccupied = (r1, c1, r2, c2) => {
        for (let r = r1; r <= r2; r++) {
            for (let c = c1; c <= c2; c++) {
                if (occupied.has(`${r}:${c}`)) return true;
            }
        }
        return false;
    };

    days.forEach((dayDate, dayIndex) => {
        const dateStr = schedFmtDate(dayDate);
        const dayEvents = weekData.filter(e => (e.scheduleDate || '').split('T')[0] === dateStr);
        const dayStartCol = 2 + dayIndex * truckList.length;
        const dayEndCol = dayStartCol + truckList.length - 1;
        const meeting = dayEvents.find(ev => schedNormalizeKey(schedEventLabel(ev)).includes('MORNINGMEETING'));
        if (meeting) {
            const range = schedEventRangeForSlots(meeting, timeSlots);
            if (range) {
                const startRow = 7 + range.first;
                const endRow = 7 + range.last;
                if (!isOccupied(startRow, dayStartCol, endRow, dayEndCol)) {
                    schedStyleMergedBlock(ws, startRow, dayStartCol, endRow, dayEndCol, 'FFFFFFFF', { size: 15 });
                    ws.getCell(startRow, dayStartCol).value = 'MORNING MEETING';
                    schedTryMerge(ws, startRow, dayStartCol, endRow, dayEndCol);
                    markOccupied(startRow, dayStartCol, endRow, dayEndCol);
                }
            }
        }

        truckList.forEach((truck, truckIndex) => {
            const col = dayStartCol + truckIndex;
            const style = schedVehicleStyle(truck, truckIndex + 7);
            const events = dayEvents
                .filter(ev => schedEventMatchesVehicle(ev, truck))
                .filter(ev => !schedNormalizeKey(schedEventLabel(ev)).includes('MORNINGMEETING'))
                .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')));

            events.forEach(event => {
                const range = schedEventRangeForSlots(event, timeSlots);
                if (!range) return;
                const startRow = 7 + range.first;
                const endRow = 7 + range.last;
                if (isOccupied(startRow, col, endRow, col)) return;
                schedStyleMergedBlock(ws, startRow, col, endRow, col, style.fill, {
                    size: schedEventLabel(event).length > 65 ? 9 : 11,
                    color: style.fontColor || 'FF000000'
                });
                ws.getCell(startRow, col).value = schedEventLabel(event);
                schedTryMerge(ws, startRow, col, endRow, col);
                markOccupied(startRow, col, endRow, col);
            });
        });
    });

    const noteRow = 7 + timeSlots.length + 1;
    schedStyleMergedBlock(ws, noteRow, 1, noteRow, 1, 'FF00B0F0', { size: 16 });
    ws.getCell(noteRow, 1).value = 'NOTE:';
    schedStyleMergedBlock(ws, noteRow + 1, 1, noteRow + 1, Math.min(totalCols, 10), 'FFFFFF00', { size: 16 });
    ws.getCell(noteRow + 1, 1).value = 'PICK UP DANPLA IN BOSHOKU (MONDAY & THURSDAY)';
    schedTryMerge(ws, noteRow + 1, 1, noteRow + 1, Math.min(totalCols, 10));
    schedStyleMergedBlock(ws, noteRow + 2, 1, noteRow + 2, Math.min(totalCols, 10), 'FFFFFF00', { size: 16, color: 'FFFF0000' });
    ws.getCell(noteRow + 2, 1).value = 'MAKE SURE NO ANY PRODUCTS INSIDE THE DELIVERY CAR BEFORE LEAVING THE COMPANY';
    schedTryMerge(ws, noteRow + 2, 1, noteRow + 2, Math.min(totalCols, 10));
}

// ─── Guest Public Access ─────────────────────────────────────────────
async function showPublicDriverCalendar() {
    try {
        window.isGuestCalendarView = true;
        currentUser = null;

        // Load references (vehicles and drivers)
        if (typeof loadFleetReferences === 'function') {
            await loadFleetReferences();
        }

        // Configure guest/read-only UI
        document.getElementById('navItemDashboard').style.display = 'none';
        document.getElementById('navItemApply').style.display = 'none';
        document.getElementById('navItemSchedule').style.display = 'none';
        document.getElementById('navGroupApprovals').style.display = 'none';
        document.getElementById('navGroupSecurity').style.display = 'none';
        document.getElementById('navGroupAdmin').style.display = 'none';
        document.getElementById('navGroupHRAD').style.display = 'none';

        // Add guest navigation back to login if it doesn't exist
        let backToLoginBtn = document.getElementById('navItemGuestLogin');
        if (!backToLoginBtn) {
            const sideNav = document.getElementById('sideNav');
            if (sideNav) {
                backToLoginBtn = document.createElement('a');
                backToLoginBtn.id = 'navItemGuestLogin';
                backToLoginBtn.href = '#';
                backToLoginBtn.className = 'nav-item px-6 py-3 transition text-white flex items-center';
                backToLoginBtn.innerHTML = '<i class="fas fa-arrow-left w-6 text-left"></i> <span class="text-sm">Back to Login</span>';
                backToLoginBtn.onclick = function(e) {
                    e.preventDefault();
                    if (typeof logout === 'function') {
                        logout();
                    }
                };
                sideNav.appendChild(backToLoginBtn);
            }
        }
        if (backToLoginBtn) {
            backToLoginBtn.style.display = 'flex';
        }

        // Hide logout button
        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.style.display = 'none';
        }

        // Hide login view and show main app
        const loginView = document.getElementById('loginView');
        if (loginView) {
            loginView.style.opacity = '0';
            setTimeout(() => {
                loginView.classList.add('hidden');
                document.getElementById('appView')?.classList.remove('hidden');
                loginView.style.opacity = '1';
            }, 300);
        } else {
            document.getElementById('appView')?.classList.remove('hidden');
        }

        // Update Topbar for guest user
        const uName = document.getElementById('navUserName');
        const uRole = document.getElementById('navUserRole');
        if (uName) uName.innerText = 'Guest Driver/Truck Viewer';
        if (uRole) uRole.innerText = 'Read-Only Calendar View';

        // Switch to the schedule calendar section
        if (typeof switchSection === 'function') {
            switchSection('scheduleCalendar');
        }
    } catch (e) {
        console.error(e);
        if (typeof showToast === 'function') {
            showToast('Unable to open schedule calendar.', 'error');
        }
    }
}

// ─── Manage Fixed Weekly Schedules ──────────────────────────────────
let loadedFixedSchedules = [];

async function openFixedSchedulesModal() {
    const modal = document.getElementById('fixedSchedulesModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    await loadFixedSchedulesList();
}

function closeFixedSchedulesModal() {
    const modal = document.getElementById('fixedSchedulesModal');
    if (!modal) return;
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

async function loadFixedSchedulesList() {
    try {
        const res = await ApiClient.get('/fleet/fixed-schedules');
        loadedFixedSchedules = Array.isArray(res) ? res : [];
        renderFixedSchedulesList();
    } catch (err) {
        showToast('Unable to load fixed schedules.', 'error');
    }
}

const daysOfWeekNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function renderFixedSchedulesList() {
    const tbody = document.getElementById('fixedSchedulesTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (loadedFixedSchedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-6 text-center text-gray-400">No fixed weekly schedules seeded.</td></tr>';
        return;
    }

    loadedFixedSchedules.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = 'border-b hover:bg-gray-50';
        tr.innerHTML = `
            <td class="px-4 py-3 font-semibold text-gray-700">${daysOfWeekNames[item.dayOfWeek] || item.dayOfWeek}</td>
            <td class="px-4 py-3 text-gray-600 font-mono">${(item.startTime || '').substring(0, 5)} - ${(item.endTime || '').substring(0, 5)}</td>
            <td class="px-4 py-3 text-gray-800">${schedEscape(item.vehicleName)} <span class="text-xs text-gray-500 font-mono">(${schedEscape(item.plateNumber)})</span></td>
            <td class="px-4 py-3 text-gray-600">${schedEscape(item.driverName || 'Unassigned')}</td>
            <td class="px-4 py-3">
                <div class="font-bold text-gray-800">${schedEscape(item.title)}</div>
                ${item.description ? `<div class="text-gray-500 text-[10px]">${schedEscape(item.description)}</div>` : ''}
            </td>
            <td class="px-4 py-3 space-x-2">
                <button onclick="openEditFixedScheduleForm(${item.fixedScheduleId})" class="text-blue-600 hover:underline"><i class="fas fa-edit"></i> Edit</button>
                <button onclick="deleteFixedSchedule(${item.fixedScheduleId})" class="text-red-600 hover:underline"><i class="fas fa-trash"></i> Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function openAddFixedScheduleForm() {
    const modal = document.getElementById('fixedScheduleFormModal');
    if (!modal) return;
    document.getElementById('fixedScheduleFormTitle').innerText = 'Add Fixed Schedule';
    document.getElementById('fixedScheduleForm').reset();
    document.getElementById('fsId').value = '';
    
    populateFixedScheduleFormDropdowns();
    
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function openEditFixedScheduleForm(id) {
    const record = loadedFixedSchedules.find(r => r.fixedScheduleId === id);
    if (!record) return;

    const modal = document.getElementById('fixedScheduleFormModal');
    if (!modal) return;
    document.getElementById('fixedScheduleFormTitle').innerText = 'Edit Fixed Schedule';
    
    populateFixedScheduleFormDropdowns();

    document.getElementById('fsId').value = record.fixedScheduleId;
    document.getElementById('fsVehicle').value = record.vehicleId;
    document.getElementById('fsDriver').value = record.driverId || '';
    document.getElementById('fsDayOfWeek').value = record.dayOfWeek;
    document.getElementById('fsStartTime').value = (record.startTime || '').substring(0, 5);
    document.getElementById('fsEndTime').value = (record.endTime || '').substring(0, 5);
    document.getElementById('fsTitle').value = record.title;
    document.getElementById('fsDescription').value = record.description || '';
    document.getElementById('fsType').value = record.scheduleType || 'RECURRING';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeFixedScheduleFormModal() {
    const modal = document.getElementById('fixedScheduleFormModal');
    if (!modal) return;
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

function populateFixedScheduleFormDropdowns() {
    const vSelect = document.getElementById('fsVehicle');
    const dSelect = document.getElementById('fsDriver');
    if (!vSelect || !dSelect) return;

    // Populate Vehicles
    vSelect.innerHTML = '<option value="">Select Vehicle</option>';
    (databaseVehicles || []).forEach(v => {
        const availability = String(v.status || v.availabilityStatusCode || 'Available');
        vSelect.innerHTML += `<option value="${schedEscape(v.id)}">${schedEscape(v.name)} (${schedEscape(v.plate)}) — ${schedEscape(availability)}</option>`;
    });

    // Populate Drivers
    dSelect.innerHTML = '<option value="">Select Driver (Optional)</option>';
    (databaseDrivers || []).forEach(d => {
        dSelect.innerHTML += `<option value="${schedEscape(d.driverId)}">${schedEscape(d.fullName)} — Available</option>`;
    });
}

async function saveFixedScheduleForm(event) {
    event.preventDefault();
    
    const id = document.getElementById('fsId').value;
    const body = {
        vehicleId: Number(document.getElementById('fsVehicle').value),
        driverId: document.getElementById('fsDriver').value ? Number(document.getElementById('fsDriver').value) : null,
        dayOfWeek: Number(document.getElementById('fsDayOfWeek').value),
        startTime: document.getElementById('fsStartTime').value + ':00',
        endTime: document.getElementById('fsEndTime').value + ':00',
        title: document.getElementById('fsTitle').value.trim(),
        description: document.getElementById('fsDescription').value.trim() || null,
        scheduleType: document.getElementById('fsType').value
    };

    try {
        if (id) {
            await ApiClient.put(`/fleet/fixed-schedule/${id}`, body);
            showToast('Fixed schedule updated successfully.');
        } else {
            await ApiClient.post('/fleet/fixed-schedule', body);
            showToast('Fixed schedule created successfully.');
        }
        closeFixedScheduleFormModal();
        await loadFixedSchedulesList();
        await loadAndRenderScheduleMonth();
    } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to save fixed schedule.', 'error');
    }
}

async function deleteFixedSchedule(id) {
    if (!confirm('Are you sure you want to delete this fixed schedule?')) return;
    try {
        await ApiClient.delete(`/fleet/fixed-schedule/${id}`);
        showToast('Fixed schedule deleted successfully.');
        await loadFixedSchedulesList();
        await loadAndRenderScheduleMonth();
    } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to delete fixed schedule.', 'error');
    }
}

// ─── Window exports ──────────────────────────────────────────────────
window.initializeScheduleCalendar = initializeScheduleCalendar;
window.loadScheduleData = loadScheduleData;
window.renderScheduleCalendar = renderScheduleCalendar;
window.navigateScheduleMonth = navigateScheduleMonth;
window.applyScheduleFilters = applyScheduleFilters;
window.clearScheduleFilters = clearScheduleFilters;
window.openScheduleDayModal = openScheduleDayModal;
window.setScheduleDayView = setScheduleDayView;
window.setScheduleDayGridType = setScheduleDayGridType;
window.closeScheduleDayModal = closeScheduleDayModal;
window.exportScheduleExcel = exportScheduleExcel;
window.populateScheduleFilterDropdowns = populateScheduleFilterDropdowns;
window.showPublicDriverCalendar = showPublicDriverCalendar;
window.openFixedSchedulesModal = openFixedSchedulesModal;
window.closeFixedSchedulesModal = closeFixedSchedulesModal;
window.openAddFixedScheduleForm = openAddFixedScheduleForm;
window.closeFixedScheduleFormModal = closeFixedScheduleFormModal;
window.saveFixedScheduleForm = saveFixedScheduleForm;
window.openEditFixedScheduleForm = openEditFixedScheduleForm;
window.deleteFixedSchedule = deleteFixedSchedule;

function openServiceScheduleRequestModal() {
    const modal = document.getElementById('serviceScheduleRequestModal');
    if (!modal) return;

    // Reset form
    document.getElementById('serviceScheduleRequestForm')?.reset();

    // Default to today's date
    const today = new Date().toISOString().split('T')[0];
    const dateInput = document.getElementById('serviceRequestDate');
    if (dateInput) dateInput.value = today;

    // Populate Vehicles
    const vehicleSelect = document.getElementById('serviceRequestVehicle');
    if (vehicleSelect) {
        vehicleSelect.innerHTML = '';
        (databaseVehicles || []).forEach(v => {
            const opt = document.createElement('option');
            opt.value = v.id;
            opt.textContent = `${v.name} (${v.plate}) — ${v.status || v.availabilityStatusCode || 'Available'}`;
            vehicleSelect.appendChild(opt);
        });
        const crv = (databaseVehicles || []).find(v => v.name?.toUpperCase().includes('CRV'));
        if (crv) vehicleSelect.value = crv.id;
        vehicleSelect.disabled = true;
    }

    // Populate Drivers
    const driverSelect = document.getElementById('serviceRequestDriver');
    if (driverSelect) {
        driverSelect.innerHTML = '';
        (databaseDrivers || []).forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.driverId;
            opt.textContent = `${d.fullName} — Available`;
            driverSelect.appendChild(opt);
        });
        const jt = (databaseDrivers || []).find(d => d.fullName?.toUpperCase().includes('TURRECHA'));
        if (jt) driverSelect.value = jt.driverId;
        driverSelect.disabled = true;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeServiceScheduleRequestModal() {
    const modal = document.getElementById('serviceScheduleRequestModal');
    if (!modal) return;
    modal.classList.remove('flex');
    modal.classList.add('hidden');
}

async function saveServiceScheduleRequest(event) {
    event.preventDefault();
    const date = document.getElementById('serviceRequestDate').value;
    const startTime = document.getElementById('serviceRequestStartTime').value;
    const endTime = document.getElementById('serviceRequestEndTime').value;
    const destination = document.getElementById('serviceRequestDestination').value;
    const purpose = document.getElementById('serviceRequestPurpose').value;
    const vehicleId = Number(document.getElementById('serviceRequestVehicle').value);
    const driverId = Number(document.getElementById('serviceRequestDriver').value);

    try {
        await ApiClient.post('/fleet/service-request', {
            date,
            startTime,
            endTime,
            destination,
            purpose,
            vehicleId,
            driverId
        });
        showToast('Service schedule requested and auto-approved successfully.');
        closeServiceScheduleRequestModal();
        await loadAndRenderScheduleMonth();
    } catch (err) {
        showToast(err instanceof ApiError ? err.message : 'Failed to submit service schedule request.', 'error');
    }
}

window.openServiceScheduleRequestModal = openServiceScheduleRequestModal;
window.closeServiceScheduleRequestModal = closeServiceScheduleRequestModal;
window.saveServiceScheduleRequest = saveServiceScheduleRequest;
