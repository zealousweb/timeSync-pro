// Constants
const WORKDAY_MS = 8.5 * 60 * 60 * 1000;
const HALF_WORKDAY_MS = 4 * 60 * 60 * 1000;
const PARTIAL_WORKDAY_MS = 1 * 60 * 60 * 1000;
const WEEKLY_TARGET_MS = 42.5 * 60 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const TEST_HH_MM = "19:24";
const USE_TEST_TIME = false;
const today = new Date();
const now = getNow();

const totalHours = 8.5;
const totalDegrees = 30 * totalHours;
const centerX = 50;
const centerY = 50;
const radius = 40;

// DOM Elements
const loginForm = document.getElementById('loginForm');
const navLinks = document.getElementById('nav-links');
const timeDisplay = document.getElementById('timeDisplay');
const userIdInput = document.getElementById('userIdInput');
const passwordInput = document.getElementById('passwordInput');
const saveCredsButton = document.getElementById('saveCreds');
const refreshButton = document.getElementById('refreshButton');
const settingPageButton = document.getElementById('settingsLink');
const dashboardPageButton = document.getElementById('dashboardLink');
const liveSyncIndicator = document.getElementById('liveSync');
const errorBox = document.getElementById('errorBox');

const EXTENSION_PAGES = ['settings.html', 'dashboard.html'];

function openOrReuseExtensionTab(targetPage) {
  const targetUrl = chrome.runtime.getURL(targetPage);
  chrome.tabs.query({}, (tabs) => {
    const existingTab = tabs.find(tab =>
      tab.url && EXTENSION_PAGES.some(page => tab.url.includes(chrome.runtime.getURL(page)))
    );
    if (existingTab) {
      chrome.tabs.update(existingTab.id, { url: targetUrl, active: true });
    } else {
      chrome.tabs.create({ url: targetUrl });
    }
  });
}

if (settingPageButton) {
  settingPageButton.addEventListener('click', () => openOrReuseExtensionTab('settings.html'));
}
if (dashboardPageButton) {
  dashboardPageButton.addEventListener('click', () => openOrReuseExtensionTab('dashboard.html'));
}

for (let i = 1; i <= totalHours; i++) {
  const hour = i;
  const number = document.createElement("div");
  number.className = "hour-number";
  number.innerText = hour;

  const angle = ((hour - 1) / (totalHours - 1)) * totalDegrees;
  const angleRad = (angle - totalDegrees) * (Math.PI / 136);

  const x = centerX + radius * Math.sin(angleRad) - 10;
  const y = centerY - radius * Math.cos(angleRad) - 10;

  number.style.left = `${x}px`;
  number.style.top = `${y}px`;
}

// Show error
function showError(message) {
  errorBox.textContent = message;
  errorBox.style.display = 'block';
}

// Hide error
function hideError() {
  errorBox.textContent = '';
  errorBox.style.display = 'none';
}

// Time helpers
function getNow() {
  const [testH, testM] = TEST_HH_MM.split(':').map(Number);
  const testDate = new Date(today.getFullYear(), today.getMonth(), today.getDate(), testH, testM);
  return USE_TEST_TIME ? testDate : new Date();
}

function getCurrentTimeStr(now = getNow()) {
  return now.toTimeString().slice(0, 5);
}

function formatTimeReadable(ms) {
  const isNegative = ms < 0;
  ms = Math.abs(ms);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  const formatted = `${hours}h ${minutes}m`;
  return isNegative ? `-${formatted}` : formatted;
}

// Leave helpers
function getLeaveMsByType(type) {
  if (type === 'full') return WORKDAY_MS;
  if (type === 'half') return HALF_WORKDAY_MS;
  if (type === 'partial') return PARTIAL_WORKDAY_MS;
  return 0;
}

function getLeaveMsForDate(leaveData, dateStr) {
  const rec = leaveData && leaveData[dateStr];
  return rec ? getLeaveMsByType(rec.type) : 0;
}

// Holidays count as a full leave day unless an explicit leave entry already exists
function getEffectiveLeaveMsForDate(leaveData, holidayData, dateStr) {
  if (leaveData[dateStr]) return getLeaveMsByType(leaveData[dateStr].type);
  if (holidayData && holidayData[dateStr]) return WORKDAY_MS;
  return 0;
}

function createTimeObj(timeStr, refDate) {
  const [h, m] = timeStr.split(':').map(Number);
  return new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), h, m);
}

function toMinutes(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function getMergedPunchesForDate(dateStr, timeData, manualPunches) {
  const punches = (timeData[dateStr] || []).map(p => ({ ...p }));
  const overrides = (manualPunches || {})[dateStr] || [];

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
        punches[idx] = { ...punches[idx], time: o.time, type: o.type };
      }
    }
  }

  // Exclude deleted server punches from time calculations
  return punches
    .filter(p => !(p.seqNo && deletedSeqNos.has(p.seqNo)))
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

