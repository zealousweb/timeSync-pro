// Constants
const WORKDAY_MS = 8.5 * 60 * 60 * 1000;
const HALF_WORKDAY_MS = 4 * 60 * 60 * 1000;
const PARTIAL_WORKDAY_MS = 1 * 60 * 60 * 1000;
const WEEKLY_TARGET_MS = 42.5 * 60 * 60 * 1000;
const weeklyBtn = document.getElementById("weeklyBtn");
const monthlyBtn = document.getElementById("monthlyBtn");
const table = document.getElementById("employeeTable");
const calendar = document.getElementById("monthlyCalendar");
const dashboardTitle = document.getElementById("dashboardTitle");
const currentWeek = document.getElementById("currentWeek");

// ================================
// Merge helpers
// ================================
function toMinutes(t) {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
}

/**
 * Merges server timeData for one date with manualPunches overrides.
 * Override actions in manualPunches[dateStr]:
 *   { action:'edit',   seqNo,              time, type } — edit server punch by seqNo
 *   { action:'edit',   origTime, origType, time, type } — edit auto/system punch
 *   { action:'add',    id,                 time, type } — user-added punch
 *   { action:'delete', seqNo }                          — delete a fetched server punch
 *
 * includeDeleted=false (default) excludes deleted punches — used for time calculations.
 * includeDeleted=true            marks deleted punches with deleted:true — used for modal UI.
 */
