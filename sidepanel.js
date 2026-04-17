import { utils } from './lib/utils.js';
import { loadAppStorage, saveAppState, loadFullStorageSnapshot, clearAppStorage } from './lib/storage.js';
import { fetchBrowserState, focusExistingTabOrOpen, restoreBrowserGroup } from './lib/tab-operations.js';
import {
    createTaskFromTab,
    createGroupTask,
    insertTask,
    removeTask as removeTaskFromList,
    addHistoryEntry,
    toggleTaskCompletion,
    restoreHistoryItem,
    deleteHistoryEntry
} from './lib/task-lifecycle.js';
import { TabCard } from './components/TabCard.js';
import { GroupCard } from './components/GroupCard.js';
import { TaskCard } from './components/TaskCard.js';
import { TaskGroupCard } from './components/TaskGroupCard.js';
import { Toast } from './components/Toast.js';

// State Object
const state = {
    openTabs: [],
    savedTasks: [],
    completedTasks: [], // New Completed Tasks
    history: [], // Deleted Tasks
    recentlyClosed: [], // Closed Tabs
    dragItem: null,
    toast: null
};

// DOM Elements
const elements = {
    openTabsList: document.getElementById('open-tabs-list'),
    tasksList: document.getElementById('tasks-list'),
    historyList: document.getElementById('history-list'),
    recentlyClosedList: document.getElementById('recently-closed-list'),
    contextMenu: document.getElementById('context-menu')
};

function applyAccessibilityMetadata() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.setAttribute('aria-label', 'Search tabs and tasks');

    const contextMenu = document.getElementById('context-menu');
    if (contextMenu) contextMenu.setAttribute('role', 'menu');

    document.querySelectorAll('#context-menu .context-menu-item').forEach(item => {
        item.setAttribute('role', 'menuitem');
        item.tabIndex = -1;
    });
}

// Initialization
async function init() {
    console.log('Tab Notion Initializing...');

    // Init Toast
    state.toast = new Toast();

    // Load saved data
    await loadStorage();
    await loadTheme();

    // Initial render
    await renderTabs();
    renderTasksList();
    renderCompletedTasksList();
    renderHistoryList();
    if (state.recentlyClosed.length > 0) drawRecentlyClosed();

    // Setup listeners
    applyAccessibilityMetadata();
    setupListeners();
}

// Helper for context menu labels
window.updateContextLabels = function (type) {
    const saveBtn = document.getElementById('ctx-save');
    const suspendBtn = document.getElementById('ctx-suspend');
    const closeBtn = document.getElementById('ctx-close');
    const renameBtn = document.getElementById('ctx-rename');
    const groupBrowserBtn = document.getElementById('ctx-group-browser');

    saveBtn.classList.remove('hidden');
    suspendBtn.classList.remove('hidden');
    closeBtn.classList.remove('hidden');
    renameBtn.classList.add('hidden');
    groupBrowserBtn.classList.add('hidden');

    const iconSave = '<span class="menu-icon">[Save]</span>';
    const iconSuspend = '<span class="menu-icon">[Pause]</span>';
    const iconClose = '<span class="menu-icon">[Delete]</span>';
    const iconRename = '<span class="menu-icon">[Rename]</span>';

    if (type === 'window') {
        saveBtn.innerHTML = `${iconSave} Save Window to Tasks`;
        suspendBtn.innerHTML = `${iconSuspend} Suspend Window`;
        closeBtn.innerHTML = `${iconClose} Close Window`;
    } else if (type === 'multi-tab') {
        saveBtn.innerHTML = `${iconSave} Save Selected to Tasks`;
        suspendBtn.innerHTML = `${iconSuspend} Suspend Selected`;
        closeBtn.innerHTML = `${iconClose} Close Selected`;
        groupBrowserBtn.classList.remove('hidden');
    } else if (type === 'group') {
        saveBtn.innerHTML = `${iconSave} Save Group to Tasks`;
        suspendBtn.innerHTML = `${iconSuspend} Suspend Group`;
        closeBtn.innerHTML = `${iconClose} Close Group`;
        renameBtn.innerHTML = `${iconRename} Rename Group`;
        renameBtn.classList.remove('hidden');
    } else if (type === 'task-group') {
        saveBtn.classList.add('hidden');
        suspendBtn.classList.add('hidden');
        closeBtn.innerHTML = `${iconClose} Delete Group`;
        renameBtn.innerHTML = `${iconRename} Rename Group`;
        renameBtn.classList.remove('hidden');
    } else if (type === 'task') {
        saveBtn.classList.add('hidden');
        suspendBtn.classList.add('hidden');
        closeBtn.innerHTML = `${iconClose} Delete Task`;
    } else {
        saveBtn.innerHTML = `${iconSave} Save to Tasks`;
        suspendBtn.innerHTML = `${iconSuspend} Suspend Tab`;
        closeBtn.innerHTML = `${iconClose} Close Tab`;
    }
};

// Rename Logic
async function showRenameModal(currentTitle, onSave) {
    // Create modal elements
    const overlay = utils.createElement('div', 'modal-overlay');
    const content = utils.createElement('div', 'modal-content');

    const title = utils.createElement('div', 'modal-title', 'Rename Group');
    const input = utils.createElement('input', 'modal-input');
    input.value = currentTitle;
    input.placeholder = "Enter group name";

    // Auto-focus input
    setTimeout(() => input.focus(), 100);

    const actions = utils.createElement('div', 'modal-actions');

    const cancelBtn = utils.createElement('button', 'btn secondary-btn', 'Cancel');
    cancelBtn.onclick = () => document.body.removeChild(overlay);

    const saveBtn = utils.createElement('button', 'btn primary-btn', 'Save');
    saveBtn.onclick = () => {
        const newTitle = input.value.trim();
        if (newTitle) {
            onSave(newTitle);
            document.body.removeChild(overlay);
        }
    };

    // Handle Enter key
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveBtn.click();
        if (e.key === 'Escape') cancelBtn.click();
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    content.appendChild(title);
    content.appendChild(input);
    content.appendChild(actions);

    overlay.appendChild(content);
    document.body.appendChild(overlay);
}

// Data Fetching
async function loadStorage() {
    const data = await loadAppStorage();
    state.savedTasks = data.tasks;
    state.history = data.history;
    state.recentlyClosed = data.recentlyClosed;
    state.completedTasks = data.completedTasks;
}

async function fetchTabs() {
    return fetchBrowserState();
}

// --- Inline Notes (per-URL) ---
async function loadNote(url) {
    const key = 'note::' + url;
    const result = await chrome.storage.local.get(key);
    return result[key] || '';
}

