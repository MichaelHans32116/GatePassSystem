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
    
    // Check if current user is an authorized HR manager
    const authorizedHR = ['GA120', 'GA150', 'GA133', 'GA407'];
    const activeUser = typeof currentUser !== 'undefined' ? currentUser : null;
    const btn = document.getElementById('btnManageFixedSchedules');
    if (btn) {
        if (activeUser && authorizedHR.includes(activeUser.id)) {
            btn.classList.remove('hidden');
        } else {
            btn.classList.add('hidden');
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
}

// ─── Data Loading ────────────────────────────────────────────────────
async function loadScheduleData(from, to) {
    if (!isDatabaseSession()) return;
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
            html += `<div class="text-[9px] leading-tight truncate px-1.5 py-0.5 rounded border mb-0.5 ${pillCls}" title="${(ev.title || ev.vehicleName || '').replace(/"/g, '&quot;')}">`;
            html += `${timeLabel ? timeLabel + ' ' : ''}${ev.vehicleName || ev.title || ''}`;
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
function openScheduleDayModal(dateStr) {
    scheduleSelectedDay = dateStr;
    const modal = document.getElementById('scheduleDayModal');
    const titleEl = document.getElementById('scheduleDayModalTitle');
    const bodyEl = document.getElementById('scheduleDayModalBody');
    const countEl = document.getElementById('scheduleDayModalCount');
    if (!modal || !titleEl || !bodyEl) return;

    const d = schedParseDateLocal(dateStr);
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    titleEl.textContent = `Schedule for ${d.toLocaleDateString('en-US', opts)}`;

    const events = schedEventsForDate(dateStr);
    countEl.textContent = `${events.length} ${events.length === 1 ? 'entry' : 'entries'}`;

    if (events.length === 0) {
        bodyEl.innerHTML = `
            <div class="py-12 text-center">
                <i class="fas fa-calendar-day text-4xl text-gray-200 mb-3"></i>
                <p class="text-sm text-gray-400">No scheduled entries for this day.</p>
            </div>`;
    } else {
        // Sort by start time
        events.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));

        let listHtml = '<div class="space-y-3">';
        events.forEach(ev => {
            const timeRange = ev.startTime && ev.endTime
                ? `${schedFormatTime12(ev.startTime)} – ${schedFormatTime12(ev.endTime)}`
                : (ev.startTime ? schedFormatTime12(ev.startTime) : 'All Day');

            listHtml += `
            <div class="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition">
                <div class="flex items-start justify-between mb-1.5">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-clock text-gray-400 text-xs"></i>
                        <span class="text-xs font-bold text-gray-700">${timeRange}</span>
                    </div>
                    ${schedStatusBadge(ev.statusCode)}
                </div>
                <div class="ml-5 space-y-1">
                    <div class="text-sm font-semibold text-gray-800">${ev.title || 'Untitled'}</div>
                    <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500">
                        <span><i class="fas fa-car mr-1 text-gray-400"></i>${ev.vehicleName || '—'} ${ev.plateNumber ? '(' + ev.plateNumber + ')' : ''}</span>
                        <span><i class="fas fa-user mr-1 text-gray-400"></i>${ev.driverName || '—'}</span>
                    </div>
                    ${ev.description ? `<div class="text-xs text-gray-500 mt-0.5">${ev.description}</div>` : ''}
                    ${ev.scheduleSource === 'RESERVATION' ? `
                    <div class="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-gray-500 mt-1 pt-1 border-t border-gray-100">
                        ${ev.requesterName ? `<span><i class="fas fa-user-tag mr-1 text-gray-400"></i>${ev.requesterName}</span>` : ''}
                        ${ev.destination ? `<span><i class="fas fa-map-marker-alt mr-1 text-gray-400"></i>${ev.destination}</span>` : ''}
                        ${ev.controlNo ? `<span><i class="fas fa-hashtag mr-1 text-gray-400"></i>${ev.controlNo}</span>` : ''}
                    </div>` : ''}
                </div>
            </div>`;
        });
        listHtml += '</div>';
        bodyEl.innerHTML = listHtml;
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
async function exportScheduleExcel(format) {
    if (typeof ExcelJS === 'undefined') {
        showToast('ExcelJS library not loaded. Please refresh and try again.', 'error');
        return;
    }

    // Determine the reference date and week range
    const refDate = scheduleSelectedDay
        ? schedParseDateLocal(scheduleSelectedDay)
        : new Date(scheduleCurrentYear, scheduleCurrentMonth, new Date().getDate());

    const monday = schedGetMonday(refDate);
    const saturday = schedGetSaturday(refDate);

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
        buildVehicleSheets(wb, monday, saturday, weekData, weekNum);
    }
    if (format === 'truck' || format === 'both') {
        buildTruckSheet(wb, monday, saturday, weekData, weekNum);
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

// ─── Vehicle Format Sheets (one per day, Mon-Sat) ────────────────────
function buildVehicleSheets(wb, monday, saturday, weekData, weekNum) {
    const vehicles = (databaseVehicles || []).filter(v => {
        const type = (v.vehicleType || v.type || '').toLowerCase();
        return type !== 'truck';
    });
    if (vehicles.length === 0 && databaseVehicles.length > 0) {
        // If no non-truck vehicles, use all
        vehicles.push(...databaseVehicles);
    }
    // Use all vehicles if empty
    const vehicleList = vehicles.length > 0 ? vehicles : (databaseVehicles || []);

    // Time slots: 5:30 to 19:00 in 30-min increments
    const timeSlots = [];
    for (let h = 5; h < 19; h++) {
        for (let m = 0; m < 60; m += 30) {
            if (h === 5 && m === 0) continue; // Start at 5:30
            const startH = h; const startM = m;
            let endH = h; let endM = m + 30;
            if (endM >= 60) { endM = 0; endH++; }
            const fmt = (hr, mn) => `${hr}:${String(mn).padStart(2,'0')}`;
            timeSlots.push({
                label: `${fmt(startH,startM)} ~ ${fmt(endH,endM)}`,
                startKey: `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}`,
                endKey: `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`
            });
        }
    }

    // For each day Mon-Sat
    for (let dayOff = 0; dayOff <= 5; dayOff++) {
        const dayDate = new Date(monday);
        dayDate.setDate(monday.getDate() + dayOff);
        const dateStr = schedFmtDate(dayDate);
        const dayEvents = weekData.filter(e => (e.scheduleDate || '').split('T')[0] === dateStr);

        const dayName = schedDayName(dayDate.getDay());
        const sheetName = dayName.substring(0, 3) + ' ' + dayDate.getDate();
        const ws = wb.addWorksheet(sheetName);

        // Styling constants
        const blueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155CA2' } };
        const lightYellowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFDE7' } };
        const whiteFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10, name: 'Calibri' };
        const defaultFont = { size: 9, name: 'Calibri' };
        const headerFont = { bold: true, size: 10, name: 'Calibri' };
        const thinBorder = {
            top: { style: 'thin' }, bottom: { style: 'thin' },
            left: { style: 'thin' }, right: { style: 'thin' }
        };

        const dateFormatted = dayDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).toUpperCase();

        // Column widths
        ws.getColumn(1).width = 16;
        vehicleList.forEach((_, vi) => { ws.getColumn(vi + 2).width = 22; });

        // Row 1: Title
        const titleCell = ws.getCell('A1');
        titleCell.value = `VEHICLE MONITORING SCHEDULE FOR ${dateFormatted}`;
        titleCell.font = { bold: true, size: 12, name: 'Calibri' };
        ws.mergeCells(1, 1, 1, vehicleList.length + 1);

        // Row 3: Week number + Day
        const weekCell = ws.getCell('A3');
        weekCell.value = `WEEK ${weekNum} — ${dayName.toUpperCase()}`;
        weekCell.font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF155CA2' } };
        ws.mergeCells(3, 1, 3, vehicleList.length + 1);

        // Row 5: Vehicle headers
        const headerRow = ws.getRow(5);
        headerRow.getCell(1).value = 'TIME';
        headerRow.getCell(1).font = whiteFont;
        headerRow.getCell(1).fill = blueFill;
        headerRow.getCell(1).border = thinBorder;
        headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

        vehicleList.forEach((v, vi) => {
            const driver = v.driver || '—';
            const cell = headerRow.getCell(vi + 2);
            cell.value = `${v.name}\n${v.plate}\n${driver}`;
            cell.font = whiteFont;
            cell.fill = blueFill;
            cell.border = thinBorder;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
        headerRow.height = 42;

        // Row 6: "PLAN" labels
        const planRow = ws.getRow(6);
        planRow.getCell(1).value = '';
        planRow.getCell(1).border = thinBorder;
        vehicleList.forEach((_, vi) => {
            const cell = planRow.getCell(vi + 2);
            cell.value = 'PLAN';
            cell.font = { bold: true, size: 8, name: 'Calibri', color: { argb: 'FF666666' } };
            cell.alignment = { horizontal: 'center', vertical: 'middle' };
            cell.border = thinBorder;
        });

        // Row 7+: Time slots
        timeSlots.forEach((slot, si) => {
            const row = ws.getRow(7 + si);
            row.getCell(1).value = slot.label;
            row.getCell(1).font = defaultFont;
            row.getCell(1).border = thinBorder;
            row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

            vehicleList.forEach((v, vi) => {
                const cell = row.getCell(vi + 2);
                cell.border = thinBorder;
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.font = defaultFont;

                // Find events for this vehicle & time slot
                const matching = dayEvents.filter(ev => {
                    if (String(ev.vehicleId) !== String(v.id)) return false;
                    const evStart = (ev.startTime || '').substring(0, 5);
                    const evEnd = (ev.endTime || '').substring(0, 5);
                    return evStart <= slot.startKey && evEnd > slot.startKey;
                });

                if (matching.length > 0) {
                    cell.value = matching.map(m => m.title || m.destination || m.requesterName || '').join(', ');
                    cell.fill = lightYellowFill;
                }
            });
        });
    }
}

// ─── Truck Format Sheet (single sheet) ───────────────────────────────
function buildTruckSheet(wb, monday, saturday, weekData, weekNum) {
    // Truck definitions
    const truckDefs = [
        { label: 'ISUZU CANTER', plate: 'ZJE 745', driver: 'ALEX' },
        { label: 'MITSUBISHI FUSO', plate: 'DAV 3864', driver: 'ALVIN' },
        { label: 'FLEXI VAN', plate: 'NAW 3504', driver: 'ADMIN' }
    ];

    // Time slots: 7:30 to 19:00
    const timeSlots = [];
    for (let h = 7; h < 19; h++) {
        for (let m = 0; m < 60; m += 30) {
            if (h === 7 && m === 0) continue;
            const startH = h; const startM = m;
            let endH = h; let endM = m + 30;
            if (endM >= 60) { endM = 0; endH++; }
            const fmt = (hr, mn) => `${hr}:${String(mn).padStart(2,'0')}`;
            timeSlots.push({
                label: `${fmt(startH,startM)} ~ ${fmt(endH,endM)}`,
                startKey: `${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}`,
                endKey: `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`
            });
        }
    }

    const ws = wb.addWorksheet('Plan');
    const days = [];
    for (let d = 0; d <= 5; d++) {
        const dt = new Date(monday);
        dt.setDate(monday.getDate() + d);
        days.push(dt);
    }

    const monStr = schedFmtDate(monday);
    const satStr = schedFmtDate(saturday);

    // Styling
    const blueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF155CA2' } };
    const lightBlueFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3F2FD' } };
    const whiteFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9, name: 'Calibri' };
    const defaultFont = { size: 8, name: 'Calibri' };
    const thinBorder = {
        top: { style: 'thin' }, bottom: { style: 'thin' },
        left: { style: 'thin' }, right: { style: 'thin' }
    };

    // Column A width for time
    ws.getColumn(1).width = 14;

    // Total columns: 1 (time) + days * trucks
    const totalCols = 1 + days.length * truckDefs.length;
    for (let c = 2; c <= totalCols; c++) {
        ws.getColumn(c).width = 18;
    }

    // Row 1: Title
    const titleCell = ws.getCell('A1');
    const dateRangeStr = `${monday.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })} - ${saturday.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
    titleCell.value = `LOGISTICS TRUCK SCHEDULE: ${dateRangeStr.toUpperCase()}`;
    titleCell.font = { bold: true, size: 12, name: 'Calibri' };
    ws.mergeCells(1, 1, 1, totalCols);

    // Row 3: WEEK N + day group headers
    const weekRow = ws.getRow(3);
    weekRow.getCell(1).value = `WEEK ${weekNum}`;
    weekRow.getCell(1).font = { bold: true, size: 10, name: 'Calibri', color: { argb: 'FF155CA2' } };
    weekRow.getCell(1).border = thinBorder;

    days.forEach((dayDate, di) => {
        const startCol = 2 + di * truckDefs.length;
        const endCol = startCol + truckDefs.length - 1;
        const cell = weekRow.getCell(startCol);
        cell.value = schedDayName(dayDate.getDay()).toUpperCase();
        cell.font = whiteFont;
        cell.fill = blueFill;
        cell.border = thinBorder;
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        ws.mergeCells(3, startCol, 3, endCol);
    });

    // Row 4: Dates per group
    const dateRow = ws.getRow(4);
    dateRow.getCell(1).value = '';
    dateRow.getCell(1).border = thinBorder;
    days.forEach((dayDate, di) => {
        const startCol = 2 + di * truckDefs.length;
        const endCol = startCol + truckDefs.length - 1;
        const cell = dateRow.getCell(startCol);
        cell.value = dayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        cell.font = { bold: true, size: 9, name: 'Calibri' };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
        ws.mergeCells(4, startCol, 4, endCol);
    });

    // Row 5: Truck headers repeated per day
    const truckRow = ws.getRow(5);
    truckRow.getCell(1).value = 'TIME';
    truckRow.getCell(1).font = whiteFont;
    truckRow.getCell(1).fill = blueFill;
    truckRow.getCell(1).border = thinBorder;
    truckRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    days.forEach((_, di) => {
        truckDefs.forEach((truck, ti) => {
            const col = 2 + di * truckDefs.length + ti;
            const cell = truckRow.getCell(col);
            cell.value = `${truck.label}\n(${truck.plate} / ${truck.driver})`;
            cell.font = whiteFont;
            cell.fill = blueFill;
            cell.border = thinBorder;
            cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
    });
    truckRow.height = 38;

    // Row 6: "PLAN" labels
    const planRow = ws.getRow(6);
    planRow.getCell(1).value = '';
    planRow.getCell(1).border = thinBorder;
    for (let c = 2; c <= totalCols; c++) {
        const cell = planRow.getCell(c);
        cell.value = 'PLAN';
        cell.font = { bold: true, size: 7, name: 'Calibri', color: { argb: 'FF888888' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.border = thinBorder;
    }

    // Row 7+: Time slots
    timeSlots.forEach((slot, si) => {
        const row = ws.getRow(7 + si);
        row.getCell(1).value = slot.label;
        row.getCell(1).font = defaultFont;
        row.getCell(1).border = thinBorder;
        row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

        days.forEach((dayDate, di) => {
            const dateStr = schedFmtDate(dayDate);
            const dayEvents = weekData.filter(e => (e.scheduleDate || '').split('T')[0] === dateStr);

            truckDefs.forEach((truck, ti) => {
                const col = 2 + di * truckDefs.length + ti;
                const cell = row.getCell(col);
                cell.border = thinBorder;
                cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
                cell.font = defaultFont;

                // Match events to truck by plate number (fuzzy match)
                const matching = dayEvents.filter(ev => {
                    const evPlate = (ev.plateNumber || '').replace(/\s/g, '').toUpperCase();
                    const truckPlate = truck.plate.replace(/\s/g, '').toUpperCase();
                    if (evPlate === truckPlate) return true;
                    // Also match by vehicle name containing truck label
                    const evName = (ev.vehicleName || '').toUpperCase();
                    if (evName.includes(truck.label.split(' ')[0])) return true;
                    return false;
                }).filter(ev => {
                    const evStart = (ev.startTime || '').substring(0, 5);
                    const evEnd = (ev.endTime || '').substring(0, 5);
                    return evStart <= slot.startKey && evEnd > slot.startKey;
                });

                if (matching.length > 0) {
                    cell.value = matching.map(m => m.title || m.destination || m.requesterName || '').join(', ');
                    cell.fill = lightBlueFill;
                }
            });
        });
    });
}

// ─── Guest Public Access ─────────────────────────────────────────────
async function showPublicDriverCalendar() {
    try {
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
        document.getElementById('navGroupHR').style.display = 'none';

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
            <td class="px-4 py-3 text-gray-800">${item.vehicleName} <span class="text-xs text-gray-500 font-mono">(${item.plateNumber})</span></td>
            <td class="px-4 py-3 text-gray-600">${item.driverName || 'Unassigned'}</td>
            <td class="px-4 py-3">
                <div class="font-bold text-gray-800">${item.title}</div>
                \${item.description ? `<div class="text-gray-500 text-[10px]">\${item.description}</div>` : ''}
            </td>
            <td class="px-4 py-3 space-x-2">
                <button onclick="openEditFixedScheduleForm(\${item.fixedScheduleId})" class="text-blue-600 hover:underline"><i class="fas fa-edit"></i> Edit</button>
                <button onclick="deleteFixedSchedule(\${item.fixedScheduleId})" class="text-red-600 hover:underline"><i class="fas fa-trash"></i> Delete</button>
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
        vSelect.innerHTML += `<option value="\${v.id}">\${v.name} (\${v.plate})</option>`;
    });

    // Populate Drivers
    dSelect.innerHTML = '<option value="">Select Driver (Optional)</option>';
    (databaseDrivers || []).forEach(d => {
        dSelect.innerHTML += `<option value="\${d.driverId}">\${d.fullName}</option>`;
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
            await ApiClient.put(`/fleet/fixed-schedule/\${id}`, {
                body: JSON.stringify(body)
            });
            showToast('Fixed schedule updated successfully.');
        } else {
            await ApiClient.post('/fleet/fixed-schedule', {
                body: JSON.stringify(body)
            });
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
        await ApiClient.delete(`/fleet/fixed-schedule/\${id}`);
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
