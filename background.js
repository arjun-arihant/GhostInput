// Background service worker for Chrome extension

import {
    getActions, updateAction, getSettings, addLog, saveSettings,
    addActionInstance, removeActionInstance, updateActionInstance, getActionInstances
} from './storage.js';

// Track active timers by composite key: "actionId-tabId"
const activeTimers = new Map(); // "actionId-tabId" -> { timerId, nextExecution, actionId, tabId }
let isInitialized = false;

// Initialize extension
chrome.runtime.onInstalled.addListener(async () => {
    console.log('GhostInput installed');
    await initializeTimers();
});

// Handle startup
chrome.runtime.onStartup.addListener(async () => {
    await initializeTimers();
});

// Handle tab closure - remove instances for closed tab
chrome.tabs.onRemoved.addListener(async (tabId) => {
    const actions = await getActions();
    for (const action of actions) {
        if (action.instances && action.instances[tabId]) {
            await stopActionOnTab(action.id, tabId);
            await addLog({
                actionId: action.id,
                actionName: action.name,
                type: action.type,
                key: action.key,
                success: false,
                error: `Tab ${tabId} was closed`
            });
        }
    }
});

// Keep service worker alive by touching storage periodically
const KEEP_ALIVE_INTERVAL = 20000; // 20 seconds
setInterval(async () => {
    try {
        await chrome.storage.local.get('keepAlive');
    } catch (e) {
        // Ignore errors
    }
}, KEEP_ALIVE_INTERVAL);

// Initialize timers for all enabled action instances
async function initializeTimers() {
    if (isInitialized) return;
    isInitialized = true;

    const actions = await getActions();
    const settings = await getSettings();

    if (!settings.globalEnabled) {
        updateBadge(0);
        return;
    }

    // Clear existing timers
    for (const [key, timerInfo] of activeTimers) {
        if (timerInfo.timerId) {
            clearTimeout(timerInfo.timerId);
        }
    }
    activeTimers.clear();

    let activeCount = 0;
    for (const action of actions) {
        if (action.instances) {
            for (const [tabId, instance] of Object.entries(action.instances)) {
                if (instance.enabled) {
                    await scheduleActionOnTab(action, parseInt(tabId));
                    activeCount++;
                }
            }
        }
    }

    updateBadge(activeCount);
}

// Schedule an action on a specific tab
async function scheduleActionOnTab(action, tabId) {
    const intervalMs = calculateInterval(action);
    const nextExecution = Date.now() + intervalMs;
    const timerKey = `${action.id}-${tabId}`;

    const timerId = setTimeout(() => executeAndRescheduleOnTab(action.id, tabId), intervalMs);

    activeTimers.set(timerKey, {
        timerId,
        nextExecution,
        intervalMs,
        actionId: action.id,
        tabId
    });

    // Store next execution time in the instance
    await updateActionInstance(action.id, tabId, { nextExecution });
}

// Execute action on a specific tab and reschedule
async function executeAndRescheduleOnTab(actionId, tabId) {
    const timerKey = `${actionId}-${tabId}`;
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);

    if (!action || !action.instances || !action.instances[tabId]) {
        activeTimers.delete(timerKey);
        await refreshBadge();
        return;
    }

    const instance = action.instances[tabId];
    if (!instance.enabled) {
        activeTimers.delete(timerKey);
        await refreshBadge();
        return;
    }

    const settings = await getSettings();
    if (!settings.globalEnabled) {
        activeTimers.delete(timerKey);
        return;
    }

    // Get the target tab
    let tab = null;
    try {
        tab = await chrome.tabs.get(tabId);
    } catch (e) {
        // Tab no longer exists - remove instance
        await stopActionOnTab(actionId, tabId);
        return;
    }

    // Check URL filter
    if (tab && action.urlFilter && !matchesUrlFilter(tab.url, action.urlFilter)) {
        // Reschedule but don't execute
        await scheduleActionOnTab(action, tabId);
        return;
    }

    // Execute the action
    await executeAction(action, tab);

    // Update execution count for this instance
    const newCount = (instance.executionCount || 0) + 1;
    await updateActionInstance(actionId, tabId, {
        executionCount: newCount,
        lastExecuted: Date.now()
    });

    // Check Limits

    // 1. Repeat Limit (per instance)
    if (action.repeatLimit && newCount >= action.repeatLimit) {
        await stopActionOnTab(actionId, tabId);
        notifyCompletion(action.name, `${newCount} executions on tab`);
        return;
    }

    // 2. Time Limit (per instance)
    if (action.timeLimit && instance.startedAt) {
        const elapsedMinutes = (Date.now() - instance.startedAt) / 60000;
        if (elapsedMinutes >= action.timeLimit) {
            await stopActionOnTab(actionId, tabId);
            notifyCompletion(action.name, `${Math.round(elapsedMinutes)} minutes on tab`);
            return;
        }
    }

    // Notification if enabled (occasional)
    if (settings.notifications && (newCount === 1 || newCount % 50 === 0)) {
        chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon48.png',
            title: 'Auto Key Presser Pro',
            message: `${action.name}: ${newCount}x on ${tab.title?.substring(0, 20) || 'tab'}`,
            silent: true
        });
    }

    // Reschedule
    await scheduleActionOnTab(action, tabId);
}