async function saveNote(url, text) {
    const key = 'note::' + url;
    if (text.trim() === '') {
        await chrome.storage.local.remove(key);
    } else {
        await chrome.storage.local.set({ [key]: text });
    }
}

function initNoteAffordance(cardElement, url) {
    const affordance = cardElement.querySelector('.note-affordance');
    const body = cardElement.querySelector('.note-body');
    const textarea = cardElement.querySelector('.note-textarea');
    const label = cardElement.querySelector('.note-label');
    const dot = cardElement.querySelector('.note-dot');
    if (!affordance) return;

    loadNote(url).then(existing => {
        if (existing) {
            textarea.value = existing;
            label.textContent = 'Note';
            dot.hidden = false;
        }
    });

    affordance.addEventListener('click', () => {
        const isOpen = !body.hidden;
        body.hidden = isOpen;
        if (!isOpen) textarea.focus();
    });

    textarea.addEventListener('blur', async () => {
        const text = textarea.value;
        await saveNote(url, text);
        if (text.trim() === '') {
            label.textContent = 'Add note';
            dot.hidden = true;
        } else {
            label.textContent = 'Note';
            dot.hidden = false;
        }
    });
}

// Rendering Logic
async function renderTabs() {
    const { tabs, groups } = await fetchTabs();
    state.openTabs = tabs;
    state.groups = groups; // Store groups in state

    const container = elements.openTabsList;
    container.innerHTML = '';

    // Group by Window
    const windows = {};
    tabs.forEach(tab => {
        if (!windows[tab.windowId]) windows[tab.windowId] = [];
        windows[tab.windowId].push(tab);
    });

    const windowIds = Object.keys(windows).sort();

    // Iterate Windows
    windowIds.forEach((winId, index) => {
        const winTabs = windows[winId];
        const winName = `Window ${index + 1}`;

        // Filter tabs by search query
        const query = (state.searchQuery || '').toLowerCase();
        const filteredTabs = winTabs.filter(t => t.title.toLowerCase().includes(query) || t.url.toLowerCase().includes(query));

        // If searching and no matches in this window, skip (unless we want to show empty windows?)
        if (query && filteredTabs.length === 0) return;

        // Window Header
        const winSection = utils.createElement('div', 'window-section');
        // Always show header for consistency/structure
        const header = utils.createElement('div', 'window-header');
        header.innerHTML = `<span class="toggle-icon">▼</span> <span>${winName}</span>`;
        header.dataset.windowId = winId; // Store window ID for drag-drop
        header.onclick = (e) => {
            // Don't collapse if user is dragging
            if (e.target.closest('.timeline-trash-btn')) return;
            winSection.classList.toggle('collapsed');
            header.querySelector('.toggle-icon').style.transform = winSection.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
        };

        // Window Context Menu
        header.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const ctxMenu = document.getElementById('context-menu');
            ctxMenu.classList.remove('hidden');

            let x = e.pageX;
            let y = e.pageY;
            if (y + 200 > window.scrollY + window.innerHeight) y = window.scrollY + window.innerHeight - 205;
            if (x + 160 > window.scrollX + window.innerWidth) x = window.scrollX + window.innerWidth - 165;

            ctxMenu.style.top = `${y}px`;
            ctxMenu.style.left = `${x}px`;

            ctxMenu.dataset.targetId = winId;
            ctxMenu.dataset.targetType = 'window';
            ctxMenu.dataset.context = 'window'; // For CSS visibility

            if (window.updateContextLabels) window.updateContextLabels('window');
        });

        // Drag Drop (Receive Tabs to Window)
        header.addEventListener('dragover', (e) => {
            e.preventDefault(); // Required to allow drop
            e.stopPropagation();
            header.classList.add('drag-over');
        });

        header.addEventListener('dragleave', (e) => {
            // Only remove if we're actually leaving the header
            if (e.target === header) {
                header.classList.remove('drag-over');
            }
        });

        header.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            header.classList.remove('drag-over');
            const data = e.dataTransfer.getData('text/plain');
            if (!data) return;

            try {
                const dragData = JSON.parse(data);

                // Get target window ID from the header's dataset
                const targetWindowId = parseInt(header.dataset.windowId || winId);

                if (dragData.type === 'tab' && dragData.id) {
                    const tabId = parseInt(dragData.id);
                    const freshTab = await chrome.tabs.get(tabId);
                    const sourceWindowId = freshTab.windowId;

                    // Only move if it's a different window
                    if (sourceWindowId === targetWindowId) return;

                    // Try to ungroup first (only if it's in a group)
                    if (freshTab.groupId && freshTab.groupId !== -1 && freshTab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) {
                        try {
                            await chrome.tabs.ungroup(tabId);
                        } catch (err) {
                            // Tab may already be ungrouped — safe to continue
                        }
                    }

                    // Move tab to this window (append to end)
                    await chrome.tabs.move(tabId, { windowId: targetWindowId, index: -1 });
                    if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);

                    // Activate the moved tab and focus the window
                    await chrome.tabs.update(tabId, { active: true });
                    await chrome.windows.update(targetWindowId, { focused: true });
                } else if (dragData.type === 'group' && dragData.id) {
                    const groupId = parseInt(dragData.id);
                    const freshGroup = await chrome.tabGroups.get(groupId);
                    const sourceWindowId = freshGroup.windowId;

                    if (sourceWindowId === targetWindowId) return;

                    // Move group to this window (append to end)
                    await chrome.tabGroups.move(groupId, { windowId: targetWindowId, index: -1 });
                    if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);

                    await chrome.windows.update(targetWindowId, { focused: true });
                }
            } catch (err) {
                console.error('Drop error:', err);
            }
        });

        winSection.appendChild(header);

        const winContent = utils.createElement('div', 'window-content');

        // Group tabs filtered
        const groupedTabs = filteredTabs.reduce((acc, tab) => {
            const gid = tab.groupId;
            if (!acc[gid]) acc[gid] = [];
            acc[gid].push(tab);
            return acc;
        }, {});

        // Render Ungrouped Tabs (groupId = -1)
        const ungrouped = groupedTabs[chrome.tabGroups.TAB_GROUP_ID_NONE] || [];
        ungrouped.forEach(tab => {
            const tabCard = new TabCard(tab);
            // Check if saved (including in groups)
            const isSaved = state.savedTasks.some(task => {
                if (task.type === 'group') {
                    return task.tasks.some(sub => sub.url === tab.url);
                }
                return task.url === tab.url;
            });
            tabCard.updateStatus(isSaved);

            // Check if discarded (Suspended)
            if (tab.discarded) {
                tabCard.element.classList.add('suspended');
                tabCard.element.title += ' (Suspended)';
            }

            winContent.appendChild(tabCard.element);
            initNoteAffordance(tabCard.element, tab.url);
        });

        // Render Groups in this window
        // Filter groups that belong to this window
        const winGroups = groups.filter(g => g.windowId === parseInt(winId));

        for (const group of winGroups) {
            const groupTabs = groupedTabs[group.id] || [];
            if (groupTabs.length > 0) {
                const groupCard = new GroupCard(group, groupTabs);

                const isGroupSaved = state.savedTasks.some(t => t.type === 'group' && t.title === group.title);
                if (isGroupSaved) {
                    const dot = groupCard.element.querySelector('.group-header .status-dot');
                    if (dot) dot.classList.remove('hidden');
                }

                // Check status for sub-tabs inside the group card
                groupTabs.forEach(t => {
                    const isSaved = state.savedTasks.some(task => {
                        if (task.type === 'group') {
                            return task.tasks.some(sub => sub.url === t.url);
                        }
                        return task.url === t.url;
                    });

                    if (isSaved || t.discarded) {
                        const subCard = groupCard.element.querySelector(`[data-tab-id="${t.id}"]`);
                        if (subCard) {
                            if (isSaved) {
                                const dot = subCard.querySelector('.status-dot');
                                if (dot) dot.classList.remove('hidden');
                            }
                            if (t.discarded) {
                                subCard.classList.add('suspended');
                                subCard.title += ' (Suspended)';
                            }
                        }
                    }
                });
                winContent.appendChild(groupCard.element);
            }
        }

        winSection.appendChild(winContent);
        container.appendChild(winSection);
    });

    // Update count
    document.getElementById('open-tabs-count').textContent = tabs.length;
}

