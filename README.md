# 🕒 TimeSync Pro


## ⚠️ Disclaimer

This project is developed strictly for internal use and testing purposes only.  
It integrates with the COSEC API for development, evaluation, and testing activities.  
This application is not intended for production or public use.

---

**TimeSync Pro** is a high-performance browser extension designed to help employees track their work hours, manage leaves, and visualize their weekly productivity rhythms. It seamlessly integrates with internal time-tracking portals to provide real-time insights and automated calculations.

---

## ✨ Features

- **📊 Real-Time Dashboard:** View your total "In" time, "Out" time, and remaining work hours for the day at a glance.
- **🏃 Escape Time Calculator:** Automatically calculates your "Escape Time" based on your first punch-in and required work hours (8.5h/day).
- **📉 Weekly Rhythm:** A dynamic bar chart visualizing your daily time deficits or extras, helping you balance your weekly target.
- **📅 Leave Management:** Log full, half, or partial leaves directly in the dashboard to maintain accurate time tracking.
- **🔄 Smart Sync:** Background scraping ensures your data is always up-to-date without manual refreshes.
- **🌓 Modern Aesthetics:** Sleek, premium UI with glassmorphism effects and smooth transitions.

---

## 🚀 Installation Instructions

### 🌐 Google Chrome / Microsoft Edge / Brave
1.  **Download** or clone this repository to your local machine.
2.  Open your browser and navigate to `chrome://extensions/` (or `edge://extensions/`).
3.  Enable **Developer mode** using the toggle switch in the top right corner.
4.  Click on **Load unpacked**.
5.  Select the project folder (`timeSync-pro`).
6.  The extension is now installed and will appear in your extensions list.

### 🦊 Mozilla Firefox
1.  **Download** or clone the repository.
2.  Open Firefox and type `about:debugging#/runtime/this-firefox` in the address bar.
3.  Click on **Load Temporary Add-on...**.
4.  Navigate to your project folder and select the `manifest.json` file.
    > **Note:** Firefox requires some Manifest V3 features to be enabled or might require minor adjustments in `background.js` (like using `browser` namespace instead of `chrome`).

### 🍎 Safari (macOS)
1.  Ensure you have **Xcode** installed.
2.  Open Terminal and run:
    ```bash
    xcrun safari-web-extension-converter /path/to/timeSync-pro
    ```
3.  Follow the prompts to create a new Xcode project.
4.  In Xcode, click the **Run** button (Play icon) to build and install the extension into Safari.
5.  In Safari, go to **Settings > Extensions** and enable "TimeSync Pro".

---

## 📖 How to Use

1.  **Login:** Click the extension icon and enter your portal credentials. This allows the extension to securely scrape your punch records.
2.  **Dashboard:** Click the "Dashboard" icon in the popup to view your weekly and monthly summaries.
3.  **Leave Logging:** Right-click on any date in the Monthly Calendar view to add or remove leave records.
4.  **Syncing:** Use the refresh button for a manual sync, or enable Auto-Refresh in the settings page.

---

## 🎨 Technology Stack

- **Core:** HTML5, CSS3 (Vanilla), JavaScript (ES6+)
- **APIs:** Chrome Extensions API (Manifest V3)
- **UI Design:** Flexbox/Grid, SVG Icons, CSS Animations


## 🔐 Security Note

This extension interacts with internal systems and APIs. 
Ensure that credentials and API keys are not exposed in public repositories. 
Do not deploy this extension in production environments.