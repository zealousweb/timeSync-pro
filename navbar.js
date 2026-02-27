chrome.storage.local.get('user', (result) => {
    const userName = result.user || 'Guest';
    const userNameSpan = document.getElementById("userName");
    if (userNameSpan) {
        userNameSpan.textContent = userName;
    }
});
const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
        chrome.storage.local.clear(() => {
            if (chrome.runtime.lastError) {
                console.error("Error clearing chrome.storage.local:", chrome.runtime.lastError);
            } else {
                console.log("All local storage cleared.");
                window.location.href = "login.html";
            }
        });
    });
}
