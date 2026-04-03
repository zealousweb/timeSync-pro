document.addEventListener("DOMContentLoaded", () => {
    const autoRefreshToggle = document.getElementById("autoRefreshToggle");
    const refreshTimeContainer = document.getElementById("refreshTimeContainer");
    const saveRefreshTimeBtn = document.getElementById("saveRefreshTimeBtn");
    const refreshTimeInput = document.getElementById("refreshTime");

    const refreshOnOpenToggle = document.getElementById("refreshOnOpenToggle");

    chrome.storage.local.get(["autoRefreshEnabled", "refreshTime", "refreshOnOpen"], (result) => {
        if (result.autoRefreshEnabled) {
            autoRefreshToggle.checked = true;
            refreshTimeContainer.style.display = "block";
        }

        if (result.refreshTime) {
            refreshTimeInput.value = result.refreshTime;
        }

        refreshOnOpenToggle.checked = result.refreshOnOpen === true;
    });

    refreshOnOpenToggle.addEventListener("change", () => {
        chrome.storage.local.set({ refreshOnOpen: refreshOnOpenToggle.checked });
    });

    autoRefreshToggle.addEventListener("change", () => {
        const enabled = autoRefreshToggle.checked;
        chrome.storage.local.set({ autoRefreshEnabled: enabled });
        refreshTimeContainer.style.display = enabled ? "block" : "none";
    });

    saveRefreshTimeBtn.addEventListener("click", () => {
        const refreshTime = parseInt(refreshTimeInput.value, 10);
        if (!isNaN(refreshTime)) {
            chrome.storage.local.set({ refreshTime }, () => {
                alert("Auto Refresh Time saved.");
            });
        }
    });

    refreshTimeInput.addEventListener("input", () => {
        saveRefreshTimeBtn.textContent = "Save";
    });


    // ================================
    // Keyboard Shortcut
    // ================================
    const currentShortcutEl = document.getElementById("currentShortcut");
    const shortcutRecorder = document.getElementById("shortcutRecorder");
    const shortcutRecorderText = document.getElementById("shortcutRecorderText");
    const shortcutRecorderHint = document.getElementById("shortcutRecorderHint");
    const clearShortcutRecorder = document.getElementById("clearShortcutRecorder");
    const changeShortcutBtn = document.getElementById("changeShortcutBtn");

    // Show the currently assigned shortcut
    chrome.commands.getAll((commands) => {
        const cmd = commands.find(c => c.name === "open-extension");
        currentShortcutEl.textContent = cmd?.shortcut || "Not set";
    });

    // Key recorder: capture combo on keydown
    shortcutRecorder.addEventListener("focus", () => {
        shortcutRecorder.classList.add("recording");
        shortcutRecorderHint.textContent = "Recording… press any key combination.";
    });

    shortcutRecorder.addEventListener("blur", () => {
        shortcutRecorder.classList.remove("recording");
        if (shortcutRecorderHint.textContent.startsWith("Recording")) {
            shortcutRecorderHint.textContent = "";
        }
    });

    shortcutRecorder.addEventListener("keydown", (e) => {
        e.preventDefault();
        const parts = [];
        if (e.ctrlKey) parts.push("Ctrl");
        if (e.altKey) parts.push("Alt");
        if (e.shiftKey) parts.push("Shift");
        if (e.metaKey) parts.push("Meta");

        const key = e.key;
        const ignoredKeys = ["Control", "Alt", "Shift", "Meta"];
        if (!ignoredKeys.includes(key)) {
            parts.push(key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key);
        }

        if (parts.length === 0) return;

        const combo = parts.join("+");
        shortcutRecorderText.innerHTML = parts
            .map(p => `<kbd class="key-chip">${p}</kbd>`)
            .join('<span class="key-sep">+</span>');
        shortcutRecorderText.classList.remove("shortcut-recorder-placeholder");

        const currentShortcut = currentShortcutEl.textContent;
        if (combo === currentShortcut) {
            shortcutRecorderHint.textContent = "Matches your current shortcut.";
            shortcutRecorderHint.style.color = "var(--success, #4ade80)";
        } else {
            shortcutRecorderHint.textContent = `Recorded: ${combo} — click "Change in Chrome Settings" to apply.`;
            shortcutRecorderHint.style.color = "var(--text-muted)";
        }
    });

    clearShortcutRecorder.addEventListener("click", () => {
        shortcutRecorderText.textContent = "Click & press keys…";
        shortcutRecorderText.className = "shortcut-recorder-placeholder";
        shortcutRecorderHint.textContent = "";
        shortcutRecorder.focus();
    });

    // Open chrome://extensions/shortcuts
    changeShortcutBtn.addEventListener("click", () => {
        chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
    });

    // ================================
    // Holiday management
    // ================================
    loadHolidayList();

    document.getElementById("importIcsBtn").addEventListener("click", () => {
        const file = document.getElementById("icsFileInput").files[0];
        if (!file) { alert("Please select an .ics file first."); return; }

        const reader = new FileReader();
        reader.onload = (e) => {
            const parsed = parseICS(e.target.result);
            const count = Object.keys(parsed).length;
            if (count === 0) { alert("No holiday events found in the file."); return; }

            chrome.storage.local.get(["holidayData"], (result) => {
                const merged = { ...(result.holidayData || {}), ...parsed };
                chrome.storage.local.set({ holidayData: merged }, () => {
                    const status = document.getElementById("icsImportStatus");
                    status.textContent = `Imported ${count} holiday(s) successfully.`;
                    status.style.display = "block";
                    setTimeout(() => { status.style.display = "none"; }, 3000);
                    document.getElementById("icsFileInput").value = "";
                    loadHolidayList();
                });
            });
        };
        reader.readAsText(file);
    });

    document.getElementById("addHolidayBtn").addEventListener("click", () => {
        const dateVal = document.getElementById("manualHolidayDate").value;
        const name = document.getElementById("manualHolidayName").value.trim();
        if (!dateVal || !name) { alert("Please enter both a date and a holiday name."); return; }

        const [y, m, d] = dateVal.split("-");
        const dateStr = `${d}/${m}/${y}`;

        chrome.storage.local.get(["holidayData"], (result) => {
            const holidayData = result.holidayData || {};
            holidayData[dateStr] = { name };
            chrome.storage.local.set({ holidayData }, () => {
                document.getElementById("manualHolidayDate").value = "";
                document.getElementById("manualHolidayName").value = "";
                loadHolidayList();
            });
        });
    });
});