// [Removed duplicate renderTasks and renderHistory functions]

function renderTasksList() {
    elements.tasksList.innerHTML = '';
    // Always update count first
    document.getElementById('tasks-count').textContent = state.savedTasks.length;

    if (state.savedTasks.length === 0) {
        elements.tasksList.innerHTML = '<div class="empty-state">No saved tasks yet. Drag tabs here or use Save to Tasks to keep work for later.</div>';
        return;
    }

    const query = (state.searchQuery || '').toLowerCase();

    // Filter logic
    const filteredTasks = state.savedTasks.filter(item => {
        if (!query) return true;

        if (item.type === 'group') {
            // Match group title OR any task inside
            const groupMatch = item.title.toLowerCase().includes(query);
            const taskMatch = item.tasks.some(t => t.title.toLowerCase().includes(query) || t.url.toLowerCase().includes(query));
            return groupMatch || taskMatch;
        } else {
            return item.title.toLowerCase().includes(query) || item.url.toLowerCase().includes(query);
        }
    });

    filteredTasks.forEach(item => {
        if (item.type === 'group') {
            const card = new TaskGroupCard(
                item,
                (g) => restoreGroup(g),
                (g) => deleteGroup(g),
                (g) => toggleTaskComplete(g)
            );
            elements.tasksList.appendChild(card.element);
        } else {
            const card = new TaskCard(
                item,
                (t) => restoreTask(t),
                (t) => removeTask(t),
                (t) => toggleTaskComplete(t)
            );
            elements.tasksList.appendChild(card.element);
            if (item.url) initNoteAffordance(card.element, item.url);
        }
    });

    document.getElementById('tasks-count').textContent = state.savedTasks.length;
}

function renderCompletedTasksList() {
    const container = document.getElementById('completed-list');
    container.innerHTML = '';

    // Always update count first
    const countBadge = document.getElementById('completed-count');
    if (countBadge) countBadge.textContent = state.completedTasks.length;

    if (state.completedTasks.length === 0) {
        container.innerHTML = '<div class="empty-state">No completed tasks yet. Checked-off items will appear here until you restore them.</div>';
        return;
    }

    state.completedTasks.forEach(item => {
        if (item.type === 'group') {
            const card = new TaskGroupCard(
                item,
                (g) => restoreGroup(g),
                (g) => deleteGroup(g),
                (g) => toggleTaskComplete(g)
            );
            card.element.classList.add('completed');
            container.appendChild(card.element);
        } else {
            const card = new TaskCard(
                item,
                (t) => restoreTask(t),
                (t) => removeTask(t),
                (t) => toggleTaskComplete(t)
            );
            card.element.classList.add('completed');
            container.appendChild(card.element);
            if (item.url) initNoteAffordance(card.element, item.url);
        }
    });
}


function renderHistoryList() {
    elements.historyList.innerHTML = '';
    if (state.history.length === 0) {
        elements.historyList.innerHTML = '<div class="empty-state">No deleted saved items. Removing a task from Tasks will place it here for recovery.</div>';
        return;
    }

    state.history.forEach(item => {
        if (item.type === 'group') {
            const card = new TaskGroupCard(
                item,
                (g) => saveGroupToTasks(g), // Restore to tasks
                (g) => deleteHistoryItem(g.id) // Delete forever
            );
            card.element.style.opacity = '0.8';
            elements.historyList.appendChild(card.element);
        } else {
            const el = utils.createElement('div', 'task-card');
            el.style.opacity = '0.7';
            el.style.cursor = "pointer";
            el.style.position = "relative";
            el.style.paddingRight = "24px";

            // Title
            const title = utils.createElement('span', 'tab-title', item.title);
            el.appendChild(title);

            // Restore click
            el.onclick = async () => {
                const restored = restoreHistoryItem(state.savedTasks, state.history, item);
                state.savedTasks = restored.savedTasks;
                state.history = restored.history;
                await saveAppState({
                    tasks: state.savedTasks,
                    history: state.history
                });
            };

            // Delete Button (X)
            const deleteBtn = utils.createElement('div', 'close-btn', '✕');
            deleteBtn.title = 'Delete History Item';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('Delete this item related to history?')) {
                    await deleteHistoryItem(item.id);
                }
            };
            el.appendChild(deleteBtn);

            elements.historyList.appendChild(el);
        }
    });
}

