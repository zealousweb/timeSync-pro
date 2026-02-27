fetchApiData();

async function retryGetToken(maxRetries = 5, delay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const token = localStorage.getItem("SecurityManager.token");
        let fullName = null;
        const labels = document.querySelectorAll('.form-group label');

        if (labels && labels.length > 5) {
            fullName = labels[1]?.textContent.trim();
            chrome.storage.local.set({ user: fullName });
        }

        if (token && fullName) {
            chrome.storage.local.set({ validLogin: "yes" });
            return token;
        }
        console.warn(`⚠️ Token not found. Retrying... (${attempt}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }
    chrome.storage.local.set({ validLogin: "no" });
    throw new Error("Token not found after multiple retries.");
}

async function fetchApiData() {
    try {
        const token = await retryGetToken();
        await new Promise(resolve => setTimeout(resolve, 1000));

        chrome.storage.local.set({ SecurityManagerToken: token });
        chrome.runtime.sendMessage({
            action: "getSessionIdAndCallAPI",
            token: token,
        });

    } catch (error) {
        console.warn("⚠️ Error during fetchApiData:", error);
    }
}
