document.getElementById("startBtn").addEventListener("click", async () => {
    // Obtiene la pestaña activa
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ["scripts/inject.js"]
        });
    }
    window.close();
});