function drawRecentlyClosed() {
    elements.recentlyClosedList.innerHTML = '';
    if (state.recentlyClosed.length === 0) {
        elements.recentlyClosedList.innerHTML = '<div class="empty-state">No recently closed tabs. Closed browser tabs will appear here so you can reopen them quickly.</div>';
        return;
    }

    // Sort by closedAt (most recent first)
    const sorted = [...state.recentlyClosed].sort((a, b) => {
        const timeA = new Date(a.closedAt || 0).getTime();
        const timeB = new Date(b.closedAt || 0).getTime();
        return timeB - timeA; // Descending
    });

    // Group into time buckets
    const now = Date.now();
    const buckets = {
        'Just now': [],
        'minutes': [],
        'Today': [],
        'Yesterday': [],
        'Older': []
    };

    sorted.forEach(item => {
        const closedTime = new Date(item.closedAt || 0).getTime();
        const diff = now - closedTime;
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) {
            buckets['Just now'].push(item);
        } else if (minutes < 60) {
            buckets['minutes'].push({ ...item, minutesAgo: minutes });
        } else if (hours < 24) {
            buckets['Today'].push(item);
        } else if (days === 1) {
            buckets['Yesterday'].push(item);
        } else {
            buckets['Older'].push(item);
        }
    });

    // Group "minutes" bucket by time intervals
    const minuteBuckets = {};
    buckets['minutes'].forEach(item => {
        const mins = item.minutesAgo;
        minuteBuckets[mins] = minuteBuckets[mins] || [];
        minuteBuckets[mins].push(item);
    });

    // Render buckets
    const renderBucket = (label, items) => {
        if (items.length === 0) return;

        const headerContainer = utils.createElement('div', 'timeline-header-container');
        headerContainer.style.display = 'flex';
        headerContainer.style.alignItems = 'center';
        headerContainer.style.justifyContent = 'space-between';
        headerContainer.style.padding = '8px 12px';
        headerContainer.style.marginTop = '8px';
        headerContainer.style.background = 'var(--bg-secondary)';
        headerContainer.style.borderLeft = '3px solid var(--accent-color)';

        const headerText = utils.createElement('span', 'timeline-header-text');
        headerText.style.fontSize = '11px';
        headerText.style.fontWeight = '600';
        headerText.style.color = 'var(--text-secondary)';
        headerText.style.textTransform = 'uppercase';
        headerText.textContent = `${label} (${items.length})`;

        const trashBtn = utils.createElement('button', 'timeline-trash-btn');
        trashBtn.innerHTML = '<span class="icon" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg></span>';
        trashBtn.title = `Clear all from "${label}"`;
        trashBtn.style.background = 'none';
        trashBtn.style.border = 'none';
        trashBtn.style.cursor = 'pointer';
        trashBtn.style.fontSize = '14px';
        trashBtn.style.opacity = '0.6';
        trashBtn.style.transition = 'opacity 0.2s';
        trashBtn.onmouseover = () => trashBtn.style.opacity = '1';
        trashBtn.onmouseout = () => trashBtn.style.opacity = '0.6';

        trashBtn.onclick = async (e) => {
            e.stopPropagation();
            if (confirm(`Clear all ${items.length} item(s) from "${label}"?`)) {
                const itemIds = items.map(item => item.id);
                const newRecent = state.recentlyClosed.filter(h => !itemIds.includes(h.id));
                state.recentlyClosed = newRecent;
                await saveAppState({ recentlyClosed: newRecent });
                drawRecentlyClosed(); // Re-render
            }
        };

        headerContainer.appendChild(headerText);
        headerContainer.appendChild(trashBtn);
        elements.recentlyClosedList.appendChild(headerContainer);

        items.forEach(item => {
            const el = utils.createElement('div', 'task-card history-item');
            el.style.position = "relative";
            el.style.paddingRight = "24px";

            const title = utils.createElement('span', 'tab-title', item.title);
            el.appendChild(title);

            el.title = "Click to re-open tab";
            el.style.cursor = "pointer";
            el.onclick = async () => {
                await chrome.tabs.create({ url: item.url, active: true });
                const newRecent = state.recentlyClosed.filter(h => h.id !== item.id);
                state.recentlyClosed = newRecent;
                await saveAppState({ recentlyClosed: newRecent });
            };

            const deleteBtn = utils.createElement('div', 'close-btn', '✕');
            deleteBtn.title = 'Delete Permanently';
            deleteBtn.onclick = async (e) => {
                e.stopPropagation();
                if (confirm('Delete this item from recently closed?')) {
                    const newRecent = state.recentlyClosed.filter(h => h.id !== item.id);
                    state.recentlyClosed = newRecent;
                    await saveAppState({ recentlyClosed: newRecent });
                }
            };
            el.appendChild(deleteBtn);

            elements.recentlyClosedList.appendChild(el);
        });
    };

    // Render in order
    renderBucket('Just now', buckets['Just now']);

    // Render minute buckets in descending order
    Object.keys(minuteBuckets).sort((a, b) => parseInt(a) - parseInt(b)).forEach(mins => {
        renderBucket(`${mins} min${mins > 1 ? 's' : ''} ago`, minuteBuckets[mins]);
    });

    renderBucket('Earlier today', buckets['Today']);
    renderBucket('Yesterday', buckets['Yesterday']);
    renderBucket('Older', buckets['Older']);
}




// Logic Helpers
async function saveTask(tab) {
    const { savedTasks, changed } = insertTask(state.savedTasks, createTaskFromTab(tab));
    if (!changed) return;

    state.savedTasks = savedTasks;

    await saveAppState({ tasks: state.savedTasks });

    // Re-render
    renderTasksList();
    renderTabs(); // Update green dots
}

async function restoreTask(task) {
    // If task is completed, just move it back to tasks (uncomplete)
    if (task.completed) {
        await toggleTaskComplete(task);
        return;
    }

    await focusExistingTabOrOpen(task.url, state.openTabs);
    await removeTask(task);
}

async function removeTask(task) {
    // 1. Remove from local state immediately (UI updates)
    const originalTasks = [...state.savedTasks];
    state.savedTasks = removeTaskFromList(state.savedTasks, task.id).savedTasks;
    renderTasksList();
    renderTabs();

    // 2. Show Toast with Undo
    state.toast.show(
        `Task "${task.title}" deleted`,
        // Undo Callback
        async () => {
            // Restore state
            state.savedTasks = originalTasks;
            await saveAppState({ tasks: state.savedTasks });

            // Undo: Remove from History (Fix)
            const newHistory = deleteHistoryEntry(state.history, task.id);
            state.history = newHistory;
            await saveAppState({ history: newHistory });

            renderTasksList();
            renderTabs();
            renderHistoryList();
        },
        5000 // 5 seconds
    );

    // 3. Commit to storage
    const newTasks = removeTaskFromList(originalTasks, task.id).savedTasks;
    await saveAppState({ tasks: newTasks });
    await addToHistory(task);
}

async function saveGroup(group, tabs) {
    const { savedTasks } = insertTask(state.savedTasks, createGroupTask(group, tabs));
    state.savedTasks = savedTasks;
    await saveAppState({ tasks: savedTasks });
}

async function restoreGroup(groupTask) {
    await restoreBrowserGroup(groupTask);
    await deleteGroup(groupTask);
}

