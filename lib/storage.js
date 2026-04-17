export const APP_STORAGE_KEYS = [
    'tasks',
    'history',
    'recentlyClosed',
    'completedTasks',
    'notes',
    'deletedNotes'
];

export async function loadAppStorage() {
    const data = await chrome.storage.local.get(APP_STORAGE_KEYS);

    return {
        tasks: data.tasks || [],
        history: data.history || [],
        recentlyClosed: data.recentlyClosed || [],
        completedTasks: data.completedTasks || [],
        notes: data.notes || [],
        deletedNotes: data.deletedNotes || []
    };
}

export async function saveAppState(patch) {
    await chrome.storage.local.set(patch);
}

export async function loadFullStorageSnapshot() {
    return chrome.storage.local.get(null);
}

export async function clearAppStorage() {
    await chrome.storage.local.clear();
}