// Calculate interval with optional randomization
function calculateInterval(action) {
    // Standard calculation
    let baseMs = action.interval;
    // Normalize to ms
    if (action.timeUnit === 'seconds') baseMs *= 1000;
    else if (action.timeUnit === 'minutes') baseMs *= 60000;
    else if (action.timeUnit === 'hours') baseMs *= 3600000;
    // else match milliseconds

    // Randomization: Min/Max style
    if (action.randomize && (action.randomizeMin || action.randomizeMax)) {
        let min = action.randomizeMin || 0;
        let max = action.randomizeMax || 0;

        // Ensure max >= min
        if (max < min) max = min;

        // Convert range to ms if provided in other units (assuming inputs match unit)
        if (action.timeUnit === 'seconds') { min *= 1000; max *= 1000; }
        else if (action.timeUnit === 'minutes') { min *= 60000; max *= 60000; }
        else if (action.timeUnit === 'hours') { min *= 3600000; max *= 3600000; }

        if (max > 0) {
            // Generate random duration between Min and Max
            return Math.floor(Math.random() * (max - min + 1) + min);
        }
    }
    // Fallback to legacy percent randomization if old data exists? 
    // No, strictly use new logic. If user checks "Randomize" but leaves 0/0, use base interval?
    // Let's fallback to base interval if randomization results in 0 or invalid.

    return Math.max(baseMs || 100, 100);
}

// Execute the action on the specified tab
async function executeAction(action, tab) {
    if (!tab || !tab.id) return;

    // Skip browser internal pages
    const url = tab.url || '';
    if (url.startsWith('chrome://') || url.startsWith('edge://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: simulateAction,
            args: [action]
        });
    } catch (error) {
        console.error('Failed to execute action:', error);
    }
}

// Function injected into page to simulate action
function simulateAction(action) {
    const activeElement = document.activeElement || document.body;

    if (action.type === 'key') {
        const keyInfo = action.keyInfo || { code: `Key${action.key}`, keyCode: action.key.charCodeAt(0), key: action.key.toLowerCase() };

        const eventOptions = {
            key: keyInfo.key,
            code: keyInfo.code,
            keyCode: keyInfo.keyCode,
            which: keyInfo.keyCode,
            ctrlKey: action.modifiers?.includes('Ctrl') || false,
            altKey: action.modifiers?.includes('Alt') || false,
            shiftKey: action.modifiers?.includes('Shift') || false,
            metaKey: action.modifiers?.includes('Meta') || false,
            bubbles: true,
            cancelable: true
        };

        activeElement.dispatchEvent(new KeyboardEvent('keydown', eventOptions));
        activeElement.dispatchEvent(new KeyboardEvent('keypress', eventOptions));
        activeElement.dispatchEvent(new KeyboardEvent('keyup', eventOptions));

        // For text inputs, also insert the character
        if ((activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA') &&
            keyInfo.key.length === 1 && !eventOptions.ctrlKey && !eventOptions.altKey && !eventOptions.metaKey) {
            const start = activeElement.selectionStart;
            const end = activeElement.selectionEnd;
            const value = activeElement.value;
            activeElement.value = value.slice(0, start) + keyInfo.key + value.slice(end);
            activeElement.selectionStart = activeElement.selectionEnd = start + 1;
            activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
    } else if (action.type === 'mouse') {
        const mouseAction = action.mouseAction;
        const eventType = mouseAction === 'doubleClick' ? 'dblclick' :
            mouseAction === 'rightClick' ? 'contextmenu' : 'click';
        const button = mouseAction === 'rightClick' ? 2 : mouseAction === 'middleClick' ? 1 : 0;

        const mouseEvent = new MouseEvent(eventType, {
            bubbles: true,
            cancelable: true,
            button: button,
            buttons: 1 << button
        });

        activeElement.dispatchEvent(mouseEvent);
    }
}

// Check if URL matches filter
function matchesUrlFilter(url, filter) {
    if (!filter || !url) return true;

    const filters = filter.split(',').map(f => f.trim().toLowerCase());
    const urlLower = url.toLowerCase();

    return filters.some(f => {
        if (f.startsWith('*.')) {
            const domain = f.slice(2);
            return urlLower.includes(domain);
        }
        return urlLower.includes(f);
    });
}

// Update badge count
function updateBadge(count) {
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#10B981' : '#6B7280' });
}

// Refresh badge based on current state  
async function refreshBadge() {
    const actions = await getActions();
    const settings = await getSettings();

    if (!settings.globalEnabled) {
        updateBadge(0);
        return;
    }

    // Count total enabled instances across all actions
    let activeCount = 0;
    for (const action of actions) {
        if (action.instances) {
            activeCount += Object.values(action.instances).filter(i => i.enabled).length;
        }
    }
    updateBadge(activeCount);
}

function notifyCompletion(name, reason) {
    chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'Task Completed',
        message: `Action "${name}" finished after ${reason}`,
        silent: false
    });
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message, sender).then(sendResponse);
    return true; // Keep channel open
});

