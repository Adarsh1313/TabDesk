function cloneItem(item) {
    return structuredClone(item);
}

export function createTaskFromTab(tab) {
    return {
        id: crypto.randomUUID(),
        title: tab.title,
        url: tab.url,
        favIconUrl: tab.favIconUrl,
        createdAt: new Date().toISOString()
    };
}

export function createGroupTask(group, tabs) {
    return {
        id: crypto.randomUUID(),
        type: 'group',
        title: group.title,
        color: group.color,
        tasks: tabs.map(tab => createTaskFromTab(tab)),
        createdAt: new Date().toISOString()
    };
}

export function insertTask(savedTasks, task) {
    if (!task.type && savedTasks.some(existing => existing.url === task.url)) {
        return { savedTasks, task: null, changed: false };
    }

    return {
        savedTasks: [task, ...savedTasks],
        task,
        changed: true
    };
}

export function removeTask(savedTasks, taskId) {
    const nextTasks = savedTasks.filter(task => task.id !== taskId);
    return {
        savedTasks: nextTasks,
        changed: nextTasks.length !== savedTasks.length
    };
}

export function addHistoryEntry(history, item) {
    const historyItem = {
        ...cloneItem(item),
        deletedAt: new Date().toISOString()
    };

    return {
        history: [historyItem, ...history].slice(0, 50),
        historyItem
    };
}

export function toggleTaskCompletion(savedTasks, completedTasks, task) {
    const nextTask = cloneItem(task);
    const isComplete = !nextTask.completed;

    nextTask.completed = isComplete;

    if (isComplete) {
        nextTask.completedAt = new Date().toISOString();
        return {
            savedTasks: savedTasks.filter(item => item.id !== nextTask.id),
            completedTasks: [nextTask, ...completedTasks],
            task: nextTask,
            isComplete
        };
    }

    nextTask.completedAt = null;
    return {
        savedTasks: [nextTask, ...savedTasks],
        completedTasks: completedTasks.filter(item => item.id !== nextTask.id),
        task: nextTask,
        isComplete
    };
}

export function restoreHistoryItem(savedTasks, history, item) {
    return {
        savedTasks: [cloneItem(item), ...savedTasks],
        history: history.filter(entry => entry.id !== item.id)
    };
}

export function deleteHistoryEntry(history, id) {
    return history.filter(item => item.id !== id);
}

export function trimRecentlyClosed(recentlyClosed, limit = 50) {
    return recentlyClosed.slice(0, limit);
}