async function deleteGroup(groupTask) {
    const originalTasks = [...state.savedTasks];
    const originalHistory = [...state.history]; // Capture history for undo
    state.savedTasks = state.savedTasks.filter(t => t.id !== groupTask.id);
    renderTasksList();
    renderTabs();

    state.toast.show(
        `Group "${groupTask.title}" deleted`,
        'Undo', // This is the label for the undo button
        async () => {
            state.history = originalHistory; // Restore history
            state.savedTasks = originalTasks;
            // Restore to storage
            await saveAppState({
                tasks: originalTasks,
                history: originalHistory
            });

            renderTasksList();
            renderTabs();
            renderHistoryList();
        },
        5000
    );

    const newTasks = removeTaskFromList(originalTasks, groupTask.id).savedTasks;
    await saveAppState({ tasks: newTasks });
    await addToHistory(groupTask);
}

async function toggleTaskComplete(task) {
    const nextState = toggleTaskCompletion(state.savedTasks, state.completedTasks, task);
    state.savedTasks = nextState.savedTasks;
    state.completedTasks = nextState.completedTasks;

    // Save state
    await saveAppState({
        tasks: state.savedTasks,
        completedTasks: state.completedTasks
    });

    // Render both lists
    renderTasksList();
    renderCompletedTasksList();

    // Check if green dots need update (if tasks are removed from savedTasks)
    renderTabs();
}

// History restoration helper
async function saveGroupToTasks(groupTask) {
    // Add back to tasks, remove from history
    const restored = restoreHistoryItem(state.savedTasks, state.history, groupTask);
    state.savedTasks = restored.savedTasks;
    state.history = restored.history;
    await saveAppState({
        tasks: state.savedTasks,
        history: state.history
    });
}

async function deleteHistoryItem(id) {
    state.history = deleteHistoryEntry(state.history, id);
    await saveAppState({ history: state.history });

    renderHistoryList();
}

async function addToHistory(item) {
    const nextHistory = addHistoryEntry(state.history, item).history;
    state.history = nextHistory;
    await saveAppState({ history: nextHistory });
}

// Data Persistence
async function exportData() {
    const data = await loadFullStorageSnapshot();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tab-notion-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

async function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.tasks && !data.history) {
                throw new Error('Invalid backup file format');
            }

            if (confirm('Restoring will overwrite your current tasks and history. Continue?')) {
                await clearAppStorage();
                await saveAppState(data);

                // Reload state
                await loadStorage();
                renderTasksList();
                renderTabs();
                renderHistoryList();
                drawRecentlyClosed();

                state.toast.show('Backup restored successfully!');
            }
        } catch (err) {
            alert('Error importing data: ' + err.message);
            console.error(err);
        }
        event.target.value = ''; // Reset
    };
    reader.readAsText(file);
}

// Event Listeners
// Debounce helper — collapses rapid successive calls into one
function debounce(fn, ms) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), ms);
    };
}
const debouncedRenderTabs = debounce(renderTabs, 50);