function getMergedPunchesForDate(dateStr, timeData, manualPunches, includeDeleted = false) {
    const punches = (timeData[dateStr] || []).map(p => ({ ...p }));
    const overrides = (manualPunches || {})[dateStr] || [];

    // Collect seqNos that are marked for deletion
    const deletedSeqNos = new Set(
        overrides.filter(o => o.action === 'delete' && o.seqNo).map(o => o.seqNo)
    );

    for (const o of overrides) {
        if (o.action === 'add') {
            punches.push({ time: o.time, type: o.type, manualId: o.id });
        } else if (o.action === 'edit') {
            let idx;
            if (o.seqNo) {
                idx = punches.findIndex(p => p.seqNo === o.seqNo);
            } else {
                idx = punches.findIndex(
                    p => !p.seqNo && !p.manualId && p.time === o.origTime && p.type === o.origType
                );
            }
            if (idx !== -1) {
                punches[idx] = {
                    ...punches[idx],
                    time: o.time,
                    type: o.type,
                    edited: true,
                    _origTime: o.origTime,   // for auto punches: stable original time
                    _origType: o.origType,   // for auto punches: stable original type
                    _origDisplayTime: punches[idx]._origDisplayTime || punches[idx].time, // first-ever time
                    _origDisplayType: punches[idx]._origDisplayType || punches[idx].type,
                };
            }
        }
    }

    const result = [];
    for (const p of punches) {
        if (p.seqNo && deletedSeqNos.has(p.seqNo)) {
            if (includeDeleted) result.push({ ...p, deleted: true });
            // else skip — excluded from calculations
        } else {
            result.push(p);
        }
    }

    return result.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

function getMergedTimeData(timeData, manualPunches) {
    const merged = {};
    const allDates = new Set([...Object.keys(timeData), ...Object.keys(manualPunches || {})]);
    for (const d of allDates) {
        merged[d] = getMergedPunchesForDate(d, timeData, manualPunches);
    }
    return merged;
}

// ================================
// Existing helpers
// ================================
function calculateTotalMinutes(punches) {
    return punches.reduce((total, p) => {
        if (!p.in || !p.out) return total;
        const [inH, inM] = p.in.split(":").map(Number);
        const [outH, outM] = p.out.split(":").map(Number);
        return total + ((outH * 60 + outM) - (inH * 60 + inM));
    }, 0);
}

function minutesToHHMM(mins) {
    const h = Math.floor(mins / 60).toString().padStart(2, '0');
    const m = (mins % 60).toString().padStart(2, '0');
    return `${h}:${m}`;
}

function getLeaveMinutesByType(type) {
    if (type === 'full') return WORKDAY_MS / 60000;
    if (type === 'half') return HALF_WORKDAY_MS / 60000;
    if (type === 'partial') return PARTIAL_WORKDAY_MS / 60000;
    return 0;
}

function getLeaveMinutesForDate(leaveData, dateStr) {
    const record = leaveData && leaveData[dateStr];
    if (!record) return 0;
    return getLeaveMinutesByType(record.type);
}

// Holidays count as a full leave day unless an explicit leave entry exists
function getEffectiveLeaveMinutesForDate(leaveData, holidayData, dateStr) {
    if (leaveData[dateStr]) return getLeaveMinutesByType(leaveData[dateStr].type);
    if (holidayData && holidayData[dateStr]) return WORKDAY_MS / 60000;
    return 0;
}

let selectedLeaveDate = null;

function toAMPM(timeStr) {
    if (!timeStr || !timeStr.includes(":")) return "--:--";
    const [hour, minute] = timeStr.split(":").map(Number);
    const period = hour >= 12 ? "PM" : "AM";
    const hour12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${hour12.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')} ${period}`;
}

function getCurrentTimeHHMM() {
    const now = new Date();
    const hh = now.getHours().toString().padStart(2, '0');
    const mm = now.getMinutes().toString().padStart(2, '0');
    return `${hh}:${mm}`;
}

function formatPunchPairs(punches, dateStr) {
    const pairs = [];
    const todayStr = new Date().toLocaleDateString('en-GB');
    let i = 0;

    while (i < punches.length) {
        const current = punches[i];
        const next = punches[i + 1];
        if (current.type === 'in' && next?.type === 'out') {
            pairs.push({ in: current.time, out: next.time, diff: timeDiff(next.time, punches[i + 2]?.time), autoFilled: false });
            i += 2;
        } else if (current.type === 'in' && (!next || next.type === 'in')) {
            const isToday = (dateStr === todayStr);
            const prev = punches[i - 1];
            const nextIn = next && next.type === 'in' ? next : undefined;
            const outTime = isToday ? getCurrentTimeHHMM() : null;
            pairs.push({ in: current.time, out: outTime, diff: timeDiff(outTime, punches[i + 2]?.time), autoFilled: isToday });
            i += 1;
        } else if (current.type === 'out') {
            pairs.push({ in: null, out: current.time, diff: timeDiff(current.time, punches[i + 2]?.time), autoFilled: false });
            i += 1;
        } else {
            i += 1;
        }
    }
    return pairs;
}

function timeDiff(inTime, outTime) {
    if (!inTime || !outTime) return "";
    const [inH, inM] = inTime.split(":").map(Number);
    const [outH, outM] = outTime.split(":").map(Number);
    const diff = (outH * 60 + outM) - (inH * 60 + inM);
    if (diff < 0) return "--:--";
    const hh = Math.floor(diff / 60).toString().padStart(2, '0');
    const mm = (diff % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
}

function getWeekday(dateStr) {
    const [day, month, year] = dateStr.split('/');
    const date = new Date(`${year}-${month}-${day}`);
    return date.toLocaleDateString('en-US', { weekday: 'long' });
}

function hasMissingPunches(punchPairs) {
    if (!punchPairs || punchPairs.length === 0) return true;
    return punchPairs.some(pair => !pair.in || !pair.out);
}

let currentMonday = null;

function getMonday(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = ((day + 6) % 7);
    d.setDate(d.getDate() - diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

// ================================
// Render functions (use merged data)
// ================================
function renderWeeklyTableForMonday(monday) {
    const tbody = document.getElementById("weekData");
    if (!tbody) return;
    tbody.innerHTML = "";
    let weeklyTotal = 0;

    const mondayStart = new Date(monday);
    mondayStart.setHours(0, 0, 0, 0);
    const sundayEnd = new Date(mondayStart);
    sundayEnd.setDate(mondayStart.getDate() + 6);
    sundayEnd.setHours(23, 59, 59, 999);

    const weekLabel = `Week ${getWeekNumber(mondayStart)} (${mondayStart.toLocaleDateString('en-GB')} - ${new Date(sundayEnd).toLocaleDateString('en-GB')})`;
    const currentWeekEl = document.getElementById("currentWeek");
    dashboardTitle.textContent = `📅 ${new Date(mondayStart).toLocaleString('default', {
        month: 'long', year: 'numeric'
    })}`;
    if (currentWeekEl) currentWeekEl.textContent = weekLabel;

    chrome.storage.local.get(['timeData', 'leaveData', 'manualPunches'], (result) => {
        const mergedTimeData = getMergedTimeData(result.timeData || {}, result.manualPunches || {});
        const leaveData = result.leaveData || {};

        const sortedDates = Object.keys(mergedTimeData).sort((a, b) => {
            const [da, ma, ya] = a.split('/').map(Number);
            const [db, mb, yb] = b.split('/').map(Number);
            return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
        });

        sortedDates.forEach(dateStr => {
            const [d, m, y] = dateStr.split('/').map(Number);
            const dateObj = new Date(y, m - 1, d);

            if (dateObj >= mondayStart && dateObj <= sundayEnd) {
                const punchesRaw = mergedTimeData[dateStr] || [];
                const punchPairs = formatPunchPairs(punchesRaw, dateStr);
                if (punchPairs.length === 0) return;

                const firstValidIn = punchPairs.find(p => p.in)?.in || null;
                const lastValidOut = [...punchPairs].reverse().find(p => p.out)?.out || null;
                const totalMinsRaw = calculateTotalMinutes(punchesRaw.length ? punchPairs : []);
                const totalMins = totalMinsRaw;
                weeklyTotal += totalMins;

                const row = document.createElement("tr");
                row.className = "clickable";
                row.innerHTML = `
                    <td>${getWeekday(dateStr)}</td>
                    <td>${firstValidIn ? toAMPM(firstValidIn) : "<span style='color:red;'>⚠️</span>"}</td>
                    <td>${lastValidOut ? toAMPM(lastValidOut) : "<span style='color:red;'>⚠️</span>"}</td>
                    <td>${minutesToHHMM(totalMins)}</td>
                    `;

                const detailsRow = document.createElement("tr");
                detailsRow.className = "details-row";
                detailsRow.style.display = "none";
                const punchesHTML = punchPairs.map(p => {
                    const inTime = p.in ? toAMPM(p.in) : "<span style='color:red;'>⚠️ Missing In</span>";
                    let outTime = "";
                    if (p.out) {
                        const label = p.autoFilled ? " <span style='color:green;'>(Now)</span>" : "";
                        outTime = `${toAMPM(p.out)}${label}`;
                    } else {
                        outTime = "<span style='color:red;'>⚠️ Missing Out</span>";
                    }
                    diff = p.diff !== "" ? `(${p.diff})` : "";
                    return `<li>🕒 ${inTime} → ${outTime} ${diff} </li>`;
                }).join("");

                detailsRow.innerHTML = `
                    <td colspan="4">
                        <ul style="margin: 10px 0; padding-left: 20px; text-align: left;">
                        ${punchesHTML}
                        </ul>
                    </td>`;

                row.addEventListener("click", () => {
                    document.querySelectorAll(".details-row").forEach(r => {
                        if (r !== detailsRow) r.style.display = "none";
                    });
                    detailsRow.style.display = detailsRow.style.display === "none" ? "table-row" : "none";
                });

                tbody.appendChild(row);
                tbody.appendChild(detailsRow);
            }
        });
        document.getElementById("weeklyTotal").textContent = minutesToHHMM(weeklyTotal);
    });
}

function renderMonthlyCalendar() {
    const headerContainer = document.getElementById("calendarHeaderRow");
    const gridContainer = document.getElementById("calendarGrid");
    headerContainer.innerHTML = "";
    gridContainer.innerHTML = "";

    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const startDay = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(day => {
        const cell = document.createElement("div");
        cell.textContent = day;
        cell.className = "calendar-header-cell";
        headerContainer.appendChild(cell);
    });

    chrome.storage.local.get(['timeData', 'leaveData', 'manualPunches', 'holidayData'], (result) => {
        const mergedTimeData = getMergedTimeData(result.timeData || {}, result.manualPunches || {});
        const leaveData = result.leaveData || {};
        const holidayData = result.holidayData || {};

        for (let date = 1; date <= daysInMonth; date++) {
            const cell = document.createElement("div");
            const dayStr = date.toString().padStart(2, '0');
            const monthStr = (month + 1).toString().padStart(2, '0');
            const dateStr = `${dayStr}/${monthStr}/${year}`;

            cell.innerHTML = `<strong>${dayStr}</strong>`;
            cell.className = "calendar-date-cell";

            if (date === 1) {
                cell.style.gridColumnStart = startDay + 1;
            }

            const currentDateObj = new Date();
            const currentDate = new Date();
            const isToday = (date === currentDateObj.getDate() && month === currentDateObj.getMonth() && year === currentDateObj.getFullYear());

            if (isToday) {
                cell.classList.add("today-cell");
            }

            const isHoliday = !!holidayData[dateStr];
            const holidayName = isHoliday ? holidayData[dateStr].name : '';

            if (mergedTimeData[dateStr] && currentDate > new Date(dateStr.split('/').reverse().join('-'))) {
                const punchPairs = formatPunchPairs(mergedTimeData[dateStr], dateStr);
                const totalMinsRaw = calculateTotalMinutes(punchPairs);
                const leaveDeduct = getEffectiveLeaveMinutesForDate(leaveData, holidayData, dateStr);
                const totalMins = Math.max(0, totalMinsRaw - leaveDeduct);
                const shortText = minutesToHHMM(totalMins);
                const hasMissing = hasMissingPunches(punchPairs);
                const hasLeave = !!leaveData[dateStr];

                if (hasLeave) {
                    const leaveType = leaveData[dateStr].type;
                    const minutes = getLeaveMinutesByType(leaveType);
                    cell.classList.add("leave-day");
                    cell.innerHTML += `<br/><span class="status-label primary-text">On Leave</span>`;
                    const chip = document.createElement('div');
                    chip.className = "leave-chip";
                    chip.textContent = `${leaveType} (${minutesToHHMM(minutes)})`;
                    cell.appendChild(chip);
                } else if (isHoliday) {
                    // Holiday badge on top of punch data (worked on a holiday)
                    const chip = document.createElement('div');
                    chip.className = "holiday-chip";
                    cell.innerHTML += `<br/>`;
                    chip.textContent = holidayName;
                    cell.appendChild(chip);
                } else if (hasMissing) {
                    cell.innerHTML += `<br/><span class="time-text warning-text">${shortText}</span><br/><span class="status-tag danger-text">⚠️ Missing</span>`;
                    cell.classList.add("missing-day");
                } else {
                    cell.innerHTML += `<br/><span class="time-text success-text">${shortText}</span>`;
                }



                cell.title = `In: ${punchPairs[0]?.in || '--'}, Out: ${punchPairs.at(-1)?.out || '--'}${isHoliday ? ' | Holiday: ' + holidayName : ''}`;
                if (!isHoliday) {
                    cell.addEventListener("click", () => showPunchModal(dateStr));
                }
            } else {
                const cellDate = new Date(year, month, date);
                const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
                const isFuture = cellDate > currentDate;

                if (isHoliday && !leaveData[dateStr]) {
                    // Holiday with no punch data — amber cell
                    cell.classList.add("holiday-day");
                    cell.innerHTML += `<br/><span class="status-label warning-text">Holiday</span>`;
                    const chip = document.createElement('div');
                    chip.className = "holiday-chip";
                    chip.textContent = holidayName;
                    cell.appendChild(chip);
                } else if (!isWeekend && !isFuture && !leaveData[dateStr]) {
                    cell.innerHTML += `<br/><span class="status-tag danger-text">⚠️ No Data</span>`;
                    cell.classList.add("no-data-day");
                    if (!isHoliday) {
                        cell.addEventListener("click", () => showPunchModal(dateStr));
                    }
                } else if (leaveData[dateStr]) {
                    const leaveType = leaveData[dateStr].type;
                    const minutes = getLeaveMinutesByType(leaveType);
                    cell.classList.add("leave-day");
                    cell.innerHTML += `<br/><span class="status-label primary-text">On Leave</span>`;
                    const chip = document.createElement('div');
                    chip.className = "leave-chip";
                    chip.textContent = `${leaveType} (${minutesToHHMM(minutes)})`;
                    cell.appendChild(chip);
                }
            }
            if (!isHoliday) {
                cell.addEventListener("contextmenu", (e) => { e.preventDefault(); openLeaveModal(dateStr); });
            }
            gridContainer.appendChild(cell);
        }
    });
}

// ================================
// Dashboard view state
// ================================
function saveDashboardView(view) {
    chrome.storage.local.set({ dashboardView: view });
}

function loadDashboardView() {
    chrome.storage.local.get(['dashboardView'], (result) => {
        const savedView = result.dashboardView || 'weekly';
        if (savedView === 'monthly') {
            monthlyBtn.click();
        } else {
            weeklyBtn.click();
        }
    });
}

weeklyBtn.addEventListener("click", () => {
    weeklyBtn.classList.add("active");
    monthlyBtn.classList.remove("active");
    table.style.display = "table";
    calendar.style.display = "none";
    dashboardTitle.textContent = `📅 ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    if (!currentMonday) currentMonday = getMonday(new Date());
    renderWeeklyTableForMonday(currentMonday);
    saveDashboardView('weekly');
});

function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

monthlyBtn.addEventListener("click", () => {
    monthlyBtn.classList.add("active");
    weeklyBtn.classList.remove("active");
    table.style.display = "none";
    calendar.style.display = "block";
    renderMonthlyCalendar();
    dashboardTitle.textContent = `📅 ${new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}`;
    saveDashboardView('monthly');
});

// ================================
// Punch modal — edit / add
// ================================
let _punchModalDate = null;

function showPunchModal(dateStr) {
    chrome.storage.local.get(['holidayData'], result => {
        if (result.holidayData && result.holidayData[dateStr]) return;

        _punchModalDate = dateStr;
        document.getElementById("modalDateTitle").textContent = `Punches for ${dateStr}`;
        document.getElementById("punchModal").style.display = "flex";

        const addBtn = document.getElementById("addPunchBtn");
        addBtn.onclick = () => addManualPunch(dateStr);

        refreshPunchModal(dateStr);
    });
}

function refreshPunchModal(dateStr) {
    chrome.storage.local.get(['timeData', 'manualPunches'], result => {
        // includeDeleted=true so deleted server punches appear greyed out with Restore
        const merged = getMergedPunchesForDate(
            dateStr,
            result.timeData || {},
            result.manualPunches || {},
            true
        );
        renderPunchEditList(dateStr, merged, document.getElementById("modalPunchList"));
        loadDashboardView()
    });
}

function renderPunchEditList(dateStr, punches, container) {
    container.innerHTML = "";

    if (punches.length === 0) {
        const li = document.createElement("li");
        li.style.cssText = "color:gray; padding:8px 0;";
        li.textContent = "No punches recorded.";
        container.appendChild(li);
        return;
    }

    punches.forEach(punch => {
        const isManual = !!punch.manualId;
        const hasSeqNo = !!punch.seqNo;
        const isDeleted = !!punch.deleted;
        const isEdited = !!punch.edited;

        // Badge colour and label
        let bgColor, label;
        if (isManual) { bgColor = "#6c757d"; label = "Manual"; }
        else if (hasSeqNo) { bgColor = "#0d6efd"; label = `#${punch.seqNo}`; }
        else { bgColor = "#6f42c1"; label = "Auto"; }

        const li = document.createElement("li");
        li.style.cssText = `display:flex; align-items:center; gap:6px; padding:8px 0; border-bottom:1px solid #eee; ${isDeleted ? 'opacity:0.45;' : ''}`;

        // Badge (+ "edited" dot)
        const badgeWrap = document.createElement("span");
        badgeWrap.style.cssText = "display:flex; align-items:center; gap:3px; flex-shrink:0;";

        const badge = document.createElement("span");
        badge.style.cssText = `background:${bgColor}; color:white; padding:2px 7px; border-radius:10px; font-size:11px; white-space:nowrap; min-width:52px; text-align:center;`;
        badge.textContent = label;
        badgeWrap.appendChild(badge);

        if (isEdited && !isDeleted) {
            const dot = document.createElement("span");
            dot.title = `Original: ${punch._origDisplayTime || ''} ${punch._origDisplayType || ''}`;
            dot.style.cssText = "width:7px; height:7px; background:#ffc107; border-radius:50%; display:inline-block;";
            badgeWrap.appendChild(dot);
        }

        li.appendChild(badgeWrap);

        if (isDeleted) {
            // Greyed-out: show original time as plain text + Restore only
            const info = document.createElement("span");
            info.style.cssText = "flex:1; font-size:13px; color:#888;";
            info.textContent = `${punch.type.toUpperCase()}  ${punch.time}  (deleted)`;
            li.appendChild(info);

            const restoreBtn = document.createElement("button");
            restoreBtn.textContent = "Restore";
            restoreBtn.style.cssText = "padding:4px 9px; background:#fd7e14; color:white; border:none; border-radius:4px; cursor:pointer; font-size:13px;";
            restoreBtn.addEventListener('click', () => restorePunch(dateStr, punch));
            li.appendChild(restoreBtn);
        } else {
            // Editable row
            const typeSelect = document.createElement("select");
            typeSelect.style.cssText = "padding:4px; border:1px solid #ccc; border-radius:4px; font-size:13px;";
            ['in', 'out'].forEach(v => {
                const opt = document.createElement("option");
                opt.value = v;
                opt.textContent = v.toUpperCase();
                if (punch.type === v) opt.selected = true;
                typeSelect.appendChild(opt);
            });

            const timeInput = document.createElement("input");
            timeInput.type = "time";
            timeInput.value = punch.time;
            timeInput.style.cssText = "padding:4px; border:1px solid #ccc; border-radius:4px; font-size:13px; flex:1;";

            const saveBtn = document.createElement("button");
            saveBtn.textContent = "Save";
            saveBtn.style.cssText = "padding:4px 10px; background:#28a745; color:white; border:none; border-radius:4px; cursor:pointer; font-size:13px;";
            saveBtn.addEventListener('click', () => savePunchEdit(dateStr, punch, timeInput.value, typeSelect.value));

            li.appendChild(typeSelect);
            li.appendChild(timeInput);
            li.appendChild(saveBtn);

            // Restore button — shown when an edit override exists
            if (isEdited) {
                const restoreBtn = document.createElement("button");
                restoreBtn.textContent = "Restore";
                restoreBtn.title = `Revert to original: ${punch._origDisplayTime || punch.time}`;
                restoreBtn.style.cssText = "padding:4px 9px; background:#fd7e14; color:white; border:none; border-radius:4px; cursor:pointer; font-size:13px;";
                restoreBtn.addEventListener('click', () => restorePunch(dateStr, punch));
                li.appendChild(restoreBtn);
            }

            // Delete — fetched server punches and manual additions
            if (hasSeqNo || isManual) {
                const delBtn = document.createElement("button");
                delBtn.textContent = "Del";
                delBtn.style.cssText = "padding:4px 8px; background:#dc3545; color:white; border:none; border-radius:4px; cursor:pointer; font-size:13px;";
                if (isManual) {
                    delBtn.addEventListener('click', () => deleteManualPunch(dateStr, punch.manualId));
                } else {
                    delBtn.addEventListener('click', () => deleteFetchedPunch(dateStr, punch));
                }
                li.appendChild(delBtn);
            }
        }

        container.appendChild(li);
    });
}

function savePunchEdit(dateStr, originalPunch, newTime, newType) {
    chrome.storage.local.get(['manualPunches'], result => {
        const manualPunches = result.manualPunches || {};
        const overrides = [...(manualPunches[dateStr] || [])];

        if (originalPunch.manualId) {
            // Update an existing manual addition
            const idx = overrides.findIndex(o => o.action === 'add' && o.id === originalPunch.manualId);
            if (idx !== -1) {
                overrides[idx] = { ...overrides[idx], time: newTime, type: newType };
            }
        } else if (originalPunch.seqNo) {
            // Edit a server punch (identified by seqNo)
            const idx = overrides.findIndex(o => o.action === 'edit' && o.seqNo === originalPunch.seqNo);
            if (originalPunch.type !== newType || originalPunch.time !== newTime) {
                if (idx !== -1) {
                    overrides[idx] = { action: 'edit', seqNo: originalPunch.seqNo, time: newTime, type: newType };
                } else {
                    overrides.push({ action: 'edit', seqNo: originalPunch.seqNo, time: newTime, type: newType });
                }
            }
        } else {
            // Edit a system/auto punch — use _origTime if available (already edited once)
            const origTime = originalPunch._origTime || originalPunch.time;
            const origType = originalPunch._origType || originalPunch.type;
            const idx = overrides.findIndex(
                o => o.action === 'edit' && !o.seqNo && o.origTime === origTime && o.origType === origType
            );
            if (idx !== -1) {
                overrides[idx] = { action: 'edit', origTime, origType, time: newTime, type: newType };
            } else {
                overrides.push({ action: 'edit', origTime, origType, time: newTime, type: newType });
            }
        }

        manualPunches[dateStr] = overrides;
        chrome.storage.local.set({ manualPunches }, () => refreshPunchModal(dateStr));
    });
}

function addManualPunch(dateStr) {
    chrome.storage.local.get(['manualPunches'], result => {
        const manualPunches = result.manualPunches || {};
        const overrides = [...(manualPunches[dateStr] || [])];
        overrides.push({ action: 'add', id: `manual_${Date.now()}`, time: '', type: '' });
        manualPunches[dateStr] = overrides;
        chrome.storage.local.set({ manualPunches }, () => refreshPunchModal(dateStr));
    });
}

function deleteManualPunch(dateStr, manualId) {
    chrome.storage.local.get(['manualPunches'], result => {
        const manualPunches = result.manualPunches || {};
        manualPunches[dateStr] = (manualPunches[dateStr] || [])
            .filter(o => !(o.action === 'add' && o.id === manualId));
        chrome.storage.local.set({ manualPunches }, () => refreshPunchModal(dateStr));
    });
}

// Soft-delete a fetched (server) punch — stores a delete override, keeps it visible as greyed
function deleteFetchedPunch(dateStr, punch) {
    chrome.storage.local.get(['manualPunches'], result => {
        const manualPunches = result.manualPunches || {};
        const overrides = [...(manualPunches[dateStr] || [])];
        // avoid duplicates
        if (!overrides.some(o => o.action === 'delete' && o.seqNo === punch.seqNo)) {
            overrides.push({ action: 'delete', seqNo: punch.seqNo });
        }
        manualPunches[dateStr] = overrides;
        chrome.storage.local.set({ manualPunches }, () => refreshPunchModal(dateStr));
    });
}

// Remove all overrides for a punch, reverting it to its original server value
function restorePunch(dateStr, punch) {
    chrome.storage.local.get(['manualPunches'], result => {
        const manualPunches = result.manualPunches || {};
        let overrides = manualPunches[dateStr] || [];

        if (punch.seqNo) {
            // Remove both edit and delete overrides for this seqNo
            overrides = overrides.filter(
                o => !(o.seqNo === punch.seqNo && (o.action === 'edit' || o.action === 'delete'))
            );
        } else {
            // Auto punch: remove the edit override matched by origTime+origType
            const origTime = punch._origTime || punch.time;
            const origType = punch._origType || punch.type;
            overrides = overrides.filter(
                o => !(o.action === 'edit' && !o.seqNo && o.origTime === origTime && o.origType === origType)
            );
        }

        manualPunches[dateStr] = overrides;
        chrome.storage.local.set({ manualPunches }, () => refreshPunchModal(dateStr));
    });
}

document.getElementById("closeModal").addEventListener("click", () => {
    document.getElementById("punchModal").style.display = "none";
    _punchModalDate = null;
});

// ================================
// Monthly data reload
// ================================
const reloadBtn = document.getElementById("load-monthly-data");

reloadBtn.addEventListener("click", () => {
    const today = new Date();
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

    const startDateStr = firstDay.toISOString().split("T")[0];
    const endDateStr = lastDay.toISOString().split("T")[0];

    reloadBtn.classList.add("spin");

    chrome.runtime.sendMessage({
        action: "getRangePunchData",
        startDate: startDateStr,
        endDate: endDateStr
    }, (response) => {
        reloadBtn.classList.remove("spin");

        if (response?.success) {
            console.log("✅ Monthly punch data loaded:", response.data);
            window.location.reload();
            alert("Monthly data fetched successfully!");
        } else {
            console.error("❌ Error fetching monthly data:", response?.error);
            alert("Failed to fetch monthly data.");
        }
    });
});

// ================================
// Leave modal
// ================================
function openLeaveModal(dateStr) {
    chrome.storage.local.get(['holidayData', 'leaveData'], (result) => {
        if (result.holidayData && result.holidayData[dateStr]) return;

        selectedLeaveDate = dateStr;
        const modal = document.getElementById('leaveModal');
        const title = document.getElementById('leaveModalTitle');
        title.textContent = `Add Leave for ${dateStr}`;

        const leaveData = result.leaveData || {};
        const existing = leaveData[dateStr];
        const select = document.getElementById('leaveType');
        select.value = existing?.type || 'full';
        modal.style.display = 'flex';
    });
}

document.getElementById('closeLeaveModal').addEventListener('click', () => {
    document.getElementById('leaveModal').style.display = 'none';
});

document.getElementById('saveLeaveBtn').addEventListener('click', () => {
    if (!selectedLeaveDate) return;
    const select = document.getElementById('leaveType');
    const type = select.value;
    chrome.storage.local.get(['leaveData'], (result) => {
        const leaveData = result.leaveData || {};
        leaveData[selectedLeaveDate] = { type };
        chrome.storage.local.set({ leaveData }, () => {
            document.getElementById('leaveModal').style.display = 'none';
            if (document.getElementById('monthlyCalendar').style.display !== 'none') {
                renderMonthlyCalendar();
            } else {
                window.location.reload();
            }
        });
    });
});

document.getElementById('removeLeaveBtn').addEventListener('click', () => {
    if (!selectedLeaveDate) return;
    chrome.storage.local.get(['leaveData'], (result) => {
        const leaveData = result.leaveData || {};
        delete leaveData[selectedLeaveDate];
        chrome.storage.local.set({ leaveData }, () => {
            document.getElementById('leaveModal').style.display = 'none';
            if (document.getElementById('monthlyCalendar').style.display !== 'none') {
                renderMonthlyCalendar();
            } else {
                window.location.reload();
            }
        });
    });
});

// ================================
// Init
// ================================
loadDashboardView();

const prevWeekBtn = document.getElementById('prevWeek');
const nextWeekBtn = document.getElementById('nextWeek');

if (prevWeekBtn && nextWeekBtn) {
    prevWeekBtn.addEventListener('click', () => {
        if (!currentMonday) currentMonday = getMonday(new Date());
        currentMonday.setDate(currentMonday.getDate() - 7);
        renderWeeklyTableForMonday(currentMonday);
    });
    nextWeekBtn.addEventListener('click', () => {
        if (!currentMonday) currentMonday = getMonday(new Date());
        currentMonday.setDate(currentMonday.getDate() + 7);
        renderWeeklyTableForMonday(currentMonday);
    });
}
