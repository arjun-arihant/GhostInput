/**
 * Enhanced Background Service Worker with Error Handling and Recovery
 * @module background
 */

import {
  getActions, updateAction, getSettings, addLog, saveSettings,
  addActionInstance, removeActionInstance, updateActionInstance, getActionInstances
} from './storage.js';

/** @typedef {import('./types').Action} Action */
/** @typedef {import('./types').TimerInfo} TimerInfo */
/** @typedef {import('./types').LogEntry} LogEntry */

/**
 * Active timers map: "actionId-tabId" -> TimerInfo
 * @type {Map<string, TimerInfo>}
 */
const activeTimers = new Map();

/**
 * Initialization state flag
 * @type {boolean}
 */
let isInitialized = false;

/**
 * Error recovery attempt counter
 * @type {Map<string, number>}
 */
const errorRecoveryAttempts = new Map();

/**
 * Maximum error recovery attempts per action
 * @constant {number}
 */
const MAX_RECOVERY_ATTEMPTS = 3;

/**
 * Keep-alive interval to prevent service worker termination
 * @constant {number}
 */
const KEEP_ALIVE_INTERVAL = 20000;

/**
 * Maximum interval cap to prevent overflow issues (24 hours)
 * @constant {number}
 */
const MAX_INTERVAL_MS = 24 * 60 * 60 * 1000;

/**
 * Minimum interval to prevent excessive CPU usage (100ms)
 * @constant {number}
 */
const MIN_INTERVAL_MS = 100;

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('GhostInput installed', details.reason);
  
  try {
    await initializeTimers();
    
    // Log installation
    await addLog({
      actionId: 'system',
      actionName: 'Extension Installed',
      type: 'key',
      success: true
    });
  } catch (error) {
    console.error('Failed to initialize on install:', error);
  }
});

// Handle startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('GhostInput starting up');
  
  try {
    await initializeTimers();
  } catch (error) {
    console.error('Failed to initialize on startup:', error);
  }
});

// Handle tab closure - clean up instances for closed tab
chrome.tabs.onRemoved.addListener(async (tabId) => {
  try {
    const actions = await getActions();
    const cleanupPromises = [];
    
    for (const action of actions) {
      if (action.instances?.[tabId]) {
        cleanupPromises.push(
          stopActionOnTab(action.id, tabId).then(async () => {
            await addLog({
              actionId: action.id,
              actionName: action.name,
              type: action.type,
              key: action.key,
              success: false,
              error: `Tab ${tabId} was closed`,
              tabId
            });
          })
        );
      }
    }
    
    await Promise.all(cleanupPromises);
  } catch (error) {
    console.error('Error handling tab closure:', error);
  }
});

// Keep service worker alive
setInterval(async () => {
  try {
    await chrome.storage.local.get('keepAlive');
  } catch (e) {
    // Ignore errors - service worker may be terminating
  }
}, KEEP_ALIVE_INTERVAL);

/**
 * Initialize timers for all enabled action instances
 * @returns {Promise<void>}
 */
async function initializeTimers() {
  if (isInitialized) {
    console.log('Timers already initialized, skipping');
    return;
  }
  
  isInitialized = true;
  console.log('Initializing timers...');

  try {
    const actions = await getActions();
    const settings = await getSettings();

    if (!settings.globalEnabled) {
      updateBadge(0);
      return;
    }

    // Clear existing timers
    clearAllTimers();

    let activeCount = 0;
    const initPromises = [];
    
    for (const action of actions) {
      if (action.instances) {
        for (const [tabIdStr, instance] of Object.entries(action.instances)) {
          const tabId = parseInt(tabIdStr);
          if (instance.enabled && !isNaN(tabId)) {
            initPromises.push(
              scheduleActionOnTab(action, tabId).then(() => {
                activeCount++;
              }).catch(error => {
                console.error(`Failed to schedule action ${action.id} on tab ${tabId}:`, error);
              })
            );
          }
        }
      }
    }
    
    await Promise.all(initPromises);
    updateBadge(activeCount);
    
    console.log(`Initialized ${activeCount} active timers`);
  } catch (error) {
    console.error('Failed to initialize timers:', error);
    isInitialized = false;
    throw error;
  }
}

