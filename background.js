// ================================
// 🧠 Runtime Message Listener
// ================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSessionIdAndCallAPI") {
        validateToken()
            .then(() => fetchAndUpdateData())
            .then(() => sendResponse({ success: true, message: "Data refreshed." }))
            .catch((err) => {
                console.error("❌ Error in validate or fetch:", err);
                sendResponse({ success: false, error: err.message || "Unknown error" });
            });
        return true;
    }

    if (request.action === "openAndScrape") {
        const { userId, password } = request;
        try {
            handleLoginAndScrape({ userId, password });

            setTimeout(() => {
                chrome.storage.local.get("validLogin", (result) => {
                    sendResponse({ valid: result.validLogin === "yes" });
                });
            }, 5000);
            return true;
        } catch (error) {
            console.error("❌ Error in openAndScrape:", error);
            sendResponse({ valid: false, error: error.message });
            return false;
        }
    }

    if (request.action === "getRangePunchData") {
        const { startDate, endDate } = request;

        getPunchDataInRange(startDate, endDate)
            .then((data) => {
                sendResponse({ success: true, data });
            })
            .catch((err) => {
                console.error("❌ Error in getRangePunchData:", err);
                sendResponse({ success: false, error: err.message });
            });

        return true;
    }

    sendResponse({ success: false, error: "Unknown action" });
    return false;
});

// Default to 15 minutes if nothing is stored
const DEFAULT_REFRESH_TIME = 15;

// Set alarm using stored refresh time
function setRefreshAlarm() {
    chrome.storage.local.get(["refreshTime", "autoRefreshEnabled"], (result) => {
        const refreshTime = result.refreshTime ?? DEFAULT_REFRESH_TIME;
        const autoRefreshEnabled = result.autoRefreshEnabled ?? false;

        // Clear any existing alarms first
        chrome.alarms.clear("hourlySync", () => {
            if (autoRefreshEnabled) {
                chrome.alarms.create("hourlySync", { periodInMinutes: refreshTime });
            }
        });
    });
}

// When extension is installed
chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.set({ refreshTime: DEFAULT_REFRESH_TIME, autoRefreshEnabled: false }, () => {
        setRefreshAlarm();
    });
});

// When Chrome starts
chrome.runtime.onStartup.addListener(() => {
    setRefreshAlarm();
});

// If user updates refreshTime in settings
chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.refreshTime || changes.autoRefreshEnabled) {
        setRefreshAlarm();
    }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name !== "hourlySync") return;
    console.log("🔁 hourlySync triggered");
    try {
        const { userId, password } = await chrome.storage.local.get(["userId", "password"]);
        if (userId && password) {
            handleLoginAndScrape({ userId, password });
        }
    } catch (e) {
        console.error("❌ Error in hourlySync:", e);
    }
});


async function getToken() {
    return new Promise((resolve) => {
        chrome.storage.local.get(["SecurityManagerToken"], (result) => {
            resolve(result.SecurityManagerToken);
        });
    });
}

async function validateToken() {
    const url = "http://192.168.1.200:88";
    const token = await getToken();

    if (!token) {
        console.error("❌ No token found in chrome.storage.local.");
        return null;
    }

    const apiUrl = `${url}/cosec/api/NPunchView/getDataListOnPageLoad?MenuID=12053&token=${encodeURIComponent(token)}`;

    try {
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Referer': `${url}/COSEC/Default/Default`
            },
        });

        return await response.json();
    } catch (err) {
        console.error("❌ Failed to fetch getDataListOnPageLoad:", err);
        chrome.storage.local.set({ apiError: "true" });
        throw err;
    }
}