// ================================
// ICS parser
// ================================
function parseICS(text) {
    const holidays = {};

    // Unfold RFC 5545 line continuations (CRLF/LF + space or tab)
    const unfolded = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");

    const blocks = unfolded.split(/BEGIN:VEVENT/i);

    for (let i = 1; i < blocks.length; i++) {
        const block = blocks[i];

        // DTSTART can be: VALUE=DATE:YYYYMMDD  or  :YYYYMMDDThhmmssZ  etc.
        const dtMatch = block.match(/DTSTART[^:\r\n]*:(\d{8})/i);
        if (!dtMatch) continue;

        const raw = dtMatch[1]; // YYYYMMDD
        const dateStr = `${raw.slice(6, 8)}/${raw.slice(4, 6)}/${raw.slice(0, 4)}`;

        const summaryMatch = block.match(/SUMMARY[^:\r\n]*:([^\r\n]+)/i);
        const name = summaryMatch ? summaryMatch[1].trim() : "Holiday";

        holidays[dateStr] = { name };
    }

    return holidays;
}

// ================================
// Holiday list renderer
// ================================
function loadHolidayList() {
    chrome.storage.local.get(["holidayData"], (result) => {
        const holidayData = result.holidayData || {};
        const container = document.getElementById("holidayListContainer");
        container.innerHTML = "";

        const entries = Object.entries(holidayData).sort((a, b) => {
            const [da, ma, ya] = a[0].split("/").map(Number);
            const [db, mb, yb] = b[0].split("/").map(Number);
            return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
        });

        if (entries.length === 0) {
            container.innerHTML = '<p style="color:#aaa; font-size:13px; margin:4px 0;">No holidays added yet.</p>';
            return;
        }

        entries.forEach(([dateStr, holiday]) => {
            const [d, m, y] = dateStr.split("/").map(Number);
            const dayName = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });

            const row = document.createElement("div");
            row.className = "holiday-row";

            const infoSide = document.createElement("div");
            infoSide.className = "holiday-info-side";

            const nameSpan = document.createElement("span");
            nameSpan.className = "holiday-name";
            nameSpan.textContent = holiday.name;

            const dateSpan = document.createElement("span");
            dateSpan.className = "holiday-date";
            dateSpan.textContent = `${dateStr} (${dayName})`;

            infoSide.appendChild(nameSpan);
            infoSide.appendChild(dateSpan);

            const removeBtn = document.createElement("button");
            removeBtn.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            `;
            removeBtn.title = "Remove holiday";
            removeBtn.type = "button";
            removeBtn.className = "btn-icon-danger";
            removeBtn.addEventListener("click", () => removeHoliday(dateStr));

            row.appendChild(infoSide);
            row.appendChild(removeBtn);
            container.appendChild(row);
        });
    });
}

function removeHoliday(dateStr) {
    chrome.storage.local.get(["holidayData"], (result) => {
        const holidayData = result.holidayData || {};
        delete holidayData[dateStr];
        chrome.storage.local.set({ holidayData }, loadHolidayList);
    });
}