/**
 * Clear all active timers
 */
function clearAllTimers() {
  let clearedCount = 0;
  for (const [key, timerInfo] of activeTimers) {
    if (timerInfo.timerId) {
      clearTimeout(timerInfo.timerId);
      clearedCount++;
    }
  }
  activeTimers.clear();
  
  if (clearedCount > 0) {
    console.log(`Cleared ${clearedCount} existing timers`);
  }
}

/**
 * Schedule an action on a specific tab
 * @param {Action} action - Action to schedule
 * @param {number} tabId - Tab ID
 * @returns {Promise<void>}
 */
async function scheduleActionOnTab(action, tabId) {
  const intervalMs = calculateInterval(action);
  
  // Validate interval
  if (intervalMs < MIN_INTERVAL_MS || intervalMs > MAX_INTERVAL_MS) {
    throw new Error(`Invalid interval: ${intervalMs}ms`);
  }
  
  const nextExecution = Date.now() + intervalMs;
  const timerKey = `${action.id}-${tabId}`;

  // Clear existing timer if present
  const existingTimer = activeTimers.get(timerKey);
  if (existingTimer?.timerId) {
    clearTimeout(existingTimer.timerId);
  }

  const timerId = setTimeout(() => {
    executeAndRescheduleOnTab(action.id, tabId).catch(error => {
      console.error(`Execution error for ${timerKey}:`, error);
    });
  }, intervalMs);

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

/**
 * Execute action on a specific tab and reschedule
 * @param {string} actionId - Action ID
 * @param {number} tabId - Tab ID
 * @returns {Promise<void>}
 */
async function executeAndRescheduleOnTab(actionId, tabId) {
  const timerKey = `${actionId}-${tabId}`;
  
  try {
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
      console.log(`Tab ${tabId} no longer exists, cleaning up`);
      await stopActionOnTab(actionId, tabId);
      return;
    }

    // Check URL filter
    if (tab && action.urlFilter && !matchesUrlFilter(tab.url, action.urlFilter)) {
      // Reschedule but don't execute
      await scheduleActionOnTab(action, tabId);
      return;
    }

    // Execute the action with error recovery
    let success = false;
    let attempts = errorRecoveryAttempts.get(timerKey) || 0;
    
    try {
      await executeAction(action, tab);
      success = true;
      attempts = 0; // Reset on success
    } catch (error) {
      attempts++;
      console.warn(`Execution attempt ${attempts} failed for ${timerKey}:`, error);
      
      if (attempts >= MAX_RECOVERY_ATTEMPTS) {
        console.error(`Max recovery attempts reached for ${timerKey}, stopping action`);
        await stopActionOnTab(actionId, tabId);
        await addLog({
          actionId,
          actionName: action.name,
          type: action.type,
          key: action.key,
          success: false,
          error: `Max recovery attempts reached: ${error.message}`,
          tabId
        });
        return;
      }
      
      errorRecoveryAttempts.set(timerKey, attempts);
    }

    if (!success) {
      // Retry on next cycle
      await scheduleActionOnTab(action, tabId);
      return;
    }

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
      try {
        await chrome.notifications.create({
          type: 'basic',
          iconUrl: 'icons/ghost48.png',
          title: 'GhostInput',
          message: `${action.name}: ${newCount}x on ${tab.title?.substring(0, 20) || 'tab'}`,
          silent: true
        });
      } catch (e) {
        console.warn('Failed to show notification:', e);
      }
    }

    // Reschedule for next execution
    await scheduleActionOnTab(action, tabId);
    
  } catch (error) {
    console.error(`Error in executeAndRescheduleOnTab for ${timerKey}:`, error);
    
    // Attempt recovery
    const attempts = (errorRecoveryAttempts.get(timerKey) || 0) + 1;
    errorRecoveryAttempts.set(timerKey, attempts);
    
    if (attempts < MAX_RECOVERY_ATTEMPTS) {
      // Try to reschedule
      try {
        const actions = await getActions();
        const action = actions.find(a => a.id === actionId);
        if (action) {
          await scheduleActionOnTab(action, tabId);
          return;
        }
      } catch (e) {
        console.error('Recovery scheduling failed:', e);
      }
    }
    
    // Final cleanup
    activeTimers.delete(timerKey);
    await stopActionOnTab(actionId, tabId);
  }
}

