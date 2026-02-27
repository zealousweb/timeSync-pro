document.addEventListener("DOMContentLoaded", () => {
    const autoRefreshToggle = document.getElementById("autoRefreshToggle");
    const refreshTimeContainer = document.getElementById("refreshTimeContainer");
    const saveRefreshTimeBtn = document.getElementById("saveRefreshTimeBtn");
    const refreshTimeInput = document.getElementById("refreshTime");

    chrome.storage.local.get(["autoRefreshEnabled", "refreshTime"], (result) => {
        if (result.refreshTime) {
            refreshTimeInput.value = result.refreshTime;
        }
        if (result.autoRefreshEnabled !== undefined) {
            autoRefreshToggle.checked = result.autoRefreshEnabled;
            refreshTimeContainer.style.display = result.autoRefreshEnabled ? "flex" : "none";
        }
    });

    autoRefreshToggle.addEventListener("change", () => {
        const enabled = autoRefreshToggle.checked;
        chrome.storage.local.set({ autoRefreshEnabled: enabled }, () => {
             refreshTimeContainer.style.display = enabled ? "flex" : "none";
             console.log("Sync Automation state saved:", enabled);
        });
    });

    saveRefreshTimeBtn.addEventListener("click", () => {
        const refreshValue = parseInt(refreshTimeInput.value, 10);
        if (!isNaN(refreshValue) && refreshValue > 0) {
            chrome.storage.local.set({ refreshTime: refreshValue }, () => {
                saveRefreshTimeBtn.textContent = "Saved!";
                setTimeout(() => {
                    saveRefreshTimeBtn.textContent = "Update";
                }, 2000);
            });
        }
    });

    refreshTimeInput.addEventListener("input", () => {
        saveRefreshTimeBtn.textContent = "Save";
    });
});
