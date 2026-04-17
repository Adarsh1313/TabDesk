export async function fetchBrowserState() {
    const tabs = await chrome.tabs.query({});
    const groups = await chrome.tabGroups.query({});

    return { tabs, groups };
}

export async function focusExistingTabOrOpen(url, openTabs) {
    const existingTab = openTabs.find(tab => tab.url === url);

    if (existingTab) {
        await chrome.tabs.update(existingTab.id, { active: true });
        await chrome.windows.update(existingTab.windowId, { focused: true });

        return { action: 'focused', tab: existingTab };
    }

    const newTab = await chrome.tabs.create({ url, active: true });
    return { action: 'created', tab: newTab };
}

export async function restoreBrowserGroup(groupTask) {
    const tabIds = [];

    for (const task of groupTask.tasks) {
        const tab = await chrome.tabs.create({ url: task.url, active: false });
        tabIds.push(tab.id);
    }

    if (tabIds.length === 0) return { tabIds: [], groupId: null };

    const groupId = await chrome.tabs.group({ tabIds });
    await chrome.tabGroups.update(groupId, {
        title: groupTask.title,
        color: groupTask.color
    });
    await chrome.tabs.update(tabIds[0], { active: true });

    return { tabIds, groupId };
}