function getMergedTimeData(timeData, manualPunches) {
  const merged = {};
  const allDates = new Set([...Object.keys(timeData), ...Object.keys(manualPunches || {})]);
  for (const d of allDates) {
    merged[d] = getMergedPunchesForDate(d, timeData, manualPunches);
  }
  return merged;
}

// Initial toggle UI
chrome.storage.local.get(['userId', 'password', 'timeData', 'autoRefreshEnabled'], (result) => {
  if (result.userId && result.password) {
    loginForm.style.display = 'none';
    timeDisplay.style.display = 'block';
    navLinks.style.display = '';
  } else {
    loginForm.style.display = 'block';
    timeDisplay.style.display = 'none';
    navLinks.style.display = 'none';
  }
  if (result.autoRefreshEnabled) {
    liveSyncIndicator.style.display = "flex";
  }
});

saveCredsButton.addEventListener("click", async () => {
  const userId = userIdInput.value.trim();
  const password = passwordInput.value.trim();
  hideError();

  if (userId && password) {
    chrome.storage.local.set({ userId, password }, async () => {
      saveCredsButton.textContent = "Logging..";
      saveCredsButton.style.backgroundColor = "#27ae60";
      try {
        const response = await triggerLogin(userId, password);
        if (response) {
          loginForm.style.display = "none";
          timeDisplay.style.display = "block";
          navLinks.style.display = '';
          updateTimeDisplay();
          refreshButton.disabled = true;
          refreshButton.style.opacity = "0.5";
        } else {
          showError("❌ Invalid credentials");
        }
      } catch (err) {
        console.error("❌ Login error:", err);
        showError("⚠️ Login failed");
      }
    });
  } else {
    showError("Please fill both User ID and Password");
    saveCredsButton.textContent = "Please fill both fields";
    saveCredsButton.style.backgroundColor = "#e74c3c";
    setTimeout(() => {
      saveCredsButton.textContent = "Save & Login";
      saveCredsButton.style.backgroundColor = "#2ecc71";
    }, 2000);
  }
});

refreshButton.addEventListener("click", async () => {
  chrome.storage.local.get(["timeData", "userId", "password"], async (result) => {
    const timeData = result.timeData || {};
    const todayKey = today.toLocaleDateString("en-GB");
    delete timeData[todayKey];

    const userId = result.userId;
    const password = result.password;

    if (userId && password) {
      hideError();
      refreshButton.classList.add("loading");
      refreshButton.disabled = true;

      try {
        const response = await triggerLogin(userId, password);
        if (response) {
          updateTimeDisplay();
        } else {
          showError("❌ Invalid credentials");
        }
      } catch (err) {
        console.error("❌ Refresh error:", err);
        showError("⚠️ Refresh failed");
      }
    } else {
      showError("Stored credentials not found.");
    }
  });
});

// Trigger background scrape
function triggerLogin(userId, password) {
  localStorage.removeItem("SecurityManager.token");
  chrome.storage.local.set({ validLogin: "no" });
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "openAndScrape",
        userId,
        password
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("Runtime error:", chrome.runtime.lastError);
          return reject(chrome.runtime.lastError);
        }

        console.log("🔁 Response received:", response);
        resolve(response.valid); // true or false
      }
    );
  });
}