async function handleMessage(message, sender) {
    switch (message.type) {
        case 'START_ACTION':
            await startAction(message.actionId, message.targetTabId);
            return { success: true };

        case 'STOP_ACTION':
            await stopAction(message.actionId);
            return { success: true };

        case 'TOGGLE_ACTION':
            await toggleActionState(message.actionId, message.enabled, message.targetTabId);
            return { success: true };

        case 'STOP_ACTION_ON_TAB':
            await stopActionOnTab(message.actionId, message.tabId);
            return { success: true };

        case 'GET_ACTION_INSTANCES':
            return await getActionInstances(message.actionId);

        case 'REFRESH_TIMERS':
            isInitialized = false;
            await initializeTimers();
            return { success: true };

        case 'TOGGLE_GLOBAL':
            await toggleGlobal();
            return { success: true };

        case 'GET_STATUS':
            return await getFullStatus();

        case 'GET_COUNTDOWN':
            return getCountdownData();

        case 'GET_OVERLAY_SETTING':
            const settings = await getSettings();
            return { showOverlay: settings.showOverlay !== false };

        case 'SHOULD_SHOW_OVERLAY':
            // Called by content script to check if overlay should appear on THIS tab
            const senderTabId = sender?.tab?.id;
            if (!senderTabId) return { shouldShow: false };
            return await shouldShowOverlayOnTab(senderTabId);

        case 'TOGGLE_OVERLAY':
            await toggleOverlayOnActiveTab();
            return { success: true };

        case 'SET_OVERLAY_VISIBLE':
            await setOverlayVisibility(message.visible);
            return { success: true };

        case 'OVERLAY_HIDDEN':
            await saveSettings({ showOverlay: false });
            return { success: true };

        case 'GET_CURRENT_TAB':
            const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
            return { tabId: currentTab?.id, tabTitle: currentTab?.title, tabUrl: currentTab?.url };

        case 'GET_MY_TAB_ID':
            // Returns the tab ID of the sender (for content scripts to know their own tab ID)
            return { tabId: sender?.tab?.id };

        default:
            return { error: 'Unknown message type' };
    }
}

async function toggleOverlayOnActiveTab() {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id && !tab.url?.startsWith('chrome://')) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
        } catch (e) { }
    }
}

async function setOverlayVisibility(visible) {
    await saveSettings({ showOverlay: visible });
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab && tab.id && !tab.url?.startsWith('chrome://')) {
        try {
            await chrome.tabs.sendMessage(tab.id, { type: visible ? 'SHOW_OVERLAY' : 'HIDE_OVERLAY' });
        } catch (e) { }
    }
}