function setupListeners() {
    // Tab changes
    chrome.tabs.onUpdated.addListener(debouncedRenderTabs);
    chrome.tabs.onCreated.addListener(debouncedRenderTabs);
    chrome.tabs.onAttached.addListener(debouncedRenderTabs);
    chrome.tabs.onDetached.addListener(debouncedRenderTabs);
    chrome.tabs.onRemoved.addListener(debouncedRenderTabs);

    // Listen for tab group updates (rename, color change, etc.)
    chrome.tabGroups.onUpdated.addListener(() => {
        debouncedRenderTabs();
    });

    // Listen for tab group creation
    chrome.tabGroups.onCreated.addListener(() => {
        debouncedRenderTabs();
    });

    chrome.tabs.onMoved.addListener(debouncedRenderTabs);

    // Storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area === 'local') {
            if (changes.tasks) {
                state.savedTasks = changes.tasks.newValue || [];
                renderTasksList();
                renderTabs(); // Update Green Dots
            }
            if (changes.history) {
                state.history = changes.history.newValue || [];
                renderHistoryList();
            }
            if (changes.recentlyClosed) {
                state.recentlyClosed = changes.recentlyClosed.newValue || [];
                drawRecentlyClosed();
            }
        }
    });

    // Global click to close context menu
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.context-menu')) {
            elements.contextMenu.classList.add('hidden');
            document.getElementById('window-submenu').classList.add('hidden');
        }
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            elements.contextMenu.classList.add('hidden');
            document.getElementById('window-submenu').classList.add('hidden');
        }
    });

    // Drag & Drop Setup
    // Drag Start (delegated)
    document.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.tab-card') || e.target.closest('.group-card');
        if (card) {
            if (card.classList.contains('tab-card')) {
                state.dragItem = { type: 'tab', id: parseInt(card.dataset.tabId) };
                e.dataTransfer.setData('text/plain', JSON.stringify(state.dragItem));
            } else if (card.classList.contains('group-card')) {
                state.dragItem = { type: 'group', id: parseInt(card.dataset.groupId) };
                e.dataTransfer.setData('text/plain', JSON.stringify(state.dragItem));
            }
        }
    });

    // Drop Targets: Tasks List
    elements.tasksList.addEventListener('dragover', (e) => {
        e.preventDefault(); // Allow drop
        elements.tasksList.style.backgroundColor = 'var(--bg-hover)';
    });

    elements.tasksList.addEventListener('dragleave', (e) => {
        elements.tasksList.style.backgroundColor = '';
    });

    elements.tasksList.addEventListener('drop', async (e) => {
        e.preventDefault();
        elements.tasksList.style.backgroundColor = '';

        if (!state.dragItem) return;

        if (state.dragItem.type === 'tab') {
            const tab = state.openTabs.find(t => t.id === state.dragItem.id);
            if (tab) await saveTask(tab);
        } else if (state.dragItem.type === 'group') {
            const tabs = state.openTabs.filter(t => t.groupId === state.dragItem.id);
            const group = (await fetchTabs()).groups.find(g => g.id === state.dragItem.id);
            if (group && tabs.length > 0) {
                await saveGroup(group, tabs);
            }
        }
        state.dragItem = null;
    });

    // Drop Targets: Groups and Tabs (Tab -> Group or Tab -> Tab reorder)
    elements.openTabsList.addEventListener('dragover', (e) => {
        const groupCard = e.target.closest('.group-card');
        const tabCard = e.target.closest('.tab-card');

        if (groupCard || tabCard) {
            e.preventDefault(); // Allow drop
        }

        if (groupCard) {
            groupCard.style.backgroundColor = 'var(--bg-hover)';
        } else if (tabCard) {
            const rect = tabCard.getBoundingClientRect();
            const mid = rect.top + rect.height / 2;
            if (e.clientY < mid) {
                tabCard.style.borderTop = '2px solid var(--accent-green)';
                tabCard.style.borderBottom = '';
            } else {
                tabCard.style.borderBottom = '2px solid var(--accent-green)';
                tabCard.style.borderTop = '';
            }
        }
    });

    elements.openTabsList.addEventListener('dragleave', (e) => {
        const groupCard = e.target.closest('.group-card');
        const tabCard = e.target.closest('.tab-card');

        if (groupCard) {
            groupCard.style.backgroundColor = '';
        }
        if (tabCard) {
            tabCard.style.borderTop = '';
            tabCard.style.borderBottom = '';
        }
    });

    elements.openTabsList.addEventListener('drop', async (e) => {
        e.preventDefault();
        const groupCard = e.target.closest('.group-card');
        const tabCard = e.target.closest('.tab-card');

        if (groupCard) groupCard.style.backgroundColor = '';
        if (tabCard) {
            tabCard.style.borderTop = '';
            tabCard.style.borderBottom = '';
        }

        if (state.dragItem && state.dragItem.type === 'tab') {
            const draggedTabId = state.dragItem.id;

            if (groupCard) {
                const targetGroupId = parseInt(groupCard.dataset.groupId);
                // Move tab to group
                await chrome.tabs.group({ tabIds: draggedTabId, groupId: targetGroupId });
            } else if (tabCard) {
                const targetTabId = parseInt(tabCard.dataset.tabId);
                if (targetTabId !== draggedTabId) {
                    const targetTab = await chrome.tabs.get(targetTabId);
                    const draggedTab = await chrome.tabs.get(draggedTabId);

                    const rect = tabCard.getBoundingClientRect();
                    const mid = rect.top + rect.height / 2;

                    let insertIndex = targetTab.index;
                    // If dropping on bottom half, insert after
                    if (e.clientY > mid) {
                        insertIndex += 1;
                    }

                    // If moving down inside the same window, adjust index slightly because the dragged tab is removed from above
                    if (draggedTab.windowId === targetTab.windowId && draggedTab.index < insertIndex) {
                        insertIndex -= 1;
                    }

                    await chrome.tabs.move(draggedTabId, { windowId: targetTab.windowId, index: Math.max(0, insertIndex) });
                }
            }
        }
        state.dragItem = null;
    });

    // --- Context Menu Actions ---
    document.getElementById('ctx-rename').addEventListener('click', () => {
        const id = elements.contextMenu.dataset.targetId; // String UUID for task groups
        const type = elements.contextMenu.dataset.targetType;

        if (type === 'task-group') {
            const group = state.savedTasks.find(t => t.id === id) || state.completedTasks.find(t => t.id === id);
            if (group) {
                showRenameModal(group.title, async (newTitle) => {
                    group.title = newTitle;
                    await saveAppState({
                        tasks: state.savedTasks,
                        completedTasks: state.completedTasks
                    });
                    renderTasksList();
                    renderCompletedTasksList();
                });
            }
        } else if (type === 'group') {
            const groupId = parseInt(id);
            const group = state.groups.find(g => g.id === groupId);
            if (group) {
                showRenameModal(group.title, async (newTitle) => {
                    await chrome.tabGroups.update(groupId, { title: newTitle });
                    // renderTabs handles update via listeners
                });
            }
        }
        elements.contextMenu.classList.add('hidden');
    });

    document.getElementById('ctx-group-browser').addEventListener('click', async () => {
        if (elements.contextMenu.dataset.targetType === 'multi-tab') {
            const selectedCards = document.querySelectorAll('.tab-card.selected');
            const tabIds = Array.from(selectedCards).map(card => parseInt(card.dataset.tabId));

            if (tabIds.length > 0) {
                await chrome.tabs.group({ tabIds: tabIds });
                // Optional: Prompt for group name? Or let browser handle default.
                // Just grouping is what was asked "group the tabs".
                // Clearing selection
                selectedCards.forEach(c => c.classList.remove('selected'));
            }
        }
        elements.contextMenu.classList.add('hidden');
    });

    document.getElementById('ctx-save').addEventListener('click', async () => {
        const id = parseInt(elements.contextMenu.dataset.targetId); // Tab IDs are numbers
        const type = elements.contextMenu.dataset.targetType; // 'tab' or 'group'

        if (type === 'tab') {
            const tab = state.openTabs.find(t => t.id === id);
            if (tab) await saveTask(tab);
        } else if (type === 'group') {
            const tabs = state.openTabs.filter(t => t.groupId === id);
            const group = (await fetchTabs()).groups.find(g => g.id === id);
            if (group && tabs.length > 0) {
                await saveGroup(group, tabs);
            }
        } else if (type === 'window') {
            // Save all tabs in window as separate tasks? Or as a "Window Task"?
            // Usually "Save to Tasks" means saving individual tasks.
            // But if user wants to save "Windows", we might need a "Window Group"?
            // For now, let's save all tabs in the window as individual tasks.
            // User request: "Save to task or calender".
            // Let's iterate and save each tab.
            const winId = parseInt(id); // dataset.targetId is winId
            const tabs = state.openTabs.filter(t => t.windowId === winId);
            for (const t of tabs) {
                const isSaved = state.savedTasks.some(sq => sq.url === t.url);
                if (!isSaved) await saveTask(t);
            }
        } else if (type === 'multi-tab') {
            const selectedCards = document.querySelectorAll('.tab-card.selected');
            const selectedIds = Array.from(selectedCards).map(card => parseInt(card.dataset.tabId));
            const tabs = state.openTabs.filter(t => selectedIds.includes(t.id));

            if (tabs.length > 0) {
                // Determine next Grouped Task Number
                const baseName = "Grouped Task";
                const regex = new RegExp(`^${baseName} (\\d+)$`);
                let maxNum = 0;

                state.savedTasks.forEach(task => {
                    const match = task.title.match(regex);
                    if (match) {
                        const num = parseInt(match[1]);
                        if (num > maxNum) maxNum = num;
                    }
                });
                state.completedTasks.forEach(task => {
                    const match = task.title.match(regex);
                    if (match) {
                        const num = parseInt(match[1]);
                        if (num > maxNum) maxNum = num;
                    }
                });

                const groupTitle = `${baseName} ${maxNum + 1}`;

                // Create Group Task manually
                const groupTask = createGroupTask({ title: groupTitle, color: 'grey' }, tabs);
                const nextTasks = insertTask(state.savedTasks, groupTask).savedTasks;
                state.savedTasks = nextTasks;
                await saveAppState({ tasks: state.savedTasks });

                renderTasksList();
                renderTabs();
                state.toast.show('Tabs saved as group');

                selectedCards.forEach(c => c.classList.remove('selected'));
            }
        }
        elements.contextMenu.classList.add('hidden');
    });

    document.getElementById('ctx-suspend').addEventListener('click', async () => {
        const id = parseInt(elements.contextMenu.dataset.targetId);
        const type = elements.contextMenu.dataset.targetType;

        if (type === 'tab') {
            try {
                const tab = state.openTabs.find(t => t.id === id);
                if (!tab.active) {
                    await chrome.tabs.discard(id);
                }
            } catch (e) {
                // console.debug('Cannot suspend tab', e);
            }
        } else if (type === 'group') {
            const tabs = state.openTabs.filter(t => t.groupId === id);
            for (const t of tabs) {
                if (!t.active) {
                    try {
                        await chrome.tabs.discard(t.id);
                    } catch (e) { /* ignore */ }
                }
            }
        } else if (type === 'multi-tab') {
            const selectedCards = document.querySelectorAll('.tab-card.selected');
            const selectedIds = Array.from(selectedCards).map(card => parseInt(card.dataset.tabId));
            for (const id of selectedIds) {
                try {
                    await chrome.tabs.discard(id);
                } catch (e) { /* ignore */ }
            }
            selectedCards.forEach(c => c.classList.remove('selected'));
        } else if (type === 'window') {
            const winId = parseInt(id);
            const tabs = state.openTabs.filter(t => t.windowId === winId);
            for (const t of tabs) {
                if (!t.active) {
                    try {
                        await chrome.tabs.discard(t.id);
                    } catch (e) { /* ignore */ }
                }
            }
        }
        elements.contextMenu.classList.add('hidden');
    });

    document.getElementById('ctx-close').addEventListener('click', async () => {
        const id = parseInt(elements.contextMenu.dataset.targetId);
        const type = elements.contextMenu.dataset.targetType;

        if (type === 'tab') {
            await chrome.tabs.remove(id);
        } else if (type === 'group') {
            const tabs = state.openTabs.filter(t => t.groupId === id);
            const tabIds = tabs.map(t => t.id);
            await chrome.tabs.remove(tabIds);
        } else if (type === 'multi-tab') {
            const selectedCards = document.querySelectorAll('.tab-card.selected');
            const selectedIds = Array.from(selectedCards).map(card => parseInt(card.dataset.tabId));
            await chrome.tabs.remove(selectedIds);
            // Clear selection? Tabs are gone.
        } else if (type === 'window') {
            const winId = parseInt(id);
            // Close Window
            try {
                // Must use chrome.windows.remove
                await chrome.windows.remove(winId);
            } catch (e) {
                // Window might be closed or invalid
            }
        }
        elements.contextMenu.classList.add('hidden');
    });

    // Mute / Unmute Tab
    document.getElementById('ctx-mute').addEventListener('click', async () => {
        const id = parseInt(elements.contextMenu.dataset.targetId);
        const type = elements.contextMenu.dataset.targetType;

        if (type === 'tab') {
            try {
                // Get current mute state
                const tab = await chrome.tabs.get(id);
                const newMutedState = !tab.mutedInfo.muted;

                // Toggle mute
                await chrome.tabs.update(id, { muted: newMutedState });

                state.toast.show(newMutedState ? 'Tab muted' : 'Tab unmuted');
            } catch (e) {
                console.error('Mute failed:', e);
            }
        }
        elements.contextMenu.classList.add('hidden');
    });

    // Move to Window (shows submenu)
    document.getElementById('ctx-move-window').addEventListener('click', async () => {
        const id = parseInt(elements.contextMenu.dataset.targetId);
        const type = elements.contextMenu.dataset.targetType;

        if (type === 'tab') {
            // Get all windows
            const allWindows = await chrome.windows.getAll();
            const currentTab = state.openTabs.find(t => t.id === id);

            if (!currentTab) return;

            // Create submenu with window options
            const submenu = document.getElementById('window-submenu');
            submenu.innerHTML = '';

            allWindows.forEach((win, index) => {
                // Skip the current window
                if (win.id === currentTab.windowId) return;

                const item = document.createElement('div');
                item.className = 'context-menu-item';
                item.textContent = `Window ${index + 1}`;
                item.onclick = async () => {
                    try {
                        // Ungroup if needed
                        if (currentTab.groupId && currentTab.groupId !== -1) {
                            try {
                                await chrome.tabs.ungroup(id);
                            } catch (e) {
                                // Tab may already be ungrouped — safe to continue
                            }
                        }

                        // Move tab to selected window
                        await chrome.tabs.move(id, { windowId: win.id, index: -1 });
                        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);

                        await chrome.tabs.update(id, { active: true });
                        await chrome.windows.update(win.id, { focused: true });

                        state.toast.show(`Moved to Window ${index + 1}`);
                        submenu.classList.add('hidden');
                        // UI refresh handled by debouncedRenderTabs via chrome.tabs.onMoved
                    } catch (err) {
                        console.error('Move failed:', err);
                        state.toast.show('Failed to move tab');
                    }
                };
                submenu.appendChild(item);
            });

            // Position submenu next to main menu
            const ctxMenu = elements.contextMenu;
            const rect = ctxMenu.getBoundingClientRect();
            submenu.style.top = `${rect.top}px`;
            submenu.style.left = `${rect.right + 5}px`;

            // Show submenu
            submenu.classList.remove('hidden');

            // Hide main menu
            elements.contextMenu.classList.add('hidden');
        } else if (type === 'group') {
            // Move entire group to another window
            const allWindows = await chrome.windows.getAll();
            const groupTabs = state.openTabs.filter(t => t.groupId === id);

            if (groupTabs.length === 0) return;

            const currentWindowId = groupTabs[0].windowId;

            // Create submenu with window options
            const submenu = document.getElementById('window-submenu');
            submenu.innerHTML = '';

            allWindows.forEach((win, index) => {
                // Skip the current window
                if (win.id === currentWindowId) return;

                const item = document.createElement('div');
                item.className = 'context-menu-item';
                item.textContent = `Window ${index + 1}`;
                item.onclick = async () => {
                    try {
                        const tabIds = groupTabs.map(t => t.id);

                        // Get the group info before moving
                        const groupInfo = await chrome.tabGroups.get(id);

                        // Move all tabs to selected window
                        await chrome.tabs.move(tabIds, { windowId: win.id, index: -1 });
                        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);

                        // Re-group the tabs in the new window
                        const newGroupId = await chrome.tabs.group({ tabIds });

                        // Apply the same group properties (title, color)
                        await chrome.tabGroups.update(newGroupId, {
                            title: groupInfo.title,
                            color: groupInfo.color,
                            collapsed: groupInfo.collapsed
                        });

                        // Focus the window and activate first tab
                        await chrome.tabs.update(tabIds[0], { active: true });
                        await chrome.windows.update(win.id, { focused: true });

                        state.toast.show(`Moved ${tabIds.length} tabs to Window ${index + 1}`);
                        submenu.classList.add('hidden');
                        // UI refresh handled by tabGroups.onUpdated/onCreated listeners
                    } catch (err) {
                        console.error('Move group failed:', err);
                        state.toast.show('Failed to move group');
                    }
                };
                submenu.appendChild(item);
            });

            // Position submenu next to main menu
            const ctxMenu = elements.contextMenu;
            const rect = ctxMenu.getBoundingClientRect();
            submenu.style.top = `${rect.top}px`;
            submenu.style.left = `${rect.right + 5}px`;

            // Show submenu
            submenu.classList.remove('hidden');

            // Hide main menu
            elements.contextMenu.classList.add('hidden');
        }
    });

    // Clear History Handlers
    document.getElementById('btn-clear-history').addEventListener('click', async (e) => {
        e.stopPropagation(); // prevent fold
        if (confirm('Clear all task history?')) {
            state.history = [];
            await saveAppState({ history: [] });
        }
    });

    document.getElementById('btn-clear-recent').addEventListener('click', async (e) => {
        e.stopPropagation(); // prevent fold
        if (confirm('Clear all recently deleted tabs?')) {
            state.recentlyClosed = [];
            await saveAppState({ recentlyClosed: [] });
        }
    });

    // Section Folding
    document.querySelectorAll('.section-header.foldable').forEach(header => {
        const section = header.closest('.section');
        header.tabIndex = 0;
        header.setAttribute('role', 'button');
        header.setAttribute('aria-expanded', String(section.classList.contains('expanded')));
        header.addEventListener('click', () => {
            section.classList.toggle('expanded');
            header.setAttribute('aria-expanded', String(section.classList.contains('expanded')));
        });
        header.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                header.click();
            }
        });
    });

    // Search Listener
    document.getElementById('search-input').addEventListener('input', (e) => {
        state.searchQuery = e.target.value;
        renderTabs();
        renderTasksList();
        // optionally renderHistory?
    });

    // Calendar Handler
    document.getElementById('ctx-calendar').addEventListener('click', async () => {
        // ID can be string (Task UUID) or number (Tab/Group ID)
        const rawId = elements.contextMenu.dataset.targetId;
        const type = elements.contextMenu.dataset.targetType;
        let title = "New Event";
        let details = "";

        if (type === 'tab') {
            const id = parseInt(rawId);
            const tab = state.openTabs.find(t => t.id === id);
            if (tab) {
                title = tab.title;
                details = `${tab.title}\n${tab.url}`;
            }
        } else if (type === 'task') {
            const task = state.savedTasks.find(t => t.id === rawId);
            if (task) {
                title = task.title;
                details = `${task.title}\n${task.url}`;
            }
        } else if (type === 'group' || type === 'task-group') {
            // Group Event
            let groupTitle = "Group Event";
            let tabs = [];

            if (type === 'group') {
                const id = parseInt(rawId);
                const { groups } = await fetchTabs();
                const group = groups.find(g => g.id === id);
                if (group) groupTitle = group.title || "Untitled Group";
                tabs = state.openTabs.filter(t => t.groupId === id);
            } else {
                // Saved Task Group
                const group = state.savedTasks.find(t => t.id === rawId);
                if (group) {
                    groupTitle = group.title;
                    tabs = group.tasks;
                }
            }
            title = groupTitle;
            // Format: Bullet points with Title - URL
            details = tabs.map(t => `• ${t.title}: ${t.url}`).join('\n');

        } else if (type === 'window') {
            // Window Event
            const winId = parseInt(rawId);
            title = `Window ${winId} Tabs`;
            // Let's use generic name or try to find index
            // Recalculating index is hard here without full re-fetch.
            const tabs = state.openTabs.filter(t => t.windowId === winId);
            details = tabs.map(t => `• ${t.title}: ${t.url}`).join('\n');
        } else if (type === 'multi-tab') {
            const selectedCards = document.querySelectorAll('.tab-card.selected');
            const selectedIds = Array.from(selectedCards).map(card => parseInt(card.dataset.tabId));
            const tabs = state.openTabs.filter(t => selectedIds.includes(t.id));

            title = "Grouped Task Event";
            details = tabs.map(t => `• ${t.title}: ${t.url}`).join('\n');
            selectedCards.forEach(c => c.classList.remove('selected'));
        }

        const url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&details=${encodeURIComponent(details)}`;
        chrome.tabs.create({ url });
        elements.contextMenu.classList.add('hidden');
    });

    // Window Actions (Save/Suspend) - reusing existing context menu logic?
    // Wait, the context menu HTML only has "Save to Tasks", "Suspend", "Calendar", "Close".
    // We need to handle "type === window" in those listeners too.

    // Save To Tasks Handler Update
    const originalSaveHandler = document.getElementById('ctx-save').onclick; // It's addEventListener, so we can't easily replace.
    // We need to modify the existing listeners I pasted in a previous block.
    // Since I can't easily modify the *inside* of the previous big block without re-pasting it, 
    // I will add a NEW listener for 'window' type specifically if the ID overlaps, 
    // OR (better) I should have updated the listeners in the previous huge block.
    // But I didn't. The previous block ended at line 153 (renderTabs).
    // The listeners are at the bottom.
    // I am currently replacing the bottom listeners.

    // Let's rewrite the listeners here to handle 'window' type.

    // Export / Import Handlers
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', exportData);
    const btnImport = document.getElementById('btn-import');
    if (btnImport) {
        btnImport.addEventListener('click', () => { document.getElementById('file-import').click(); });
    }
    const fileImport = document.getElementById('file-import');
    if (fileImport) fileImport.addEventListener('change', handleImport);

    // Theme Toggle
    const btnTheme = document.getElementById('btn-theme-toggle');
    if (btnTheme) {
        btnTheme.addEventListener('click', () => {
            const newTheme = state.theme === 'light' ? 'dark' : 'light';
            setTheme(newTheme);
        });
    }
}

// Theme Logic
async function loadTheme() {
    const data = await chrome.storage.local.get('theme');
    // Default to system if not set? Or default light? User said "independent".
    // Let's default to 'light' if undefined.
    setTheme(data.theme || 'light');
}

async function setTheme(theme) {
    state.theme = theme;
    document.body.setAttribute('data-theme', theme);
    await chrome.storage.local.set({ theme });
}

// Start
init();

