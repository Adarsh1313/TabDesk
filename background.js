// Background service worker
// Handles history tracking for closed tabs

const tabCache = {};

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.status === 'complete' && tab.url && !tab.url.startsWith('chrome://')) {
        tabCache[tabId] = {
            title: tab.title,
            url: tab.url,
            favIconUrl: tab.favIconUrl
        };
    }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
    const tabInfo = tabCache[tabId];
    if (tabInfo) {
        // Add to Recently Deleted (Closed Tabs)
        const data = await chrome.storage.local.get(['recentlyClosed']);
        const recentlyClosed = data.recentlyClosed || [];

        const newItem = {
            ...tabInfo,
            id: crypto.randomUUID(),
            deletedAt: new Date().toISOString(),
            type: 'tab' // explicit type
        };

        const newRecent = [newItem, ...recentlyClosed].slice(0, 50); // Keep last 50
        await chrome.storage.local.set({ recentlyClosed: newRecent });

        // Cleanup cache
        delete tabCache[tabId];
    }
});

chrome.runtime.onInstalled.addListener(() => {
    console.log('Tab Notion Extension Installed');
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});