async function shouldShowOverlayOnTab(tabId) {
    const settings = await getSettings();
    if (!settings.showOverlay) {
        return { shouldShow: false };
    }

    const actions = await getActions();
    // Check if any action has an enabled instance on this specific tab
    const hasActiveAction = actions.some(a =>
        a.instances && a.instances[tabId] && a.instances[tabId].enabled
    );

    return { shouldShow: hasActiveAction, showOverlay: true };
}

async function getFullStatus() {
    const actions = await getActions();
    const settings = await getSettings();
    const countdowns = {};

    // Build countdown data from active timers
    for (const [key, timerInfo] of activeTimers) {
        if (!countdowns[timerInfo.actionId]) {
            countdowns[timerInfo.actionId] = {};
        }
        countdowns[timerInfo.actionId][timerInfo.tabId] = {
            nextExecution: timerInfo.nextExecution,
            remaining: Math.max(0, timerInfo.nextExecution - Date.now())
        };
    }

    return { actions, settings, activeTimers: Array.from(activeTimers.keys()), countdowns };
}

function getCountdownData() {
    const countdowns = {};
    const now = Date.now();
    for (const [key, timerInfo] of activeTimers) {
        if (!countdowns[timerInfo.actionId]) {
            countdowns[timerInfo.actionId] = {};
        }
        countdowns[timerInfo.actionId][timerInfo.tabId] = {
            nextExecution: timerInfo.nextExecution,
            remaining: Math.max(0, timerInfo.nextExecution - now)
        };
    }
    return { countdowns, serverTime: now };
}

// Start an action on a specific tab (creates an instance)
async function startActionOnTab(actionId, tabId, tabTitle = null) {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    if (!action) return { error: 'Action not found' };

    // Auto-enable global toggle if disabled
    const settings = await getSettings();
    if (!settings.globalEnabled) {
        await saveSettings({ globalEnabled: true });
        isInitialized = false;
    }

    // Get tab title if not provided
    if (!tabTitle) {
        try {
            const tab = await chrome.tabs.get(tabId);
            tabTitle = tab.title || `Tab ${tabId}`;
        } catch (e) {
            tabTitle = `Tab ${tabId}`;
        }
    }

    // Add or update instance
    const result = await addActionInstance(actionId, tabId, tabTitle);
    if (result?.error) return result;

    // Schedule the timer
    await scheduleActionOnTab(action, tabId);
    await refreshBadge();
    return { success: true };
}

// Stop an action on a specific tab (removes instance)
async function stopActionOnTab(actionId, tabId) {
    const timerKey = `${actionId}-${tabId}`;
    const timerInfo = activeTimers.get(timerKey);
    if (timerInfo && timerInfo.timerId) {
        clearTimeout(timerInfo.timerId);
    }
    activeTimers.delete(timerKey);
    await removeActionInstance(actionId, tabId);
    await refreshBadge();
}

// Stop an action on ALL tabs
async function stopActionOnAllTabs(actionId) {
    const instances = await getActionInstances(actionId);
    for (const tabId of Object.keys(instances)) {
        await stopActionOnTab(actionId, parseInt(tabId));
    }
}

// Legacy wrapper for backward compatibility
async function startAction(actionId, targetTabId = null) {
    if (!targetTabId) {
        const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
        targetTabId = tab?.id;
    }
    if (!targetTabId) return { error: 'No target tab' };
    return await startActionOnTab(actionId, targetTabId);
}

async function stopAction(actionId) {
    await stopActionOnAllTabs(actionId);
}

async function toggleActionState(actionId, shouldBeEnabled, targetTabId = null) {
    if (shouldBeEnabled) {
        return await startAction(actionId, targetTabId);
    } else {
        // If tabId provided, stop only on that tab, else stop all
        if (targetTabId) {
            await stopActionOnTab(actionId, targetTabId);
        } else {
            await stopAction(actionId);
        }
    }
}

async function toggleGlobal() {
    const settings = await getSettings();
    const newEnabled = !settings.globalEnabled;

    await saveSettings({ globalEnabled: newEnabled });

    if (newEnabled) {
        isInitialized = false;
        await initializeTimers();
    } else {
        for (const [actionId, timerInfo] of activeTimers) {
            if (timerInfo.timerId) clearTimeout(timerInfo.timerId);
        }
        activeTimers.clear();
        updateBadge(0);
    }
    return { globalEnabled: newEnabled };
}

chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-all') await toggleGlobal();
    else if (command === 'toggle-overlay') await toggleOverlayOnActiveTab();
});

initializeTimers();