// Main update function
function updateTimeDisplay() {
  chrome.storage.local.get(null, (result) => {
    const data = getMergedTimeData(result.timeData || {}, result.manualPunches || {});
    const leaveData = result.leaveData || {};
    const holidayData = result.holidayData || {};
    const now = getNow();
    const dateKey = now.toLocaleDateString("en-GB");
    const rawTimes = data[dateKey];

    if (!rawTimes || rawTimes.length === 0) {
      updateUI("N/A", "N/A", "N/A", "N/A", now, 0, WEEKLY_TARGET_MS);
      return;
    }

    let totalInMs = 0;
    let totalOutMs = 0;
    let firstIn = null;

    for (let i = 0; i < rawTimes.length; i += 2) {
      const inTime = rawTimes[i].time;
      const outTime = rawTimes[i + 1] ? rawTimes[i + 1].time : getCurrentTimeStr(now);

      const inDate = createTimeObj(inTime, now);
      const outDate = createTimeObj(outTime, now);

      if (!firstIn) firstIn = inDate;
      totalInMs += outDate - inDate;

      if (i + 2 < rawTimes.length) {
        const nextInDate = createTimeObj(rawTimes[i + 2].time, now);
        totalOutMs += nextInDate - outDate;
      }
    }

    const todayLeaveMs = getEffectiveLeaveMsForDate(leaveData, holidayData, dateKey);

    let escapeTime = new Date(firstIn?.getTime() + (WORKDAY_MS - todayLeaveMs) + totalOutMs || now);
    if (now.getHours() < 13 || (now.getHours() === 13 && now.getMinutes() < 30)) {
      escapeTime = new Date(escapeTime.getTime() + ONE_HOUR_MS);
    }

    totalInMs = Math.max(0, totalInMs);

    const remainingMs = Math.max((WORKDAY_MS - todayLeaveMs) - totalInMs, 0);

    // Weekly totals
    let weekTotalInMs = 0;
    let weekLeaveMsToDate = 0;
    let weekLeaveMsFull = 0;
    const monday = new Date(now);
    const day = monday.getDay();
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
    monday.setDate(diff);
    monday.setHours(0, 0, 0, 0);
    const saturday = new Date(monday);
    saturday.setDate(monday.getDate() + 5);
    saturday.setHours(23, 59, 59, 999);

    const dayTotals = { "Mon": 0, "Tue": 0, "Wed": 0, "Thu": 0, "Fri": 0, "Sat": 0 };
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    // Sum worked time for days up to now
    for (const key in data) {
      const [dd, mm, yyyy] = key.split('/');
      const entryDate = new Date(`${yyyy}-${mm}-${dd}`);
      entryDate.setHours(0, 0, 0, 0);

      const isWeekday = entryDate.getDay() >= 1 && entryDate.getDay() <= 6;
      if (isWeekday && entryDate >= monday && entryDate <= now) {
        const entries = data[key];
        let dayTotal = 0;
        for (let i = 0; i < entries.length; i += 2) {
          const inDate = createTimeObj(entries[i].time, entryDate);
          const outDate = createTimeObj(entries[i + 1] ? entries[i + 1].time : getCurrentTimeStr(), entryDate);
          dayTotal += outDate - inDate;
        }

        const dName = dayNames[entryDate.getDay()];
        if (dName !== "Sun") {
          dayTotals[dName] = dayTotal;
        }

        weekTotalInMs += dayTotal;
      }
    }

    // Sum effective leave (leave + holidays) for (a) up to now and (b) full week
    const allLeaveOrHolidayDates = new Set([...Object.keys(leaveData), ...Object.keys(holidayData)]);
    for (const key of allLeaveOrHolidayDates) {
      const [dd, mm, yyyy] = key.split('/');
      const leaveDate = new Date(`${yyyy}-${mm}-${dd}`);
      leaveDate.setHours(0, 0, 0, 0);
      const isWeekday = leaveDate.getDay() >= 1 && leaveDate.getDay() <= 6;
      if (!isWeekday) continue;
      const leaveMs = getEffectiveLeaveMsForDate(leaveData, holidayData, key);
      if (leaveDate >= monday && leaveDate <= now) {
        weekLeaveMsToDate += leaveMs;
      }
      if (leaveDate >= monday && leaveDate <= saturday) {
        weekLeaveMsFull += leaveMs;
      }
    }

    let pastDaysLength = 0;
    for (let d = new Date(monday); d <= now; d.setDate(d.getDate() + 1)) {
      if (d.getDay() >= 1 && d.getDay() <= 5) pastDaysLength++;
    }

    const todayKey = now.toLocaleDateString("en-GB");
    let todayInMs = 0;

    if (data[todayKey]) {
      const times = data[todayKey];
      for (let i = 0; i < times.length; i += 2) {
        const inDate = createTimeObj(times[i].time, now);
        const outDate = createTimeObj(times[i + 1] ? times[i + 1].time : getCurrentTimeStr(now), now);
        todayInMs += outDate - inDate;
      }
    }

    const expectedTotalMs = (WORKDAY_MS * (pastDaysLength - 1) - weekLeaveMsToDate) + Math.min(todayInMs, WORKDAY_MS);
    const weeklyDiff = weekTotalInMs - expectedTotalMs;
    const weekRemainingMs = Math.max((WEEKLY_TARGET_MS - weekLeaveMsFull) - weekTotalInMs, 0);
    const isClockedIn = rawTimes.length % 2 !== 0;

    updateUI(
      formatTimeReadable(totalInMs),
      formatTimeReadable(totalOutMs),
      escapeTime,
      formatTimeReadable(remainingMs),
      now,
      weekTotalInMs,
      weekRemainingMs,
      weeklyDiff,
      firstIn,
      isClockedIn,
      dayTotals
    );
    refreshButton.classList.remove("loading");
    refreshButton.disabled = false;
  });
}

