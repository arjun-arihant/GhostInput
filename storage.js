// Storage abstraction for Chrome extension

const STORAGE_KEYS = {
    ACTIONS: 'actions',
    PROFILES: 'profiles',
    SETTINGS: 'settings',
    ACTIVE_PROFILE: 'activeProfile',
    LOGS: 'actionLogs'
};

const DEFAULT_SETTINGS = {
    theme: 'dark',
    notifications: true,
    sound: false,
    globalEnabled: true,
    showOverlay: true,
    maxLogs: 100
};

// Actions CRUD
export async function getActions() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIONS);
    return result[STORAGE_KEYS.ACTIONS] || [];
}

export async function saveActions(actions) {
    await chrome.storage.local.set({ [STORAGE_KEYS.ACTIONS]: actions });
}

export async function addAction(action) {
    const actions = await getActions();
    actions.push(action);
    await saveActions(actions);
    return actions;
}

export async function updateAction(actionId, updates) {
    const actions = await getActions();
    const index = actions.findIndex(a => a.id === actionId);
    if (index !== -1) {
        actions[index] = { ...actions[index], ...updates };
        await saveActions(actions);
    }
    return actions;
}

export async function deleteAction(actionId) {
    const actions = await getActions();
    const filtered = actions.filter(a => a.id !== actionId);
    await saveActions(filtered);
    return filtered;
}

// Instance management (multi-tab support)
const MAX_INSTANCES_PER_ACTION = 5;

export async function addActionInstance(actionId, tabId, tabTitle) {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    if (!action) return null;

    if (!action.instances) action.instances = {};

    // Check max instances limit
    const currentCount = Object.keys(action.instances).length;
    if (currentCount >= MAX_INSTANCES_PER_ACTION && !action.instances[tabId]) {
        return { error: `Max ${MAX_INSTANCES_PER_ACTION} tabs per action` };
    }

    action.instances[tabId] = {
        enabled: true,
        executionCount: 0,
        startedAt: Date.now(),
        tabTitle: tabTitle || `Tab ${tabId}`
    };

    await saveActions(actions);
    return action;
}

export async function removeActionInstance(actionId, tabId) {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    if (!action || !action.instances) return null;

    delete action.instances[tabId];
    await saveActions(actions);
    return action;
}

export async function updateActionInstance(actionId, tabId, updates) {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    if (!action || !action.instances || !action.instances[tabId]) return null;

    action.instances[tabId] = { ...action.instances[tabId], ...updates };
    await saveActions(actions);
    return action;
}

export async function getActionInstances(actionId) {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    return action?.instances || {};
}

export async function hasActiveInstances(actionId) {
    const instances = await getActionInstances(actionId);
    return Object.values(instances).some(i => i.enabled);
}

// Profiles
export async function getProfiles() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PROFILES);
    return result[STORAGE_KEYS.PROFILES] || [];
}

export async function saveProfile(profile) {
    const profiles = await getProfiles();
    const index = profiles.findIndex(p => p.id === profile.id);
    if (index !== -1) {
        profiles[index] = profile;
    } else {
        profiles.push(profile);
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: profiles });
    return profiles;
}

export async function deleteProfile(profileId) {
    const profiles = await getProfiles();
    const filtered = profiles.filter(p => p.id !== profileId);
    await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: filtered });
    return filtered;
}

export async function loadProfile(profileId) {
    const profiles = await getProfiles();
    const profile = profiles.find(p => p.id === profileId);
    if (profile) {
        await saveActions(profile.actions);
        await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_PROFILE]: profileId });
    }
    return profile;
}

// Settings
export async function getSettings() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.SETTINGS);
    return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.SETTINGS] || {}) };
}

export async function saveSettings(settings) {
    const current = await getSettings();
    const updated = { ...current, ...settings };
    await chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: updated });
    return updated;
}

// Activity Logs
export async function getLogs() {
    const result = await chrome.storage.local.get(STORAGE_KEYS.LOGS);
    return result[STORAGE_KEYS.LOGS] || [];
}

export async function addLog(logEntry) {
    const settings = await getSettings();
    let logs = await getLogs();
    logs.unshift({
        ...logEntry,
        timestamp: Date.now()
    });
    // Keep only maxLogs entries
    if (logs.length > settings.maxLogs) {
        logs = logs.slice(0, settings.maxLogs);
    }
    await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: logs });
    return logs;
}

export async function clearLogs() {
    await chrome.storage.local.set({ [STORAGE_KEYS.LOGS]: [] });
}

// Import/Export
export async function exportData() {
    const [actions, profiles, settings] = await Promise.all([
        getActions(),
        getProfiles(),
        getSettings()
    ]);
    return {
        version: '1.0.0',
        exportedAt: new Date().toISOString(),
        actions,
        profiles,
        settings
    };
}

export async function importData(data) {
    if (!data.version) {
        throw new Error('Invalid import file format');
    }

    await chrome.storage.local.set({
        [STORAGE_KEYS.ACTIONS]: data.actions || [],
        [STORAGE_KEYS.PROFILES]: data.profiles || [],
        [STORAGE_KEYS.SETTINGS]: { ...DEFAULT_SETTINGS, ...(data.settings || {}) }
    });

    return true;
}

// Clear all data
export async function clearAllData() {
    await chrome.storage.local.clear();
}