/**
 * Calculate interval with optional randomization
 * @param {Action} action - Action configuration
 * @returns {number} Interval in milliseconds
 */
function calculateInterval(action) {
  // Base calculation
  let baseMs = action.interval;
  
  // Normalize to ms based on time unit
  switch (action.timeUnit) {
    case 'seconds':
      baseMs *= 1000;
      break;
    case 'minutes':
      baseMs *= 60000;
      break;
    case 'hours':
      baseMs *= 3600000;
      break;
    // 'milliseconds' - no conversion needed
  }

  // Apply bounds
  baseMs = Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, baseMs));

  // Randomization: Min/Max style
  if (action.randomize && (action.randomizeMin || action.randomizeMax)) {
    let min = action.randomizeMin || 0;
    let max = action.randomizeMax || 0;

    // Ensure max >= min
    if (max < min) max = min;

    // Convert range to ms if provided in other units
    switch (action.timeUnit) {
      case 'seconds':
        min *= 1000;
        max *= 1000;
        break;
      case 'minutes':
        min *= 60000;
        max *= 60000;
        break;
      case 'hours':
        min *= 3600000;
        max *= 3600000;
        break;
    }

    if (max > 0) {
      // Generate random duration between Min and Max
      return Math.floor(Math.random() * (max - min + 1) + min);
    }
  }

  return baseMs;
}

/**
 * Execute the action on the specified tab
 * @param {Action} action - Action to execute
 * @param {chrome.tabs.Tab} tab - Target tab
 * @returns {Promise<void>}
 */
async function executeAction(action, tab) {
  if (!tab?.id) {
    throw new Error('Invalid tab');
  }

  // Skip browser internal pages
  const url = tab.url || '';
  if (url.startsWith('chrome://') || 
      url.startsWith('edge://') || 
      url.startsWith('chrome-extension://') || 
      url.startsWith('about:') ||
      url.startsWith('file://')) {
    console.log('Skipping internal page:', url);
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
    throw new ExecutionError(`Script injection failed: ${error.message}`);
  }
}

/**
 * Custom error class for execution errors
 */
class ExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ExecutionError';
  }
}

/**
 * Function injected into page to simulate action
 * @param {Action} action - Action configuration
 */
function simulateAction(action) {
  const activeElement = document.activeElement || document.body;

  if (action.type === 'key') {
    const keyInfo = action.keyInfo || { 
      code: `Key${action.key}`, 
      keyCode: action.key.charCodeAt(0), 
      key: action.key.toLowerCase() 
    };

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

/**
 * Check if URL matches filter
 * @param {string} url - URL to check
 * @param {string} filter - Comma-separated filter patterns
 * @returns {boolean} True if URL matches filter
 */
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

/**
 * Update badge count
 * @param {number} count - Active action count
 */
function updateBadge(count) {
  try {
    chrome.action.setBadgeText({ text: count > 0 ? count.toString() : '' });
    chrome.action.setBadgeBackgroundColor({ color: count > 0 ? '#10B981' : '#6B7280' });
  } catch (e) {
    console.error('Failed to update badge:', e);
  }
}

/**
 * Refresh badge based on current state
 * @returns {Promise<void>}
 */
async function refreshBadge() {
  try {
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
  } catch (error) {
    console.error('Failed to refresh badge:', error);
  }
}

/**
 * Show completion notification
 * @param {string} name - Action name
 * @param {string} reason - Completion reason
 */
function notifyCompletion(name, reason) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/ghost48.png',
      title: 'Task Completed',
      message: `Action "${name}" finished after ${reason}`,
      silent: false
    });
  } catch (e) {
    console.error('Failed to show notification:', e);
  }
}

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then(response => {
      sendResponse(response);
    })
    .catch(error => {
      console.error('Message handler error:', error);
      sendResponse({ error: error.message, code: error.code || 'UNKNOWN_ERROR' });
    });
  return true; // Keep channel open for async
});