async function fetchAndUpdateData() {
    const url = "http://192.168.1.200:88";
    const token = await getToken();
    chrome.storage.local.remove("apiError");

    const sessionCookie = await getCookie(url, "ASP.NET_SessionId");
    const userIdCookie = await getCookie(url, "UserID");
    const passwordCookie = await getCookie(url, "Password");

    if (!sessionCookie?.value) {
        console.error("ASP.NET_SessionId not found");
        return { error: "No session" };
    }

    const today = new Date();
    const monday = new Date(today);
    monday.setDate(today.getDate() - ((today.getDay() + 6) % 7));

    const datesToFetch = [];
    for (let i = 0; i < 5; i++) {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        if (date <= today) datesToFetch.push(date);
    }

    if (today.getDay() === 1) {
        const lastFriday = new Date(today);
        lastFriday.setDate(today.getDate() - 3);
        datesToFetch.unshift(lastFriday);
    }

    const workingDays = datesToFetch.filter(date => ![0, 6].includes(date.getDay()));
    const lastTwoWorkingDays = workingDays.slice(-2);
    const allUniqueDates = Array.from(new Set([...workingDays, ...lastTwoWorkingDays]));

    const { generated } = await chrome.storage.local.get('generated');
    const finalData = {};

    await Promise.all(allUniqueDates.map(date =>
        new Promise((res) => {
            fetchPunchDataForDate(token, sessionCookie.value, userIdCookie?.value, passwordCookie?.value, date, (data) => {
                Object.assign(finalData, data);
                res();
            });
        })
    ));

    await new Promise((resolve) => {
        appendTimeData(finalData, () => {
            if (generated === "yes") {
                chrome.storage.local.remove('generated');
                closeGeneratedTab();
            }
            resolve();
        });
    });

    return finalData;
}

function getCurrentTimeHHMM() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}

function addOutPunch(punchesByDate) {
    const todayStr = new Date().toLocaleDateString("en-GB");
    const currentTime = getCurrentTimeHHMM();

    const punches = punchesByDate[todayStr];
    if (!Array.isArray(punches)) {
        console.error("❌ No punches array found for today:", todayStr);
        return;
    }

    for (let i = punches.length - 1; i >= 0; i--) {
        if (punches[i].type === "in" && !punches[i].out) {
            punches.splice(i + 1, 0, {
                type: "out",
                time: currentTime,
                autoFilled: true
            });
            break;
        }
    }


    console.log("✅ Updated punches:", punchesByDate);
    return punchesByDate;
}

function appendTimeData(newData, callback = () => { }) {
    chrome.storage.local.get('timeData', (result) => {
        const existingData = result.timeData || {};
        for (const date in newData) {
            existingData[date] = newData[date];
        }

        chrome.storage.local.set({ timeData: existingData }, () => {
            console.log('✅ Time data appended and updated successfully.');
            callback();
        });
    });
}



function getCookie(url, name) {
    return new Promise((resolve) => {
        chrome.cookies.get({ url, name }, resolve);
    });
}

function closeGeneratedTab() {
    chrome.tabs.query({ url: "http://192.168.1.200:88/COSEC/Default/Default*" }, (tabs) => {
        if (tabs.length > 0) {
            chrome.tabs.remove(tabs[0].id);
        }
    });
}

function handleLoginAndScrape(request) {
    const targetUrl = "http://192.168.1.200:88";
    chrome.storage.local.set({ generated: "yes" });

    chrome.tabs.create({
        url: `${targetUrl}/COSEC/Login/Login`,
        active: false
    }, (tab) => {
        chrome.tabs.onUpdated.addListener(function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    function: loginToCosec,
                    args: [request.userId, request.password],
                });
            }
        });
    });
}

function loginToCosec(userId, password) {
    const userField = document.getElementById('loginid');
    const passField = document.getElementById('pwd');
    const loginButton = document.getElementById('btnlogin');

    if (userField && passField && loginButton) {
        userField.value = userId;
        passField.value = password;
        loginButton.click();
    }
}

async function fetchPunchDataForDate(token, sessionId, userId, password, dateStr, callback) {
    const apiUrl = `http://192.168.1.200:88/cosec/api/NPunchView/changePDateSelection/?token=${token}`;
    const { userId: storedUserId } = await chrome.storage.local.get('userId');

    dateStr = formatDate(dateStr);

    const payload = {
        UserId: storedUserId,
        PDate: dateStr,
        DateSelection: 4,
        AlwMonth: 1
    };

    fetch(apiUrl, {
        method: "POST",
        headers: {
            "Accept": "application/json",
            "Content-Type": "application/json;charset=UTF-8",
            "Cookie": `UserID=${userId}; Password=${password}; ASP.NET_SessionId=${sessionId}; ProductID=COSEC`
        },
        body: JSON.stringify(payload)
    })
        .then(res => res.json())
        .then(data => {
            const result = data?.result?.grdData || [];
            const groupedData = groupPunchData(dateStr, result);
            callback(groupedData);
        })
        .catch(err => {
            console.error(`Error fetching data for ${dateStr}`, err);
            chrome.storage.local.set("apiError", "true");
            callback({ [dateStr]: [] });
        });
}

