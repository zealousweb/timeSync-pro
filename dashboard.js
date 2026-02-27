const weeklyBtn = document.getElementById("weeklyBtn");
const monthlyBtn = document.getElementById("monthlyBtn");
const table = document.getElementById("employeeTable");
const calendar = document.getElementById("monthlyCalendar");
const dashboardTitle = document.getElementById("dashboardTitle");
const currentWeek = document.getElementById("currentWeek");

function calculateTotalMinutes(punches) {
  return punches.reduce((total, p) => {
    if (!p.in || !p.out) return total;
    const [inH, inM] = p.in.split(":").map(Number);
    const [outH, outM] = p.out.split(":").map(Number);
    return total + (outH * 60 + outM - (inH * 60 + inM));
  }, 0);
}

function minutesToHHMM(mins) {
  const h = Math.floor(mins / 60)
    .toString()
    .padStart(2, "0");
  const m = (mins % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function getLeaveMinutesByType(type) {
  if (type === "full") return 8.5 * 60;
  if (type === "half") return 4 * 60;
  if (type === "partial") return 60;
  return 0;
}

function getLeaveMinutesForDate(leaveData, dateStr) {
  const record = leaveData && leaveData[dateStr];
  if (!record) return 0;
  return getLeaveMinutesByType(record.type);
}

let selectedLeaveDate = null;

function toAMPM(timeStr) {
  if (!timeStr || !timeStr.includes(":")) return "--:--";
  const [hour, minute] = timeStr.split(":").map(Number);
  const period = hour >= 12 ? "PM" : "AM";
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} ${period}`;
}

function getCurrentTimeHHMM() {
  const now = new Date();
  const hh = now.getHours().toString().padStart(2, "0");
  const mm = now.getMinutes().toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function formatPunchPairs(punches, dateStr) {
  const pairs = [];
  const todayStr = new Date().toLocaleDateString("en-GB");
  let i = 0;

  while (i < punches.length) {
    const current = punches[i];
    const next = punches[i + 1];

    if (current.type === "in" && next?.type === "out") {
      pairs.push({
        in: current.time,
        out: next.time,
        diff: timeDiff(next.time, punches[i + 2]?.time),
        autoFilled: false,
      });
      i += 2;
    } else if (current.type === "in" && (!next || next.type === "in")) {
      const isToday = dateStr === todayStr;
      // Calculate out time only if both a previous out and the next in are available
      const prev = punches[i - 1];
      const nextIn = next && next.type === "in" ? next : undefined;
      const canCalculateFromOutAndNextIn = prev?.type === "out" && !!nextIn;
      const outTime = canCalculateFromOutAndNextIn
        ? prev.time
        : isToday
          ? getCurrentTimeHHMM()
          : null;
      pairs.push({
        in: current.time,
        out: outTime,
        diff: timeDiff(outTime, punches[i + 2]?.time),
        autoFilled: canCalculateFromOutAndNextIn || isToday,
      });
      i += 1;
    } else if (current.type === "out") {
      pairs.push({
        in: null,
        out: current.time,
        diff: timeDiff(current.time, punches[i + 2]?.time),
        autoFilled: false,
      });
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
  const diff = outH * 60 + outM - (inH * 60 + inM);
  if (diff < 0) return "--:--";
  const hh = Math.floor(diff / 60)
    .toString()
    .padStart(2, "0");
  const mm = (diff % 60).toString().padStart(2, "0");
  return `${hh}:${mm}`;
}

function getWeekday(dateStr) {
  const [day, month, year] = dateStr.split("/");
  const date = new Date(`${year}-${month}-${day}`);
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function hasMissingPunches(punchPairs) {
  if (!punchPairs || punchPairs.length === 0) return true;

  return punchPairs.some((pair) => {
    return !pair.in || !pair.out;
  });
}

let currentMonday = null;

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day + 6) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

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

  // Update header label
  const weekLabel = `Week ${getWeekNumber(mondayStart)} (${mondayStart.toLocaleDateString("en-GB")} - ${new Date(sundayEnd).toLocaleDateString("en-GB")})`;
  const currentWeekEl = document.getElementById("currentWeek");
  dashboardTitle.textContent = `📅 ${new Date(mondayStart).toLocaleString(
    "default",
    {
      month: "long",
      year: "numeric",
    },
  )}`;
  if (currentWeekEl) currentWeekEl.textContent = weekLabel;

  chrome.storage.local.get(["timeData", "leaveData"], (result) => {
    const timeData = result.timeData || {};
    const leaveData = result.leaveData || {};

    const sortedDates = Object.keys(timeData).sort((a, b) => {
      const [da, ma, ya] = a.split("/").map(Number);
      const [db, mb, yb] = b.split("/").map(Number);
      return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });

    sortedDates.forEach((dateStr) => {
      const [d, m, y] = dateStr.split("/").map(Number);
      const dateObj = new Date(y, m - 1, d);

      if (dateObj >= mondayStart && dateObj <= sundayEnd) {
        const punchesRaw = timeData[dateStr] || [];
        const punchPairs = formatPunchPairs(punchesRaw, dateStr);
        if (punchPairs.length === 0) return;

        const firstValidIn = punchPairs.find((p) => p.in)?.in || null;
        const lastValidOut =
          [...punchPairs].reverse().find((p) => p.out)?.out || null;
        const totalMinsRaw = calculateTotalMinutes(
          punchesRaw.length ? punchPairs : [],
        );
        const leaveDeduct = getLeaveMinutesForDate(leaveData, dateStr);
        const totalMins = Math.max(0, totalMinsRaw - leaveDeduct);
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
        const punchesHTML = punchPairs
          .map((p) => {
            const inTime = p.in
              ? toAMPM(p.in)
              : "<span style='color:red;'>⚠️ Missing In</span>";
            let outTime = "";
            if (p.out) {
              const label = p.autoFilled
                ? " <span style='color:green;'>(Now)</span>"
                : "";
              outTime = `${toAMPM(p.out)}${label}`;
            } else {
              outTime = "<span style='color:red;'>⚠️ Missing Out</span>";
            }
            diff = p.diff !== "" ? `(${p.diff})` : "";
            return `<li>🕒 ${inTime} → ${outTime} ${diff} </li>`;
          })
          .join("");

        detailsRow.innerHTML = `
                    <td colspan="4">
                        <ul style="margin: 10px 0; padding-left: 20px; text-align: left;">
                        ${punchesHTML}
                        </ul>
                    </td>`;

        row.addEventListener("click", () => {
          document.querySelectorAll(".details-row").forEach((r) => {
            if (r !== detailsRow) r.style.display = "none";
          });
          detailsRow.style.display =
            detailsRow.style.display === "none" ? "table-row" : "none";
        });

        tbody.appendChild(row);
        tbody.appendChild(detailsRow);
      }
    });
    document.getElementById("weeklyTotal").textContent =
      minutesToHHMM(weeklyTotal);

    // Calculate weekly escape time (max 1 hour flexible)
    const escapeTimeEl = document.getElementById("weeklyEscapeTime");
    if (escapeTimeEl) {
      // Only calculate for current week
      const today = new Date();
      const todayMonday = getMonday(today);
      const isCurrentWeek = mondayStart.getTime() === todayMonday.getTime();

      if (isCurrentWeek) {
        // Count workdays completed so far this week (Mon-Fri, excluding today if still working)
        const todayDayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        // Days from Monday (1) to today, excluding weekends
        let workdaysCompleted = 0;
        for (
          let d = 1;
          d <= Math.min(todayDayOfWeek === 0 ? 5 : todayDayOfWeek - 1, 5);
          d++
        ) {
          workdaysCompleted++;
        }

        // Expected time = 8.5 hours per completed workday
        const expectedMinutes = workdaysCompleted * 8.5 * 60;

        // Extra time = worked - expected (only consider positive)
        const extraTime = Math.max(0, weeklyTotal - expectedMinutes);

        // Escape time = min(extraTime, 60 minutes) - capped at 1 hour
        const escapeTime = Math.min(extraTime, 60);

        escapeTimeEl.textContent = minutesToHHMM(escapeTime);
        escapeTimeEl.style.color = escapeTime > 0 ? "green" : "inherit";
      } else {
        escapeTimeEl.textContent = "--:--";
        escapeTimeEl.style.color = "gray";
      }
    }
  });
}

function renderMonthlyCalendar() {
  const headerContainer = document.getElementById("calendarHeaderRow");
  const gridContainer = document.getElementById("calendarGrid");
  headerContainer.innerHTML = "";
  gridContainer.innerHTML = "";

  const today = new Date();
  // const today = new Date(2025,2,1);
  const year = today.getFullYear();
  const month = today.getMonth();
  const firstDay = new Date(year, month, 1);
  const startDay = firstDay.getDay(); // 0 = Sun, 1 = Mon, ...
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Week headers
  ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach((day) => {
    const cell = document.createElement("div");
    cell.textContent = day;
    cell.className = "calendar-header-cell";
    headerContainer.appendChild(cell);
  });

  chrome.storage.local.get(["timeData", "leaveData"], (result) => {
    const timeData = result.timeData || {};
    const leaveData = result.leaveData || {};

    for (let date = 1; date <= daysInMonth; date++) {
      const cell = document.createElement("div");
      const dayStr = date.toString().padStart(2, "0");
      const monthStr = (month + 1).toString().padStart(2, "0");
      const dateStr = `${dayStr}/${monthStr}/${year}`;

      cell.innerHTML = `<strong>${dayStr}</strong>`;
      cell.className = "calendar-date-cell";

      // 👇 Align the first day in the correct weekday column
      if (date === 1) {
        cell.style.gridColumnStart = startDay + 1;
      }

      const currentDate = new Date();
      if (
        timeData[dateStr] &&
        currentDate > new Date(dateStr.split("/").reverse().join("-"))
      ) {
        const punchPairs = formatPunchPairs(timeData[dateStr], dateStr);
        const totalMinsRaw = calculateTotalMinutes(punchPairs);
        const leaveDeduct = getLeaveMinutesForDate(leaveData, dateStr);
        const totalMins = Math.max(0, totalMinsRaw - leaveDeduct);
        const shortText = minutesToHHMM(totalMins);
        const hasMissing = hasMissingPunches(punchPairs);
        const hasLeave = !!leaveData[dateStr];

        if (hasLeave) {
          // Leave styling first priority
          const leaveType = leaveData[dateStr].type;
          const minutes = getLeaveMinutesByType(leaveType);

          cell.classList.add("leave-day");
          cell.innerHTML += `<br/><span class="status-label primary-text">On Leave</span>`;

          const chip = document.createElement("div");
          chip.className = "leave-chip";
          chip.textContent = `${leaveType} (${minutesToHHMM(minutes)})`;
          cell.appendChild(chip);
        } else if (hasMissing) {
          // Only show missing if no leave
          cell.innerHTML += `<br/><span class="time-text warning-text">${shortText}</span><br/><span class="status-tag danger-text">⚠️ Missing</span>`;
          cell.classList.add("missing-day");
        } else {
          cell.innerHTML += `<br/><span class="time-text success-text">${shortText}</span>`;
        }

        cell.title = `In: ${punchPairs[0]?.in || "--"}, Out: ${punchPairs.at(-1)?.out || "--"}`;
        cell.addEventListener("click", () =>
          showPunchModal(dateStr, punchPairs),
        );
      } else {
        const cellDate = new Date(year, month, date);
        const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
        const isFuture = cellDate > currentDate;

        if (!isWeekend && !isFuture && !leaveData[dateStr]) {
          cell.innerHTML += `<br/><span class="status-tag danger-text">⚠️ No Data</span>`;
          cell.classList.add("no-data-day");
          cell.addEventListener("click", () => showPunchModal(dateStr, []));
        } else if (leaveData[dateStr]) {
          // Handle pure leave days (no punch at all)
          const leaveType = leaveData[dateStr].type;
          const minutes = getLeaveMinutesByType(leaveType);

          cell.classList.add("leave-day");
          cell.innerHTML += `<br/><span class="status-label primary-text">On Leave</span>`;

          const chip = document.createElement("div");
          chip.className = "leave-chip";
          chip.textContent = `${leaveType} (${minutesToHHMM(minutes)})`;
          cell.appendChild(chip);
        }
      }
      cell.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openLeaveModal(dateStr);
      });
      gridContainer.appendChild(cell);
    }
  });
}

// Function to save dashboard view state
function saveDashboardView(view) {
  chrome.storage.local.set({ dashboardView: view });
}

// Function to load dashboard view state
function loadDashboardView() {
  chrome.storage.local.get(["dashboardView"], (result) => {
    const savedView = result.dashboardView || "weekly";
    if (savedView === "monthly") {
      monthlyBtn.click();
    } else {
      weeklyBtn.click();
    }
  });
}

// Weekly View
weeklyBtn.addEventListener("click", () => {
  weeklyBtn.classList.add("active");
  monthlyBtn.classList.remove("active");
  table.style.display = "table";
  calendar.style.display = "none";
  dashboardTitle.textContent = `📅 ${new Date().toLocaleString("default", { month: "long", year: "numeric" })}`;
  if (!currentMonday) currentMonday = getMonday(new Date());
  renderWeeklyTableForMonday(currentMonday);
  saveDashboardView("weekly");
});

function getWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return weekNo;
}

// Monthly View
monthlyBtn.addEventListener("click", () => {
  monthlyBtn.classList.add("active");
  weeklyBtn.classList.remove("active");

  table.style.display = "none";
  calendar.style.display = "block";

  renderMonthlyCalendar();

  dashboardTitle.textContent = `📅 ${new Date().toLocaleString("default", {
    month: "long",
    year: "numeric",
  })}`;

  saveDashboardView("monthly");
});

function showPunchModal(dateStr, punches) {
  const modal = document.getElementById("punchModal");
  const title = document.getElementById("modalDateTitle");
  const list = document.getElementById("modalPunchList");

  title.textContent = `🗓️ Punches for ${dateStr}`;
  list.innerHTML = "";

  if (punches.length === 0) {
    list.innerHTML = "<li style='color:red;'>No punch data available.</li>";
  } else {
    punches.forEach((p) => {
      const li = document.createElement("li");
      const inTime = p.in
        ? toAMPM(p.in)
        : "<span style='color:red;'>⚠️ Missing In</span>";
      let outTime = "";
      if (p.out) {
        const label = p.autoFilled
          ? " <span style='color:green;'>(Now)</span>"
          : "";
        outTime = `${toAMPM(p.out)}${label}`;
      } else {
        outTime = "<span style='color:red;'>⚠️ Missing Out</span>";
      }
      diff = p.diff !== "" ? `(${p.diff})` : "";
      li.innerHTML = `🕒 ${inTime} → ${outTime} ${diff}`;
      list.appendChild(li);
    });
  }
  modal.style.display = "flex";
}

document.getElementById("closeModal").addEventListener("click", () => {
  document.getElementById("punchModal").style.display = "none";
});

const reloadBtn = document.getElementById("load-monthly-data");

reloadBtn.addEventListener("click", () => {
  const today = new Date();
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);

  const startDateStr = firstDay.toISOString().split("T")[0];
  const endDateStr = lastDay.toISOString().split("T")[0];

  // Start spinning
  reloadBtn.classList.add("spin");

  chrome.runtime.sendMessage(
    {
      action: "getRangePunchData",
      startDate: startDateStr,
      endDate: endDateStr,
    },
    (response) => {
      // Stop spinning
      reloadBtn.classList.remove("spin");

      if (response?.success) {
        console.log("✅ Monthly punch data loaded:", response.data);
        window.location.reload();
        alert("Monthly data fetched successfully!");
      } else {
        console.error("❌ Error fetching monthly data:", response?.error);
        alert("Failed to fetch monthly data.");
      }
    },
  );
});

// ---- Leave Modal wiring ----
function openLeaveModal(dateStr) {
  selectedLeaveDate = dateStr;
  const modal = document.getElementById("leaveModal");
  const title = document.getElementById("leaveModalTitle");
  title.textContent = `Add Leave for ${dateStr}`;

  chrome.storage.local.get(["leaveData"], (result) => {
    const leaveData = result.leaveData || {};
    const existing = leaveData[dateStr];
    const select = document.getElementById("leaveType");
    select.value = existing?.type || "full";
  });
  modal.style.display = "flex";
}

document.getElementById("closeLeaveModal").addEventListener("click", () => {
  document.getElementById("leaveModal").style.display = "none";
});

document.getElementById("saveLeaveBtn").addEventListener("click", () => {
  if (!selectedLeaveDate) return;
  const select = document.getElementById("leaveType");
  const type = select.value;
  chrome.storage.local.get(["leaveData"], (result) => {
    const leaveData = result.leaveData || {};
    leaveData[selectedLeaveDate] = { type };
    chrome.storage.local.set({ leaveData }, () => {
      document.getElementById("leaveModal").style.display = "none";
      // Rerender calendar to reflect changes
      if (document.getElementById("monthlyCalendar").style.display !== "none") {
        renderMonthlyCalendar();
      } else {
        window.location.reload();
      }
    });
  });
});

document.getElementById("removeLeaveBtn").addEventListener("click", () => {
  if (!selectedLeaveDate) return;
  chrome.storage.local.get(["leaveData"], (result) => {
    const leaveData = result.leaveData || {};
    delete leaveData[selectedLeaveDate];
    chrome.storage.local.set({ leaveData }, () => {
      document.getElementById("leaveModal").style.display = "none";
      if (document.getElementById("monthlyCalendar").style.display !== "none") {
        renderMonthlyCalendar();
      } else {
        window.location.reload();
      }
    });
  });
});

// Load saved dashboard view on page load
loadDashboardView();

// ---- Week navigation buttons ----
const prevWeekBtn = document.getElementById("prevWeek");
const nextWeekBtn = document.getElementById("nextWeek");

if (prevWeekBtn && nextWeekBtn) {
  prevWeekBtn.addEventListener("click", () => {
    if (!currentMonday) currentMonday = getMonday(new Date());
    currentMonday.setDate(currentMonday.getDate() - 7);
    renderWeeklyTableForMonday(currentMonday);
  });
  nextWeekBtn.addEventListener("click", () => {
    if (!currentMonday) currentMonday = getMonday(new Date());
    currentMonday.setDate(currentMonday.getDate() + 7);
    renderWeeklyTableForMonday(currentMonday);
  });
}