/**
 * Handle incoming messages
 * @param {import('./types').MessagePayload} message - Message payload
 * @param {chrome.runtime.MessageSender} sender - Message sender
 * @returns {Promise<any>} Response data
 */
async function handleMessage(message, sender) {
  switch (message.type) {
    case 'START_ACTION':
      return await startAction(message.actionId, message.targetTabId);

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
      return await toggleGlobal();

    case 'GET_STATUS':
      return await getFullStatus();

    case 'GET_COUNTDOWN':
      return getCountdownData();

    case 'GET_OVERLAY_SETTING':
      const settings = await getSettings();
      return { showOverlay: settings.showOverlay !== false };

    case 'SHOULD_SHOW_OVERLAY':
      const senderTabId = sender?.tab?.id;
      if (!senderTabId) return { shouldShow: false };
      return await shouldShowOverlayOnTab(senderTabId);

    case 'TOGGLE_OVERLAY':
      await toggleOverlayOnActiveTab();
      return { success: true };

    case 'SET_OVERLAY_VISIBLE':
      await setOverlayVisibility(message.visible);
      return { success: true };

    case 'GET_CURRENT_TAB':
      const [currentTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      return { 
        tabId: currentTab?.id, 
        tabTitle: currentTab?.title, 
        tabUrl: currentTab?.url 
      };

    case 'GET_MY_TAB_ID':
      return { tabId: sender?.tab?.id };

    default:
      return { error: 'Unknown message type', code: 'UNKNOWN_MESSAGE_TYPE' };
  }
}

/**
 * Toggle overlay on active tab
 * @returns {Promise<void>}
 */
async function toggleOverlayOnActiveTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id && !tab.url?.startsWith('chrome://')) {
      await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' });
    }
  } catch (e) {
    // Tab may not have content script
  }
}

/**
 * Set overlay visibility
 * @param {boolean} visible - Whether to show overlay
 * @returns {Promise<void>}
 */
async function setOverlayVisibility(visible) {
  await saveSettings({ showOverlay: visible });
  
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.id && !tab.url?.startsWith('chrome://')) {
      await chrome.tabs.sendMessage(tab.id, { 
        type: visible ? 'SHOW_OVERLAY' : 'HIDE_OVERLAY' 
      });
    }
  } catch (e) {
    // Tab may not have content script
  }
}

/**
 * Check if overlay should show on specific tab
 * @param {number} tabId - Tab ID
 * @returns {Promise<{shouldShow: boolean, showOverlay?: boolean}>}
 */
async function shouldShowOverlayOnTab(tabId) {
  try {
    const settings = await getSettings();
    if (!settings.showOverlay) {
      return { shouldShow: false };
    }

    const actions = await getActions();
    const hasActiveAction = actions.some(a =>
      a.instances?.[tabId]?.enabled
    );

    return { shouldShow: hasActiveAction, showOverlay: true };
  } catch (error) {
    console.error('Error checking overlay:', error);
    return { shouldShow: false };
  }
}

/**
 * Get full status for countdown display
 * @returns {Promise<Object>} Status object
 */
async function getFullStatus() {
  try {
    const [actions, settings] = await Promise.all([
      getActions(),
      getSettings()
    ]);
    
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
  } catch (error) {
    console.error('Error getting full status:', error);
    return { actions: [], settings: {}, activeTimers: [], countdowns: {} };
  }
}