function updateUI(totalIn, totalOut, escapeTime, remaining, now, weekTotalInMs, weekRemainingMs, weeklyDiff, firstIn, isClockedIn, dayTotals) {
  document.getElementById("total-in").textContent = totalIn;
  document.getElementById("total-out").textContent = totalOut;
  document.getElementById("escape-time").textContent = new Date(escapeTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  document.getElementById("escape-time-today").textContent = new Date(escapeTime.getTime() - (weeklyDiff > 0 ? Math.min(weeklyDiff, 1 * 60 * 60 * 1000) : weeklyDiff)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  // document.getElementById("refreshedAt").textContent = now.toLocaleTimeString([], {
  //   hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true
  // });
  document.getElementById("remaining").textContent = remaining;
  document.getElementById("week-total-in").textContent = formatTimeReadable(weekTotalInMs);
  let weeklyDiffText = "";
  if (weeklyDiff > 0) {
    weeklyDiffText = `▲ ${formatTimeReadable(weeklyDiff)}`;
  } else if (weeklyDiff < 0) {
    weeklyDiffText = `▼ ${formatTimeReadable(weeklyDiff)}`;
  } else {
    weeklyDiffText = formatTimeReadable(weeklyDiff);
  }
  document.getElementById("week-diff").textContent = weeklyDiffText
  document.getElementById("week-remaining").textContent = formatTimeReadable(weekRemainingMs);
  if (firstIn) {
    const firstInStr = firstIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
    const firstInEl = document.getElementById("first-in-time");
    if (firstInEl) firstInEl.textContent = firstInStr;
  }
  // Calculate max difference for the week to scale relatively
  let maxAbsDiff = 60 * 60 * 1000; // Default 1hr minimum scale to avoid jumpy bars
  Object.values(dayTotals).forEach(ms => {
    if (ms > 0) {
      const diff = Math.abs(ms - WORKDAY_MS);
      if (diff > maxAbsDiff) maxAbsDiff = diff;
    }
  });

  // Highlight today's bar
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
  const todayName = dayNames[now.getDay()];

  Object.entries(dayTotals).forEach(([day, ms]) => {
    const bar = document.getElementById(`bar-${day}`);
    const valEl = document.getElementById(`val-${day}`);
    if (bar) {
      const diffMs = ms - WORKDAY_MS;
      const isExtra = diffMs > 0;
      const absDiffMs = Math.abs(diffMs);

      // Calculate relative height based on the week's biggest difference
      // Minimum 8% height so very small values like -1m are still visible
      let percentage = 0;
      if (ms > 0) {
        percentage = (absDiffMs / maxAbsDiff) * 85;
        percentage = Math.max(8, percentage);
      } else {
        percentage = 0; // No data for this day
      }

      bar.style.height = `${percentage}%`;

      const dHrs = Math.floor(absDiffMs / (1000 * 60 * 60));
      const dMins = Math.floor((absDiffMs % (1000 * 60 * 60)) / (1000 * 60));

      if (valEl) {
        if (ms === 0) {
          valEl.textContent = "0h 0m";
          valEl.className = "bar-value";
        } else if (isExtra) {
          valEl.textContent = `+${dHrs}h ${dMins}m`; // Show extra value
          valEl.className = "bar-value extra-text";
        } else {
          valEl.textContent = `-${dHrs}h ${dMins}m`; // Show deficit value
          valEl.className = "bar-value deficit-text";
        }
      }

      // Apply 3D color states
      bar.classList.remove("extra", "deficit");
      if (ms > 0) {
        if (isExtra) {
          bar.classList.add("extra");
        } else {
          bar.classList.add("deficit");
        }
      }

      if (day === todayName) {
        bar.classList.add("today");
      } else {
        bar.classList.remove("today");
      }
    }
  });
}


// function updateWorkClock(totalIn) {
//   const now = getNow();
//   const maxMinutes = 8.5 * 60;
//   const secDeg = now.getSeconds() * 6;

//   const hourHand = document.querySelector('.hand.hour');
//   const minuteHand = document.querySelector('.hand.minute');
//   const secondHand = document.querySelector('.hand.second');

//   if (totalIn > maxMinutes) {
//     const extraDeg = ((totalIn - maxMinutes) / 60) * 360;
//     hourHand.style.display = 'none';
//     minuteHand.style.display = 'block';
//     minuteHand.style.backgroundColor = '#27ae60';
//     minuteHand.style.transform = `translateX(-50%) rotate(${extraDeg}deg)`;
//   } else {
//     const hourDeg = (totalIn / maxMinutes) * 360;
//     hourHand.style.display = 'block';
//     hourHand.style.transform = `translateX(-50%) rotate(${hourDeg}deg)`;
//     minuteHand.style.display = 'none';
//     minuteHand.style.backgroundColor = '';
//     minuteHand.style.transform = `translateX(-50%) rotate(0deg)`;
//   }
//   secondHand.style.transform = `translateX(-50%) rotate(${secDeg}deg)`;
// }

// Initial call and auto-update every second
updateTimeDisplay();
setInterval(updateTimeDisplay, 1000);