async function getPunchDataInRange(startDateStr, endDateStr) {
    const url = "http://192.168.1.200:88";
    const token = await getToken();
    chrome.storage.local.remove("apiError");

    const sessionCookie = await getCookie(url, "ASP.NET_SessionId");
    const userIdCookie = await getCookie(url, "UserID");
    const passwordCookie = await getCookie(url, "Password");

    if (!sessionCookie?.value) {
        throw new Error("No session cookie found");
    }

    const startDate = new Date(startDateStr);
    const endDate = new Date(endDateStr);

    if (isNaN(startDate) || isNaN(endDate) || startDate > endDate) {
        throw new Error("Invalid date range");
    }

    const dateList = [];
    const current = new Date(startDate);
    while (current <= endDate) {
        if (![0, 6].includes(current.getDay())) {
            dateList.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }

    const punchDataByDate = {};

    // 1. Fetch all raw punch entries per date
    await Promise.all(dateList.map(date =>
        new Promise((res) => {
            fetchPunchDataForDate(
                token,
                sessionCookie.value,
                userIdCookie?.value,
                passwordCookie?.value,
                date,
                (data) => {
                    console.log("✅ Raw punch data:", data); // optional debug log

                    if (data && typeof data === "object") {
                        for (const date in data) {
                            const punches = data[date];
                            if (Array.isArray(punches)) {
                                punchDataByDate[date] = addBreak(punches, date);
                                console.log(`✅ Processed punches for ${date}:`, punchDataByDate[date]);
                            } else {
                                console.log(`⚠️ Skipped ${date}, punches not an array`, punches);
                            }
                        }
                    } else {
                        console.error(`❌ Invalid punch data format for ${formatDate(date)}:`, data);
                    }
                    res();
                }
            );
        })
    ));

    return new Promise((resolve) => {
        console.log("✅ All punch data fetched and processed:", punchDataByDate);
        appendTimeData(punchDataByDate, () => {});
    });
}

function groupPunchData(dateStr, data) {
    const grouped = {};

    if (!Array.isArray(data) || data.length === 0) {
        return { [dateStr]: [] };
    }

    data.forEach(item => {
        const parsed = extractDateAndTime(item.EDatetime);
        if (!parsed) return;
        const { date, time } = parsed;

        grouped[date] = grouped[date] || [];
        grouped[date].push({ type: item.IOTypeText.toLowerCase(), time });
    });

    console.log("Grouped punch data before adding breaks:", grouped);

    const final = {};
    for (const date in grouped) {
        final[date] = addBreak(grouped[date], date);
    }
    return final;
}

function addBreak(times, date) {
    const breakStartMin = toMinutes("13:30");
    const breakEndMin = toMinutes("14:30");
    const isToday = formatDate(new Date()) === date;
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();

    if (currentMinutes < breakStartMin && isToday) return times;

    const statusAtStart = getStatusAtTime(times, breakStartMin - 0.5);
    const statusAtEnd = getStatusAtTime(times, breakEndMin + 0.5);

    const filtered = times.filter(p => {
        const timeMin = toMinutes(p.time);
        return timeMin < breakStartMin || timeMin > breakEndMin;
    });

    if (statusAtStart === 'in' && statusAtEnd === 'in') {
        filtered.push({ type: 'out', time: "13:30" }, { type: 'in', time: "14:30" });
    } else if (statusAtStart === 'in') {
        filtered.push({ type: 'out', time: "13:30" });
    } else if (statusAtEnd === 'in') {
        filtered.push({ type: 'in', time: "14:30" });
    }
    console.log("Filtered punches after adding breaks:", filtered);
    console.log(filtered.sort((a, b) => toMinutes(a.time) - toMinutes(b.time)));
    return filtered.sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

function getStatusAtTime(times, targetMin) {
    // Default status is 'out'
    let status = 'out';

    // Sort times just in case
    const sortedTimes = times.slice().sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

    for (const punch of sortedTimes) {
        const punchMin = toMinutes(punch.time);
        if (punchMin > targetMin) break;
        status = punch.type;
    }
    return status;
}

function extractDateAndTime(datetimeStr) {
    if (!datetimeStr) return null;
    const [datePart, timePart] = datetimeStr.split(" ");
    if (!datePart || !timePart) return null;

    const [hour, minute] = timePart.split(":").map(Number);
    if (isNaN(hour) || isNaN(minute)) return null;

    return {
        date: datePart,
        time: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
    };
}

function formatDate(date) {
    return date.toLocaleDateString('en-GB');
}

function toMinutes(t) {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
}