/**
 * Get countdown data for all active timers
 * @returns {Object} Countdown data
 */
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

/**
 * Start an action on a specific tab
 * @param {string} actionId - Action ID
 * @param {number} tabId - Tab ID
 * @param {string} [tabTitle] - Tab title
 * @returns {Promise<Object>} Result
 */
async function startActionOnTab(actionId, tabId, tabTitle = null) {
  try {
    const actions = await getActions();
    const action = actions.find(a => a.id === actionId);
    
    if (!action) {
      return { error: 'Action not found', code: 'ACTION_NOT_FOUND' };
    }

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
  } catch (error) {
    console.error('Error starting action:', error);
    return { error: error.message, code: 'START_ERROR' };
  }
}

/**
 * Stop an action on a specific tab
 * @param {string} actionId - Action ID
 * @param {number} tabId - Tab ID
 * @returns {Promise<void>}
 */
async function stopActionOnTab(actionId, tabId) {
  const timerKey = `${actionId}-${tabId}`;
  const timerInfo = activeTimers.get(timerKey);
  
  if (timerInfo?.timerId) {
    clearTimeout(timerInfo.timerId);
  }
  
  activeTimers.delete(timerKey);
  errorRecoveryAttempts.delete(timerKey);
  
  await removeActionInstance(actionId, tabId);
  await refreshBadge();
}

/**
 * Stop an action on ALL tabs
 * @param {string} actionId - Action ID
 * @returns {Promise<void>}
 */
async function stopActionOnAllTabs(actionId) {
  const instances = await getActionInstances(actionId);
  const stopPromises = Object.keys(instances).map(tabIdStr => 
    stopActionOnTab(actionId, parseInt(tabIdStr))
  );
  await Promise.all(stopPromises);
}

/**
 * Legacy wrapper for backward compatibility
 * @param {string} actionId - Action ID
 * @param {number} [targetTabId] - Target tab ID
 * @returns {Promise<Object>} Result
 */
async function startAction(actionId, targetTabId = null) {
  if (!targetTabId) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    targetTabId = tab?.id;
  }
  
  if (!targetTabId) {
    return { error: 'No target tab', code: 'NO_TARGET_TAB' };
  }
  
  return await startActionOnTab(actionId, targetTabId);
}

/**
 * Stop action wrapper
 * @param {string} actionId - Action ID
 * @returns {Promise<void>}
 */
async function stopAction(actionId) {
  await stopActionOnAllTabs(actionId);
}

/**
 * Toggle action state
 * @param {string} actionId - Action ID
 * @param {boolean} shouldBeEnabled - Desired state
 * @param {number} [targetTabId] - Target tab ID
 * @returns {Promise<void>}
 */
async function toggleActionState(actionId, shouldBeEnabled, targetTabId = null) {
  if (shouldBeEnabled) {
    await startAction(actionId, targetTabId);
  } else {
    if (targetTabId) {
      await stopActionOnTab(actionId, targetTabId);
    } else {
      await stopAction(actionId);
    }
  }
}

/**
 * Toggle global enabled state
 * @returns {Promise<{globalEnabled: boolean}>}
 */
async function toggleGlobal() {
  const settings = await getSettings();
  const newEnabled = !settings.globalEnabled;

  await saveSettings({ globalEnabled: newEnabled });

  if (newEnabled) {
    isInitialized = false;
    await initializeTimers();
  } else {
    clearAllTimers();
    updateBadge(0);
  }
  
  return { globalEnabled: newEnabled };
}

// Command shortcuts
chrome.commands.onCommand.addListener(async (command) => {
  try {
    if (command === 'toggle-all') {
      await toggleGlobal();
    } else if (command === 'toggle-overlay') {
      await toggleOverlayOnActiveTab();
    }
  } catch (error) {
    console.error('Command handler error:', error);
  }
});

// Initialize on module load
initializeTimers().catch(error => {
  console.error('Initial timer initialization failed:', error);
});
